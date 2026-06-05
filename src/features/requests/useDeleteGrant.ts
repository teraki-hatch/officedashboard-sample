import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

/**
 * 付与履歴削除フック (Phase 3-8 補完)
 * --------------------------------------------------------------
 * leave_grants から指定の1行を DELETE する。
 *
 * 既存システムには UI 上の削除機能はないが、誤付与の修正用として
 * OfficeHub の有休管理に追加。
 *
 * 注意:
 *   - 削除しても leave_balances は自動で減算されない (別途編集で調整)
 *   - admin role のみ実行可能 (RLS 前提)
 *
 * このフックは leave_grants の DELETE のみ。
 * leave_balances 側の修正は useEditBalance を使う。
 * --------------------------------------------------------------
 */

export type DeleteGrantParams = {
  grantId: string;
  /** ログ用 (なくてもOK) */
  userName?: string;
};

export type DeleteGrantResult = {
  ok: boolean;
  error: string | null;
};

export type UseDeleteGrantState = {
  deletingId: string | null;
  lastError: string | null;
  deleteGrant: (params: DeleteGrantParams) => Promise<DeleteGrantResult>;
  clearError: () => void;
};

export function useDeleteGrant(): UseDeleteGrantState {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingRef = useRef<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = useCallback(() => setLastError(null), []);

  const deleteGrant = useCallback(
    async (params: DeleteGrantParams): Promise<DeleteGrantResult> => {
      if (deletingRef.current) {
        return { ok: false, error: null };
      }
      deletingRef.current = params.grantId;
      setDeletingId(params.grantId);
      setLastError(null);

      try {
        const supabase = getSupabase();
        if (!supabase) {
          const msg = 'Supabase が未設定です';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        logger.log('[OfficeHub:leave-admin:delete-grant] start', {
          grantId: params.grantId,
        });

        type DelRes = {
          data: unknown[] | null;
          error: { message: string; code?: string } | null;
        };
        const res = await withTimeout<DelRes>(
          supabase
            .from('leave_grants')
            .delete()
            .eq('id', params.grantId)
            .select() as unknown as Promise<DelRes>,
          15000,
          'DELETE leave_grants'
        ).catch(
          (e): DelRes => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );
        logger.log('[OfficeHub:leave-admin:delete-grant] done', {
          deletedCount: res.data?.length ?? 0,
          errorCode: res.error?.code ?? null,
          errorMessage: res.error?.message ?? null,
        });

        if (res.error) {
          const msg = `削除失敗: ${res.error.message} (code: ${res.error.code ?? '—'})`;
          setLastError(msg);
          return { ok: false, error: msg };
        }
        if (!res.data || res.data.length === 0) {
          const msg = '削除失敗: 対象の付与履歴が見つからないか、権限がありません';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        return { ok: true, error: null };
      } finally {
        deletingRef.current = null;
        setDeletingId(null);
        logger.log('[OfficeHub:leave-admin:delete-grant] finally -> deletingId=null');
      }
    },
    []
  );

  return { deletingId, lastError, deleteGrant, clearError };
}
