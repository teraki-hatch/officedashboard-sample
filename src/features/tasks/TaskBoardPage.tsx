// Phase D-4-h: ガントビューを本実装に差し替え + カレンダービュー削除
// Phase D-4-e (Step 7): カード追加機能を本実装
//   - useAddCard を使って実際に Supabase に INSERT
//   - 成功で reload して画面に反映
// Phase D-4-e (Step 6): onListChanged={reload} を BoardView に渡す
// Phase D-4-e (Step 5): BoardView に onToggleComplete={reload} を渡す
// Phase D-4-e (Step 2.8): 完了フィルタ追加
//   - status='完了' のカードはデフォルト非表示
//   - ヘッダーに「完了を表示」トグル
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, BarChart3, Eye, EyeOff } from 'lucide-react';
import { useBoardData, useFirstBoardId } from './useBoardData';
import { useAddCard } from './useAddCard';
import { BoardView } from './BoardView';
import { GanttView } from './GanttView';
import { CardDetailModal } from './CardDetailModal';
import type { TaskCard } from './types';
import './TaskBoard.css';

type ViewMode = 'board' | 'gantt';

export function TaskBoardPage() {
  const { boardId, loading: loadingBoard } = useFirstBoardId();
  const { board, lists, cards, checklistItems, loading, error, reload } = useBoardData(boardId);
  const { addCard, ready: addCardReady } = useAddCard(boardId);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!loadingBoard && !loading) setInitialized(true);
  }, [loadingBoard, loading]);

  // 完了非表示フィルタ (モーダルで開いてるカードは完了でも残す)
  const visibleCards = useMemo(() => {
    if (showCompleted) return cards;
    return cards.filter(
      (c) => c.status !== '完了' || c.id === openCardId
    );
  }, [cards, showCompleted, openCardId]);

  // モーダル用 (元の cards から取得 = 完了でも開ける)
  const openCard = openCardId
    ? cards.find((c) => c.id === openCardId) ?? null
    : null;

  const handleCardClick = (card: TaskCard) => {
    setOpenCardId(card.id);
  };

  const handleAddCard = useCallback(
    async (listId: string, title: string): Promise<boolean> => {
      const ok = await addCard(listId, title);
      if (ok) await reload();
      return ok;
    },
    [addCard, reload]
  );

  if (!initialized) {
    if (loadingBoard || loading) {
      return (
        <div className="tb">
          <div className="tb-loading">読み込み中...</div>
        </div>
      );
    }
    if (!boardId || !board) {
      return (
        <div className="tb">
          <div className="tb-empty">ボードが見つかりません</div>
        </div>
      );
    }
    if (error) {
      return (
        <div className="tb">
          <div className="tb-error">エラー: {error}</div>
        </div>
      );
    }
  }

  // 完了カード件数 (表示用)
  const completedCount = cards.filter((c) => c.status === '完了').length;

  return (
    <div className="tb">
      <header className="tb-header">
        <h1 className="tb-header__title">{board?.name || 'タスク管理'}</h1>
        <button
          type="button"
          className={
            'tb-header__filter' +
            (showCompleted ? ' tb-header__filter--active' : '')
          }
          onClick={() => setShowCompleted((v) => !v)}
          title={showCompleted ? '完了を隠す' : '完了を表示'}
        >
          {showCompleted ? (
            <EyeOff size={13} aria-hidden style={{ marginRight: 4 }} />
          ) : (
            <Eye size={13} aria-hidden style={{ marginRight: 4 }} />
          )}
          完了を表示 ({completedCount})
        </button>
      </header>
      <div className="tb-mode">
        <button
          type="button"
          className={
            'tb-mode__btn' +
            (viewMode === 'board' ? ' tb-mode__btn--active' : '')
          }
          onClick={() => setViewMode('board')}
        >
          <LayoutGrid size={14} aria-hidden />
          ボード
        </button>
        <button
          type="button"
          className={
            'tb-mode__btn' +
            (viewMode === 'gantt' ? ' tb-mode__btn--active' : '')
          }
          onClick={() => setViewMode('gantt')}
        >
          <BarChart3 size={14} aria-hidden />
          ガント
        </button>
      </div>
      {viewMode === 'board' && (
        <BoardView
          lists={lists}
          cards={visibleCards}
          onCardClick={handleCardClick}
          onAddCard={handleAddCard}
          onToggleComplete={() => void reload()}
          onListChanged={() => void reload()}
          canAddCard={addCardReady}
        />
      )}
      {viewMode === 'gantt' && (
        <GanttView
          lists={lists}
          cards={visibleCards}
          checklistItems={checklistItems}
          onCardClick={handleCardClick}
        />
      )}

      {openCard && (
        <CardDetailModal
          card={openCard}
          lists={lists}
          onClose={() => setOpenCardId(null)}
          onUpdated={() => void reload()}
        />
      )}
    </div>
  );
}

export default TaskBoardPage;
