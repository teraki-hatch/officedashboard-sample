// Phase D-4-e (Step 7): カード追加フック
//   - board 配下の最初の list の id を自動取得 (cards.list_id NOT NULL のため)
//   - 指定カラムの末尾 (max position + 10) に新規カードを追加
//   - assignee_id は未割当カラムの場合は null
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { UNASSIGNED_KEY } from './useBoardData';

export function useAddCard(boardId: string | null) {
  const [defaultListId, setDefaultListId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  // board に紐づく最初の list id を1回だけ取得
  useEffect(() => {
    if (!boardId) return;
    if (loadedFor.current === boardId) return;
    loadedFor.current = boardId;
    (async () => {
      try {
        const sb = getSupabase();
        if (!sb) return;
        const { data, error: e } = await sb
          .from('lists')
          .select('id')
          .eq('board_id', boardId)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (e) {
          console.error('[OfficeHub:tasks:addcard] default list fetch error', e);
          return;
        }
        setDefaultListId((data?.id as string | undefined) ?? null);
      } catch (err) {
        console.error('[OfficeHub:tasks:addcard] default list error', err);
      }
    })();
  }, [boardId]);

  /**
   * 新規カード追加
   * @param assigneeListId カラムキー (users.id または UNASSIGNED_KEY)
   * @param title カード名
   */
  const addCard = useCallback(
    async (assigneeListId: string, title: string): Promise<boolean> => {
      const trimmed = title.trim();
      if (!trimmed) return false;
      setError(null);
      try {
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase 未設定');
        if (!defaultListId) throw new Error('デフォルトリストが取得できません');

        const assigneeId =
          assigneeListId === UNASSIGNED_KEY ? null : assigneeListId;

        // そのカラムの max position を取得 (未割当含む)
        let query = sb
          .from('cards')
          .select('position')
          .eq('archived', false)
          .order('position', { ascending: false })
          .limit(1);
        if (assigneeId === null) {
          query = query.is('assignee_id', null);
        } else {
          query = query.eq('assignee_id', assigneeId);
        }
        const { data: maxRow, error: mErr } = await query.maybeSingle();
        if (mErr) throw mErr;

        const nextPosition = ((maxRow?.position as number | undefined) ?? 0) + 10;

        const { error: iErr } = await sb.from('cards').insert({
          list_id: defaultListId, // ダミー (NOT NULL 制約満たすため)
          title: trimmed,
          assignee_id: assigneeId,
          status: null,
          archived: false,
          position: nextPosition,
        });
        if (iErr) throw iErr;
        return true;
      } catch (err) {
        console.error('[OfficeHub:tasks:addcard] insert error', err);
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [defaultListId]
  );

  return { addCard, error, ready: defaultListId !== null };
}
