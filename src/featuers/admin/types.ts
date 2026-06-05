/**
 * 月次勤怠台帳 PDF出力に使う型定義
 * --------------------------------------------------------------
 * 旧 timetrack-app-clean からの移植版 (TypeScript化)
 * --------------------------------------------------------------
 */

export type UserRow = {
  id: string;
  name: string;
  email?: string | null;
  employee_code: string | null;
};

export type AttendanceRecord = {
  id?: string;
  user_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  work_type: string | null;
  memo: string | null;
};

export type AttendanceBreak = {
  id?: string;
  user_id: string;
  date: string;
  break_start: string | null;
  break_end: string | null;
};

export type LeaveRequest = {
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
};

export type HolidayRow = {
  date: string;
  name: string | null;
};
