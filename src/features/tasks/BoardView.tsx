// Phase D-4-e (Step 7.2): カラム内を期日順で自動ソート
//   - 期日が近い順 (期日なしは末尾)
//   - 同じ期日は作成日が新しい順
//   - DB の position は無視 (画面表示時に毎回ソート)
//   - 3点メニューの並べ替えは "そのリロードまでの一時的な順" として残るが、
//     ボードビュー上は常に期日順で表示される
// Phase D-4-e (Step 7): onAddCard の型を (listId, title) => Promise<boolean> に変更
// Phase D-4-e (Step 6): allLists を ListColumn に渡す (移動先候補に必要)
// Phase D-4-e (Step 5): onToggleComplete を ListColumn に素通し
// Phase D-4-c (cont.): 担当者カラム方式に変更
//   - card.assignee_id で users にグルーピング
//   - 未割当 (assignee_id IS NULL) は __unassigned__ カラムへ
import { useMemo } from 'react';
import { ListColumn } from './ListColumn';
import type { TaskCard, TaskList } from './types';

type Props = {
  lists: TaskList[];
  cards: TaskCard[];
  onCardClick?: (card: TaskCard) => void;
  onAddCard?: (listId: string, title: string) => Promise<boolean> | boolean;
  onToggleComplete?: () => void;
  onListChanged?: () => void;
  canAddCard?: boolean;
};

const UNASSIGNED_KEY = '__unassigned__';

/**
 * カラム内のカード並び順:
 *  1. 期日が近い順 (期日なしは末尾へ)
 *  2. 同じ期日のカードは作成日が新しい順 (新規追加が上に来やすい)
 */
function compareByDueThenCreated(a: TaskCard, b: TaskCard): number {
  // 期日なしは末尾
  if (!a.due_date && !b.due_date) {
    return b.created_at.localeCompare(a.created_at);
  }
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  // 期日昇順
  const dueCmp = a.due_date.localeCompare(b.due_date);
  if (dueCmp !== 0) return dueCmp;
  // 同じ期日は作成日が新しい順
  return b.created_at.localeCompare(a.created_at);
}

export function BoardView({
  lists,
  cards,
  onCardClick,
  onAddCard,
  onToggleComplete,
  onListChanged,
  canAddCard,
}: Props) {
  // assignee_id でカードをグルーピング (lists.id === user.id, または未割当)
  const cardsByAssignee = useMemo(() => {
    const map = new Map<string, TaskCard[]>();
    for (const list of lists) {
      map.set(list.id, []);
    }
    for (const card of cards) {
      const key = card.assignee_id ?? UNASSIGNED_KEY;
      const arr = map.get(key);
      if (arr) {
        arr.push(card);
      }
      // map に key がない (= TASKBOARD_TARGET_CODES に居ない担当者) は表示しない
    }
    // 期日順で安定ソート
    for (const arr of map.values()) {
      arr.sort(compareByDueThenCreated);
    }
    return map;
  }, [lists, cards]);

  return (
    <div className="tb-board">
      {lists.map((list) => (
        <ListColumn
          key={list.id}
          list={list}
          allLists={lists}
          cards={cardsByAssignee.get(list.id) || []}
          onCardClick={onCardClick}
          onAddCard={onAddCard}
          onToggleComplete={onToggleComplete}
          onListChanged={onListChanged}
          canAddCard={canAddCard}
        />
      ))}
    </div>
  );
}
