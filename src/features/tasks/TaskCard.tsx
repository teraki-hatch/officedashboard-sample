// Phase D-4-e (Step 5): カード一覧に ○完了マーク追加
//   - タイトル左に ○ (未完了) / ✓ (完了) を表示
//   - クリックで status を '完了' ↔ null トグル
//   - e.stopPropagation() でカード詳細モーダルが開かないように
// Phase D-4-e (Step 2.8): 完了カードに data-completed 属性追加
import { Clock, MessageSquare, CheckSquare, Circle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import type { TaskCard as TaskCardType } from './types';
import { labelColorStyle, statusColorStyle } from './types';

type Props = {
  card: TaskCardType;
  onClick?: (card: TaskCardType) => void;
  onToggleComplete?: () => void; // 完了切り替え後に親で再フェッチ
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function dueClass(due: string | null): string {
  if (!due) return '';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(d);
  dueDate.setHours(0, 0, 0, 0);
  if (dueDate < today) return 'tb-card__due--overdue';
  if (dueDate.getTime() === today.getTime()) return 'tb-card__due--today';
  return '';
}

export function TaskCard({ card, onClick, onToggleComplete }: Props) {
  const [toggling, setToggling] = useState(false);
  const cl = dueClass(card.due_date);
  const checklist = card.checklist_count;
  const hasChecklist = checklist && checklist.total > 0;
  const isCompleted = card.status === '完了';

  const handleToggleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation(); // カード詳細モーダルを開かない
    if (toggling) return;
    setToggling(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');
      const newStatus = isCompleted ? null : '完了';
      const { error } = await sb
        .from('cards')
        .update({ status: newStatus })
        .eq('id', card.id);
      if (error) throw error;
      onToggleComplete?.();
    } catch (err) {
      console.error('[OfficeHub:tasks:card] quick complete error', err);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div
      className="tb-card"
      data-completed={isCompleted ? 'true' : 'false'}
      onClick={() => onClick?.(card)}
      role="button"
      tabIndex={0}
    >
      {card.labels && card.labels.length > 0 && (
        <div className="tb-card__labels">
          {card.labels.map((l) => (
            <span
              key={l.id}
              className="tb-card__label"
              style={labelColorStyle(l.color)}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className="tb-card__title-row" style={styles.titleRow}>
        <button
          type="button"
          onClick={handleToggleComplete}
          disabled={toggling}
          title={isCompleted ? '完了を取り消す' : '完了としてマーク'}
          aria-label={isCompleted ? '完了を取り消す' : '完了としてマーク'}
          style={{
            ...styles.completeBtn,
            color: isCompleted ? '#16a34a' : '#9ca3af',
          }}
        >
          {isCompleted ? (
            <CheckCircle2 size={16} aria-hidden />
          ) : (
            <Circle size={16} aria-hidden />
          )}
        </button>
        <div className="tb-card__title" style={styles.title}>
          {card.title}
        </div>
      </div>
      <div className="tb-card__meta">
        {card.due_date && (
          <span className={`tb-card__due ${cl}`}>
            <Clock size={11} aria-hidden />
            {formatDate(card.due_date)}
          </span>
        )}
        {card.status && (
          <span
            className="tb-card__status"
            style={statusColorStyle(card.status)}
          >
            {card.status}
          </span>
        )}
        {hasChecklist && (
          <span className="tb-card__icon-meta" title="チェックリスト">
            <CheckSquare size={11} aria-hidden />
            {checklist!.completed}/{checklist!.total}
          </span>
        )}
        {card.comment_count != null && card.comment_count > 0 && (
          <span className="tb-card__icon-meta" title="コメント">
            <MessageSquare size={11} aria-hidden />
            {card.comment_count}
          </span>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  titleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
  },
  completeBtn: {
    flex: '0 0 auto',
    background: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    marginTop: 1, // タイトル先頭文字と揃える微調整
  },
  title: {
    flex: '1 1 auto',
    minWidth: 0,
  },
};
