import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import type { AttendanceBreak, AttendanceRecord, WorkType } from './types';
import { todayStr } from './utils';
import { logger } from '../../lib/logger';

/**
 * 打刻保存フック (Phase 3-4: 書き込み実装)
 * --------------------------------------------------------------
 * 既存システム timetrack-app-clean の AttendanceClock.jsx 内
 * `punch` 関数を TypeScript で完全踏襲。
 *
 * 操作種別ごとの動作 (既存と完全に同一):
 *   - 'in'          : attendance_records に upsert (出勤打刻)
 *   - 'break_start' : attendance_breaks に insert (休憩開始)
 *   - 'break_end'   : attendance_breaks の break_end を update (休憩終了)
 *   - 'out'         : 進行中休憩を先に終了 → attendance_records を update (退勤)
 *
 * 既存テーブル・RLS・保存ロジックは変更しない。
 *
 * ★ 実装注意:
 *    saving は state + ref の二重管理。state は UI 表示のため、ref は
 *    useCallback の依存配列を空にしたまま「多重押下防止」を実現するため。
 *    こうしないと saving が変わるたびに punch 関数が再生成され、呼び出し側
 *    (ClockPanel) でも依存関係が連鎖して不安定になる。
 * --------------------------------------------------------------
 */

export type PunchAction = 'in' | 'break_start' | 'break_end' | 'out';

export type PunchParams = {
  /** public.users.id (auth_user_id ではない) */
  userId: string;
  /** 出勤打刻時に使用 (office / remote / business_trip) */
  workType: WorkType;
  /** 現在の勤怠レコード (退勤・休憩開始・休憩終了の判断に使用) */
  record: AttendanceRecord | null;
  /** 現在の休憩一覧 (退勤時の自動終了・休憩終了の対象判断に使用) */
  breaks: AttendanceBreak[];
};

export type PunchResult = {
  ok: boolean;
  error: string | null;
};

export type UsePunchState = {
  saving: boolean;
  lastError: string | null;
  punch: (action: PunchAction, params: PunchParams) => Promise<PunchResult>;
  clearError: () => void;
};

const findOngoingBreak = (breaks: AttendanceBreak[]): AttendanceBreak | undefined =>
  breaks.find((b) => b.break_start && !b.break_end);

export function usePunch(): UsePunchState {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // ★ 多重押下チェック用 (関数の再生成を避ける)
  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = useCallback(() => setLastError(null), []);

  // ★ useCallback の依存配列は空。saving チェックは ref 経由で行う。
  const punch = useCallback(
    async (action: PunchAction, params: PunchParams): Promise<PunchResult> => {
      const supabase = getSupabase();
      if (!supabase) {
        const msg = 'Supabase が未設定です';
        setLastError(msg);
        return { ok: false, error: msg };
      }
      if (savingRef.current) {
        logger.log('[OfficeHub:kintai:punch] skipped (already saving)');
        return { ok: false, error: null };
      }

      savingRef.current = true;
      setSaving(true);
      setLastError(null);
      const nowISO = new Date().toISOString();
      const today = todayStr();

      // 診断ログ (値そのものは出さない)
      logger.log('[OfficeHub:kintai:punch] start', {
        action,
        hasRecord: Boolean(params.record),
        hasRecordId: Boolean(params.record?.id),
        recordStatus: params.record?.status ?? null,
        breaksCount: params.breaks.length,
        hasOngoingBreak: Boolean(findOngoingBreak(params.breaks)),
        workType: action === 'in' ? params.workType : undefined,
      });

      try {
        // ── 出勤 (upsert) ──────────────────────────────────
        if (action === 'in') {
          const { error } = await supabase
            .from('attendance_records')
            .upsert(
              {
                user_id: params.userId,
                date: today,
                clock_in: nowISO,
                clock_out: null,
                work_type: params.workType,
                status: 'working',
              },
              { onConflict: 'user_id,date' }
            )
            .select()
            .single();
          if (error) {
            throw new Error(`出勤失敗: ${error.message} (code: ${error.code ?? '—'})`);
          }
        }

        // ── 退勤 (進行中休憩の自動終了 → record の clock_out 更新) ──
        else if (action === 'out') {
          if (!params.record?.id) {
            throw new Error('勤怠レコードが見つかりません');
          }
          // 進行中の休憩を先に自動終了
          const ongoing = findOngoingBreak(params.breaks);
          if (ongoing?.id) {
            const { error: be } = await supabase
              .from('attendance_breaks')
              .update({ break_end: nowISO })
              .eq('id', ongoing.id);
            if (be) {
              throw new Error(`休憩自動終了失敗: ${be.message} (code: ${be.code ?? '—'})`);
            }
          }
          const correctedWorkType =
            !params.record.work_type || params.record.work_type === 'normal'
              ? 'office'
              : params.record.work_type;
          const { error } = await supabase
            .from('attendance_records')
            .update({
              clock_out: nowISO,
              status: 'completed',
              work_type: correctedWorkType,
            })
            .eq('id', params.record.id)
            .select()
            .single();
          if (error) {
            throw new Error(`退勤失敗: ${error.message} (code: ${error.code ?? '—'})`);
          }
        }

        // ── 休憩開始 (insert) ──────────────────────────────
        else if (action === 'break_start') {
          if (!params.record?.id) {
            throw new Error('勤怠レコードが見つかりません');
          }
          if (findOngoingBreak(params.breaks)) {
            throw new Error('すでに休憩中です');
          }
          const { error } = await supabase.from('attendance_breaks').insert({
            attendance_record_id: params.record.id,
            user_id: params.userId,
            date: today,
            break_start: nowISO,
            break_end: null,
            memo: null,
          });
          if (error) {
            throw new Error(`休憩開始失敗: ${error.message} (code: ${error.code ?? '—'})`);
          }
        }

        // ── 休憩終了 (update) ──────────────────────────────
        else if (action === 'break_end') {
          const ongoing = findOngoingBreak(params.breaks);
          if (!ongoing?.id) {
            throw new Error('進行中の休憩が見つかりません');
          }
          const { error } = await supabase
            .from('attendance_breaks')
            .update({ break_end: nowISO })
            .eq('id', ongoing.id)
            .eq('user_id', params.userId);
          if (error) {
            throw new Error(`休憩終了失敗: ${error.message} (code: ${error.code ?? '—'})`);
          }
        }
        logger.log('[OfficeHub:kintai:punch] success', { action });
        return { ok: true, error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('[OfficeHub:kintai:punch] failure', { action, errorMessage: msg });
        setLastError(msg);
        return { ok: false, error: msg };
      } finally {
        // ★ 必ず saving を解除する。例外があっても通る。
        savingRef.current = false;
        setSaving(false);
        logger.log('[OfficeHub:kintai:punch] finally -> saving=false');
      }
    },
    []  // ★ 依存配列を空に。saving は ref 経由で参照。
  );

  return { saving, lastError, punch, clearError };
}
