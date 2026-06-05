import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import { r2 } from './kousuUtils';

/**
 * 指定日の勤怠時間取得フック (Phase 4-1: 工数差分用)
 * --------------------------------------------------------------
 * 工数モーダルで「勤怠 vs 工数」を表示するために、その日の
 * attendance_records + attendance_breaks を取得して実勤怠時間 (h) を計算。
 *
 * 既存システム attendanceUtils.js の calcActualHours を踏襲:
 *   - clock_out 未打刻なら null
 *   - 未終了の休憩があれば null
 *   - 有給/病欠 (work_type が paid_leave 系) は null
 *   - 実働 = (clock_out - clock_in - 休憩合計) / 60min
 *
 * 読み取り専用なので RLS で SELECT のみ。
 * --------------------------------------------------------------
 */

export type DailyAttendanceState = {
  /** 勤怠が記録されている */
  hasRecord: boolean;
  /** 出勤時刻 ISO */
  clockIn: string | null;
  /** 退勤時刻 ISO */
  clockOut: string | null;
  /** 勤務区分 (work_type) */
  workType: string | null;
  /** 実働時間 (h)。計算不可なら null */
  actualHours: number | null;
  /** 計算不可の理由 (UI用) */
  reason: 'no-record' | 'not-finished' | 'on-break' | 'leave' | null;
  loading: boolean;
};

/** ISO の差分を分単位で返す (>=0) */
function diffMin(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(0, Math.floor((e - s) / 60000));
}

/** 有給/病欠を判定する work_type プレフィクス */
const LEAVE_WORK_TYPES = new Set([
  'paid_leave_full',
  'paid_leave_am',
  'paid_leave_pm',
  'sick_leave',
  'special_leave',
  'absence',
]);

export function useDailyAttendance(
  userId: string | null | undefined,
  date: string | null | undefined
): DailyAttendanceState {
  const [state, setState] = useState<DailyAttendanceState>({
    hasRecord: false,
    clockIn: null,
    clockOut: null,
    workType: null,
    actualHours: null,
    reason: 'no-record',
    loading: false,
  });

  useEffect(() => {
    if (!userId || !date) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        if (!cancelled) {
          setState({
            hasRecord: false,
            clockIn: null,
            clockOut: null,
            workType: null,
            actualHours: null,
            reason: 'no-record',
            loading: false,
          });
        }
        return;
      }

      type RecRes = {
        data: Array<{
          id: string;
          clock_in: string | null;
          clock_out: string | null;
          work_type: string | null;
        }> | null;
        error: unknown;
      };
      type BrkRes = {
        data: Array<{ break_start: string | null; break_end: string | null }> | null;
        error: unknown;
      };

      const recP = withTimeout<RecRes>(
        supabase
          .from('attendance_records')
          .select('id, clock_in, clock_out, work_type')
          .eq('user_id', userId)
          .eq('date', date)
          .limit(1) as unknown as Promise<RecRes>,
        8000,
        'SELECT attendance_record (diff)'
      ).catch((): RecRes => ({ data: null, error: null }));

      const brkP = withTimeout<BrkRes>(
        supabase
          .from('attendance_breaks')
          .select('break_start, break_end')
          .eq('user_id', userId)
          .eq('date', date) as unknown as Promise<BrkRes>,
        8000,
        'SELECT attendance_breaks (diff)'
      ).catch((): BrkRes => ({ data: null, error: null }));

      const [rec, brk] = await Promise.all([recP, brkP]);
      if (cancelled) return;

      const r = rec.data?.[0];
      if (!r) {
        setState({
          hasRecord: false,
          clockIn: null,
          clockOut: null,
          workType: null,
          actualHours: null,
          reason: 'no-record',
          loading: false,
        });
        return;
      }

      // 計算不可ケースを順に判定
      const workType = r.work_type ?? null;
      if (workType && LEAVE_WORK_TYPES.has(workType)) {
        setState({
          hasRecord: true,
          clockIn: r.clock_in,
          clockOut: r.clock_out,
          workType,
          actualHours: null,
          reason: 'leave',
          loading: false,
        });
        return;
      }
      if (!r.clock_in || !r.clock_out) {
        setState({
          hasRecord: true,
          clockIn: r.clock_in,
          clockOut: r.clock_out,
          workType,
          actualHours: null,
          reason: 'not-finished',
          loading: false,
        });
        return;
      }
      // 未終了の休憩があるか
      const breaks = brk.data ?? [];
      const hasOngoingBreak = breaks.some((b) => b.break_start && !b.break_end);
      if (hasOngoingBreak) {
        setState({
          hasRecord: true,
          clockIn: r.clock_in,
          clockOut: r.clock_out,
          workType,
          actualHours: null,
          reason: 'on-break',
          loading: false,
        });
        return;
      }

      // 計算
      const totalMin = diffMin(r.clock_in, r.clock_out);
      const breakMin = breaks.reduce(
        (acc, b) => acc + diffMin(b.break_start, b.break_end),
        0
      );
      const actualHours = r2((totalMin - breakMin) / 60);

      logger.log('[OfficeHub:kousu:diff] daily attendance loaded', {
        userId,
        date,
        totalMin,
        breakMin,
        actualHours,
      });

      setState({
        hasRecord: true,
        clockIn: r.clock_in,
        clockOut: r.clock_out,
        workType,
        actualHours,
        reason: null,
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, date]);

  return state;
}
