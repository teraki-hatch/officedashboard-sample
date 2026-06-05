/**
 * 月次勤怠締め機能の型定義
 * --------------------------------------------------------------
 * monthly_closures / monthly_closure_logs テーブルに対応
 * --------------------------------------------------------------
 */

/** 締めステータス: submitted=提出済 / confirmed=確定済(ロック) */
export type ClosureStatus = 'submitted' | 'confirmed';

/** ログのアクション種別 */
export type ClosureAction = 'submitted' | 'confirmed' | 'rejected' | 'unlocked';

/** monthly_closures テーブル1行 */
export type MonthlyClosure = {
  id: string;
  user_id: string;
  year_month: string; // 'YYYY-MM'
  status: ClosureStatus;
  submitted_at: string | null;
  submitted_by: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** 管理者画面で社員ごとの状態を一覧表示する際の表示行 */
export type ClosureRow = {
  user_id: string;
  user_name: string;
  employee_code: string | null;
  year_month: string;
  closure: MonthlyClosure | null; // 未提出なら null
};

/** ロック判定結果 */
export type LockState = {
  /** その月がロック中か (confirmed) */
  locked: boolean;
  /** その月が提出済か (submitted) */
  submitted: boolean;
  /** 元データ */
  closure: MonthlyClosure | null;
};
