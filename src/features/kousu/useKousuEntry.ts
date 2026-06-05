import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

/**
 * 工数 CRUD フック (Phase 4-1 + Gcal連携 + タイトル欄)
 * --------------------------------------------------------------
 * Phase C-3: projects 廃止により project_id → client_id へ移行。
 *
 * - insert: 新規エントリ作成 (Gcal 連携時は source='gcal' + event_id 保存)
 * - update: 既存エントリ更新 (clientId / categoryId / hours / title / memo)
 * - delete: 削除 (user_id 一致確認付き)
 *
 * すべて user_id 一致で WHERE 句指定 (RLS 前提だが、二重防御)。
 * --------------------------------------------------------------
 */

export type SaveEntryParams = {
  userId: string;
  date: string; // "YYYY-MM-DD"
  clientId: string;
  /** 案件ID (任意。社内案件含む) */
  dealId?: string | null;
  workCategoryId: string;
  hours: number;
  /** 作業のタイトル (短く要約) */
  title: string;
  /** 詳細メモ (任意) */
  memo: string;
  /** 編集モード時のみ ID */
  editId?: string | null;
  /** Googleカレンダー連携: 元になった予定の event_id */
  googleCalendarEventId?: string | null;
};

export type DeleteEntryParams = {
  userId: string;
  entryId: string;
};

export type CRUDResult = {
  ok: boolean;
  error: string | null;
};

export type UseKousuEntryState = {
  saving: boolean;
  deleting: boolean;
  lastError: string | null;
  save: (params: SaveEntryParams) => Promise<CRUDResult>;
  remove: (params: DeleteEntryParams) => Promise<CRUDResult>;
  clearError: () => void;
};

export function useKousuEntry(): UseKousuEntryState {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const savingRef = useRef(false);
  const deletingRef = useRef(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = useCallback(() => setLastError(null), []);

  const save = useCallback(
    async (params: SaveEntryParams): Promise<CRUDResult> => {
      if (savingRef.current) return { ok: false, error: null };
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

        type Res = {
          data: unknown[] | null;
          error: { message: string; code?: string } | null;
        };

        let res: Res;
        if (params.editId) {
          // UPDATE (Gcal 紐付けは触らない)
          logger.log('[OfficeHub:kousu:entry] update start', {
            id: params.editId,
            userId: params.userId,
          });
          res = await withTimeout<Res>(
            supabase
              .from('time_entries')
              .update({
                client_id: params.clientId,
                deal_id: params.dealId ?? null,
                work_category_id: params.workCategoryId,
                hours: params.hours,
                title: params.title.trim() || null,
                memo: params.memo.trim() || null,
              })
              .eq('id', params.editId)
              .eq('user_id', params.userId)
              .select() as unknown as Promise<Res>,
            15000,
            'UPDATE time_entries'
          ).catch(
            (e): Res => ({
              data: null,
              error: { message: e instanceof Error ? e.message : String(e) },
            })
          );
        } else {
          // INSERT
          const hasGcal = !!params.googleCalendarEventId;
          const payload: Record<string, unknown> = {
            user_id: params.userId,
            date: params.date,
            client_id: params.clientId,
            deal_id: params.dealId ?? null,
            work_category_id: params.workCategoryId,
            hours: params.hours,
            title: params.title.trim() || null,
            memo: params.memo.trim() || null,
            source: hasGcal ? 'gcal' : 'manual',
          };
          if (hasGcal) {
            payload.google_calendar_event_id = params.googleCalendarEventId;
          }
          logger.log('[OfficeHub:kousu:entry] insert start', payload);
          res = await withTimeout<Res>(
            supabase
              .from('time_entries')
              .insert(payload)
              .select() as unknown as Promise<Res>,
            15000,
            'INSERT time_entries'
          ).catch(
            (e): Res => ({
              data: null,
              error: { message: e instanceof Error ? e.message : String(e) },
            })
          );
        }

        if (res.error) {
          const msg = `保存失敗: ${res.error.message} (code: ${res.error.code ?? '—'})`;
          logger.warn('[OfficeHub:kousu:entry] error', { msg });
          setLastError(msg);
          return { ok: false, error: msg };
        }
        if (!res.data || res.data.length === 0) {
          const msg = '保存失敗: RLS ポリシーを確認してください';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        return { ok: true, error: null };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    []
  );

  const remove = useCallback(
    async (params: DeleteEntryParams): Promise<CRUDResult> => {
      if (deletingRef.current) return { ok: false, error: null };
      deletingRef.current = true;
      setDeleting(true);
      setLastError(null);

      try {
        const supabase = getSupabase();
        if (!supabase) {
          const msg = 'Supabase が未設定です';
          setLastError(msg);
          return { ok: false, error: msg };
        }

        logger.log('[OfficeHub:kousu:entry] delete start', params);
        type Res = {
          data: unknown[] | null;
          error: { message: string; code?: string } | null;
        };
        const res = await withTimeout<Res>(
          supabase
            .from('time_entries')
            .delete()
            .eq('id', params.entryId)
            .eq('user_id', params.userId)
            .select() as unknown as Promise<Res>,
          15000,
          'DELETE time_entries'
        ).catch(
          (e): Res => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        if (res.error) {
          const msg = `削除失敗: ${res.error.message} (code: ${res.error.code ?? '—'})`;
          setLastError(msg);
          return { ok: false, error: msg };
        }
        if (!res.data || res.data.length === 0) {
          const msg = '削除失敗: 対象が見つからないか権限がありません';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        return { ok: true, error: null };
      } finally {
        deletingRef.current = false;
        setDeleting(false);
      }
    },
    []
  );

  return { saving, deleting, lastError, save, remove, clearError };
}
