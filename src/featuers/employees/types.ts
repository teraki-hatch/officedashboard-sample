// 雇用形態 (DB制約: 日本語そのまま)
export const EMPLOYMENT_TYPES = [
  '正社員',
  '契約社員',
  '業務委託',
  'アルバイト',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
// 在籍ステータス (DB制約: active / inactive)
export const EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: '在籍',
  inactive: '退職',
};
// 権限 (DB制約: member / project_manager / admin)
export const USER_ROLES = ['admin', 'project_manager', 'member'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理者',
  project_manager: 'プロジェクトマネージャ',
  member: '一般',
};
// 社員の基本情報 (users テーブル)
export type Employee = {
  id: string;
  auth_user_id: string | null;
  employee_code: string;
  name: string;
  email: string;
  role: string; // admin / project_manager / member
  employment_type: string; // 日本語
  standard_work_hours: number;
  joined_at: string | null;
  resigned_at: string | null;
  status: string; // active / inactive
  hourly_rate: number | null;
  cost_rate: number | null;
  hire_date: string | null;
  has_leave_management: boolean;
  has_attendance_management: boolean;
  created_at: string;
  updated_at: string;
};
// 基本情報の編集用 input
export type EmployeeInput = {
  name: string;
  email: string;
  role: string;
  employment_type: string;
  standard_work_hours: number;
  joined_at: string | null;
  resigned_at: string | null;
  status: string;
  hourly_rate: number;
  cost_rate: number;
  has_leave_management: boolean;
  has_attendance_management: boolean;
};
// 固定手当の型 (jsonb)
export type FixedAllowance = {
  name: string;
  amount: number;
};
// 給与マスタ (employee_salary_master テーブル)
export type SalaryRecord = {
  id: string;
  user_id: string;
  effective_from: string;
  effective_to: string | null;
  base_salary: number;
  hourly_wage: number;
  overtime_rate: number;
  fixed_allowances: FixedAllowance[];
  memo: string | null;
  created_at: string;
  updated_at: string;
};
// 給与マスタの編集用 input
export type SalaryInput = {
  effective_from: string;
  effective_to: string | null;
  base_salary: number;
  hourly_wage: number;
  overtime_rate: number;
  fixed_allowances: FixedAllowance[];
  memo: string | null;
};
export const EMPTY_SALARY_INPUT: SalaryInput = {
  effective_from: '',
  effective_to: null,
  base_salary: 0,
  hourly_wage: 0,
  overtime_rate: 1.25,
  fixed_allowances: [],
  memo: null,
};
