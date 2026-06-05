// Phase D-4-e (Step 7.1): 日付ピッカーを画面中央に固定表示
//   - Dropdown コンポーネントに `centered` prop を追加
//   - 日付ピッカー呼び出しのみ centered={true} に → 画面センター寄り fixed 配置
//   - 縦長コンテンツでも見切れない (max-height: 90vh + overflow-y: auto)
//   - 他のドロップダウン (担当者/ステータス/ラベル) は今まで通り親要素基準
// Phase D-4-e (Step 4): コメント機能を右ペインに統合
//   - import に CommentSection を追加
//   - 右ペインのプレースホルダを <CommentSection cardId={card.id} /> に置換
// Phase D-4-e (Step 2.8): ○マークを完了トグルに
//   - ○クリック → status='完了' / 完了状態なら status=null に戻す
//   - 完了状態のときアイコンが変わる (CheckCircle)
//   - ツールチップ表示
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  MoreHorizontal,
  Calendar,
  CheckSquare,
  UserPlus,
  Tag,
  Trash2,
  MessageSquare,
  AlignLeft,
  Plus,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  CheckCircle2,
} from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import type { TaskCard, TaskLabel, TaskList, TaskStatus } from './types';
import { TASK_STATUSES, statusColorStyle } from './types';
import { UNASSIGNED_KEY } from './useBoardData';
import { ChecklistSection } from './ChecklistSection';
import type { ChecklistSectionHandle } from './ChecklistSection';
import { CommentSection } from './CommentSection';

type Props = {
  card: TaskCard;
  lists: TaskList[];
  onClose: () => void;
  onUpdated: () => void;
};

const LABEL_COLORS: Array<{ key: string; bg: string; text: string; label: string }> = [
  { key: 'yellow', bg: '#fef3c7', text: '#92400e', label: 'イエロー' },
  { key: 'orange', bg: '#ffedd5', text: '#9a3412', label: 'オレンジ' },
  { key: 'red', bg: '#fee2e2', text: '#991b1b', label: 'レッド' },
  { key: 'pink', bg: '#fce7f3', text: '#9d174d', label: 'ピンク' },
  { key: 'green', bg: '#dcfce7', text: '#166534', label: 'グリーン' },
  { key: 'teal', bg: '#ccfbf1', text: '#115e59', label: 'ティール' },
  { key: 'sky', bg: '#e0f2fe', text: '#075985', label: 'スカイ' },
  { key: 'blue', bg: '#dbeafe', text: '#1e40af', label: 'ブルー' },
  { key: 'gray', bg: '#f3f4f6', text: '#374151', label: 'グレー' },
];

export function CardDetailModal({ card, lists, onClose, onUpdated }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checklistRef = useRef<ChecklistSectionHandle>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [tmpTitle, setTmpTitle] = useState(card.title);
  const [tmpDesc, setTmpDesc] = useState(card.description ?? '');

  const [openDD, setOpenDD] = useState<null | 'assignee' | 'status' | 'date' | 'label'>(null);

  const [allLabels, setAllLabels] = useState<TaskLabel[]>([]);
  const loadAllLabels = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error: e } = await sb
      .from('labels')
      .select('id, name, color, created_at, updated_at')
      .order('name');
    if (e) {
      console.error('[OfficeHub:tasks:card] labels fetch error', e);
      return;
    }
    setAllLabels(
      (data ?? []).map((l) => ({
        id: l.id as string,
        name: (l.name as string) ?? '',
        color: (l.color as string) ?? 'gray',
        created_at: (l.created_at as string) ?? '',
        updated_at: (l.updated_at as string) ?? '',
      }))
    );
  }, []);

  useEffect(() => {
    if (openDD === 'label') void loadAllLabels();
  }, [openDD, loadAllLabels]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openDD) setOpenDD(null);
        else if (!editingTitle && !editingDesc) onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingTitle, editingDesc, openDD, onClose]);

  const assignee = card.assignee_id
    ? lists.find((l) => l.id === card.assignee_id) ?? null
    : null;
  const assigneeName = assignee?.name ?? '未割当';
  const isCompleted = card.status === '完了';

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const { error: e } = await sb.from('cards').update(patch).eq('id', card.id);
      if (e) throw e;
      onUpdated();
    } catch (e) {
      console.error('[OfficeHub:tasks:card] update error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveAssignee = async (uid: string | null) => {
    setOpenDD(null);
    await save({ assignee_id: uid });
  };
  const saveStatus = async (s: TaskStatus | null) => {
    setOpenDD(null);
    await save({ status: s });
  };

  // ○ 完了トグル
  const toggleComplete = async () => {
    await save({ status: isCompleted ? null : '完了' });
  };

  const saveDates = async (startDate: string | null, dueDate: string | null) => {
    setOpenDD(null);
    await save({
      start_date: startDate,
      due_date: dueDate,
    });
  };

  const saveTitle = async () => {
    await save({ title: tmpTitle.trim() || card.title });
    setEditingTitle(false);
  };
  const saveDesc = async () => {
    await save({ description: tmpDesc || null });
    setEditingDesc(false);
  };

  const toggleLabel = async (labelId: string, isAttached: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      if (isAttached) {
        const { error: e } = await sb
          .from('card_labels')
          .delete()
          .eq('card_id', card.id)
          .eq('label_id', labelId);
        if (e) throw e;
      } else {
        const { error: e } = await sb
          .from('card_labels')
          .insert({ card_id: card.id, label_id: labelId });
        if (e) throw e;
      }
      onUpdated();
    } catch (e) {
      console.error('[OfficeHub:tasks:card] toggle label error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const createLabel = async (name: string, color: string) => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const { data, error: e } = await sb
        .from('labels')
        .insert({ name: name.trim(), color })
        .select('id')
        .single();
      if (e) throw e;
      const newId = data?.id as string | undefined;
      if (newId) {
        const { error: e2 } = await sb
          .from('card_labels')
          .insert({ card_id: card.id, label_id: newId });
        if (e2) throw e2;
      }
      await loadAllLabels();
      onUpdated();
    } catch (e) {
      console.error('[OfficeHub:tasks:card] create label error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateLabel = async (labelId: string, name: string, color: string) => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const { error: e } = await sb
        .from('labels')
        .update({ name: name.trim(), color })
        .eq('id', labelId);
      if (e) throw e;
      await loadAllLabels();
      onUpdated();
    } catch (e) {
      console.error('[OfficeHub:tasks:card] update label error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteLabel = async (labelId: string) => {
    if (
      !window.confirm(
        'このラベルを削除します。\nこのラベルが付いている全カードからも外れます。\nよろしいですか?'
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const { error: e } = await sb.from('labels').delete().eq('id', labelId);
      if (e) throw e;
      await loadAllLabels();
      onUpdated();
    } catch (e) {
      console.error('[OfficeHub:tasks:card] delete label error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!window.confirm('このカードをアーカイブしますか?')) return;
    await save({ archived: true });
    onClose();
  };

  const attachedLabelIds = new Set((card.labels ?? []).map((l) => l.id));

  return (
    <div className="cdm-backdrop">
      <div
        className="cdm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="cdm__header">
          <div className="cdm__header-left">
            <div className="cdm__assignee-wrap">
              <button
                type="button"
                className="cdm__assignee-badge"
                onClick={() => setOpenDD(openDD === 'assignee' ? null : 'assignee')}
              >
                {assigneeName}
                <span className="cdm__chev">▾</span>
              </button>
              {openDD === 'assignee' && (
                <Dropdown onClose={() => setOpenDD(null)}>
                  <DDItem
                    label="未割当"
                    selected={!card.assignee_id}
                    onClick={() => saveAssignee(null)}
                  />
                  {lists
                    .filter((l) => l.id !== UNASSIGNED_KEY)
                    .map((u) => (
                      <DDItem
                        key={u.id}
                        label={u.name}
                        selected={card.assignee_id === u.id}
                        onClick={() => saveAssignee(u.id)}
                      />
                    ))}
                </Dropdown>
              )}
            </div>
          </div>
          <div className="cdm__header-right">
            <button
              type="button"
              className="cdm__icon-btn"
              title="その他 (準備中)"
              aria-label="その他"
            >
              <MoreHorizontal size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="cdm__icon-btn"
              onClick={onClose}
              aria-label="閉じる"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="cdm__layout">
          <div className="cdm__main">
            {/* タイトル + ○完了マーク */}
            <div className="cdm__title-row">
              <button
                type="button"
                className={
                  'cdm__title-check-btn' +
                  (isCompleted ? ' cdm__title-check-btn--done' : '')
                }
                onClick={toggleComplete}
                disabled={saving}
                title={isCompleted ? '完了を取り消す' : '完了としてマーク'}
                aria-label={isCompleted ? '完了を取り消す' : '完了としてマーク'}
              >
                {isCompleted ? (
                  <CheckCircle2 size={20} aria-hidden />
                ) : (
                  <Circle size={20} aria-hidden />
                )}
              </button>
              {editingTitle ? (
                <TitleEditor
                  value={tmpTitle}
                  onChange={setTmpTitle}
                  saving={saving}
                  onSave={saveTitle}
                  onCancel={() => {
                    setTmpTitle(card.title);
                    setEditingTitle(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={
                    'cdm__title-btn' + (isCompleted ? ' cdm__title-btn--done' : '')
                  }
                  onClick={() => {
                    setTmpTitle(card.title);
                    setEditingTitle(true);
                  }}
                >
                  {card.title}
                </button>
              )}
            </div>

            <div className="cdm__actions">
              <div className="cdm__actions-wrap">
                <button
                  type="button"
                  className="cdm__action-btn"
                  onClick={() => setOpenDD(openDD === 'label' ? null : 'label')}
                >
                  <Tag size={13} aria-hidden /> ラベル
                </button>
                {openDD === 'label' && (
                  <Dropdown onClose={() => setOpenDD(null)} wide>
                    <LabelPicker
                      allLabels={allLabels}
                      attachedLabelIds={attachedLabelIds}
                      saving={saving}
                      onToggle={toggleLabel}
                      onCreate={createLabel}
                      onUpdate={updateLabel}
                      onDelete={deleteLabel}
                      onClose={() => setOpenDD(null)}
                    />
                  </Dropdown>
                )}
              </div>
              <div className="cdm__actions-wrap">
                <button
                  type="button"
                  className="cdm__action-btn"
                  onClick={() => setOpenDD(openDD === 'date' ? null : 'date')}
                >
                  <Calendar size={13} aria-hidden /> 日付
                </button>
                {openDD === 'date' && (
                  <Dropdown onClose={() => setOpenDD(null)} wide centered>
                    <DatePicker
                      startDate={card.start_date}
                      dueDate={card.due_date}
                      saving={saving}
                      onSave={saveDates}
                      onClose={() => setOpenDD(null)}
                    />
                  </Dropdown>
                )}
              </div>
              <button
                type="button"
                className="cdm__action-btn"
                onClick={() => checklistRef.current?.startAdd()}
                title="チェックリストを追加"
              >
                <CheckSquare size={13} aria-hidden /> チェックリスト
              </button>
              <button
                type="button"
                className="cdm__action-btn"
                onClick={() => setOpenDD(openDD === 'assignee' ? null : 'assignee')}
              >
                <UserPlus size={13} aria-hidden /> メンバー
              </button>
            </div>

            <div className="cdm__chips-row">
              <div className="cdm__chips-label">ラベル</div>
              <div className="cdm__chips cdm__chips--dropdown-host">
                {card.labels && card.labels.length > 0 ? (
                  card.labels.map((l) => (
                    <span
                      key={l.id}
                      className="cdm__chip cdm__chip--label"
                      style={chipColorStyle(l.color)}
                    >
                      {l.name}
                    </span>
                  ))
                ) : (
                  <span className="cdm__placeholder">(なし)</span>
                )}
                <button
                  type="button"
                  className="cdm__chip-add"
                  onClick={() => setOpenDD(openDD === 'label' ? null : 'label')}
                  aria-label="ラベルを追加"
                  title="ラベルを追加"
                >
                  <Plus size={12} aria-hidden />
                </button>
              </div>
            </div>

            <div className="cdm__chips-row">
              <div className="cdm__chips-label">期日</div>
              <div className="cdm__chips cdm__chips--dropdown-host">
                <button
                  type="button"
                  className={'cdm__chip cdm__chip--btn ' + dueChipClass(card.due_date)}
                  onClick={() => setOpenDD(openDD === 'date' ? null : 'date')}
                >
                  {card.due_date ? formatDateTime(card.due_date) : '(なし)'}
                </button>
              </div>
            </div>

            <div className="cdm__chips-row">
              <div className="cdm__chips-label">開始日</div>
              <div className="cdm__chips cdm__chips--dropdown-host">
                <button
                  type="button"
                  className="cdm__chip cdm__chip--btn"
                  onClick={() => setOpenDD(openDD === 'date' ? null : 'date')}
                >
                  {card.start_date ? formatMD(card.start_date) : '(なし)'}
                </button>
              </div>
            </div>

            <div className="cdm__chips-row">
              <div className="cdm__chips-label">ステータス</div>
              <div className="cdm__chips cdm__chips--dropdown-host">
                <button
                  type="button"
                  className="cdm__chip cdm__chip--btn"
                  style={card.status ? statusColorStyle(card.status) : undefined}
                  onClick={() => setOpenDD(openDD === 'status' ? null : 'status')}
                >
                  {card.status ?? '(なし)'}
                </button>
                {openDD === 'status' && (
                  <Dropdown onClose={() => setOpenDD(null)}>
                    <DDItem
                      label="(なし)"
                      selected={!card.status}
                      onClick={() => saveStatus(null)}
                    />
                    {TASK_STATUSES.map((s) => (
                      <DDItem
                        key={s}
                        label={s}
                        selected={card.status === s}
                        onClick={() => saveStatus(s)}
                        chipStyle={statusColorStyle(s)}
                      />
                    ))}
                  </Dropdown>
                )}
              </div>
            </div>

            <div className="cdm__section">
              <div className="cdm__section-head">
                <AlignLeft size={14} aria-hidden />
                <span>説明</span>
              </div>
              {editingDesc ? (
                <div className="cdm__edit-block">
                  <textarea
                    className="cdm__textarea"
                    value={tmpDesc}
                    onChange={(e) => setTmpDesc(e.target.value)}
                    rows={5}
                    autoFocus
                  />
                  <div className="cdm__edit-btns">
                    <button
                      type="button"
                      className="cdm__btn cdm__btn--primary"
                      onClick={saveDesc}
                      disabled={saving}
                    >
                      {saving ? '保存中…' : '保存'}
                    </button>
                    <button
                      type="button"
                      className="cdm__btn"
                      onClick={() => {
                        setTmpDesc(card.description ?? '');
                        setEditingDesc(false);
                      }}
                      disabled={saving}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="cdm__desc"
                  onClick={() => {
                    setTmpDesc(card.description ?? '');
                    setEditingDesc(true);
                  }}
                >
                  {card.description ? (
                    card.description
                  ) : (
                    <span className="cdm__placeholder">詳しい説明を追加…</span>
                  )}
                </button>
              )}
            </div>

            {/* チェックリスト */}
            <ChecklistSection
              ref={checklistRef}
              cardId={card.id}
              lists={lists}
              onChanged={onUpdated}
            />

            <div className="cdm__footer">
              <button
                type="button"
                className="cdm__archive"
                onClick={archive}
                disabled={saving}
              >
                <Trash2 size={13} aria-hidden /> アーカイブ
              </button>
            </div>

            {error && <div className="cdm__error">エラー: {error}</div>}
          </div>

          <aside className="cdm__side">
            <div className="cdm__section-head">
              <MessageSquare size={14} aria-hidden />
              <span>コメントとアクティビティ</span>
            </div>
            <CommentSection cardId={card.id} />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ==== 以下、各種小物コンポーネント ====

function TitleEditor({
  value,
  onChange,
  saving,
  onSave,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.select();
  }, []);
  return (
    <div className="cdm__edit-block">
      <input
        ref={ref}
        type="text"
        className="cdm__input cdm__input--title"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="cdm__edit-btns">
        <button
          type="button"
          className="cdm__btn cdm__btn--primary"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          className="cdm__btn"
          onClick={onCancel}
          disabled={saving}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

/**
 * Dropdown コンポーネント
 *  - 通常 (デフォルト): 親要素基準で absolute 配置 (CSS の cdm-dd)
 *  - centered: 画面中央寄せ fixed 配置、max-height で見切れ防止
 */
function Dropdown({
  children,
  onClose,
  wide,
  centered,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  centered?: boolean;
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

  if (centered) {
    // 画面センター寄り固定配置 (Trello 風日付ピッカー用)
    return (
      <div ref={ref} style={centeredStyles.wrap}>
        <div style={centeredStyles.inner}>{children}</div>
      </div>
    );
  }

  return (
    <div className={'cdm-dd' + (wide ? ' cdm-dd--wide' : '')} ref={ref}>
      {children}
    </div>
  );
}

const centeredStyles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 1000,
    maxHeight: '90vh',
    maxWidth: '90vw',
    overflowY: 'auto',
    background: '#fff',
    borderRadius: 8,
    boxShadow:
      '0 16px 40px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)',
    border: '1px solid #e5e7eb',
  },
  inner: {
    padding: 4,
  },
};

function DDItem({
  label,
  selected,
  onClick,
  chipStyle,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
  chipStyle?: { background: string; color: string };
}) {
  return (
    <button
      type="button"
      className={'cdm-dd__item' + (selected ? ' cdm-dd__item--selected' : '')}
      onClick={onClick}
    >
      {chipStyle ? (
        <span className="cdm-dd__chip" style={chipStyle}>
          {label}
        </span>
      ) : (
        label
      )}
      {selected && <span className="cdm-dd__check">✓</span>}
    </button>
  );
}

type LabelPickerMode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; label: TaskLabel };

function LabelPicker({
  allLabels,
  attachedLabelIds,
  saving,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: {
  allLabels: TaskLabel[];
  attachedLabelIds: Set<string>;
  saving: boolean;
  onToggle: (labelId: string, isAttached: boolean) => void;
  onCreate: (name: string, color: string) => Promise<void> | void;
  onUpdate: (labelId: string, name: string, color: string) => Promise<void> | void;
  onDelete: (labelId: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<LabelPickerMode>({ kind: 'list' });
  const [filter, setFilter] = useState('');

  const filtered = allLabels.filter((l) =>
    filter.trim() === '' ? true : l.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (mode.kind === 'list') {
    return (
      <div className="cdm-lp">
        <div className="cdm-lp__head">
          <span className="cdm-lp__head-spacer" />
          <div className="cdm-lp__title">ラベル</div>
          <button
            type="button"
            className="cdm-lp__close"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <input
          type="text"
          className="cdm__input cdm-lp__search"
          placeholder="ラベルを検索…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="cdm-lp__list">
          {filtered.length === 0 && (
            <div className="cdm__placeholder cdm__placeholder--block">
              該当するラベルがありません
            </div>
          )}
          {filtered.map((l) => {
            const attached = attachedLabelIds.has(l.id);
            return (
              <div key={l.id} className="cdm-lp__row">
                <input
                  type="checkbox"
                  checked={attached}
                  onChange={() => onToggle(l.id, attached)}
                  disabled={saving}
                  aria-label={l.name}
                />
                <button
                  type="button"
                  className="cdm-lp__chip-btn"
                  style={chipColorStyle(l.color)}
                  onClick={() => onToggle(l.id, attached)}
                  disabled={saving}
                >
                  {l.name}
                </button>
                <button
                  type="button"
                  className="cdm-lp__edit-btn"
                  onClick={() => setMode({ kind: 'edit', label: l })}
                  aria-label="編集"
                  title="編集"
                >
                  <Pencil size={12} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="cdm-lp__create-btn"
          onClick={() => setMode({ kind: 'create' })}
        >
          <Plus size={12} aria-hidden /> 新しいラベルを作成
        </button>
      </div>
    );
  }

  if (mode.kind === 'edit') {
    return (
      <LabelEditor
        title="ラベルを編集"
        initialName={mode.label.name}
        initialColor={mode.label.color}
        saving={saving}
        showDelete
        onSubmit={async (name, color) => {
          await onUpdate(mode.label.id, name, color);
          setMode({ kind: 'list' });
        }}
        onDelete={async () => {
          await onDelete(mode.label.id);
          setMode({ kind: 'list' });
        }}
        onBack={() => setMode({ kind: 'list' })}
      />
    );
  }

  return (
    <LabelEditor
      title="新しいラベル"
      initialName=""
      initialColor="gray"
      saving={saving}
      onSubmit={async (name, color) => {
        await onCreate(name, color);
        setMode({ kind: 'list' });
      }}
      onBack={() => setMode({ kind: 'list' })}
    />
  );
}

function LabelEditor({
  title,
  initialName,
  initialColor,
  saving,
  showDelete,
  onSubmit,
  onDelete,
  onBack,
}: {
  title: string;
  initialName: string;
  initialColor: string;
  saving: boolean;
  showDelete?: boolean;
  onSubmit: (name: string, color: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onBack: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  return (
    <div className="cdm-lp">
      <div className="cdm-lp__head">
        <button
          type="button"
          className="cdm-lp__back"
          onClick={onBack}
          aria-label="戻る"
        >
          ←
        </button>
        <div className="cdm-lp__title">{title}</div>
        <span className="cdm-lp__head-spacer" />
      </div>

      <div className="cdm-lp__preview-wrap">
        <span className="cdm-lp__preview-chip" style={chipColorStyle(color)}>
          {name || 'ラベル名'}
        </span>
      </div>

      <div className="cdm-lp__field">
        <div className="cdm-lp__field-label">タイトル</div>
        <input
          type="text"
          className="cdm__input"
          placeholder="ラベル名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="cdm-lp__field">
        <div className="cdm-lp__field-label">色を選択</div>
        <div className="cdm-lp__colors">
          {LABEL_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={
                'cdm-lp__color-swatch' +
                (color === c.key ? ' cdm-lp__color-swatch--selected' : '')
              }
              style={{ background: c.bg, color: c.text }}
              onClick={() => setColor(c.key)}
              title={c.label}
              aria-label={c.label}
            >
              {color === c.key ? '✓' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="cdm-lp__editor-btns">
        <button
          type="button"
          className="cdm__btn cdm__btn--primary"
          onClick={() => onSubmit(name, color)}
          disabled={saving || !name.trim()}
        >
          {saving ? '保存中…' : '保存'}
        </button>
        {showDelete && onDelete && (
          <button
            type="button"
            className="cdm__btn cdm__btn--danger"
            onClick={onDelete}
            disabled={saving}
          >
            削除
          </button>
        )}
      </div>
    </div>
  );
}

function DatePicker({
  startDate,
  dueDate,
  saving,
  onSave,
  onClose,
}: {
  startDate: string | null;
  dueDate: string | null;
  saving: boolean;
  onSave: (startISO: string | null, dueISO: string | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const initialMonth = useMemo(() => {
    const ref = dueDate || startDate;
    if (ref) {
      const d = new Date(ref);
      if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  }, [dueDate, startDate]);

  const [viewMonth, setViewMonth] = useState<Date>(initialMonth);
  const [startEnabled, setStartEnabled] = useState<boolean>(!!startDate);
  const [dueEnabled, setDueEnabled] = useState<boolean>(!!dueDate);
  const [startStr, setStartStr] = useState<string>(toDateOnly(startDate));
  const [dueStr, setDueStr] = useState<string>(toDateOnly(dueDate));
  const [timeStr, setTimeStr] = useState<string>(toTimeStr(dueDate));

  const startObj = startEnabled && startStr ? new Date(startStr) : null;
  const dueObj = dueEnabled && dueStr ? new Date(dueStr) : null;

  const prevMonth = () =>
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () =>
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  const prevYear = () =>
    setViewMonth(new Date(viewMonth.getFullYear() - 1, viewMonth.getMonth(), 1));
  const nextYear = () =>
    setViewMonth(new Date(viewMonth.getFullYear() + 1, viewMonth.getMonth(), 1));

  const handleClickDay = (d: Date) => {
    const iso = toISODate(d);
    if (!startEnabled && !dueEnabled) {
      setDueEnabled(true);
      setDueStr(iso);
    } else if (startEnabled && !dueEnabled) {
      setDueEnabled(true);
      setDueStr(iso);
    } else if (!startEnabled && dueEnabled) {
      setDueStr(iso);
    } else {
      const start = new Date(startStr);
      const due = new Date(dueStr);
      const distStart = Math.abs(d.getTime() - start.getTime());
      const distDue = Math.abs(d.getTime() - due.getTime());
      if (distStart < distDue) setStartStr(iso);
      else setDueStr(iso);
    }
  };

  const handleSubmit = async () => {
    let startISO: string | null = null;
    let dueISO: string | null = null;
    if (startEnabled && startStr) startISO = startStr;
    if (dueEnabled && dueStr) {
      const t = timeStr || '23:59';
      dueISO = `${dueStr}T${t}:00`;
    }
    await onSave(startISO, dueISO);
  };

  const handleClear = async () => {
    setStartEnabled(false);
    setDueEnabled(false);
    setStartStr('');
    setDueStr('');
    setTimeStr('');
    await onSave(null, null);
  };

  return (
    <div className="cdm-dp">
      <div className="cdm-lp__head">
        <span className="cdm-lp__head-spacer" />
        <div className="cdm-lp__title">日付</div>
        <button
          type="button"
          className="cdm-lp__close"
          onClick={onClose}
          aria-label="閉じる"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <div className="cdm-dp__nav">
        <button type="button" className="cdm-dp__nav-btn" onClick={prevYear} aria-label="前年">
          <ChevronsLeft size={14} aria-hidden />
        </button>
        <button type="button" className="cdm-dp__nav-btn" onClick={prevMonth} aria-label="前月">
          <ChevronLeft size={14} aria-hidden />
        </button>
        <div className="cdm-dp__month-label">
          {viewMonth.getFullYear()}年 {viewMonth.getMonth() + 1}月
        </div>
        <button type="button" className="cdm-dp__nav-btn" onClick={nextMonth} aria-label="翌月">
          <ChevronRight size={14} aria-hidden />
        </button>
        <button type="button" className="cdm-dp__nav-btn" onClick={nextYear} aria-label="翌年">
          <ChevronsRight size={14} aria-hidden />
        </button>
      </div>

      <CalendarGrid
        viewMonth={viewMonth}
        startDate={startObj}
        dueDate={dueObj}
        onClickDay={handleClickDay}
      />

      <div className="cdm-dp__field-grid">
        <label className="cdm-dp__field-row">
          <input
            type="checkbox"
            checked={startEnabled}
            onChange={(e) => {
              setStartEnabled(e.target.checked);
              if (e.target.checked && !startStr) setStartStr(toDateOnly(new Date()));
            }}
          />
          <span className="cdm-dp__field-label">開始日</span>
          <input
            type="date"
            className="cdm__input cdm-dp__input"
            value={startStr}
            onChange={(e) => setStartStr(e.target.value)}
            disabled={!startEnabled}
          />
        </label>

        <label className="cdm-dp__field-row">
          <input
            type="checkbox"
            checked={dueEnabled}
            onChange={(e) => {
              setDueEnabled(e.target.checked);
              if (e.target.checked && !dueStr) setDueStr(toDateOnly(new Date()));
            }}
          />
          <span className="cdm-dp__field-label">期限</span>
          <input
            type="date"
            className="cdm__input cdm-dp__input"
            value={dueStr}
            onChange={(e) => setDueStr(e.target.value)}
            disabled={!dueEnabled}
          />
          <input
            type="time"
            className="cdm__input cdm-dp__input cdm-dp__input--time"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            disabled={!dueEnabled}
          />
        </label>
      </div>

      <div className="cdm-dp__btns">
        <button
          type="button"
          className="cdm__btn cdm__btn--primary"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          className="cdm__btn cdm__btn--danger"
          onClick={handleClear}
          disabled={saving}
        >
          クリア
        </button>
      </div>
    </div>
  );
}

function CalendarGrid({
  viewMonth,
  startDate,
  dueDate,
  onClickDay,
}: {
  viewMonth: Date;
  startDate: Date | null;
  dueDate: Date | null;
  onClickDay: (d: Date) => void;
}) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    cells.push({ date: d, inMonth: false });
  }
  for (let day = 1; day <= lastDay.getDate(); day++) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inRange = (d: Date) => {
    if (!startDate || !dueDate) return false;
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    const s = new Date(startDate);
    s.setHours(0, 0, 0, 0);
    const e = new Date(dueDate);
    e.setHours(0, 0, 0, 0);
    return t > s && t < e;
  };
  const isStart = (d: Date) =>
    startDate && sameDay(d, startDate) ? true : false;
  const isDue = (d: Date) => (dueDate && sameDay(d, dueDate) ? true : false);

  return (
    <div className="cdm-cal">
      <div className="cdm-cal__weekdays">
        {['日', '月', '火', '水', '木', '金', '土'].map((w) => (
          <div key={w} className="cdm-cal__weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="cdm-cal__grid">
        {cells.map((c, i) => {
          const isToday = sameDay(c.date, today);
          const classes = [
            'cdm-cal__day',
            c.inMonth ? '' : 'cdm-cal__day--out',
            isToday ? 'cdm-cal__day--today' : '',
            inRange(c.date) ? 'cdm-cal__day--range' : '',
            isStart(c.date) ? 'cdm-cal__day--start' : '',
            isDue(c.date) ? 'cdm-cal__day--due' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={i}
              type="button"
              className={classes}
              onClick={() => onClickDay(c.date)}
            >
              {c.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function toDateOnly(value: string | Date | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toTimeStr(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  if (d.getHours() === 0 && d.getMinutes() === 0) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatMD(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const hh = d.getHours();
  const mm = d.getMinutes();
  if ((hh === 0 && mm === 0) || (hh === 23 && mm === 59)) return md;
  const hStr = String(hh).padStart(2, '0');
  const mStr = String(mm).padStart(2, '0');
  return `${md} ${hStr}:${mStr}`;
}

function dueChipClass(due: string | null): string {
  if (!due) return '';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  if (d < today) return 'cdm__chip--overdue';
  if (d.getTime() === today.getTime()) return 'cdm__chip--today';
  return '';
}

function chipColorStyle(color: string): { background: string; color: string } {
  const m: Record<string, { bg: string; text: string }> = {
    yellow: { bg: '#fef3c7', text: '#92400e' },
    sky: { bg: '#e0f2fe', text: '#075985' },
    teal: { bg: '#ccfbf1', text: '#115e59' },
    green: { bg: '#dcfce7', text: '#166534' },
    blue: { bg: '#dbeafe', text: '#1e40af' },
    orange: { bg: '#ffedd5', text: '#9a3412' },
    pink: { bg: '#fce7f3', text: '#9d174d' },
    red: { bg: '#fee2e2', text: '#991b1b' },
    gray: { bg: '#f3f4f6', text: '#374151' },
  };
  const c = m[color] || m.gray;
  return { background: c.bg, color: c.text };
}
