import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { CorrectionRequest } from './types';
import type { ReviewAction, ReviewableItem, ReviewResult } from './useReviewRequest';

/**
 * 一括承認 / 一括却下 フック (Phase 4-3)
 * --------------------------------------------------------------
 * 既存 useReviewRequest の `review` 関数を直列で複数回呼び出し、
 * 進捗・成功・失敗を集計して返す。
 *
 * 並列処理は Supabase のレート制限 + RLSキャッシュタイミングに
 * 引っかかる可能性があるため、安全のため直列実行。
 *
 * 1件あたり 200ms 待機を挿入して負荷を抑える。
 * --------------------------------------------------------------
 */

export type BulkReviewParams = {
  items: ReviewableItem[];
  action: ReviewAction;
  reviewerId: string;
  /** 全件共通の admin コメント */
  adminComment: string;
};

export type BulkProgress = {
  /** 処理対象の総数 */
  total: number;
  /** 完了 (成功 + 失敗) 件数 */
  done: number;
  /** 成功件数 */
  ok: number;
  /** 失敗件数 */
  ng: number;
  /** 現在処理中の id (UI 強調表示用) */
  currentId: string | null;
  /** 失敗の id と理由のリスト */
  errors: Array<{ id: string; reason: string }>;
};

export type BulkResult = {
  ok: number;
  ng: number;
  errors: Array<{ id: string; reason: string }>;
  /** 中断されたか */
  aborted: boolean;
};

export type UseBulkReviewState = {
  running: boolean;
  progress: BulkProgress | null;
  lastResult: BulkResult | null;
  bulkReview: (params: BulkReviewParams) => Promise<BulkResult>;
  abort: () => void;
  clearResult: () => void;
};

// useReviewRequest と同じヘルパー (重複だが import 循環を避けるため再記述)
function toTstz(time: string | null | undefined, date: string): string | null {
  if (!time) return null;
  const hm = String(time).slice(0, 5);
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

async function reviewOne(
  item: ReviewableItem,
  action: ReviewAction,
  reviewerId: string,
  adminComment: string
): Promise<ReviewResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase 未設定', attendanceUpdated: false };
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
          status: 'approved' as const,
          approved_by: reviewerId,
          approved_at: nowISO,
          admin_comment: commentTrimmed || null,
          updated_at: nowISO,
        }
      : {
          status: 'rejected' as const,
          rejected_by: reviewerId,
          rejected_at: nowISO,
          admin_comment: commentTrimmed || null,
          updated_at: nowISO,
        };

  type Res = {
    data: unknown[] | null;
    error: { message: string; code?: string } | null;
  };
  const res = await withTimeout<Res>(
    supabase
      .from(table)
      .update(patch)
      .eq('id', item.id)
      .select() as unknown as Promise<Res>,
    15000,
    `BULK ${action} ${item._kind} ${item.id}`
  ).catch(
    (e): Res => ({
      data: null,
      error: { message: e instanceof Error ? e.message : String(e) },
    })
  );

  if (res.error) {
    return {
      ok: false,
      error: `ステータス更新失敗: ${res.error.message}`,
      attendanceUpdated: false,
    };
  }
  if (!res.data || res.data.length === 0) {
    return {
      ok: false,
      error: 'RLSポリシーで弾かれた可能性',
      attendanceUpdated: false,
    };
  }

  // STEP2: 承認 かつ 修正申請の場合のみ
  if (action !== 'approve' || item._kind !== 'correction') {
    return { ok: true, error: null, attendanceUpdated: false };
  }

  const cr = item as CorrectionRequest;
  const date = cr.target_date;
  const clockIn = toTstz(cr.requested_clock_in, date);
  const clockOut = toTstz(cr.requested_clock_out, date);
  const workType = normalizeWorkType(cr.requested_work_type);

  // 既存 attendance_record 確認
  type SelRes = {
    data: Array<{ id: string }> | null;
    error: { message: string } | null;
  };
  const selRes = await withTimeout<SelRes>(
    supabase
      .from('attendance_records')
      .select('id')
      .eq('user_id', cr.user_id)
      .eq('date', date)
      .limit(1) as unknown as Promise<SelRes>,
    8000,
    'SELECT attendance_records (bulk)'
  ).catch(
    (e): SelRes => ({
      data: null,
      error: { message: e instanceof Error ? e.message : String(e) },
    })
  );

  type WriteRes = { data: unknown[] | null; error: { message: string } | null };
  const recPayload = {
    user_id: cr.user_id,
    date,
    clock_in: clockIn,
    clock_out: clockOut,
    work_type: workType,
    status: clockOut ? ('completed' as const) : ('working' as const),
    memo: '勤怠修正申請承認により反映',
    updated_at: nowISO,
  };

  let writeRes: WriteRes;
  if (selRes.data && selRes.data.length > 0) {
    // UPDATE
    writeRes = await withTimeout<WriteRes>(
      supabase
        .from('attendance_records')
        .update(recPayload)
        .eq('id', selRes.data[0].id) as unknown as Promise<WriteRes>,
      12000,
      'UPDATE attendance_records (bulk)'
    ).catch(
      (e): WriteRes => ({
        data: null,
        error: { message: e instanceof Error ? e.message : String(e) },
      })
    );
  } else {
    // INSERT
    writeRes = await withTimeout<WriteRes>(
      supabase
        .from('attendance_records')
        .insert({ ...recPayload, created_at: nowISO }) as unknown as Promise<WriteRes>,
      12000,
      'INSERT attendance_records (bulk)'
    ).catch(
      (e): WriteRes => ({
        data: null,
        error: { message: e instanceof Error ? e.message : String(e) },
      })
    );
  }

  if (writeRes.error) {
    return {
      ok: true,
      error: `承認は通ったが勤怠反映失敗: ${writeRes.error.message}`,
      attendanceUpdated: false,
    };
  }

  // 休憩時間の反映 (requested_break_minutes が指定されている場合)
  if (cr.requested_break_minutes != null && cr.requested_break_minutes > 0 && clockIn) {
    // 既存の休憩を全削除 → 1件追加 (シンプルな差し替え)
    await supabase
      .from('attendance_breaks')
      .delete()
      .eq('user_id', cr.user_id)
      .eq('date', date);

    const breakStart = clockIn;
    // break_start から break_minutes 分後を break_end とする
    const breakStartDate = new Date(clockIn);
    const breakEndDate = new Date(
      breakStartDate.getTime() + cr.requested_break_minutes * 60000
    );
    const breakEnd = breakEndDate.toISOString();

    await supabase.from('attendance_breaks').insert({
      user_id: cr.user_id,
      date,
      break_start: breakStart,
      break_end: breakEnd,
      created_at: nowISO,
    });
  }

  return { ok: true, error: null, attendanceUpdated: true };
}

export function useBulkReview(): UseBulkReviewState {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [lastResult, setLastResult] = useState<BulkResult | null>(null);
  const abortRef = useRef(false);
  const runningRef = useRef(false);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const clearResult = useCallback(() => {
    setLastResult(null);
    setProgress(null);
  }, []);

  const bulkReview = useCallback(
    async (params: BulkReviewParams): Promise<BulkResult> => {
      if (runningRef.current) {
        return { ok: 0, ng: 0, errors: [], aborted: true };
      }
      runningRef.current = true;
      abortRef.current = false;
      setRunning(true);
      setLastResult(null);

      const total = params.items.length;
      const errors: Array<{ id: string; reason: string }> = [];
      let ok = 0;
      let ng = 0;

      setProgress({
        total,
        done: 0,
        ok: 0,
        ng: 0,
        currentId: null,
        errors: [],
      });

      logger.log('[OfficeHub:bulkReview] start', {
        action: params.action,
        total,
      });

      for (let i = 0; i < params.items.length; i++) {
        if (abortRef.current) {
          logger.log('[OfficeHub:bulkReview] aborted', { done: i, total });
          break;
        }
        const item = params.items[i];
        setProgress((p) =>
          p ? { ...p, currentId: item.id } : null
        );

        try {
          const r = await reviewOne(
            item,
            params.action,
            params.reviewerId,
            params.adminComment
          );
          if (r.ok) {
            ok++;
          } else {
            ng++;
            errors.push({ id: item.id, reason: r.error ?? '不明なエラー' });
          }
        } catch (e) {
          ng++;
          errors.push({
            id: item.id,
            reason: e instanceof Error ? e.message : String(e),
          });
        }

        setProgress({
          total,
          done: i + 1,
          ok,
          ng,
          currentId: null,
          errors: [...errors],
        });

        // レート制限対策で 150ms 待機
        await new Promise((res) => setTimeout(res, 150));
      }

      const result: BulkResult = {
        ok,
        ng,
        errors,
        aborted: abortRef.current,
      };
      logger.log('[OfficeHub:bulkReview] complete', result);
      setLastResult(result);
      runningRef.current = false;
      setRunning(false);
      return result;
    },
    []
  );

  return { running, progress, lastResult, bulkReview, abort, clearResult };
}
