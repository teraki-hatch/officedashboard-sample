/**
 * 申請関連の型定義
 * --------------------------------------------------------------
 * 既存システム timetrack-app-clean のスキーマに準拠。
 * テーブル: leave_requests / attendance_correction_requests / leave_balances
 * --------------------------------------------------------------
 */
/** 休暇種別 (既存システム踏襲) */
export type LeaveType =
  | 'paid'
  | 'morning_half'
  | 'afternoon_half'
  | 'bereavement'
  | 'caregiving'
  | 'menstrual'
  | 'childcare_nursing';
/** 申請ステータス */
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
/** leave_requests テーブル */
export type LeaveRequest = {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  /** 'YYYY-MM-DD' */
  start_date: string;
  /** 'YYYY-MM-DD' (半休は start_date と同じ) */
  end_date: string;
  /** 半休=0.5、全休=営業日数 */
  days: number;
  reason: string | null;
  status: RequestStatus;
  /** 既存システム互換 */
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  admin_comment?: string | null;
  created_at?: string;
  updated_at?: string;
};
/** attendance_correction_requests テーブル */
export type CorrectionRequest = {
  id: string;
  user_id: string;
  target_date: string;
  request_type: string;
  requested_work_type: string | null;
  requested_clock_in: string | null;
  requested_clock_out: string | null;
  requested_break_minutes: number | null;
  reason: string | null;
  status: RequestStatus;
  /** 既存システム互換 */
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  admin_comment?: string | null;
  created_at?: string;
  updated_at?: string;
};
/** leave_balances テーブル (年度別の有休残日数) */
export type LeaveBalance = {
  user_id: string;
  fiscal_year: number;
  granted_days: number;
  carryover_days: number;
  adjusted_days: number;
  note?: string | null;
};
/** 管理者向けユーザー一覧用 */
export type UserBrief = {
  id: string;
  name: string | null;
  email: string | null;
};
/** 有休管理用の拡張ユーザー情報 (Phase 3-8) */
export type UserForLeaveAdmin = {
  id: string;
  name: string | null;
  email: string | null;
  employee_code: string | null;
  hire_date: string | null;
  /** OfficeHub 有休管理タブの表示対象か (役員/パートなど対象外なら false) */
  has_leave_management?: boolean | null;
};
/** leave_grants テーブル (付与履歴 + 期限管理) */
export type LeaveGrant = {
  id?: string;
  user_id: string;
  /** "YYYY-MM-DD" */
  grant_date: string;
  fiscal_year: number;
  granted_days: number;
  /** 'annual' (年次有給) / 'initial' (初期残高移行) など */
  grant_type: string;
  /** "YYYY-MM-DD" 有効期限 (付与日から2年、INSERT時に自動セット) */
  expires_at: string;
  /** 期限切れで失効した日数 (Cronバッチが更新) */
  expired_days: number;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
};
/** leave_expirations テーブル (失効ログ) */
export type LeaveExpiration = {
  id: string;
  user_id: string;
  grant_id: string;
  expired_date: string;
  expired_days: number;
  created_at: string;
};
