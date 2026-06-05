import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

/**
 * 申請取消フック
 * --------------------------------------------------------------
 * 既存システム RequestsView.jsx の handleCancel を完全踏襲。
 *
 * - 対象テーブル: leave_requests / attendance_correction_requests
 * - UPDATE { status: 'cancelled', updated_at }
 * - WHERE id = ? AND user_id = ? (本人の申請のみ取り消し可)
 *
 * pending 状態のチェックは UI 側で行う (ボタン表示の出し分け)。
 * もし pending 以外を取り消そうとした場合も、RLS 等でブロックされる想定。
 * --------------------------------------------------------------
 */

export type CancelKind = 'leave' | 'correction';

export type CancelParams = {
  kind: CancelKind;
  requestId: string;
  /** 本人の public.users.id (WHERE user_id = ? に使う) */
  userId: string;
};

export type CancelResult = {
  ok: boolean;
  error: string | null;
};

export type UseCancelState = {
  /** 取消処理中の申請 id */
  cancellingId: string | null;
  lastError: string | null;
  cancel: (params: CancelParams) => Promise<CancelResult>;
  clearError: () => void;
};

export function useCancelRequest(): UseCancelState {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cancellingRef = useRef<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = useCallback(() => setLastError(null), []);

  const cancel = useCallback(
    async (params: CancelParams): Promise<CancelResult> => {
      // 多重実行防止
      if (cancellingRef.current) {
        return { ok: false, error: null };
      }
      cancellingRef.current = params.requestId;
      setCancellingId(params.requestId);
      setLastError(null);

      try {
        const supabase = getSupabase();
        if (!supabase) {
          const msg = 'Supabase が未設定です';
          setLastError(msg);
          return { ok: false, error: msg };
        }

        const table =
          params.kind === 'leave'
            ? 'leave_requests'
            : 'attendance_correction_requests';

        const nowISO = new Date().toISOString();
        const patch = {
          status: 'cancelled' as const,
          updated_at: nowISO,
        };
        logger.log('[OfficeHub:requests:cancel] start', {
          table,
          requestId: params.requestId,
        });

        type CancelRes = {
          data: unknown[] | null;
          error: { message: string; code?: string } | null;
        };

        const res = await withTimeout<CancelRes>(
          supabase
            .from(table)
            .update(patch)
            .eq('id', params.requestId)
            .eq('user_id', params.userId)
            .select() as unknown as Promise<CancelRes>,
          15000,
          `UPDATE ${table} (cancel)`
        ).catch(
          (e): CancelRes => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );
        logger.log('[OfficeHub:requests:cancel] done', {
          updatedCount: res.data?.length ?? 0,
          errorCode: res.error?.code ?? null,
          errorMessage: res.error?.message ?? null,
        });

        if (res.error) {
          const msg = `取消失敗: ${res.error.message}`;
          setLastError(msg);
          return { ok: false, error: msg };
        }
        if (!res.data || res.data.length === 0) {
          const msg = '取消失敗: 対象の申請が見つからないか、すでに処理されています';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        return { ok: true, error: null };
      } finally {
        cancellingRef.current = null;
        setCancellingId(null);
        logger.log('[OfficeHub:requests:cancel] finally -> cancellingId=null');
      }
    },
    []
  );

  return { cancellingId, lastError, cancel, clearError };
}
