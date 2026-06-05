/**
 * 勤怠データの型 (既存システム timetrack-app-clean のスキーマに準拠)
 * --------------------------------------------------------------
 * 参考: 既存システムの AttendanceClock.jsx / AttendanceCalendar.jsx
 * カラム名は既存テーブルに合わせて snake_case のまま保持する。
 * --------------------------------------------------------------
 */

/** attendance_records テーブル (1日1行) */
export type AttendanceRecord = {
  id: string;
  user_id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** timestamptz (ISO 文字列) - 出勤時刻 */
  clock_in: string | null;
  /** timestamptz (ISO 文字列) - 退勤時刻 */
  clock_out: string | null;
  /** 'office' | 'remote' | 'business_trip' (旧値 'normal' は 'office' とみなす) */
  work_type: 'office' | 'remote' | 'business_trip' | 'normal' | null;
  /** 'working' | 'completed' (旧値 'pending' は使わない) */
  status: 'working' | 'completed' | string;
  memo: string | null;
  created_at?: string;
  updated_at?: string;
};

/** attendance_breaks テーブル (休憩セッション、複数可) */
export type AttendanceBreak = {
  id: string;
  attendance_record_id: string;
  user_id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** timestamptz (ISO 文字列) */
  break_start: string;
  /** null の場合は休憩中 */
  break_end: string | null;
  memo: string | null;
  created_at?: string;
  updated_at?: string;
};

/** 打刻状態 (既存システム AttendanceClock.jsx の clockStateOf と同じ判定) */
export type ClockState = 'before' | 'working' | 'breaking' | 'done';

/** 勤務区分 */
export type WorkType = 'office' | 'remote' | 'business_trip';
