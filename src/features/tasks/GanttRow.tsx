// Phase D-4-h: ガント行 (左ペインのテキスト行 / 右ペインのバー)
// OfficeHub スタイル (CSS変数 + BEM風命名) で実装
import type { TaskCard } from './types';

export type RowKind = 'group' | 'card' | 'checklist';

export type GanttItem = {
  kind: RowKind;
  id: string;
  // group
  groupId?: string;
  groupName?: string;
  groupTotal?: number;
  groupCompleted?: number;
  groupExpanded?: boolean;
  // card / checklist
  parentCard?: TaskCard;
  title?: string;
  start?: Date;
  end?: Date;
  isCompleted?: boolean;
  status?: string | null;
  assigneeName?: string;
};

function toDateOnly(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (toDateOnly(b).getTime() - toDateOnly(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function formatMD(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function GanttRowLeft({
  row,
  cardExpanded,
  onToggle,
  onClick,
}: {
  row: GanttItem;
  cardExpanded: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  // ===== グループヘッダー =====
  if (row.kind === 'group') {
    const total = row.groupTotal ?? 0;
    const done = row.groupCompleted ?? 0;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return (
      <div
        className="tb-gantt-row tb-gantt-row--group"
        onClick={onToggle}
        role="button"
        tabIndex={0}
      >
        <div className="tb-gantt-row__title">
          <button
            type="button"
            className="tb-gantt-row__caret"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={row.groupExpanded ? '折りたたむ' : '展開'}
          >
            {row.groupExpanded ? '▾' : '▸'}
          </button>
          <span className="tb-gantt-row__groupname">{row.groupName}</span>
          <span className="tb-gantt-row__groupcount">{total}件</span>
        </div>
        <div className="tb-gantt-row__progress">
          <span className="tb-gantt-row__progresslabel">完了 {percent}%</span>
          <div className="tb-gantt-row__progressbar">
            <div
              className={
                'tb-gantt-row__progressfill' +
                (percent === 100 ? ' tb-gantt-row__progressfill--done' : '')
              }
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ===== カード / チェックリスト =====
  const isCard = row.kind === 'card';
  return (
    <div
      className={
        'tb-gantt-row tb-gantt-row--' +
        (isCard ? 'card' : 'checklist') +
        (row.isCompleted ? ' tb-gantt-row--completed' : '')
      }
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="tb-gantt-row__title">
        {isCard ? (
          <button
            type="button"
            className="tb-gantt-row__caret tb-gantt-row__caret--card"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={cardExpanded ? '折りたたむ' : '展開'}
          >
            {cardExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tb-gantt-row__caret tb-gantt-row__caret--placeholder" />
        )}
        <span
          className={
            'tb-gantt-row__titletext' +
            (isCard ? '' : ' tb-gantt-row__titletext--child')
          }
          title={row.title}
        >
          {isCard ? row.title : `└ ${row.title}`}
        </span>
      </div>
      <div className="tb-gantt-row__assignee" title={row.assigneeName}>
        {row.assigneeName}
      </div>
      <div className="tb-gantt-row__due">{row.end ? formatMD(row.end) : ''}</div>
    </div>
  );
}

function GanttRowBar({
  row,
  viewStart,
  viewEnd,
  dayWidth,
  onClick,
}: {
  row: GanttItem;
  viewStart: Date;
  viewEnd: Date;
  dayWidth: number;
  onClick: () => void;
}) {
  // グループ行はバー無し
  if (row.kind === 'group') {
    return <div className="tb-gantt-bar tb-gantt-bar--group" />;
  }

  const start = row.start!;
  const end = row.end!;
  const isCard = row.kind === 'card';
  const completed = !!row.isCompleted;

  // 範囲外
  if (end < viewStart || start > viewEnd) {
    return (
      <div
        className={
          'tb-gantt-bar' + (completed ? ' tb-gantt-bar--completed' : '')
        }
      />
    );
  }

  const clippedStart = start < viewStart ? viewStart : start;
  const clippedEnd = end > viewEnd ? viewEnd : end;
  const left = daysBetween(viewStart, clippedStart) * dayWidth;
  const width = (daysBetween(clippedStart, clippedEnd) + 1) * dayWidth - 4;

  const today = toDateOnly(new Date());
  const isOverdue = !completed && end < today;

  // 色決定 (OfficeHub カラートークン準拠)
  // - 完了    : ok (緑)
  // - 期限超過: danger (赤)
  // - その他  : カードは primary (グリーン)、チェックリストは info (青)
  let variant: 'ok' | 'danger' | 'primary' | 'info';
  if (completed) variant = 'ok';
  else if (isOverdue) variant = 'danger';
  else if (isCard) variant = 'primary';
  else variant = 'info';

  return (
    <div className="tb-gantt-bar" onClick={onClick}>
      <div
        className={
          'tb-gantt-bar__fill' +
          ` tb-gantt-bar__fill--${variant}` +
          (isCard ? ' tb-gantt-bar__fill--card' : ' tb-gantt-bar__fill--checklist') +
          (completed ? ' tb-gantt-bar__fill--completed' : '')
        }
        style={{
          left: `${left + 2}px`,
          width: `${Math.max(width, 8)}px`,
        }}
        title={`${row.title} (${formatMD(start)}〜${formatMD(end)})`}
      >
        <span className="tb-gantt-bar__label">{row.title}</span>
      </div>
    </div>
  );
}

export const GanttRow = {
  Left: GanttRowLeft,
  Bar: GanttRowBar,
};
