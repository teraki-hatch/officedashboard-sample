// Phase D-4-e (Step 7): onAddCard を簡単な void コールバックに変更
//   (親で入力欄を開く処理を行うため、ListMenu からは listId を渡さなくて良い)
// Phase D-4-e (Step 6): リスト操作メニュー (3点リーダー)
//   - カードを追加
//   - このカラムの未完了カードを別担当者へ移動
//   - このカラムの完了カードを全てアーカイブ
//   - このカラムのカードを並べ替え (5種類)
import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  ArrowRightLeft,
  Archive,
  ArrowUpDown,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import type { TaskCard, TaskList } from './types';
import { UNASSIGNED_KEY } from './useBoardData';

type Props = {
  list: TaskList;
  allLists: TaskList[];
  cards: TaskCard[]; // このカラムのカードのみ
  onClose: () => void;
  onAddCard?: () => void; // カード追加 UI を親で開くトリガー
  onChanged: () => void; // DB変更後に親で reload
};

type View = 'main' | 'move' | 'sort';

type SortKey =
  | 'due_asc'
  | 'due_desc'
  | 'title_asc'
  | 'created_desc'
  | 'created_asc';

const SORT_LABELS: Record<SortKey, string> = {
  due_asc: '期日が近い順 (期日なしは末尾)',
  due_desc: '期日が遠い順',
  title_asc: 'タイトル昇順',
  created_desc: '作成日が新しい順',
  created_asc: '作成日が古い順',
};

export function ListMenu({
  list,
  allLists,
  cards,
  onClose,
  onAddCard,
  onChanged,
}: Props) {
  const [view, setView] = useState<View>('main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // 外側クリック / Escape で閉じる
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const incompleteCards = cards.filter((c) => c.status !== '完了');
  const completedCards = cards.filter((c) => c.status === '完了');

  // 移動先候補: 自分自身を除いた他のカラム
  const moveTargets = allLists.filter((l) => l.id !== list.id);

  const handleMoveTo = async (targetListId: string) => {
    if (incompleteCards.length === 0) {
      setError('移動対象の未完了カードがありません');
      return;
    }
    const targetList = moveTargets.find((l) => l.id === targetListId);
    if (!targetList) return;
    if (
      !window.confirm(
        `${list.name} の未完了カード ${incompleteCards.length} 件を「${targetList.name}」へ移動します。\nよろしいですか?`
      )
    )
      return;

    setBusy(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const newAssigneeId =
        targetListId === UNASSIGNED_KEY ? null : targetListId;
      const ids = incompleteCards.map((c) => c.id);
      const { error: e } = await sb
        .from('cards')
        .update({ assignee_id: newAssigneeId })
        .in('id', ids);
      if (e) throw e;
      onChanged();
      onClose();
    } catch (e) {
      console.error('[OfficeHub:tasks:listmenu] move error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveCompleted = async () => {
    if (completedCards.length === 0) {
      setError('完了カードがありません');
      return;
    }
    if (
      !window.confirm(
        `${list.name} の完了カード ${completedCards.length} 件をアーカイブします。\nよろしいですか?`
      )
    )
      return;

    setBusy(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const ids = completedCards.map((c) => c.id);
      const { error: e } = await sb
        .from('cards')
        .update({ archived: true })
        .in('id', ids);
      if (e) throw e;
      onChanged();
      onClose();
    } catch (e) {
      console.error('[OfficeHub:tasks:listmenu] archive error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSort = async (key: SortKey) => {
    if (cards.length === 0) {
      setError('並べ替え対象のカードがありません');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');

      // ソート (元配列をコピーしてから sort)
      const sorted = [...cards].sort((a, b) => {
        switch (key) {
          case 'due_asc': {
            // 期日なしは末尾
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return a.due_date.localeCompare(b.due_date);
          }
          case 'due_desc': {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1; // 期日なしは末尾のままに
            if (!b.due_date) return -1;
            return b.due_date.localeCompare(a.due_date);
          }
          case 'title_asc':
            return a.title.localeCompare(b.title, 'ja');
          case 'created_desc':
            return b.created_at.localeCompare(a.created_at);
          case 'created_asc':
            return a.created_at.localeCompare(b.created_at);
          default:
            return 0;
        }
      });

      // position を 10, 20, 30 ... で振り直し (将来の挿入余地を残す)
      const updates = sorted.map((c, idx) => ({
        id: c.id,
        position: (idx + 1) * 10,
      }));

      // 並列 update (件数少ない想定なので Promise.all)
      const results = await Promise.all(
        updates.map((u) =>
          sb!.from('cards').update({ position: u.position }).eq('id', u.id)
        )
      );
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) throw firstErr.error;

      onChanged();
      onClose();
    } catch (e) {
      console.error('[OfficeHub:tasks:listmenu] sort error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={popRef} style={styles.popover} role="dialog" aria-modal="true">
      {/* ヘッダー */}
      <div style={styles.header}>
        {view !== 'main' ? (
          <button
            type="button"
            onClick={() => setView('main')}
            style={styles.backBtn}
            aria-label="戻る"
            disabled={busy}
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
        ) : (
          <span style={styles.headerSpacer} />
        )}
        <div style={styles.headerTitle}>
          {view === 'main' && 'リスト操作'}
          {view === 'move' && '移動先を選択'}
          {view === 'sort' && '並べ替え'}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={styles.closeBtn}
          aria-label="閉じる"
          disabled={busy}
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* メイン */}
      {view === 'main' && (
        <div style={styles.list}>
          <MenuItem
            icon={<Plus size={14} aria-hidden />}
            label="カードを追加"
            onClick={() => {
              onAddCard?.();
              onClose();
            }}
            disabled={busy}
          />
          <MenuItem
            icon={<ArrowRightLeft size={14} aria-hidden />}
            label={`未完了カードを移動 (${incompleteCards.length})`}
            onClick={() => setView('move')}
            disabled={busy || incompleteCards.length === 0}
          />
          <MenuItem
            icon={<Archive size={14} aria-hidden />}
            label={`完了カードをアーカイブ (${completedCards.length})`}
            onClick={() => void handleArchiveCompleted()}
            disabled={busy || completedCards.length === 0}
          />
          <MenuItem
            icon={<ArrowUpDown size={14} aria-hidden />}
            label="並べ替え"
            onClick={() => setView('sort')}
            disabled={busy || cards.length === 0}
          />
        </div>
      )}

      {/* 移動先選択 */}
      {view === 'move' && (
        <div style={styles.list}>
          <div style={styles.hint}>
            {list.name} の未完了カード {incompleteCards.length} 件の移動先を選択
          </div>
          {moveTargets.map((t) => (
            <MenuItem
              key={t.id}
              icon={<ChevronRight size={14} aria-hidden />}
              label={t.name}
              onClick={() => void handleMoveTo(t.id)}
              disabled={busy}
            />
          ))}
        </div>
      )}

      {/* 並べ替え */}
      {view === 'sort' && (
        <div style={styles.list}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <MenuItem
              key={k}
              icon={<ArrowUpDown size={14} aria-hidden />}
              label={SORT_LABELS[k]}
              onClick={() => void handleSort(k)}
              disabled={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.menuItem,
        ...(disabled ? styles.menuItemDisabled : {}),
      }}
    >
      <span style={styles.menuItemIcon}>{icon}</span>
      <span style={styles.menuItemLabel}>{label}</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  popover: {
    position: 'absolute',
    top: 32,
    right: 0,
    width: 260,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    boxShadow:
      '0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
    zIndex: 100,
    padding: 4,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 4px 4px 4px',
    borderBottom: '1px solid #f3f4f6',
    marginBottom: 4,
  },
  headerSpacer: {
    width: 22,
    flex: '0 0 auto',
  },
  headerTitle: {
    flex: '1 1 auto',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
  },
  backBtn: {
    flex: '0 0 auto',
    width: 22,
    height: 22,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    borderRadius: 4,
    padding: 0,
  },
  closeBtn: {
    flex: '0 0 auto',
    width: 22,
    height: 22,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    borderRadius: 4,
    padding: 0,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  hint: {
    fontSize: 11,
    color: '#6b7280',
    padding: '6px 8px',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    background: 'none',
    border: 'none',
    padding: '8px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#374151',
    textAlign: 'left',
    borderRadius: 4,
    transition: 'background 0.1s',
  },
  menuItemDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  menuItemIcon: {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
  },
  menuItemLabel: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  error: {
    fontSize: 11,
    color: '#b91c1c',
    background: '#fee2e2',
    padding: '6px 8px',
    borderRadius: 4,
    margin: '0 4px 6px',
  },
};
