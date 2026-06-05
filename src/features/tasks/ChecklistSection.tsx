// Phase D-4-e (Step 3): チェックリスト機能
//   - 1カードに複数チェックリスト (グループ)
//   - 各リスト内に複数アイテム
//   - アイテム: チェック / テキスト / 期限 / 担当者 / 編集 / 削除
//   - 「完了したアイテムを非表示」トグル
//   - 進捗バー
//   - useImperativeHandle で外部から「追加モード起動」を呼べる
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CheckSquare, X, Trash2, Plus, Clock, UserPlus } from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import type { TaskList } from './types';
import { UNASSIGNED_KEY } from './useBoardData';

export type Checklist = {
  id: string;
  card_id: string;
  title: string;
  position: number;
  items: ChecklistItemRow[];
};

export type ChecklistItemRow = {
  id: string;
  checklist_id: string;
  title: string;
  is_completed: boolean;
  position: number;
  due_date: string | null;
  assignee_id: string | null;
};

export type ChecklistSectionHandle = {
  startAdd: () => void;
};

type Props = {
  cardId: string;
  lists: TaskList[]; // 担当者選択用
  onChanged: () => void; // 親カード reload 用
};

export const ChecklistSection = forwardRef<ChecklistSectionHandle, Props>(
  function ChecklistSection({ cardId, lists, onChanged }, ref) {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);

  useImperativeHandle(ref, () => ({
    startAdd: () => {
      setAdding(true);
      setNewTitle('');
    },
  }));

  // ===== ロード =====
  const load = useCallback(async () => {
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');

      const { data: chRaw, error: chErr } = await sb
        .from('checklists')
        .select('id, card_id, title, position')
        .eq('card_id', cardId)
        .order('position', { ascending: true });
      if (chErr) throw chErr;

      type ChRow = {
        id: string;
        card_id: string;
        title: string;
        position: number;
      };
      const chRows = (chRaw ?? []) as ChRow[];
      if (chRows.length === 0) {
        setChecklists([]);
        setLoading(false);
        return;
      }

      const chIds = chRows.map((c) => c.id);
      const { data: itRaw, error: itErr } = await sb
        .from('checklist_items')
        .select(
          'id, checklist_id, title, is_completed, position, due_date, assignee_id'
        )
        .in('checklist_id', chIds)
        .order('position', { ascending: true });
      if (itErr) throw itErr;

      type ItRow = {
        id: string;
        checklist_id: string;
        title: string;
        is_completed: boolean;
        position: number;
        due_date: string | null;
        assignee_id: string | null;
      };
      const itRows = (itRaw ?? []) as ItRow[];

      const itemsByCl = new Map<string, ChecklistItemRow[]>();
      for (const it of itRows) {
        const arr = itemsByCl.get(it.checklist_id) ?? [];
        arr.push(it);
        itemsByCl.set(it.checklist_id, arr);
      }

      const result: Checklist[] = chRows.map((c) => ({
        id: c.id,
        card_id: c.card_id,
        title: c.title,
        position: c.position,
        items: itemsByCl.get(c.id) ?? [],
      }));
      setChecklists(result);
    } catch (e) {
      console.error('[OfficeHub:tasks:checklist] load error', e);
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ===== チェックリスト作成 =====
  const createChecklist = async (title: string) => {
    const t = title.trim() || 'チェックリスト';
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const position = checklists.length;
      const { error: e } = await sb
        .from('checklists')
        .insert({ card_id: cardId, title: t, position });
      if (e) throw e;
      setAdding(false);
      setNewTitle('');
      await load();
      onChanged();
    } catch (e) {
      console.error('[OfficeHub:tasks:checklist] create error', e);
      setError(errMsg(e));
    }
  };

  // ===== チェックリスト削除 =====
  const deleteChecklist = async (id: string) => {
    if (!window.confirm('このチェックリストを削除しますか?')) return;
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const { error: e } = await sb.from('checklists').delete().eq('id', id);
      if (e) throw e;
      await load();
      onChanged();
    } catch (e) {
      console.error('[OfficeHub:tasks:checklist] delete error', e);
      setError(errMsg(e));
    }
  };

  // ===== チェックリストタイトル更新 =====
  const updateChecklistTitle = async (id: string, title: string) => {
    if (!title.trim()) return;
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const { error: e } = await sb
        .from('checklists')
        .update({ title: title.trim() })
        .eq('id', id);
      if (e) throw e;
      await load();
    } catch (e) {
      console.error('[OfficeHub:tasks:checklist] update title error', e);
      setError(errMsg(e));
    }
  };

  // ===== アイテム作成 =====
  const createItem = async (
    checklistId: string,
    title: string,
    assigneeId?: string | null,
    dueDate?: string | null
  ) => {
    if (!title.trim()) return;
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const cl = checklists.find((c) => c.id === checklistId);
      const position = cl ? cl.items.length : 0;
      const { error: e } = await sb.from('checklist_items').insert({
        checklist_id: checklistId,
        card_id: cardId,
        title: title.trim(),
        is_completed: false,
        position,
        assignee_id: assigneeId ?? null,
        due_date: dueDate ?? null,
      });
      if (e) throw e;
      await load();
      onChanged();
    } catch (e) {
      console.error('[OfficeHub:tasks:checklist] create item error', e);
      setError(errMsg(e));
    }
  };

  // ===== アイテム更新 =====
  const updateItem = async (
    itemId: string,
    patch: Partial<ChecklistItemRow>
  ) => {
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const { error: e } = await sb
        .from('checklist_items')
        .update(patch)
        .eq('id', itemId);
      if (e) throw e;
      await load();
      onChanged();
    } catch (e) {
      console.error('[OfficeHub:tasks:checklist] update item error', e);
      setError(errMsg(e));
    }
  };

  // ===== アイテム削除 =====
  const deleteItem = async (itemId: string) => {
    if (!window.confirm('このアイテムを削除しますか?')) return;
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const { error: e } = await sb.from('checklist_items').delete().eq('id', itemId);
      if (e) throw e;
      await load();
      onChanged();
    } catch (e) {
      console.error('[OfficeHub:tasks:checklist] delete item error', e);
      setError(errMsg(e));
    }
  };

  // 完了したアイテム数 (全リスト合計)
  const totalCompleted = checklists.reduce(
    (a, cl) => a + cl.items.filter((it) => it.is_completed).length,
    0
  );
  const totalItems = checklists.reduce((a, cl) => a + cl.items.length, 0);

  // チェックリストが0件 かつ 追加モードでもない → 何も表示しない (Trello風)
  if (!loading && checklists.length === 0 && !adding) {
    return null;
  }

  return (
    <div className="cl-section">
      <div className="cl-section__head">
        <div className="cdm__section-head">
          <CheckSquare size={14} aria-hidden />
          <span>チェックリスト</span>
        </div>
        <div className="cl-section__head-right">
          {totalItems > 0 && (
            <button
              type="button"
              className="cl-section__toggle"
              onClick={() => setHideCompleted((v) => !v)}
            >
              {hideCompleted ? '完了を表示' : '完了を非表示'}
              {totalCompleted > 0 && ` (${totalCompleted})`}
            </button>
          )}
          <button
            type="button"
            className="cdm__btn"
            onClick={() => setAdding(true)}
          >
            <Plus size={12} aria-hidden /> チェックリストを追加
          </button>
        </div>
      </div>

      {error && <div className="cdm__error">エラー: {error}</div>}

      {/* 新規チェックリスト作成フォーム */}
      {adding && (
        <div className="cl-create">
          <input
            type="text"
            className="cdm__input"
            placeholder="チェックリスト名"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createChecklist(newTitle);
              if (e.key === 'Escape') {
                setAdding(false);
                setNewTitle('');
              }
            }}
            autoFocus
          />
          <div className="cdm__edit-btns">
            <button
              type="button"
              className="cdm__btn cdm__btn--primary"
              onClick={() => createChecklist(newTitle)}
            >
              作成
            </button>
            <button
              type="button"
              className="cdm__btn"
              onClick={() => {
                setAdding(false);
                setNewTitle('');
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 既存チェックリスト */}
      {loading ? (
        <div className="cdm__placeholder cdm__placeholder--block">
          読み込み中…
        </div>
      ) : (
        checklists.map((cl) => (
          <ChecklistView
            key={cl.id}
            checklist={cl}
            lists={lists}
            hideCompleted={hideCompleted}
            onDelete={() => deleteChecklist(cl.id)}
            onUpdateTitle={(t) => updateChecklistTitle(cl.id, t)}
            onCreateItem={(title, assigneeId, dueDate) =>
              createItem(cl.id, title, assigneeId, dueDate)
            }
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
          />
        ))
      )}
    </div>
  );
});

// ========== 単一チェックリスト ==========

function ChecklistView({
  checklist,
  lists,
  hideCompleted,
  onDelete,
  onUpdateTitle,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
}: {
  checklist: Checklist;
  lists: TaskList[];
  hideCompleted: boolean;
  onDelete: () => void;
  onUpdateTitle: (t: string) => void;
  onCreateItem: (
    title: string,
    assigneeId?: string | null,
    dueDate?: string | null
  ) => void;
  onUpdateItem: (id: string, patch: Partial<ChecklistItemRow>) => void;
  onDeleteItem: (id: string) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [tmpTitle, setTmpTitle] = useState(checklist.title);
  const [adding, setAdding] = useState(false);

  // 進捗
  const total = checklist.items.length;
  const completed = checklist.items.filter((it) => it.is_completed).length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

  const visibleItems = hideCompleted
    ? checklist.items.filter((it) => !it.is_completed)
    : checklist.items;

  const handleTitleSave = () => {
    onUpdateTitle(tmpTitle);
    setEditingTitle(false);
  };

  return (
    <div className="cl">
      {/* ヘッダー */}
      <div className="cl__head">
        <CheckSquare size={14} className="cl__icon" aria-hidden />
        {editingTitle ? (
          <input
            type="text"
            className="cdm__input cl__title-input"
            value={tmpTitle}
            onChange={(e) => setTmpTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') {
                setTmpTitle(checklist.title);
                setEditingTitle(false);
              }
            }}
            onBlur={handleTitleSave}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="cl__title"
            onClick={() => {
              setTmpTitle(checklist.title);
              setEditingTitle(true);
            }}
          >
            {checklist.title}
          </button>
        )}
        <button
          type="button"
          className="cl__delete"
          onClick={onDelete}
          aria-label="チェックリストを削除"
          title="チェックリストを削除"
        >
          <Trash2 size={12} aria-hidden />
        </button>
      </div>

      {/* 進捗バー */}
      <div className="cl__progress">
        <div className="cl__progress-label">{pct}%</div>
        <div className="cl__progress-bar">
          <div
            className="cl__progress-fill"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      </div>

      {/* アイテム一覧 */}
      <div className="cl__items">
        {visibleItems.map((it) => (
          <ChecklistItemView
            key={it.id}
            item={it}
            lists={lists}
            onUpdate={(patch) => onUpdateItem(it.id, patch)}
            onDelete={() => onDeleteItem(it.id)}
          />
        ))}
      </div>

      {/* アイテム追加 */}
      {adding ? (
        <ItemAdder
          lists={lists}
          onSubmit={(title, assigneeId, dueDate) => {
            onCreateItem(title, assigneeId, dueDate);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          className="cl__add-btn"
          onClick={() => setAdding(true)}
        >
          <Plus size={12} aria-hidden /> アイテムを追加
        </button>
      )}
    </div>
  );
}

// ========== 単一アイテム ==========

function ChecklistItemView({
  item,
  lists,
  onUpdate,
  onDelete,
}: {
  item: ChecklistItemRow;
  lists: TaskList[];
  onUpdate: (patch: Partial<ChecklistItemRow>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tmpTitle, setTmpTitle] = useState(item.title);
  const [openMenu, setOpenMenu] = useState<null | 'assignee' | 'due'>(null);

  const assignee = item.assignee_id
    ? lists.find((l) => l.id === item.assignee_id) ?? null
    : null;

  const handleSave = () => {
    if (tmpTitle.trim() && tmpTitle.trim() !== item.title) {
      onUpdate({ title: tmpTitle.trim() });
    }
    setEditing(false);
  };

  return (
    <div className={'cl-item' + (item.is_completed ? ' cl-item--done' : '')}>
      <input
        type="checkbox"
        className="cl-item__check"
        checked={item.is_completed}
        onChange={() => onUpdate({ is_completed: !item.is_completed })}
        aria-label={item.title}
      />
      {editing ? (
        <input
          type="text"
          className="cdm__input cl-item__input"
          value={tmpTitle}
          onChange={(e) => setTmpTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') {
              setTmpTitle(item.title);
              setEditing(false);
            }
          }}
          onBlur={handleSave}
          autoFocus
        />
      ) : (
        <button
          type="button"
          className="cl-item__title"
          onClick={() => {
            setTmpTitle(item.title);
            setEditing(true);
          }}
        >
          {item.title}
        </button>
      )}

      {/* メタ情報 (期限/担当者バッジ) */}
      <div className="cl-item__meta">
        {item.due_date && (
          <span className="cl-item__chip cl-item__chip--due">
            <Clock size={10} aria-hidden /> {formatMD(item.due_date)}
          </span>
        )}
        {assignee && (
          <span className="cl-item__chip cl-item__chip--assignee">
            {assignee.name}
          </span>
        )}
      </div>

      {/* アクション */}
      <div className="cl-item__actions">
        <div className="cl-item__menu-wrap">
          <button
            type="button"
            className="cl-item__icon-btn"
            onClick={() =>
              setOpenMenu(openMenu === 'assignee' ? null : 'assignee')
            }
            title="担当者を設定"
            aria-label="担当者を設定"
          >
            <UserPlus size={12} aria-hidden />
          </button>
          {openMenu === 'assignee' && (
            <ItemMenu onClose={() => setOpenMenu(null)}>
              <button
                type="button"
                className="cl-item__menu-item"
                onClick={() => {
                  onUpdate({ assignee_id: null });
                  setOpenMenu(null);
                }}
              >
                未割当 {!item.assignee_id && '✓'}
              </button>
              {lists
                .filter((l) => l.id !== UNASSIGNED_KEY)
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="cl-item__menu-item"
                    onClick={() => {
                      onUpdate({ assignee_id: u.id });
                      setOpenMenu(null);
                    }}
                  >
                    {u.name} {item.assignee_id === u.id && '✓'}
                  </button>
                ))}
            </ItemMenu>
          )}
        </div>
        <div className="cl-item__menu-wrap">
          <button
            type="button"
            className="cl-item__icon-btn"
            onClick={() => setOpenMenu(openMenu === 'due' ? null : 'due')}
            title="期限を設定"
            aria-label="期限を設定"
          >
            <Clock size={12} aria-hidden />
          </button>
          {openMenu === 'due' && (
            <ItemMenu onClose={() => setOpenMenu(null)}>
              <div className="cl-item__menu-date">
                <input
                  type="date"
                  className="cdm__input"
                  defaultValue={item.due_date ?? ''}
                  onChange={(e) => {
                    onUpdate({ due_date: e.target.value || null });
                    setOpenMenu(null);
                  }}
                />
                <button
                  type="button"
                  className="cdm__btn"
                  onClick={() => {
                    onUpdate({ due_date: null });
                    setOpenMenu(null);
                  }}
                >
                  クリア
                </button>
              </div>
            </ItemMenu>
          )}
        </div>
        <button
          type="button"
          className="cl-item__icon-btn cl-item__icon-btn--danger"
          onClick={onDelete}
          title="削除"
          aria-label="削除"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function ItemAdder({
  lists,
  onSubmit,
  onCancel,
}: {
  lists: TaskList[];
  onSubmit: (
    title: string,
    assigneeId?: string | null,
    dueDate?: string | null
  ) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [showAssignee, setShowAssignee] = useState(false);
  const [showDue, setShowDue] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string>('');

  const submit = () => {
    if (!title.trim()) return;
    onSubmit(title, assigneeId, dueDate || null);
    setTitle('');
    setAssigneeId(null);
    setDueDate('');
  };

  return (
    <div className="cl-adder">
      <input
        type="text"
        className="cdm__input"
        placeholder="アイテムを追加"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
      />
      {showAssignee && (
        <select
          className="cdm__input"
          value={assigneeId ?? ''}
          onChange={(e) => setAssigneeId(e.target.value || null)}
        >
          <option value="">担当者なし</option>
          {lists
            .filter((l) => l.id !== UNASSIGNED_KEY)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
      )}
      {showDue && (
        <input
          type="date"
          className="cdm__input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      )}
      <div className="cl-adder__btns">
        <button
          type="button"
          className="cdm__btn cdm__btn--primary"
          onClick={submit}
          disabled={!title.trim()}
        >
          追加
        </button>
        <button type="button" className="cdm__btn" onClick={onCancel}>
          キャンセル
        </button>
        <button
          type="button"
          className={
            'cl-adder__option' + (showAssignee ? ' cl-adder__option--active' : '')
          }
          onClick={() => setShowAssignee((v) => !v)}
        >
          <UserPlus size={12} aria-hidden /> 割り当て
        </button>
        <button
          type="button"
          className={
            'cl-adder__option' + (showDue ? ' cl-adder__option--active' : '')
          }
          onClick={() => setShowDue((v) => !v)}
        >
          <Clock size={12} aria-hidden /> 期限
        </button>
      </div>
    </div>
  );
}

function ItemMenu({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);
  return (
    <div className="cl-item__menu" ref={ref}>
      {children}
    </div>
  );
}

function formatMD(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Supabase の error オブジェクトを文字列化
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.message === 'string') parts.push(obj.message);
    if (typeof obj.details === 'string') parts.push(`(${obj.details})`);
    if (typeof obj.hint === 'string') parts.push(`hint: ${obj.hint}`);
    if (typeof obj.code === 'string') parts.push(`[${obj.code}]`);
    if (parts.length > 0) return parts.join(' ');
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}
