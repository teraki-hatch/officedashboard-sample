import type { LeaveType, RequestStatus } from './types';

/**
 * 申請関連の定数・ユーティリティ
 * --------------------------------------------------------------
 * 既存システム timetrack-app-clean の RequestsView.jsx から
 * 完全踏襲。ラベル・分類・計算ロジックを TypeScript 化。
 * --------------------------------------------------------------
 */

/** 休暇種別ラベル (既存 LEAVE_TYPE_LABEL) */
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  morning_half: '午前休',
  afternoon_half: '午後休',
  paid: '有休',
  bereavement: '慶弔休暇',
  caregiving: '介護休暇',
  menstrual: '生理休暇',
  childcare_nursing: '看護休暇',
};

/** 半休キー (既存 HALF_LEAVE_TYPES) */
export const HALF_LEAVE_TYPES: ReadonlySet<LeaveType> = new Set<LeaveType>([
  'morning_half',
  'afternoon_half',
]);

/** 全休キー (既存 FULL_LEAVE_TYPES) */
export const FULL_LEAVE_TYPES: ReadonlySet<LeaveType> = new Set<LeaveType>([
  'paid',
  'bereavement',
  'caregiving',
  'menstrual',
  'childcare_nursing',
]);

/** 有休消化対象 (既存 PAID_TYPES) */
export const PAID_TYPES: ReadonlySet<LeaveType> = new Set<LeaveType>([
  'paid',
  'morning_half',
  'afternoon_half',
]);

/** 半休の日数 (既存 PAID_DAYS) */
const PAID_DAYS_HALF = 0.5;

/** ステータスラベル */
export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: '承認待ち',
  approved: '承認済み',
  rejected: '却下',
  cancelled: '取消済み',
};

/** ステータス色 (badge class) */
export const STATUS_BADGE_CLASS: Record<RequestStatus, string> = {
  pending: 'badge--warn',
  approved: 'badge--ok',
  rejected: 'badge--danger',
  cancelled: 'badge--mute',
};

/**
 * 2日付間の営業日数 (土日除く、祝日は簡易対応)
 * 既存 calcWorkdays 完全踏襲
 */
export function calcWorkdays(start: string, end: string): number {
  if (!start || !end) return 1;
  let count = 0;
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
}

/**
 * 休暇種別と日付から日数を計算
 * 半休なら 0.5、全休なら calcWorkdays
 */
export function calcLeaveDays(
  leaveType: LeaveType,
  startDate: string,
  endDate: string
): number {
  if (HALF_LEAVE_TYPES.has(leaveType)) return PAID_DAYS_HALF;
  return calcWorkdays(startDate, endDate);
}

/**
 * 有休消化日数を計算 (既存 calcPaidUsed 踏襲)
 * 指定ステータスかつ PAID_TYPES に該当する申請の合計日数
 */
export function calcPaidUsed(
  leaves: Array<{ leave_type: string; status: string; days: number | null }>,
  statusFilter: RequestStatus[]
): number {
  return leaves
    .filter(
      (r) =>
        statusFilter.includes(r.status as RequestStatus) &&
        PAID_TYPES.has(r.leave_type as LeaveType)
    )
    .reduce((s, r) => {
      const lt = r.leave_type as LeaveType;
      const d = HALF_LEAVE_TYPES.has(lt) ? PAID_DAYS_HALF : r.days ?? 1;
      return Math.round((s + d) * 10) / 10;
    }, 0);
}

/**
 * 現在の会計年度 (4月始まり)
 * 既存システムと同じ: 月が3 (=4月) 以降なら今年、それ以前なら前年
 */
export function currentFiscalYear(now: Date = new Date()): number {
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

/** ISO 文字列を 'YYYY-MM-DD HH:mm' に */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
