import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type {
  UserRow,
  AttendanceRecord,
  AttendanceBreak,
  LeaveRequest,
  HolidayRow,
} from './types';

/**
 * 月次勤怠台帳 PDF出力用データ取得フック
 * --------------------------------------------------------------
 * 指定された年月の以下を並列取得:
 *  - users (admin 出力対象社員: has_attendance_management=true, employee_code != '999')
 *  - attendance_records (月内)
 *  - attendance_breaks  (月内)
 *  - leave_requests     (approved の重なり)
 *  - holidays           (月内)
 * --------------------------------------------------------------
 */

const pad = (n: number): string => String(n).padStart(2, '0');

export type AttendancePdfData = {
  users: UserRow[];
  attRecs: AttendanceRecord[];
  attBreaks: AttendanceBreak[];
  leaveApproved: LeaveRequest[];
  holidays: Set<string>;
};

export type UseAttendancePdfDataState = {
  data: AttendancePdfData;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const EMPTY_DATA: AttendancePdfData = {
  users: [],
  attRecs: [],
  attBreaks: [],
  leaveApproved: [],
  holidays: new Set<string>(),
};

type SbErr = { message: string; code?: string } | null;
type Res<T> = { data: T | null; error: SbErr };

export function useAttendancePdfData(
  year: number,
  month: number,
  enabled: boolean
): UseAttendancePdfDataState {
  const [data, setData] = useState<AttendancePdfData>(EMPTY_DATA);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !enabled) {
      setData(EMPTY_DATA);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const start = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${pad(month)}-${pad(lastDay)}`;

    logger.log('[OfficeHub:admin:pdf-data] fetch start', { year, month, start, end });

    (async () => {
      try {
        const uP = withTimeout<Res<UserRow[]>>(
          supabase
            .from('users')
            .select('id, name, email, employee_code')
            .eq('status', 'active')
            .eq('has_attendance_management', true)
            .neq('employee_code', '999')
            .order('employee_code') as unknown as Promise<Res<UserRow[]>>,
          15000,
          'SELECT users (pdf)'
        ).catch(
          (e): Res<UserRow[]> => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        const aP = withTimeout<Res<AttendanceRecord[]>>(
          supabase
            .from('attendance_records')
            .select('id, user_id, date, clock_in, clock_out, work_type, memo')
            .gte('date', start)
            .lte('date', end) as unknown as Promise<Res<AttendanceRecord[]>>,
          15000,
          'SELECT attendance_records (pdf)'
        ).catch(
          (e): Res<AttendanceRecord[]> => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        const bP = withTimeout<Res<AttendanceBreak[]>>(
          supabase
            .from('attendance_breaks')
            .select('id, user_id, date, break_start, break_end')
            .gte('date', start)
            .lte('date', end) as unknown as Promise<Res<AttendanceBreak[]>>,
          15000,
          'SELECT attendance_breaks (pdf)'
        ).catch(
          (e): Res<AttendanceBreak[]> => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        // 月をまたぐ申請も拾う: end_date >= start AND start_date <= end
        const lP = withTimeout<Res<LeaveRequest[]>>(
          supabase
            .from('leave_requests')
            .select('user_id, leave_type, start_date, end_date')
            .eq('status', 'approved')
            .lte('start_date', end)
            .gte('end_date', start) as unknown as Promise<Res<LeaveRequest[]>>,
          15000,
          'SELECT leave_requests (pdf)'
        ).catch(
          (e): Res<LeaveRequest[]> => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        const hP = withTimeout<Res<HolidayRow[]>>(
          supabase
            .from('holidays')
            .select('date, name')
            .gte('date', start)
            .lte('date', end) as unknown as Promise<Res<HolidayRow[]>>,
          15000,
          'SELECT holidays (pdf)'
        ).catch(
          (e): Res<HolidayRow[]> => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        const [uR, aR, bR, lR, hR] = await Promise.all([uP, aP, bP, lP, hP]);
        if (!active) return;

        // 最重要のエラーを優先的に表示 (users)
        if (uR.error) {
          setError(`社員一覧の取得に失敗しました: ${uR.error.message}`);
          setData(EMPTY_DATA);
          return;
        }

        const errs: string[] = [];
        if (aR.error) errs.push(`勤怠: ${aR.error.message}`);
        if (bR.error) errs.push(`休憩: ${bR.error.message}`);
        if (lR.error) errs.push(`休暇: ${lR.error.message}`);
        if (hR.error) errs.push(`祝日: ${hR.error.message}`);

        const holidaySet = new Set<string>(
          (hR.data ?? []).map((h) => h.date).filter(Boolean)
        );

        logger.log('[OfficeHub:admin:pdf-data] fetch done', {
          users: uR.data?.length ?? 0,
          attRecs: aR.data?.length ?? 0,
          attBreaks: bR.data?.length ?? 0,
          leaveApproved: lR.data?.length ?? 0,
          holidays: holidaySet.size,
          errors: errs,
        });

        setData({
          users: uR.data ?? [],
          attRecs: aR.data ?? [],
          attBreaks: bR.data ?? [],
          leaveApproved: lR.data ?? [],
          holidays: holidaySet,
        });
        setError(errs.length > 0 ? errs.join(' / ') : null);
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(`通信エラー: ${msg}`);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, enabled, reloadKey]);

  return { data, loading, error, reload };
}
