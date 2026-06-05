import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import type { WorkType } from './types';
import { logger } from '../../lib/logger';

/**
 * 勤怠修正申請の保存フック
 * --------------------------------------------------------------
 * attendance_correction_requests テーブルへの INSERT
 *
 * カラム構造 (実テーブル準拠):
 *   - user_id (uuid)
 *   - date (date) 対象日
 *   - before_clock_in / before_clock_out (timestamptz) 修正前
 *   - before_breaks (jsonb 配列) 修正前
 *   - after_clock_in / after_clock_out (timestamptz) 修正後
 *   - after_breaks (jsonb 配列) 修正後
 *   - reason (text)
 *   - status (text) 'pending'
 *   - requested_at / created_at / updated_at (timestamptz)
 *
 * 休憩 JSON 形式: [{ break_start: 'HH:mm', break_end: 'HH:mm', memo: '' }, ...]
 *
 * 過去の互換用に requested_work_type / requested_clock_in / requested_clock_out
 * / requested_break_minutes / target_date / request_type も併せて送信する
 * (管理者画面 AdminApprovalPanel の表示が requested_* を見ているため)。
 * --------------------------------------------------------------
 */

/** 'HH:mm' の休憩区間 */
export type BreakInput = {
  /** 'HH:mm' */
  break_start: string;
  /** 'HH:mm' */
  break_end: string;
  memo?: string;
};

export type CorrectionRequestPayload = {
  /** public.users.id */
  userId: string;
  /** 対象日 'YYYY-MM-DD' */
  targetDate: string;
  /** 修正前 勤務区分 (記録があれば) */
  beforeWorkType: WorkType | null;
  /** 修正前 出勤時刻 'HH:mm' or '' */
  beforeClockIn: string;
  /** 修正前 退勤時刻 'HH:mm' or '' */
  beforeClockOut: string;
  /** 修正前 休憩配列 ('HH:mm' 形式に変換済) */
  beforeBreaks: BreakInput[];
  /** 修正後 勤務区分 */
  afterWorkType: WorkType;
  /** 修正後 出勤時刻 'HH:mm' or '' */
  afterClockIn: string;
  /** 修正後 退勤時刻 'HH:mm' or '' */
  afterClockOut: string;
  /** 修正後 休憩配列 */
  afterBreaks: BreakInput[];
  /** 申請理由 (必須) */
  reason: string;
};

export type SubmitResult = {
  ok: boolean;
  error: string | null;
};

export type UseCorrectionRequestState = {
  saving: boolean;
  lastError: string | null;
  submit: (payload: CorrectionRequestPayload) => Promise<SubmitResult>;
  clearError: () => void;
};

/** 'HH:mm' 形式バリデーション */
function toTimeOrNull(v: string): string | null {
  if (!v || v === '--:--') return null;
  if (!/^\d{2}:\d{2}$/.test(v)) return null;
  return v;
}

/** 'HH:mm' + 'YYYY-MM-DD' → 'YYYY-MM-DDTHH:mm:00+09:00' */
function toTstz(time: string, date: string): string | null {
  const t = toTimeOrNull(time);
  if (!t) return null;
  return `${date}T${t}:00+09:00`;
}

/** 休憩配列をクリーンアップ (有効な区間のみ残す) */
function sanitizeBreaks(arr: BreakInput[]): BreakInput[] {
  return arr
    .map((b) => ({
      break_start: toTimeOrNull(b.break_start) ?? '',
      break_end: toTimeOrNull(b.break_end) ?? '',
      memo: b.memo ?? '',
    }))
    .filter((b) => b.break_start !== '' && b.break_end !== '');
}

/** 休憩配列の合計分数 */
function totalBreakMinutes(arr: BreakInput[]): number {
  let total = 0;
  for (const b of arr) {
    const [sh, sm] = b.break_start.split(':').map(Number);
    const [eh, em] = b.break_end.split(':').map(Number);
    if (!isFinite(sh) || !isFinite(eh)) continue;
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin > startMin) total += endMin - startMin;
  }
  return total;
}

export function useCorrectionRequest(): UseCorrectionRequestState {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = useCallback(() => setLastError(null), []);

  const submit = useCallback(
    async (payload: CorrectionRequestPayload): Promise<SubmitResult> => {
      const supabase = getSupabase();
      if (!supabase) {
        const msg = 'Supabase が未設定です';
        setLastError(msg);
        return { ok: false, error: msg };
      }
      if (savingRef.current) {
        return { ok: false, error: null };
      }

      const reason = payload.reason.trim();
      if (!reason) {
        const msg = '申請理由を入力してください';
        setLastError(msg);
        return { ok: false, error: msg };
      }

      savingRef.current = true;
      setSaving(true);
      setLastError(null);

      const nowISO = new Date().toISOString();
      const date = payload.targetDate;

      const beforeBreaks = sanitizeBreaks(payload.beforeBreaks);
      const afterBreaks = sanitizeBreaks(payload.afterBreaks);

      const body: Record<string, unknown> = {
        user_id: payload.userId,
        // 正しいカラム
        date,
        before_clock_in: toTstz(payload.beforeClockIn, date),
        before_clock_out: toTstz(payload.beforeClockOut, date),
        before_breaks: beforeBreaks,
        after_clock_in: toTstz(payload.afterClockIn, date),
        after_clock_out: toTstz(payload.afterClockOut, date),
        after_breaks: afterBreaks,
        reason,
        status: 'pending',
        requested_at: nowISO,
        created_at: nowISO,
        updated_at: nowISO,
        // 互換 (AdminApprovalPanel / 既存147件と同じ形)
        target_date: date,
        request_type: 'correction',
        requested_work_type: payload.afterWorkType,
        requested_clock_in: toTimeOrNull(payload.afterClockIn),
        requested_clock_out: toTimeOrNull(payload.afterClockOut),
        requested_break_minutes: totalBreakMinutes(afterBreaks),
      };

      logger.log('[OfficeHub:kintai:correction] submit start', {
        date,
        afterClockIn: body.requested_clock_in,
        afterClockOut: body.requested_clock_out,
        beforeBreakCount: beforeBreaks.length,
        afterBreakCount: afterBreaks.length,
        afterBreakMinutes: body.requested_break_minutes,
        reasonLength: reason.length,
      });

      try {
        const { data, error } = await supabase
          .from('attendance_correction_requests')
          .insert(body)
          .select();
        logger.log('[OfficeHub:kintai:correction] submit done', {
          insertedCount: data?.length ?? 0,
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
        });

        if (error) {
          const msg = `申請失敗: ${error.message} (code: ${error.code ?? '—'})`;
          setLastError(msg);
          return { ok: false, error: msg };
        }
        if (!data || data.length === 0) {
          const msg = '申請失敗: レコードが作成されませんでした';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        return { ok: true, error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('[OfficeHub:kintai:correction] submit threw', { errorMessage: msg });
        setLastError(`通信エラー: ${msg}`);
        return { ok: false, error: msg };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    []
  );

  return { saving, lastError, submit, clearError };
}
