import type { TimeEntry } from './types';
import { isHoliday } from '../kintai/calendarUtils';

/**
 * 工数管理 ユーティリティ
 * --------------------------------------------------------------
 * 既存 dateUtils.js / TimeEntryCalendar.jsx のヘルパーを TS化。
 *
 * 2026-05-19 更新:
 * - 祝日 (holidays テーブル) も「公休日」として扱うよう拡張
 * - 勤怠カレンダーと同じ isHoliday / isWeekend ロジックを共有
 * --------------------------------------------------------------
 */

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD → Date オブジェクト (ローカル) */
export function parseDateStr(ds: string): Date {
  return new Date(`${ds}T00:00:00`);
}

/** Date → "YYYY-MM-DD" */
export function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 数値を小数点2桁で四捨五入 */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 月末日 (1-31) */
export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** その月の YYYY-MM-DD 配列を生成 */
export function monthDays(year: number, month0: number): string[] {
  const days = daysInMonth(year, month0);
  const arr: string[] = [];
  for (let i = 1; i <= days; i++) {
    arr.push(`${year}-${pad(month0 + 1)}-${pad(i)}`);
  }
  return arr;
}

/** 月の1日の曜日 (0=日) */
export function firstDayOfWeek(year: number, month0: number): number {
  return new Date(year, month0, 1).getDay();
}

/** 土日判定 */
export function isWeekend(ds: string): boolean {
  const d = parseDateStr(ds);
  return d.getDay() === 0 || d.getDay() === 6;
}

/**
 * 公休日判定 (土日 or 祝日)
 * 勤怠カレンダーと同じ判定を行う
 */
export function isPublicHoliday(ds: string): boolean {
  return isWeekend(ds) || isHoliday(ds);
}

/** その日のエントリ抽出 */
export function entriesOnDate(entries: TimeEntry[], ds: string): TimeEntry[] {
  return entries.filter((e) => e.date === ds);
}

/** 合計時間 (小数点2桁) */
export function sumHours(entries: TimeEntry[]): number {
  return r2(entries.reduce((acc, e) => acc + (Number(e.hours) || 0), 0));
}

/** 「今日」の YYYY-MM-DD (ローカル) */
export function todayStr(): string {
  return dateToStr(new Date());
}

// ============================================================
// 工数差分計算 (Phase 4-1)
// ============================================================

/** 有給/病欠系の work_type */
const LEAVE_WORK_TYPES = new Set([
  'paid_leave_full',
  'paid_leave_am',
  'paid_leave_pm',
  'sick_leave',
  'special_leave',
  'absence',
]);

/** ISO 文字列の差分を分単位で */
function diffMin(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(0, Math.floor((e - s) / 60000));
}

/**
 * 1日分の勤怠時間 (h) を計算
 *
 * @returns 実働時間 (h) または null (計算不可)
 */
export function calcDailyActualHours(raw: {
  clockIn: string | null;
  clockOut: string | null;
  workType: string | null;
  breaks: Array<{ start: string | null; end: string | null }>;
}): { hours: number | null; reason: DiffReason } {
  if (raw.workType && LEAVE_WORK_TYPES.has(raw.workType)) {
    return { hours: null, reason: 'leave' };
  }
  if (!raw.clockIn || !raw.clockOut) {
    return { hours: null, reason: 'not-finished' };
  }
  const hasOngoingBreak = raw.breaks.some((b) => b.start && !b.end);
  if (hasOngoingBreak) {
    return { hours: null, reason: 'on-break' };
  }
  const totalMin = diffMin(raw.clockIn, raw.clockOut);
  const breakMin = raw.breaks.reduce(
    (acc, b) => acc + diffMin(b.start, b.end),
    0
  );
  return { hours: r2((totalMin - breakMin) / 60), reason: null };
}

/** 計算不可の理由 */
export type DiffReason = null | 'leave' | 'not-finished' | 'on-break';

/** カレンダーセル上の表示ステータス */
export type CellStatus =
  | 'future' // 未来日 (表示なし)
  | 'weekend' // 土日・祝日 (公休日)
  | 'no-clock' // 平日だが打刻なし
  | 'leave' // 休暇
  | 'pending' // 退勤未打刻 / 休憩終了未打刻
  | 'no-entry' // 工数 0h
  | 'match' // 差 < 0.5h
  | 'short' // 工数不足 (>= 0.5h)
  | 'over'; // 工数超過 (>= 0.5h)

/** カレンダーセルのステータスを決定 */
export function decideCellStatus(args: {
  ds: string;
  today: string;
  /** 工数合計 (h) */
  kousuHours: number;
  /** 勤怠 raw (なければ undefined) */
  attendance:
    | {
        clockIn: string | null;
        clockOut: string | null;
        workType: string | null;
        breaks: Array<{ start: string | null; end: string | null }>;
      }
    | undefined;
}): { status: CellStatus; diff: number | null } {
  const { ds, today, kousuHours, attendance } = args;

  // ★ 公休日 (土日・祝) は工数有無に関わらず weekend 扱い
  // (打刻が無くてもエラー扱いしない)
  if (isPublicHoliday(ds)) {
    return { status: 'weekend', diff: null };
  }

  // 未来日 (今日より後)
  if (ds > today) {
    return { status: 'future', diff: null };
  }

  if (!attendance) {
    // 勤怠記録なし
    return { status: 'no-clock', diff: null };
  }

  const { hours, reason } = calcDailyActualHours(attendance);
  if (reason === 'leave') return { status: 'leave', diff: null };
  if (reason === 'not-finished' || reason === 'on-break') {
    return { status: 'pending', diff: null };
  }
  if (hours == null) return { status: 'no-clock', diff: null };

  const diff = r2(hours - kousuHours);

  if (kousuHours < 0.01) {
    return { status: 'no-entry', diff };
  }
  if (Math.abs(diff) < 0.5) return { status: 'match', diff };
  if (diff > 0) return { status: 'short', diff };
  return { status: 'over', diff };
}
