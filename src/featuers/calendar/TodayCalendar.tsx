import { useMemo } from 'react';
import type { CalendarEvent } from './types';
import './TodayCalendar.css';

const COLOR_MAP: Record<string, { bg: string; fg: string; name: string }> = {
  '1':  { bg: '#a4bdfc', fg: '#1d1d1d', name: 'ラベンダー' },
  '2':  { bg: '#7ae7bf', fg: '#1d1d1d', name: 'セージ' },
  '3':  { bg: '#dbadff', fg: '#1d1d1d', name: 'ぶどう' },
  '4':  { bg: '#ff887c', fg: '#ffffff', name: 'フラミンゴ' },
  '5':  { bg: '#fbd75b', fg: '#1d1d1d', name: 'バナナ' },
  '6':  { bg: '#ffb878', fg: '#1d1d1d', name: 'みかん' },
  '7':  { bg: '#46d6db', fg: '#1d1d1d', name: 'ピーコック' },
  '8':  { bg: '#e1e1e1', fg: '#1d1d1d', name: 'グラファイト' },
  '9':  { bg: '#5484ed', fg: '#ffffff', name: 'ブルーベリー' },
  '10': { bg: '#51b749', fg: '#ffffff', name: 'バジル' },
  '11': { bg: '#dc2127', fg: '#ffffff', name: 'トマト' },
};

const DEFAULT_COLOR = { bg: '#7b9e6e', fg: '#ffffff' };

const START_HOUR = 7;
const END_HOUR = 21;
const TOTAL_HOURS = END_HOUR - START_HOUR; // 14時間分
const HOUR_HEIGHT = 56;

type Props = {
  events: CalendarEvent[];
};

type PositionedEvent = {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  col: number;
  totalCols: number;
};

function layoutEvents(events: CalendarEvent[]): {
  allDayEvents: CalendarEvent[];
  timedEvents: PositionedEvent[];
} {
  const allDayEvents: CalendarEvent[] = [];
  const inRange: { event: CalendarEvent; startMin: number; endMin: number }[] = [];

  for (const ev of events) {
    if (ev.allDay) {
      allDayEvents.push(ev);
      continue;
    }
    if (!ev.startISO || !ev.endISO) {
      allDayEvents.push(ev);
      continue;
    }
    const s = new Date(ev.startISO);
    const e = new Date(ev.endISO);
    const startMin = s.getHours() * 60 + s.getMinutes();
    const endMin = e.getHours() * 60 + e.getMinutes();
    const rangeStart = START_HOUR * 60;
    const rangeEnd = END_HOUR * 60;
    if (endMin <= rangeStart || startMin >= rangeEnd) {
      allDayEvents.push(ev);
      continue;
    }
    inRange.push({
      event: ev,
      startMin: Math.max(startMin, rangeStart),
      endMin: Math.min(endMin, rangeEnd),
    });
  }

  inRange.sort((a, b) => a.startMin - b.startMin);

  const positioned: PositionedEvent[] = [];
  let i = 0;
  while (i < inRange.length) {
    const group: typeof inRange = [inRange[i]];
    let groupEnd = inRange[i].endMin;
    let j = i + 1;
    while (j < inRange.length && inRange[j].startMin < groupEnd) {
      group.push(inRange[j]);
      if (inRange[j].endMin > groupEnd) groupEnd = inRange[j].endMin;
      j++;
    }
    const cols: number[] = [];
    const assignments: number[] = [];
    for (const item of group) {
      let placed = false;
      for (let k = 0; k < cols.length; k++) {
        if (cols[k] <= item.startMin) {
          cols[k] = item.endMin;
          assignments.push(k);
          placed = true;
          break;
        }
      }
      if (!placed) {
        cols.push(item.endMin);
        assignments.push(cols.length - 1);
      }
    }
    const totalCols = cols.length;
    for (let k = 0; k < group.length; k++) {
      positioned.push({
        event: group[k].event,
        startMin: group[k].startMin,
        endMin: group[k].endMin,
        col: assignments[k],
        totalCols,
      });
    }
    i = j;
  }

  return { allDayEvents, timedEvents: positioned };
}

function openLink(url: string | null | undefined) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function AllDayChip({ ev }: { ev: CalendarEvent }) {
  const c = (ev.colorId && COLOR_MAP[ev.colorId]) || DEFAULT_COLOR;
  return (
    <button
      type="button"
      onClick={() => openLink(ev.htmlLink)}
      className="today-cal__allday-chip"
      style={{ background: c.bg, color: c.fg }}
      title={ev.title}
    >
      <span className="today-cal__allday-label">終日</span>
      <span className="today-cal__allday-title">{ev.title}</span>
    </button>
  );
}

function TimedChip({ p, rangeStartMin }: { p: PositionedEvent; rangeStartMin: number }) {
  const c = (p.event.colorId && COLOR_MAP[p.event.colorId]) || DEFAULT_COLOR;
  const topMin = p.startMin - rangeStartMin;
  const heightMin = p.endMin - p.startMin;
  const top = (topMin / 60) * HOUR_HEIGHT;
  const height = Math.max((heightMin / 60) * HOUR_HEIGHT - 2, 16);
  const widthPct = 100 / p.totalCols;
  const leftPct = p.col * widthPct;
  const compact = heightMin <= 30;
  return (
    <button
      type="button"
      onClick={() => openLink(p.event.htmlLink)}
      className={
        compact
          ? 'today-cal__chip today-cal__chip--compact'
          : 'today-cal__chip'
      }
      style={{
        top,
        height,
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 2px)`,
        background: c.bg,
        color: c.fg,
      }}
      title={`${p.event.startTime}-${p.event.endTime} ${p.event.title}`}
    >
      {compact ? (
        <span className="today-cal__chip-line">
          <span className="today-cal__chip-time-inline">{p.event.startTime}</span>
          <span className="today-cal__chip-title-inline">{p.event.title}</span>
        </span>
      ) : (
        <>
          <div className="today-cal__chip-time">
            {p.event.startTime}-{p.event.endTime}
          </div>
          <div className="today-cal__chip-title">{p.event.title}</div>
        </>
      )}
    </button>
  );
}

export function TodayCalendar({ events }: Props) {
  const { allDayEvents, timedEvents } = useMemo(
    () => layoutEvents(events),
    [events]
  );

  // ★ 修正: ラベル数 = 時間数 (14個) に揃える
  // 各「行 (HOUR_HEIGHT=56px)」は「H時00分 〜 (H+1)時00分」の領域を表す
  // ラベルは「その行の上端」に表示
  // 07時行〜20時行までの14行 = 14*56 = 784px の高さで TOTAL_HOURS と一致
  const hours: number[] = [];
  for (let h = START_HOUR; h < END_HOUR; h++) hours.push(h);

  const totalHeight = TOTAL_HOURS * HOUR_HEIGHT;
  const rangeStartMin = START_HOUR * 60;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNowLine = nowMin >= rangeStartMin && nowMin <= END_HOUR * 60;
  const nowTop = ((nowMin - rangeStartMin) / 60) * HOUR_HEIGHT;

  return (
    <div className="today-cal">
      {allDayEvents.length > 0 && (
        <div className="today-cal__allday">
          {allDayEvents.map((ev) => (
            <AllDayChip key={ev.id} ev={ev} />
          ))}
        </div>
      )}

      <div className="today-cal__grid" style={{ height: totalHeight }}>
        <div className="today-cal__hours">
          {hours.map((h) => (
            <div
              key={h}
              className="today-cal__hour-row"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="today-cal__hour-label">
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        <div className="today-cal__events">
          {hours.map((h) => (
            <div
              key={h}
              className="today-cal__event-row"
              style={{ height: HOUR_HEIGHT }}
            />
          ))}

          {timedEvents.map((p) => (
            <TimedChip key={p.event.id} p={p} rangeStartMin={rangeStartMin} />
          ))}

          {showNowLine && (
            <div
              className="today-cal__nowline"
              style={{ top: nowTop }}
              aria-hidden
            >
              <span className="today-cal__nowdot" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
