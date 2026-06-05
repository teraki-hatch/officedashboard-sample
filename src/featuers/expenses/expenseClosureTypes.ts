/**
 * 月次経費締め機能の型定義
 * --------------------------------------------------------------
 * monthly_expense_closures / monthly_expense_closure_logs テーブルに対応
 * 勤怠の closure と同形 (テーブルだけ別)
 * --------------------------------------------------------------
 */

/** 締めステータス: submitted=提出済 / confirmed=確定済(ロック) */
export type ExpenseClosureStatus = 'submitted' | 'confirmed';

/** ログのアクション種別 */
export type ExpenseClosureAction = 'submitted' | 'confirmed' | 'rejected' | 'unlocked';

/** monthly_expense_closures テーブル1行 */
export type MonthlyExpenseClosure = {
  id: string;
  user_id: string;
  year_month: string; // 'YYYY-MM'
  status: ExpenseClosureStatus;
  submitted_at: string | null;
  submitted_by: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** ロック判定結果 */
export type ExpenseLockState = {
  /** 確定済(ロック中) */
  locked: boolean;
  /** 提出済 */
  submitted: boolean;
  /** 元データ */
  closure: MonthlyExpenseClosure | null;
};
