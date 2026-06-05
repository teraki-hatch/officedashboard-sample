// Phase D-4-e (Step 4): コメント機能 - 右ペイン全体
//   - 投稿欄 (現在ユーザーのアバター + textarea + 送信ボタン)
//   - コメント一覧 (古い順)
//   - 投稿: Cmd/Ctrl+Enter で送信、Enter は改行
import { useState } from 'react';
import { useComments, useCurrentUserInfo } from './useComments';
import { CommentItem } from './CommentItem';

type Props = {
  cardId: string;
};

export function CommentSection({ cardId }: Props) {
  const { me, loading: meLoading } = useCurrentUserInfo();
  const { comments, loading, error, addComment, updateComment, deleteComment } =
    useComments(cardId);

  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!me) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      await addComment(trimmed, me.user_id);
      setDraft('');
    } catch {
      // error は下に表示
    } finally {
      setPosting(false);
    }
  };

  const initial = me?.name.charAt(0) || '?';

  return (
    <div style={styles.wrap}>
      {/* 投稿欄 */}
      <div style={styles.composer}>
        <div style={styles.avatar}>{initial}</div>
        <div style={styles.composerBody}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void handlePost();
              }
            }}
            placeholder={
              meLoading
                ? '読み込み中…'
                : me
                  ? 'コメントを入力… (Cmd/Ctrl+Enter で送信)'
                  : 'ユーザー情報を取得できません'
            }
            rows={3}
            style={styles.textarea}
            disabled={!me || posting}
          />
          <div style={styles.composerBtns}>
            <button
              type="button"
              onClick={handlePost}
              disabled={!me || posting || !draft.trim()}
              style={styles.btnPrimary}
            >
              {posting ? '送信中…' : '送信'}
            </button>
          </div>
        </div>
      </div>

      {error && <div style={styles.error}>エラー: {error}</div>}

      {/* 一覧 */}
      <div style={styles.list}>
        {loading ? (
          <div style={styles.placeholder}>読み込み中…</div>
        ) : comments.length === 0 ? (
          <div style={styles.placeholder}>まだコメントはありません</div>
        ) : (
          comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              currentUserId={me?.user_id ?? null}
              onUpdate={updateComment}
              onDelete={deleteComment}
            />
          ))
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    marginTop: 8,
  },
  composer: {
    display: 'flex',
    gap: 10,
    marginBottom: 12,
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
  composerBody: {
    flex: '1 1 auto',
    minWidth: 0,
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
  composerBtns: {
    marginTop: 6,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  btnPrimary: {
    background: '#0f766e',
    color: '#fff',
    border: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  list: {
    borderTop: '1px solid #f0f0f0',
  },
  placeholder: {
    fontSize: 12,
    color: '#9ca3af',
    padding: '12px 0',
    textAlign: 'center',
  },
  error: {
    fontSize: 12,
    color: '#b91c1c',
    background: '#fee2e2',
    padding: '6px 10px',
    borderRadius: 6,
    marginBottom: 10,
  },
};
