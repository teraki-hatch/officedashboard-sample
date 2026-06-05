// Phase D-4-e (Step 2.7 final): バックグラウンド reload
//   - 初回ロードのみ loading=true
//   - reload() 中も loading は触らない → 親側で「initialized 後はチラつかない」を実現
// Phase D-4-h: ガントビュー用に checklist_items 本体も配列で返すよう拡張
//   - 既存の checklist_count (件数集計) はそのまま維持
//   - 追加で checklistItems (本体配列: id, title, due_date等) を返す
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import type {
  Board,
  ChecklistItem,
  TaskCard,
  TaskLabel,
  TaskList,
  TaskStatus,
} from './types';

const TASKBOARD_TARGET_CODES = ['0000', '008', '009', '010', '002', '005'];

export const UNASSIGNED_KEY = '__unassigned__';

export function useFirstBoardId() {
  const [boardId, setBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = getSupabase();
      if (!sb) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data, error } = await sb
        .from('boards')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('[OfficeHub:tasks] boards fetch error', error);
      }
      setBoardId((data?.id as string) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { boardId, loading };
}

export function useBoardData(boardId: string | null) {
  const [board, setBoard] = useState<Board | null>(null);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [cards, setCards] = useState<TaskCard[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const reload = useCallback(async () => {
    if (!boardId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');

      const { data: boardRow, error: bErr } = await sb
        .from('boards')
        .select('id, name, created_at, updated_at')
        .eq('id', boardId)
        .maybeSingle();
      if (bErr) throw bErr;

      const boardData: Board = {
        id: (boardRow?.id as string) ?? boardId,
        name: (boardRow?.name as string) ?? 'メインボード',
        created_at: (boardRow?.created_at as string) ?? '',
        updated_at: (boardRow?.updated_at as string) ?? '',
      };
      setBoard(boardData);

      const { data: usersRaw, error: uErr } = await sb
        .from('users')
        .select('id, employee_code, name')
        .in('employee_code', TASKBOARD_TARGET_CODES);
      if (uErr) throw uErr;

      type UserRow = { id: string; employee_code: string; name: string };
      const userRows = (usersRaw ?? []) as UserRow[];
      const usersByCode = new Map(userRows.map((u) => [u.employee_code, u]));
      const orderedUsers: UserRow[] = TASKBOARD_TARGET_CODES.flatMap((code) => {
        const u = usersByCode.get(code);
        return u ? [u] : [];
      });

      const userLists: TaskList[] = orderedUsers.map((u, idx) => ({
        id: u.id,
        board_id: boardId,
        name: u.name,
        position: idx,
        created_at: '',
      }));
      const unassignedList: TaskList = {
        id: UNASSIGNED_KEY,
        board_id: boardId,
        name: '未割当',
        position: orderedUsers.length,
        created_at: '',
      };
      setLists([...userLists, unassignedList]);

      const { data: labelsRaw, error: laErr } = await sb
        .from('labels')
        .select('id, name, color, created_at, updated_at');
      if (laErr) throw laErr;

      type LabelRow = {
        id: string;
        name: string;
        color: string;
        created_at: string;
        updated_at: string;
      };
      const labelRows = (labelsRaw ?? []) as LabelRow[];
      const labelMap = new Map<string, TaskLabel>(
        labelRows.map((l) => [
          l.id,
          {
            id: l.id,
            name: l.name,
            color: l.color,
            created_at: l.created_at,
            updated_at: l.updated_at,
          },
        ])
      );

      const { data: clRaw, error: clErr } = await sb
        .from('card_labels')
        .select('card_id, label_id');
      if (clErr) throw clErr;

      type ClRow = { card_id: string; label_id: string };
      const labelsByCard = new Map<string, TaskLabel[]>();
      for (const cl of ((clRaw ?? []) as ClRow[])) {
        const lab = labelMap.get(cl.label_id);
        if (!lab) continue;
        const arr = labelsByCard.get(cl.card_id) ?? [];
        arr.push(lab);
        labelsByCard.set(cl.card_id, arr);
      }

      const { data: checkRaw, error: chErr } = await sb
        .from('checklist_items')
        .select(
          'id, card_id, title, is_completed, due_date, start_date, position, created_at, updated_at'
        )
        .order('position', { ascending: true });
      if (chErr) throw chErr;

      type ChRow = {
        id: string;
        card_id: string;
        title: string | null;
        is_completed: boolean | null;
        due_date: string | null;
        start_date: string | null;
        position: number | null;
        created_at: string | null;
        updated_at: string | null;
      };
      const chRows = (checkRaw ?? []) as ChRow[];

      // ガント等で使う本体配列
      const checklistItemsAll: ChecklistItem[] = chRows.map((ci) => ({
        id: ci.id,
        card_id: ci.card_id,
        title: ci.title ?? '',
        is_completed: ci.is_completed ?? false,
        due_date: ci.due_date,
        start_date: ci.start_date,
        position: ci.position ?? 0,
        created_at: ci.created_at ?? '',
        updated_at: ci.updated_at ?? '',
      }));
      setChecklistItems(checklistItemsAll);

      // ボード表示用の件数集計 (従来通り)
      const checklistByCard = new Map<string, { total: number; completed: number }>();
      for (const ci of chRows) {
        const cnt = checklistByCard.get(ci.card_id) ?? { total: 0, completed: 0 };
        cnt.total += 1;
        if (ci.is_completed) cnt.completed += 1;
        checklistByCard.set(ci.card_id, cnt);
      }

      const { data: cmRaw, error: cmErr } = await sb
        .from('comments')
        .select('card_id');
      if (cmErr) throw cmErr;

      type CmRow = { card_id: string };
      const commentCountByCard = new Map<string, number>();
      for (const cm of ((cmRaw ?? []) as CmRow[])) {
        commentCountByCard.set(cm.card_id, (commentCountByCard.get(cm.card_id) ?? 0) + 1);
      }

      const { data: cardsRaw, error: cErr } = await sb
        .from('cards')
        .select(
          'id, list_id, title, description, assignee_id, due_date, start_date, status, attachment_url, position, archived, created_at, updated_at'
        )
        .eq('archived', false)
        .order('position', { ascending: true });
      if (cErr) throw cErr;

      type CardRow = {
        id: string;
        list_id: string | null;
        title: string | null;
        description: string | null;
        assignee_id: string | null;
        due_date: string | null;
        start_date: string | null;
        status: string | null;
        attachment_url: string | null;
        position: number | null;
        archived: boolean | null;
        created_at: string | null;
        updated_at: string | null;
      };

      const taskCards: TaskCard[] = ((cardsRaw ?? []) as CardRow[]).map((c) => {
        const columnKey = c.assignee_id ?? UNASSIGNED_KEY;
        return {
          id: c.id,
          list_id: columnKey,
          title: c.title ?? '',
          description: c.description,
          assignee_id: c.assignee_id,
          due_date: c.due_date,
          start_date: c.start_date,
          status: (c.status as TaskStatus | null) ?? null,
          attachment_url: c.attachment_url,
          position: c.position ?? 0,
          archived: c.archived ?? false,
          created_at: c.created_at ?? '',
          updated_at: c.updated_at ?? '',
          labels: labelsByCard.get(c.id) ?? [],
          checklist_count: checklistByCard.get(c.id) ?? { total: 0, completed: 0 },
          comment_count: commentCountByCard.get(c.id) ?? 0,
        };
      });

      setCards(taskCards);
    } catch (e) {
      console.error('[OfficeHub:tasks:board] load error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      // 初回完了時のみ loading を false に。以降は触らない
      if (!initialized.current) {
        initialized.current = true;
        setLoading(false);
      }
    }
  }, [boardId]);

  useEffect(() => {
    if (boardId === null) return;
    void reload();
  }, [boardId, reload]);

  return { board, lists, cards, checklistItems, loading, error, reload };
}
