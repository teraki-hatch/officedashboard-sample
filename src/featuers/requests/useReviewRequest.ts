import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import type { CorrectionRequest, LeaveRequest } from './types';
import { checkMonthLocked } from '../closure/checkLocked';
import { logger } from '../../lib/logger';

/**
 * 申請の承認/却下フック
 * --------------------------------------------------------------
 * STEP 0 (Phase 2): 承認時に対象月の monthly_closures をチェック
 *                   confirmed (確定済) ならエラーで終了
 * STEP 1: 申請テーブルのステータス更新
 * STEP 2: 承認かつ修正申請のみ → attendance_records と attendance_breaks を上書き
 * --------------------------------------------------------------
 * 2026-05-19 修正:
 * - attendance_record_id が NULL のまま INSERT されるバグを修正
 * - エラー情報を message + code + details + hint まで全部取得
 * - INSERT に .select() を付けて、実際に挿入された件数を確認
 * - logger.log を各ステップに追加してコンソールから追えるように
 * - サイレント失敗を防ぐため、INSERT 0件もエラー扱いに
 * - Phase 2: 月次締めロック判定を追加
 */

export type ReviewAction = 'approve' | 'reject';

export type ReviewableItem =
  | ({ _kind: 'leave' } & LeaveRequest)
  | ({ _kind: 'correction' } & CorrectionRequest);

export type ReviewParams = {
  item: ReviewableItem;
  action: ReviewAction;
  reviewerId: string;
  adminComment: string;
};

export type ReviewResult = {
  ok: boolean;
  error: string | null;
  attendanceUpdated: boolean;
};

export type UseReviewState = {
  processingId: string | null;
  lastError: string | null;
  review: (params: ReviewParams) => Promise<ReviewResult>;
  clearError: () => void;
};

type BreakJson = {
  break_start?: string;
  break_end?: string;
  memo?: string;
};

type SbError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
} | null;

function toTstz(time: string | null | undefined, date: string): string | null {
  if (!time) return null;
  const hm = String(time).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(hm)) return null;
  return `${date}T${hm}:00+09:00`;
}

function normalizeWorkType(v: string | null | undefined): string | null {
  if (!v) return null;
  const m: Record<string, string> = {
    在宅: 'remote',
    出社: 'office',
    出張: 'business_trip',
    remote: 'remote',
    office: 'office',
    business_trip: 'business_trip',
    normal: 'office',
  };
  return m[v] ?? v;
}

/** 'HH:mm' 形式かどうか */
function isValidHHmm(v: string | null | undefined): v is string {
  return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
}

/** Supabaseのエラーオブジェクトから全情報を文字列化 */
function formatSbError(err: SbError, prefix: string): string {
  if (!err) return `${prefix}: 不明なエラー`;
  const parts: string[] = [err.message];
  if (err.code) parts.push(`code=${err.code}`);
  if (err.details) parts.push(`details=${err.details}`);
  if (err.hint) parts.push(`hint=${err.hint}`);
  return `${prefix}: ${parts.join(' | ')}`;
}

/** 申請から「対象月の判定に使う日付」を取り出す (YYYY-MM-DD) */
function getReviewTargetDate(item: ReviewableItem): string | null {
  if (item._kind === 'correction') {
    const corr = item as { _kind: 'correction' } & CorrectionRequest;
    const td =
      (corr as unknown as { date?: string }).date ?? corr.target_date;
    return td ?? null;
  }
  // leave: start_date 基準
  const lv = item as { _kind: 'leave' } & LeaveRequest;
  return lv.start_date ?? null;
}

export function useReviewRequest(): UseReviewState {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const processingRef = useRef<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = useCallback(() => setLastError(null), []);

  const review = useCallback(
    async (params: ReviewParams): Promise<ReviewResult> => {
      const { item, action, reviewerId, adminComment } = params;

      if (processingRef.current) {
        return { ok: false, error: null, attendanceUpdated: false };
      }
      processingRef.current = item.id;
      setProcessingId(item.id);
      setLastError(null);

      try {
        const supabase = getSupabase();
        if (!supabase) {
          const msg = 'Supabase が未設定です';
          setLastError(msg);
          return { ok: false, error: msg, attendanceUpdated: false };
        }

        // ★ Phase 2: 承認時のみ月次締めロック判定
        if (action === 'approve') {
          const td = getReviewTargetDate(item);
          if (td) {
            const lock = await checkMonthLocked(item.user_id, td);
            if (lock.locked) {
              const msg =
                lock.message ?? '対象月は確定済のため承認できません';
              logger.log('[OfficeHub:admin:review] BLOCKED by closure lock', {
                userId: item.user_id,
                targetDate: td,
              });
              setLastError(msg);
              return { ok: false, error: msg, attendanceUpdated: false };
            }
          }
        }

        const nowISO = new Date().toISOString();
        const table =
          item._kind === 'correction'
            ? 'attendance_correction_requests'
            : 'leave_requests';

        const commentTrimmed = adminComment.trim();
        const patch =
          action === 'approve'
            ? {
                status: 'approved',
                approved_by: reviewerId,
                approved_at: nowISO,
                admin_comment: commentTrimmed || null,
                updated_at: nowISO,
              }
            : {
                status: 'rejected',
                rejected_by: reviewerId,
                rejected_at: nowISO,
                admin_comment: commentTrimmed || null,
                updated_at: nowISO,
              };
        logger.log('[OfficeHub:admin:review] STEP1 start', {
          table,
          itemId: item.id,
          action,
        });

        type PatchRes = {
          data: unknown[] | null;
          error: SbError;
        };
        const patchResult = await withTimeout<PatchRes>(
          supabase
            .from(table)
            .update(patch)
            .eq('id', item.id)
            .select() as unknown as Promise<PatchRes>,
          15000,
          `UPDATE ${table}`
        ).catch(
          (e): PatchRes => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        if (patchResult.error) {
          const msg = formatSbError(patchResult.error, '処理失敗');
          logger.log('[OfficeHub:admin:review] STEP1 failed', patchResult.error);
          setLastError(msg);
          return { ok: false, error: msg, attendanceUpdated: false };
        }
        if (!patchResult.data || patchResult.data.length === 0) {
          const msg = '処理失敗: 更新対象が見つかりません';
          setLastError(msg);
          return { ok: false, error: msg, attendanceUpdated: false };
        }

        // STEP 2: 承認 + 修正申請 のみ
        let attendanceUpdated = false;
        if (action === 'approve' && item._kind === 'correction') {
          const corr = item as { _kind: 'correction' } & CorrectionRequest;
          // 互換: target_date が無い場合は date を見る
          const targetDate =
            (corr as unknown as { date?: string }).date ?? corr.target_date;
          if (!targetDate) {
            const msg = '対象日が不明な申請のため、勤怠実績への反映をスキップしました';
            setLastError(msg);
            return { ok: true, error: msg, attendanceUpdated: false };
          }

          // 時刻ソース: after_clock_in があれば優先、なければ requested_clock_in
          const corrAny = corr as unknown as {
            after_clock_in?: string | null;
            after_clock_out?: string | null;
            after_breaks?: BreakJson[] | null;
            requested_clock_in?: string | null;
            requested_clock_out?: string | null;
          };

          const clockInTstz =
            corrAny.after_clock_in ??
            toTstz(corrAny.requested_clock_in, targetDate);
          const clockOutTstz =
            corrAny.after_clock_out ??
            toTstz(corrAny.requested_clock_out, targetDate);

          const attStatus = clockOutTstz ? 'completed' : 'working';
          const wt = normalizeWorkType(corr.requested_work_type);
          const memoVal = '勤怠修正申請承認により反映';

          logger.log('[OfficeHub:admin:review] STEP2 start', {
            targetDate,
            userId: corr.user_id,
            hasClockIn: Boolean(clockInTstz),
            hasClockOut: Boolean(clockOutTstz),
            workType: wt,
          });

          // 既存レコード確認
          type SelRes = {
            data: { id: string } | null;
            error: SbError;
          };
          const selResult = await withTimeout<SelRes>(
            supabase
              .from('attendance_records')
              .select('id')
              .eq('user_id', corr.user_id)
              .eq('date', targetDate)
              .maybeSingle() as unknown as Promise<SelRes>,
            10000,
            'SELECT attendance_records (STEP2)'
          ).catch(
            (e): SelRes => ({
              data: null,
              error: { message: e instanceof Error ? e.message : String(e) },
            })
          );

          if (selResult.error) {
            const msg = formatSbError(selResult.error, '勤怠実績への反映に失敗しました');
            logger.log('[OfficeHub:admin:review] STEP2 SELECT failed', selResult.error);
            setLastError(msg);
            return { ok: true, error: msg, attendanceUpdated: false };
          }

          let attendanceRecordId: string | null = selResult.data?.id ?? null;
          type WriteRes = {
            data?: { id: string }[] | null;
            error: SbError;
          };
          let writeError: SbError = null;

          if (attendanceRecordId) {
            // UPDATE
            const upd: Record<string, unknown> = {
              clock_out: clockOutTstz,
              status: attStatus,
              updated_at: nowISO,
              memo: memoVal,
            };
            if (corr.requested_work_type) upd.work_type = wt;
            if (clockInTstz) upd.clock_in = clockInTstz;

            logger.log('[OfficeHub:admin:review] STEP2 UPDATE', {
              attendanceRecordId,
              upd,
            });

            const r = await withTimeout<WriteRes>(
              supabase
                .from('attendance_records')
                .update(upd)
                .eq('id', attendanceRecordId)
                .select('id') as unknown as Promise<WriteRes>,
              15000,
              'UPDATE attendance_records (STEP2)'
            ).catch(
              (e): WriteRes => ({
                error: { message: e instanceof Error ? e.message : String(e) },
              })
            );
            writeError = r.error;
          } else {
            // INSERT
            const ins = {
              user_id: corr.user_id,
              date: targetDate,
              work_type: wt,
              clock_in: clockInTstz,
              clock_out: clockOutTstz,
              status: attStatus,
              memo: memoVal,
              created_at: nowISO,
              updated_at: nowISO,
            };

            logger.log('[OfficeHub:admin:review] STEP2 INSERT', { ins });

            const r = await withTimeout<WriteRes>(
              supabase
                .from('attendance_records')
                .insert(ins)
                .select('id') as unknown as Promise<WriteRes>,
              15000,
              'INSERT attendance_records (STEP2)'
            ).catch(
              (e): WriteRes => ({
                data: null,
                error: { message: e instanceof Error ? e.message : String(e) },
              })
            );
            writeError = r.error;
            attendanceRecordId = r.data?.[0]?.id ?? null;
          }

          if (writeError) {
            const msg = formatSbError(writeError, '勤怠実績への反映に失敗しました');
            logger.log('[OfficeHub:admin:review] STEP2 WRITE failed', writeError);
            setLastError(msg);
            return { ok: true, error: msg, attendanceUpdated: false };
          }

          // ★★★ 重要修正: attendance_record_id を保険として再取得 ★★★
          // attendance_breaks は attendance_record_id NOT NULL なので、
          // 万一ここで null だと INSERT が必ず失敗する
          if (!attendanceRecordId) {
            logger.log('[OfficeHub:admin:review] STEP2 refetch attendance_record_id');
            const refetch = await withTimeout<SelRes>(
              supabase
                .from('attendance_records')
                .select('id')
                .eq('user_id', corr.user_id)
                .eq('date', targetDate)
                .maybeSingle() as unknown as Promise<SelRes>,
              10000,
              'REFETCH attendance_records (STEP2)'
            ).catch(
              (e): SelRes => ({
                data: null,
                error: { message: e instanceof Error ? e.message : String(e) },
              })
            );
            attendanceRecordId = refetch.data?.id ?? null;
          }

          if (!attendanceRecordId) {
            const msg =
              '休憩データの保存準備に失敗しました: attendance_record_id が取得できません';
            logger.log('[OfficeHub:admin:review] STEP2b abort: no attendance_record_id');
            setLastError(msg);
            return { ok: true, error: msg, attendanceUpdated: true };
          }

          // ── STEP 2b: attendance_breaks を after_breaks で上書き ───
          const afterBreaks: BreakJson[] = Array.isArray(corrAny.after_breaks)
            ? corrAny.after_breaks
            : [];
          logger.log('[OfficeHub:admin:review] STEP2b breaks rewrite start', {
            attendanceRecordId,
            count: afterBreaks.length,
            afterBreaks,
          });

          // 既存の attendance_breaks を全削除
          const delResult = await withTimeout<{
            error: SbError;
          }>(
            supabase
              .from('attendance_breaks')
              .delete()
              .eq('user_id', corr.user_id)
              .eq('date', targetDate) as unknown as Promise<{
              error: SbError;
            }>,
            10000,
            'DELETE attendance_breaks (STEP2b)'
          ).catch(
            (e): { error: SbError } => ({
              error: { message: e instanceof Error ? e.message : String(e) },
            })
          );

          if (delResult.error) {
            const msg = formatSbError(delResult.error, '休憩の上書きに失敗しました (delete)');
            logger.log('[OfficeHub:admin:review] STEP2b DELETE failed', delResult.error);
            setLastError(msg);
            return { ok: true, error: msg, attendanceUpdated: true };
          }

          // 新しい休憩を insert (件数 0 ならスキップ)
          if (afterBreaks.length > 0) {
            const validBreaks = afterBreaks
              .filter(
                (b) => isValidHHmm(b.break_start) && isValidHHmm(b.break_end)
              )
              .map((b) => ({
                user_id: corr.user_id,
                date: targetDate,
                attendance_record_id: attendanceRecordId,
                break_start: toTstz(b.break_start, targetDate),
                break_end: toTstz(b.break_end, targetDate),
                memo: b.memo ?? null,
                created_at: nowISO,
                updated_at: nowISO,
              }));

            logger.log('[OfficeHub:admin:review] STEP2b validBreaks', {
              original: afterBreaks.length,
              valid: validBreaks.length,
              validBreaks,
            });

            if (validBreaks.length > 0) {
              type InsBrRes = {
                data?: { id: string }[] | null;
                error: SbError;
              };
              const insBrRes = await withTimeout<InsBrRes>(
                supabase
                  .from('attendance_breaks')
                  .insert(validBreaks)
                  .select('id') as unknown as Promise<InsBrRes>,
                15000,
                'INSERT attendance_breaks (STEP2b)'
              ).catch(
                (e): InsBrRes => ({
                  data: null,
                  error: { message: e instanceof Error ? e.message : String(e) },
                })
              );

              if (insBrRes.error) {
                const msg = formatSbError(insBrRes.error, '休憩の上書きに失敗しました (insert)');
                logger.log('[OfficeHub:admin:review] STEP2b INSERT failed', insBrRes.error);
                setLastError(msg);
                return { ok: true, error: msg, attendanceUpdated: true };
              }

              // ★★★ 重要修正: 実際に何件 INSERT されたか確認 ★★★
              const insertedCount = insBrRes.data?.length ?? 0;
              logger.log('[OfficeHub:admin:review] STEP2b INSERT done', {
                expected: validBreaks.length,
                actual: insertedCount,
              });

              if (insertedCount === 0) {
                const msg = `休憩の上書きに失敗しました: ${validBreaks.length}件のはずが0件しか保存されませんでした`;
                logger.log('[OfficeHub:admin:review] STEP2b INSERT 0 rows (silent failure)');
                setLastError(msg);
                return { ok: true, error: msg, attendanceUpdated: true };
              }
            }
          }

          attendanceUpdated = true;
          logger.log('[OfficeHub:admin:review] STEP2 done', {
            attendanceRecordId,
            breaksInserted: afterBreaks.length,
          });
        }

        return { ok: true, error: null, attendanceUpdated };
      } finally {
        processingRef.current = null;
        setProcessingId(null);
      }
    },
    []
  );

  return { processingId, lastError, review, clearError };
}
