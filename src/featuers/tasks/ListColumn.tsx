// Phase D-4-e (Step 7): カード追加機能をインライン入力欄に変更
//   - 「+カードを追加」クリック → その場で textarea + 「追加」「×」ボタン
//   - Enter で追加、Shift+Enter で改行
//   - 追加後も入力欄を維持 (連続追加)、外側クリック/×で閉じる
//   - 3点メニュー「カードを追加」も同じ入力欄を開く
// Phase D-4-e (Step 6): 3点リーダーをアクティブ化 → ListMenu を表示
// Phase D-4-e (Step 5): onToggleComplete を TaskCard に素通し
// Phase D-4-c: リスト(カラム)コンポーネント
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Plus, X } from 'lucide-react';
import { TaskCard } from './TaskCard';
import { ListMenu } from './ListMenu';
import type { TaskList, TaskCard as TaskCardType } from './types';

type Props = {
  list: TaskList;
  allLists: TaskList[];
  cards: TaskCardType[];
  onCardClick?: (card: TaskCardType) => void;
  onAddCard?: (listId: string, title: string) => Promise<boolean> | boolean;
  onToggleComplete?: () => void;
  onListChanged?: () => void;
  canAddCard?: boolean;
};

export function ListColumn({
  list,
  allLists,
  cards,
  onCardClick,
  onAddCard,
  onToggleComplete,
  onListChanged,
  canAddCard = true,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 入力欄を開いた時にフォーカス
  useEffect(() => {
    if (adding && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [adding]);

  // 外側クリックで入力欄を閉じる (空のときのみ自動で閉じる)
  useEffect(() => {
    if (!adding) return;
    const onDown = (e: MouseEvent) => {
      if (
        composerRef.current &&
        !composerRef.current.contains(e.target as Node)
      ) {
        if (!draft.trim()) {
          setAdding(false);
        }
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
    };
  }, [adding, draft]);

  const handleSubmit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !onAddCard) return;
    setBusy(true);
    try {
      const ok = await onAddCard(list.id, trimmed);
      if (ok) {
        setDraft('');
        // 連続追加のためフォーカス戻す
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft('');
      setAdding(false);
    }
  };

  return (
    <div className="tb-list">
      <div className="tb-list__header" style={{ position: 'relative' }}>
        <span className="tb-list__title">{list.name}</span>
        <span className="tb-list__count">{cards.length}</span>
        <button
          type="button"
          className="tb-list__menu"
          title="リスト操作"
          aria-label="リスト操作"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
        {menuOpen && (
          <ListMenu
            list={list}
            allLists={allLists}
            cards={cards}
            onClose={() => setMenuOpen(false)}
            onAddCard={() => {
              setAdding(true);
            }}
            onChanged={() => {
              onListChanged?.();
              onToggleComplete?.();
            }}
          />
        )}
      </div>

      <div className="tb-list__cards">
        {cards.map((card) => (
          <TaskCard
            key={card.id}
            card={card}
            onClick={onCardClick}
            onToggleComplete={onToggleComplete}
          />
        ))}
      </div>

      {adding ? (
        <div ref={composerRef} style={styles.composer}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="カードのタイトルを入力… (Enter で追加、Shift+Enter で改行)"
            rows={3}
            style={styles.textarea}
            disabled={busy}
          />
          <div style={styles.composerBtns}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !draft.trim()}
              style={styles.btnPrimary}
            >
              {busy ? '追加中…' : 'カードを追加'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft('');
                setAdding(false);
              }}
              disabled={busy}
              style={styles.btnClose}
              aria-label="閉じる"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="tb-list__add"
          onClick={() => setAdding(true)}
          disabled={!canAddCard}
        >
          <Plus size={14} aria-hidden />
          カードを追加
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  composer: {
    padding: 6,
    background: '#fff',
    borderRadius: 6,
    boxShadow: '0 1px 0 rgba(9,30,66,0.25)',
    marginTop: 4,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 13,
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    minHeight: 60,
  },
  composerBtns: {
    marginTop: 6,
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  btnPrimary: {
    background: '#0f766e',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  btnClose: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
