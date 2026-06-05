// Phase D-4-h: ガントビュー本実装
// - 月単位の表示 (前月/今月/次月)
// - 担当者 (lists) でグルーピング + 完了率バー
// - カード行 + チェックリスト子行 (展開可)
// - 今日ライン、土日グレー背景、期限超過の赤バー
// - クリックでカード詳細モーダルを開く (親が onCardClick で処理)
// 旧 taskboard (github.com/teraki-coder/taskboard) の GanttChart.tsx を移植。
// Tailwind → Pure CSS、Card/Profile/ASSIGNEE_COLUMNS → TaskCard/TaskList へ変換。
import { useEffect, useMemo, useState } from 'react';
import { GanttRow, type GanttItem } from './GanttRow';
import type { ChecklistItem, TaskCard, TaskList } from './types';

type Props = {
  lists: TaskList[];
  cards: TaskCard[];
  checklistItems: ChecklistItem[];
  onCardClick: (card: TaskCard) => void;
};

function toDateOnly(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (toDateOnly(b).getTime() - toDateOnly(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  x.setHours(0, 0, 0, 0);
  return x;
}

function resolveCardDates(card: TaskCard): { start: Date; end: Date } {
  const start = card.start_date
    ? new Date(card.start_date)
    : toDateOnly(new Date(card.created_at || Date.now()));
  const end = card.due_date ? new Date(card.due_date) : start;
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

function resolveItemDates(
  item: ChecklistItem,
  parentStart: Date
): { start: Date; end: Date } {
  const start = item.start_date ? new Date(item.start_date) : new Date(parentStart);
  const end = item.due_date ? new Date(item.due_date) : start;
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

const DAY_WIDTH = 36;

export function GanttView({ lists, cards, checklistItems, onCardClick }: Props) {
  const [viewStart, setViewStart] = useState<Date>(startOfMonth(new Date()));
  const viewEnd = endOfMonth(viewStart);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(lists.map((l) => l.id))
  );
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(() => new Set());
  const [openedAll, setOpenedAll] = useState(false);

  // 初回のみ全カード展開 (チェックリスト見やすさのため)
  useEffect(() => {
    if (!openedAll && cards.length > 0) {
      setExpandedCardIds(new Set(cards.map((c) => c.id)));
      setOpenedAll(true);
    }
  }, [cards, openedAll]);

  // lists が変わったら全グループ展開
  useEffect(() => {
    setExpandedGroups(new Set(lists.map((l) => l.id)));
  }, [lists]);

  const days: Date[] = useMemo(() => {
    const totalDays = daysBetween(viewStart, viewEnd) + 1;
    return Array.from({ length: totalDays }, (_, i) => addDays(viewStart, i));
  }, [viewStart, viewEnd]);

  const totalWidth = days.length * DAY_WIDTH;

  // 担当者 (list) ごとにグルーピング
  const cardsByList = useMemo(() => {
    const map = new Map<string, TaskCard[]>();
    for (const l of lists) map.set(l.id, []);
    for (const c of cards) {
      const arr = map.get(c.list_id);
      if (arr) arr.push(c);
    }
    return map;
  }, [lists, cards]);

  // グループごとの完了率 (カード + そのカードに紐づくチェックリスト項目)
  const groupStats = useMemo(() => {
    const stats = new Map<string, { total: number; completed: number }>();
    for (const l of lists) stats.set(l.id, { total: 0, completed: 0 });
    for (const l of lists) {
      const grpCards = cardsByList.get(l.id) ?? [];
      const s = stats.get(l.id)!;
      for (const card of grpCards) {
        s.total += 1;
        if (card.status === '完了') s.completed += 1;
        const items = checklistItems.filter((it) => it.card_id === card.id);
        for (const it of items) {
          s.total += 1;
          if (it.is_completed) s.completed += 1;
        }
      }
    }
    return stats;
  }, [lists, cardsByList, checklistItems]);

  // 行を組み立て : グループ → カード → チェックリスト
  const rows: GanttItem[] = useMemo(() => {
    const result: GanttItem[] = [];
    for (const l of lists) {
      const grpCards = cardsByList.get(l.id) ?? [];
      // 空グループはスキップ (見やすさのため)
      if (grpCards.length === 0) continue;

      const stat = groupStats.get(l.id) ?? { total: 0, completed: 0 };
      const isExpanded = expandedGroups.has(l.id);
      result.push({
        kind: 'group',
        id: `group:${l.id}`,
        groupId: l.id,
        groupName: l.name,
        groupTotal: stat.total,
        groupCompleted: stat.completed,
        groupExpanded: isExpanded,
      });

      if (!isExpanded) continue;

      for (const card of grpCards) {
        const { start, end } = resolveCardDates(card);
        result.push({
          kind: 'card',
          id: card.id,
          parentCard: card,
          title: card.title,
          start,
          end,
          isCompleted: card.status === '完了',
          status: card.status,
          assigneeName: l.name,
        });

        if (expandedCardIds.has(card.id)) {
          const childItems = checklistItems
            .filter((it) => it.card_id === card.id)
            .sort((a, b) => a.position - b.position);
          for (const it of childItems) {
            const { start: cs, end: ce } = resolveItemDates(it, start);
            result.push({
              kind: 'checklist',
              id: it.id,
              parentCard: card,
              title: it.title,
              start: cs,
              end: ce,
              isCompleted: it.is_completed,
              status: null,
              assigneeName: l.name,
            });
          }
        }
      }
    }
    return result;
  }, [lists, cardsByList, expandedGroups, expandedCardIds, checklistItems, groupStats]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleCardExpand = (cardId: string) => {
    setExpandedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const goPrevMonth = () => setViewStart(startOfMonth(addDays(viewStart, -1)));
  const goNextMonth = () => setViewStart(startOfMonth(addDays(viewEnd, 1)));
  const goThisMonth = () => setViewStart(startOfMonth(new Date()));

  const today = toDateOnly(new Date());
  const todayOffset =
    today >= viewStart && today <= viewEnd
      ? daysBetween(viewStart, today) * DAY_WIDTH
      : -1;

  const monthLabel = `${viewStart.getFullYear()}年${viewStart.getMonth() + 1}月`;
  const totalCardsShown = rows.filter((r) => r.kind === 'card').length;

  return (
    <div className="tb-gantt">
      {/* ===== ヘッダー (月ナビ) ===== */}
      <div className="tb-gantt__nav">
        <button
          type="button"
          className="tb-gantt__navbtn"
          onClick={goPrevMonth}
          title="前月"
          aria-label="前月"
        >
          ‹
        </button>
        <button
          type="button"
          className="tb-gantt__navbtn tb-gantt__navbtn--today"
          onClick={goThisMonth}
        >
          今月
        </button>
        <button
          type="button"
          className="tb-gantt__navbtn"
          onClick={goNextMonth}
          title="次月"
          aria-label="次月"
        >
          ›
        </button>
        <span className="tb-gantt__monthlabel">{monthLabel}</span>
        <span className="tb-gantt__count">表示中: {totalCardsShown} 件</span>
      </div>

      {/* ===== スクロールエリア ===== */}
      <div className="tb-gantt__scroll">
        <div className="tb-gantt__inner">
          {/* 左ペイン (固定) */}
          <div className="tb-gantt__left">
            <div className="tb-gantt__lefthead">
              <div className="tb-gantt__col-title">タスク</div>
              <div className="tb-gantt__col-assignee">担当</div>
              <div className="tb-gantt__col-due">期限</div>
            </div>

            {rows.length === 0 ? (
              <div className="tb-gantt__empty">表示するタスクがありません</div>
            ) : (
              rows.map((row) => (
                <GanttRow.Left
                  key={`${row.kind}-${row.id}`}
                  row={row}
                  cardExpanded={row.kind === 'card' && expandedCardIds.has(row.id)}
                  onToggle={() => {
                    if (row.kind === 'group' && row.groupId) toggleGroup(row.groupId);
                    else if (row.kind === 'card') toggleCardExpand(row.id);
                  }}
                  onClick={() => {
                    if ((row.kind === 'card' || row.kind === 'checklist') && row.parentCard) {
                      onCardClick(row.parentCard);
                    }
                  }}
                />
              ))
            )}
          </div>

          {/* 右ペイン (タイムライン) */}
          <div className="tb-gantt__right">
            {/* 日付ヘッダー */}
            <div
              className="tb-gantt__dayhead"
              style={{ width: totalWidth, ['--day-width' as string]: `${DAY_WIDTH}px` }}
            >
              {days.map((d) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isTodayCell = d.getTime() === today.getTime();
                const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
                return (
                  <div
                    key={d.getTime()}
                    className={
                      'tb-gantt__daycell' +
                      (isTodayCell ? ' tb-gantt__daycell--today' : '') +
                      (isWeekend ? ' tb-gantt__daycell--weekend' : '')
                    }
                  >
                    <div className="tb-gantt__daynum">{d.getDate()}</div>
                    <div className="tb-gantt__daydow">{dow}</div>
                  </div>
                );
              })}
            </div>

            {/* タイムライン本体 */}
            <div
              className="tb-gantt__timeline"
              style={{ width: totalWidth, ['--day-width' as string]: `${DAY_WIDTH}px` }}
            >
              {/* 背景グリッド (土日色付け) */}
              <div className="tb-gantt__grid">
                {days.map((d) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={d.getTime()}
                      className={
                        'tb-gantt__gridcell' +
                        (isWeekend ? ' tb-gantt__gridcell--weekend' : '')
                      }
                    />
                  );
                })}
              </div>

              {/* 今日ライン */}
              {todayOffset >= 0 && (
                <div
                  className="tb-gantt__todayline"
                  style={{ left: todayOffset + DAY_WIDTH / 2 }}
                />
              )}

              {/* バー */}
              {rows.map((row) => (
                <GanttRow.Bar
                  key={`${row.kind}-${row.id}`}
                  row={row}
                  viewStart={viewStart}
                  viewEnd={viewEnd}
                  dayWidth={DAY_WIDTH}
                  onClick={() => {
                    if ((row.kind === 'card' || row.kind === 'checklist') && row.parentCard) {
                      onCardClick(row.parentCard);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
