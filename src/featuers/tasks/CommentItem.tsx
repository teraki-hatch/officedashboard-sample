// Phase D-4-e (Step 4): コメント機能 - 1コメント表示
//   - 通常表示: アバター + 投稿者名 + 投稿日時 + 本文 + (本人のみ) 編集/削除リンク
//   - 編集モード: textarea + 保存/キャンセル
//   - 削除: window.confirm で確認
import { useEffect, useRef, useState } from 'react';
import type { CardComment } from './useComments';

type Props = {
  comment: CardComment;
  currentUserId: string | null;
  onUpdate: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function CommentItem({ comment, currentUserId, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isMine = !!currentUserId && comment.user_id === currentUserId;

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (trimmed === comment.content) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onUpdate(comment.id, trimmed);
      setEditing(false);
    } catch {
      // error は親で表示
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setDraft(comment.content);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('このコメントを削除しますか?')) return;
    setBusy(true);
    try {
      await onDelete(comment.id);
    } catch {
      // error は親で表示
    } finally {
      setBusy(false);
    }
  };

  const initial = comment.author_name.charAt(0) || '?';

  return (
    <div style={styles.row}>
      <div style={styles.avatar}>{initial}</div>
      <div style={styles.body}>
        <div style={styles.meta}>
          <span style={styles.author}>{comment.author_name}</span>
          <span style={styles.time}>{formatDateTime(comment.created_at)}</span>
        </div>

        {editing ? (
          <div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleSave();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancel();
                }
              }}
              rows={3}
              style={styles.textarea}
              disabled={busy}
            />
            <div style={styles.editBtns}>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || !draft.trim()}
                style={styles.btnPrimary}
              >
                {busy ? '保存中…' : '保存'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                style={styles.btnGhost}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={styles.content}>{comment.content}</div>
            {isMine && (
              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(comment.content);
                    setEditing(true);
                  }}
                  style={styles.linkBtn}
                  disabled={busy}
                >
                  編集
                </button>
                <span style={styles.actionsSep}>·</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  style={styles.linkBtn}
                  disabled={busy}
                >
                  削除
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    gap: 10,
    padding: '10px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  avatar: {
    flex: '0 0 auto',
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#e5e7eb',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 600,
  },
  body: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  meta: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  author: {
    fontSize: 13,
    fontWeight: 600,
    color: '#111827',
  },
  time: {
    fontSize: 11,
    color: '#9ca3af',
  },
  content: {
    fontSize: 13,
    color: '#1f2937',
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  actions: {
    marginTop: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  actionsSep: {
    color: '#d1d5db',
    fontSize: 11,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: '#6b7280',
    fontSize: 11,
    cursor: 'pointer',
    textDecoration: 'underline',
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
  },
  editBtns: {
    marginTop: 6,
    display: 'flex',
    gap: 8,
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
  btnGhost: {
    background: '#f3f4f6',
    color: '#374151',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
  },
};
