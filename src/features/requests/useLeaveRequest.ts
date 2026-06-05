import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import type { LeaveType } from './types';
import { HALF_LEAVE_TYPES, calcLeaveDays } from './requestUtils';
import { checkMonthLocked } from '../closure/checkLocked';
import { logger } from '../../lib/logger';

/**
 * 休暇申請の保存フック (Phase 3-6 修正版 + Phase 2 ロック判定)
 * --------------------------------------------------------------
 * 設計変更:
 *   1. submit 関数で leave_balances を再フェッチしない。
 *      → UI 側で既に持っている availableDays / consumedDays を
 *        パラメータで受け取り、引き算でバリデーション。
 *      → 余計な Supabase 呼び出しを1回減らし、トークンリフレッシュとの
 *        競合リスクを最小化する。
 *
 *   2. insert 呼び出しに 15 秒のタイムアウトを付ける。
 *      → トークンリフレッシュ等で固まったときに「送信中…」が永遠に続く
 *        ことを防ぐ。明示的なエラーで終了させる。
 *
 *   3. savingRef.current と setSaving(true) を最優先で立てる。
 *      → UI 側の多重押下防止が確実に効く。
 *
 *   4. INSERT 先は leave_requests のみ。payload は既存システムと完全一致。
 *
 *   5. Phase 2: 開始日の月が monthly_closures で confirmed なら拒否。
 *      跨ぎ申請の場合は終了日の月もチェック。
 * --------------------------------------------------------------
 */

export type LeaveRequestPayload = {
  /** public.users.id */
  userId: string;
  leaveType: LeaveType;
  /** 'YYYY-MM-DD' */
  startDate: string;
  /** 'YYYY-MM-DD' (半休のときは start_date と同じになる) */
  endDate: string;
  reason: string;
  /** 管理者は残日数バリデーションをスキップ */
  isAdmin: boolean;
  /** 利用可能日数 (付与+繰越+調整)。null なら残日数チェック自体をスキップ */
  availableDays: number | null;
  /** 既に取得済み・承認待ちの有休消化日数の合計 */
  consumedDays: number;
};

export type SubmitLeaveResult = {
  ok: boolean;
  error: string | null;
  days?: number;
};

export type UseLeaveRequestState = {
  saving: boolean;
  lastError: string | null;
  submit: (payload: LeaveRequestPayload) => Promise<SubmitLeaveResult>;
  clearError: () => void;
};

const PAID_TYPES_SET = new Set<LeaveType>(['paid', 'morning_half', 'afternoon_half']);

export function useLeaveRequest(): UseLeaveRequestState {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = useCallback(() => setLastError(null), []);

  const submit = useCallback(
    async (payload: LeaveRequestPayload): Promise<SubmitLeaveResult> => {
      // ── 多重押下防止を最優先 ─────────────────────────
      if (savingRef.current) {
        return { ok: false, error: null };
      }
      savingRef.current = true;
      setSaving(true);
      setLastError(null);

      try {
        const supabase = getSupabase();
        if (!supabase) {
          const msg = 'Supabase が未設定です';
          setLastError(msg);
          return { ok: false, error: msg };
        }

        // ── 入力バリデーション ───────────────────────
        if (!payload.startDate) {
          const msg = '開始日を選択してください';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        if (!payload.endDate) {
          const msg = '終了日を選択してください';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        if (payload.endDate < payload.startDate) {
          const msg = '終了日は開始日以降を選択してください';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        const reason = payload.reason.trim();
        if (!reason) {
          const msg = '申請理由を入力してください';
          setLastError(msg);
          return { ok: false, error: msg };
        }

        // 日数計算 (半休=0.5、全休=営業日数)
        const isHalf = HALF_LEAVE_TYPES.has(payload.leaveType);
        const effectiveEndDate = isHalf ? payload.startDate : payload.endDate;

        // ★ Phase 2: 月次締めロック判定 (開始日と終了日の両月をチェック)
        const lockStart = await checkMonthLocked(payload.userId, payload.startDate);
        if (lockStart.locked) {
          const msg =
            lockStart.message ?? '対象月は確定済のため休暇申請できません';
          logger.log('[OfficeHub:requests:leave] BLOCKED by closure lock (start)');
          setLastError(msg);
          return { ok: false, error: msg };
        }
        // 月をまたぐ場合は終了日側もチェック
        const startMonth = payload.startDate.slice(0, 7);
        const endMonth = effectiveEndDate.slice(0, 7);
        if (endMonth !== startMonth) {
          const lockEnd = await checkMonthLocked(payload.userId, effectiveEndDate);
          if (lockEnd.locked) {
            const msg =
              lockEnd.message ?? '対象月は確定済のため休暇申請できません';
            logger.log('[OfficeHub:requests:leave] BLOCKED by closure lock (end)');
            setLastError(msg);
            return { ok: false, error: msg };
          }
        }

        const days = calcLeaveDays(
          payload.leaveType,
          payload.startDate,
          effectiveEndDate
        );

        // ── 残日数バリデーション (UI から渡された値を使う) ──
        // admin はスキップ、availableDays が null (leave_balances 行なし) もスキップ
        if (
          PAID_TYPES_SET.has(payload.leaveType) &&
          !payload.isAdmin &&
          payload.availableDays != null
        ) {
          const remaining =
            Math.round((payload.availableDays - payload.consumedDays) * 10) / 10;
          if (days > remaining) {
            const msg = `有休残日数を超えるため申請できません。残日数: ${remaining}日、申請: ${days}日`;
            setLastError(msg);
            return { ok: false, error: msg };
          }
        }

        // ── INSERT (タイムアウト 15秒) ─────────────────
        const nowISO = new Date().toISOString();
        const body = {
          user_id: payload.userId,
          leave_type: payload.leaveType,
          start_date: payload.startDate,
          end_date: effectiveEndDate,
          days,
          reason,
          status: 'pending' as const,
          created_at: nowISO,
          updated_at: nowISO,
        };
        logger.log('[OfficeHub:requests:leave] submit start', {
          leaveType: payload.leaveType,
          startDate: payload.startDate,
          endDate: effectiveEndDate,
          days,
          reasonLength: reason.length,
        });

        // Supabase の builder は thenable だが厳密な Promise ではないので、
        // Promise.resolve でラップしてから withTimeout に渡す。
        type InsertResult = {
          data: unknown[] | null;
          error: { code?: string; message: string } | null;
        };
        const insertPromise: Promise<InsertResult> = Promise.resolve(
          supabase.from('leave_requests').insert(body).select()
        ) as Promise<InsertResult>;

        let data: unknown[] | null = null;
        let error: { code?: string; message: string } | null = null;
        try {
          const r = await withTimeout(insertPromise, 15000, 'INSERT leave_requests');
          data = r.data;
          error = r.error;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.log('[OfficeHub:requests:leave] submit threw / timeout', {
            errorMessage: msg,
          });
          setLastError(`通信エラー: ${msg}`);
          return { ok: false, error: msg };
        }
        logger.log('[OfficeHub:requests:leave] submit done', {
          insertedCount: Array.isArray(data) ? data.length : 0,
          errorCode: error?.code ?? null,
          errorMessage: error?.message ?? null,
        });

        if (error) {
          const msg = `申請失敗: ${error.message} (code: ${error.code ?? '—'})`;
          setLastError(msg);
          return { ok: false, error: msg };
        }
        if (!Array.isArray(data) || data.length === 0) {
          const msg = '申請失敗: レコードが作成されませんでした';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        return { ok: true, error: null, days };
      } finally {
        savingRef.current = false;
        setSaving(false);
        logger.log('[OfficeHub:requests:leave] submit finally -> saving=false');
      }
    },
    []
  );

  return { saving, lastError, submit, clearError };
}
