import type { AttendanceBreak, AttendanceRecord, ClockState } from './types';

/**
 * 勤怠データのユーティリティ関数群
 * --------------------------------------------------------------
 * 既存システム (timetrack-app-clean) の AttendanceClock.jsx 内の
 * 計算ロジックを TypeScript で再実装したもの。
 * ロジックは既存システムと完全に同一に保つ。
 * --------------------------------------------------------------
 */

/** 今日の日付を 'YYYY-MM-DD' で取得 (ローカルタイム基準) */
export function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO 文字列 → "HH:mm" (日本時間) */
export function fmtTime(isoStr: string | null | undefined): string | null {
  if (!isoStr) return null;
  return new Date(isoStr).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 2つの ISO 文字列の差分 (分、切り捨て、負数は0) */
export function diffMin(iso1: string | null | undefined, iso2: string | null | undefined): number {
  if (!iso1 || !iso2) return 0;
  return Math.max(0, Math.floor((new Date(iso1).getTime() - new Date(iso2).getTime()) / 60000));
}

/** 完了した休憩の合計分数 (進行中の休憩は除外) */
export function calcBreakMin(breaks: AttendanceBreak[]): number {
  return breaks.reduce((sum, b) => {
    if (!b.break_start || !b.break_end) return sum;
    return sum + diffMin(b.break_end, b.break_start);
  }, 0);
}

/** 進行中の休憩 (break_start あり / break_end なし) を返す */
export function getOngoingBreak(breaks: AttendanceBreak[]): AttendanceBreak | undefined {
  return breaks.find((b) => b.break_start && !b.break_end);
}

/**
 * 打刻状態を判定する (既存システム clockStateOf と同じロジック)
 */
export function getClockState(
  rec: AttendanceRecord | null | undefined,
  breaks: AttendanceBreak[]
): ClockState {
  if (!rec?.clock_in) return 'before';
  if (rec.clock_out) return 'done';
  if (getOngoingBreak(breaks)) return 'breaking';
  return 'working';
}

/**
 * 実働時間 (分単位) を計算する。
 * - clock_in / clock_out のいずれかが欠けていれば null
 * - 進行中の休憩がある場合も null (確定前)
 */
export function calcActualMin(
  rec: AttendanceRecord | null | undefined,
  breaks: AttendanceBreak[]
): number | null {
  if (!rec?.clock_in || !rec?.clock_out) return null;
  if (breaks.some((b) => b.break_start && !b.break_end)) return null;
  return diffMin(rec.clock_out, rec.clock_in) - calcBreakMin(breaks);
}

/**
 * 実働時間 (時間、小数2桁) を計算する。
 * 後方互換のため残す (集計などで小数が必要な箇所用)。
 */
export function calcActualHours(
  rec: AttendanceRecord | null | undefined,
  breaks: AttendanceBreak[]
): number | null {
  const min = calcActualMin(rec, breaks);
  if (min == null) return null;
  return Math.round((min / 60) * 100) / 100;
}

/**
 * 休憩時間を "Xh Ym" 形式で。0 のときは null。
 */
export function fmtBreakDuration(totalMin: number): string | null {
  if (totalMin <= 0) return null;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/**
 * 実働時間を "H:MM" 形式で表示
 * - 分単位の値を受け取って "2:46" のような形式に変換
 * - 引数が hours (小数) でも対応 (後方互換)
 */
export function fmtActualHours(value: number | null): string {
  if (value == null) return '—';
  // 小数(hours)で来た場合 → 分に変換
  // 整数(min)で 24 を超えるなら分とみなす
  const totalMin = Number.isInteger(value) && value > 24
    ? value
    : Math.round(value * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** 実働時間 (分) を "H:MM" 形式で。null 安全。*/
export function fmtMinAsHM(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
