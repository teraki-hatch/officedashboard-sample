import type { ClosureStatus, MonthlyClosure, LockState } from './types';

/**
 * 月次勤怠締め機能の共通ユーティリティ
 * --------------------------------------------------------------
 * - 'YYYY-MM' 形式の年月文字列を扱うヘルパー
 * - 日付からロック中判定をする関数
 * --------------------------------------------------------------
 */

/** Date を 'YYYY-MM' に */
export function toYearMonth(year: number, month: number): string {
  // month は 1-12
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' から 'YYYY-MM' を取り出す */
export function dateStrToYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7); // 'YYYY-MM-DD' → 'YYYY-MM'
}

/** 'YYYY-MM' から { year, month(1-12) } に */
export function parseYearMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-');
  return { year: Number(y), month: Number(m) };
}

/** 年月の表示用 (例: '2026年5月') */
export function formatYearMonthJa(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  return `${year}年${month}月`;
}

/** MonthlyClosure → LockState への変換 */
export function toLockState(closure: MonthlyClosure | null): LockState {
  return {
    locked: closure?.status === 'confirmed',
    submitted: closure?.status === 'submitted',
    closure,
  };
}

/** バッジ表示用のラベル */
export function statusLabel(status: ClosureStatus | null | undefined): string {
  if (status === 'confirmed') return '確定済';
  if (status === 'submitted') return '提出済';
  return '未提出';
}

/** バッジのカラークラス */
export function statusBadgeClass(status: ClosureStatus | null | undefined): string {
  if (status === 'confirmed') return 'badge--ok';
  if (status === 'submitted') return 'badge--warn';
  return 'badge--mute';
}

/** タイムスタンプを 'M/D HH:mm' 形式で短く */
export function fmtShortTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
