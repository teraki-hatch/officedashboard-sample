import type { AttendanceBreak, AttendanceRecord } from './types';
import { calcActualHours, calcBreakMin, diffMin } from './utils';
import { isHoliday } from './holidays';

/**
 * 勤怠カレンダー用ユーティリティ
 * --------------------------------------------------------------
 * 既存システム timetrack-app-clean の AttendanceCalendar.jsx 内の
 * ヘルパー関数群を TypeScript で再実装したもの。
 * ロジックは既存と完全に同一に保つ。
 * --------------------------------------------------------------
 */

/** 'YYYY-MM-DD' を生成 (年・月0始まり・日) */
export function toDateStr(year: number, month0: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month0 + 1)}-${pad(day)}`;
}

/** 'YYYY-MM-DD' から Date オブジェクト (00:00:00 ローカル) */
export function parseDateStr(ds: string): Date {
  return new Date(ds + 'T00:00:00');
}

/** 土日判定 */
export function isWeekend(ds: string): boolean {
  const d = parseDateStr(ds);
  const w = d.getDay();
  return w === 0 || w === 6;
}

/** 休日 (土日祝) 判定 */
export function isNonWorkday(ds: string): boolean {
  return isWeekend(ds) || isHoliday(ds);
}

/** 今日の 'YYYY-MM-DD' */
export function todayStr(): string {
  const d = new Date();
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 小数2桁に丸める */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 休暇種別ラベル (既存 LEAVE_LABEL と同じ)
 */
export const LEAVE_LABEL: Record<string, string> = {
  paid: '有給',
  morning_half: '午前半休',
  afternoon_half: '午後半休',
  bereavement: '慶弔',
  caregiving: '介護',
  menstrual: '生理',
  childcare_nursing: '育児・看護',
  sick: '病欠',
};

/**
 * 1日全休扱いの休暇キー (既存 FULL_LEAVE_KEYS と同じ)
 */
export const FULL_LEAVE_KEYS: ReadonlySet<string> = new Set([
  'paid',
  'bereavement',
  'caregiving',
  'menstrual',
  'childcare_nursing',
  'sick',
]);

/**
 * 休暇種別ごとの時間 (既存 LEAVE_HOURS と同じ)
 * 半休は3時間/4時間、全休は7時間
 */
export const LEAVE_HOURS: Record<string, number> = {
  morning_half: 3,
  afternoon_half: 4,
  paid: 7,
  bereavement: 7,
  caregiving: 7,
  menstrual: 7,
  childcare_nursing: 7,
  sick: 7,
};

/** 1日あたりの標準稼働時間 (既存 HOURS_PER_DAY と同じ) */
export const HOURS_PER_DAY = 7;

/** 勤務区分ラベル (既存 workTypeLabel と同じ) */
export function workTypeLabel(val: string | null | undefined): string {
  switch (val) {
    case 'remote':
      return '在宅';
    case 'business_trip':
      return '出張';
    case 'office':
    case 'normal':
    case null:
    case undefined:
    case '':
      return '出社';
    default:
      return '出社';
  }
}

/** 勤務区分色 (既存 workTypeColor と同じ) */
export function workTypeColor(val: string | null | undefined): string {
  switch (val) {
    case 'remote':
      return '#9DAA76'; // 緑系
    case 'business_trip':
      return '#B68C3F'; // 黄土
    case 'office':
    case 'normal':
    default:
      return '#6F88A8'; // 青系
  }
}

/**
 * 勤怠ステータスのラベル (既存 statusLabel と同じ)
 * - 退勤済み → '退勤済'
 * - 出勤中   → '出勤中'
 * - 進行中休憩あり → '休憩中'
 * - その他 → '—'
 */
export function statusLabel(
  rec: AttendanceRecord | null | undefined,
  breaks: AttendanceBreak[]
): string {
  if (!rec) return '—';
  if (rec.clock_out) return '退勤済';
  if (rec.clock_in) {
    const ongoing = breaks.some((b) => b.break_start && !b.break_end);
    return ongoing ? '休憩中' : '出勤中';
  }
  return '—';
}

/**
 * 月の日付配列 (1日〜末日) を生成
 */
export function getMonthDays(year: number, month0: number): string[] {
  const last = new Date(year, month0 + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => toDateStr(year, month0, i + 1));
}

/**
 * 月の初日の曜日 (0=日)
 */
export function getFirstDayOfMonth(year: number, month0: number): number {
  return new Date(year, month0, 1).getDay();
}

/**
 * 月の総日数
 */
export function getDaysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** 'YYYY-MM-DD' を日本語短形式 ('5/16(土)') に */
export function fmtDateShort(ds: string): string {
  const d = parseDateStr(ds);
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${w})`;
}

/** 月単位での実働時間合計を計算 */
export function calcMonthTotalWork(
  monthDays: string[],
  getRec: (ds: string) => AttendanceRecord | null,
  getBreaks: (ds: string) => AttendanceBreak[],
  todayLimit: string
): number {
  return monthDays
    .filter((ds) => !isNonWorkday(ds) && ds <= todayLimit)
    .reduce((sum, ds) => {
      const h = calcActualHours(getRec(ds), getBreaks(ds));
      return sum + (h ?? 0);
    }, 0);
}

/** その月の休暇申請から休暇時間を計算 (既存ロジック踏襲) */
export function calcLeaveHours(
  leaveRequests: Array<{ leave_type: string; start_date: string; end_date: string }>,
  monthWorkdays: string[]
): number {
  const workdaySet = new Set(monthWorkdays);
  return r2(
    leaveRequests.reduce((sum, lv) => {
      const hpd = LEAVE_HOURS[lv.leave_type] ?? 7;
      // start_date〜end_date のうち、今月の平日のみカウント
      let cur = parseDateStr(lv.start_date);
      const last = parseDateStr(lv.end_date);
      while (cur <= last) {
        const ds = toDateStr(cur.getFullYear(), cur.getMonth(), cur.getDate());
        if (workdaySet.has(ds)) sum += hpd;
        cur.setDate(cur.getDate() + 1);
      }
      return sum;
    }, 0)
  );
}

/**
 * 休憩合計分数を表示用文字列に
 */
export function fmtBreakMin(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}h${m}m`;
}

// 再エクスポート (型を1ファイルで完結させやすく)
export { calcActualHours, calcBreakMin, diffMin };
export { isHoliday };
