// Phase C-3 (cont.): TripType / TRIP_TYPE_LABELS / tripLabel を撤去、business_trip → business
import type {
  ExpenseRequest,
  ExpenseCategoryCode,
  TransportType,
} from './types';
import {
  TRANSPORT_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
} from './types';
// 金額を「¥1,234」形式にフォーマット
export function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '¥0';
  return `¥${amount.toLocaleString('ja-JP')}`;
}
// 数値を3桁カンマ区切り(¥なし)
export function formatNumber(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '0';
  return amount.toLocaleString('ja-JP');
}
// 月の合計金額を計算
export function calcMonthlyTotal(expenses: ExpenseRequest[]): number {
  return expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
}
// カテゴリ別の合計を計算
export function calcCategoryTotals(
  expenses: ExpenseRequest[]
): Record<ExpenseCategoryCode, number> {
  const totals: Record<ExpenseCategoryCode, number> = {
    commute: 0,
    business: 0,
    reimbursement: 0,
  };
  for (const e of expenses) {
    totals[e.category_code] = (totals[e.category_code] || 0) + (e.amount || 0);
  }
  return totals;
}
// 日別にグループ化
export function groupByDate(
  expenses: ExpenseRequest[]
): Map<string, ExpenseRequest[]> {
  const map = new Map<string, ExpenseRequest[]>();
  for (const e of expenses) {
    const list = map.get(e.date) || [];
    list.push(e);
    map.set(e.date, list);
  }
  return map;
}
// カテゴリラベル取得
export function categoryLabel(code: ExpenseCategoryCode): string {
  return EXPENSE_CATEGORY_LABELS[code] || code;
}
// 交通手段ラベル取得
export function transportLabel(type: TransportType | null | undefined): string {
  if (!type) return '';
  return TRANSPORT_TYPE_LABELS[type] || type;
}
// 日付文字列(YYYY-MM-DD)を「M月D日(曜)」に変換
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const w = weekdays[d.getDay()];
  return `${m}月${day}日(${w})`;
}
// 月の最初と最後の日付(YYYY-MM-DD)を取得
export function getMonthRange(year: number, month: number): {
  start: string;
  end: string;
} {
  // month は 1-12
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // 翌月の0日 = 当月末日
  const toStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { start: toStr(start), end: toStr(end) };
}
// ファイル拡張子を取得(jpg, png など)
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}
// 領収書ファイル名生成(user_id/uuid.ext 形式)
export function buildReceiptPath(userId: string, originalFilename: string): string {
  const ext = getFileExtension(originalFilename);
  const uuid = crypto.randomUUID();
  return ext ? `${userId}/${uuid}.${ext}` : `${userId}/${uuid}`;
}
