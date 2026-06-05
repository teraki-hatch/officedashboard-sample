import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import type { AttendanceBreak, AttendanceRecord } from './types';
import { toDateStr } from './calendarUtils';
import { logger } from '../../lib/logger';

/**
 * 月単位の勤怠データを取得するフック (読み取り専用)
 * --------------------------------------------------------------
 * 既存システム timetrack-app-clean の AttendanceCalendar.jsx 内
 * `loadMonth` と同等のクエリを使う。
 *
 * - 対象テーブル: attendance_records / attendance_breaks / leave_requests
 * - INSERT / UPDATE / DELETE は一切行わない
 * - leave_requests はテーブルがなくてもエラーにせず、空配列で扱う (graceful)
 * --------------------------------------------------------------
 */

export type ApprovedLeave = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
};

export type MonthlyAttendanceState = {
  records: AttendanceRecord[];
  breaks: AttendanceBreak[];
  leaveRequests: ApprovedLeave[];
  loading: boolean;
  error: string | null;
  /** 接続未設定 (.env 未設定 or 未ログイン) */
  configured: boolean;
  /** 手動再取得 */
  reload: () => void;
};

export function useMonthlyAttendance(
  userId: string | null | undefined,
  year: number,
  month0: number
): MonthlyAttendanceState {
  const supabase = getSupabase();
  const effectiveUserId = userId && userId.length > 0 ? userId : null;
  const configured = Boolean(supabase) && Boolean(effectiveUserId);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [breaks, setBreaks] = useState<AttendanceBreak[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<ApprovedLeave[]>([]);
  const [loading, setLoading] = useState<boolean>(() => configured);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!supabase || !effectiveUserId) {
      logger.log('[OfficeHub:kintai:monthly] fetch skipped', {
        reason: !supabase ? 'no-supabase' : 'no-userId',
      });
      setRecords([]);
      setBreaks([]);
      setLeaveRequests([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const lastDay = new Date(year, month0 + 1, 0).getDate();
    const monthStart = toDateStr(year, month0, 1);
    const monthEnd = toDateStr(year, month0, lastDay);
    logger.log('[OfficeHub:kintai:monthly] fetch start', {
      year,
      month: month0 + 1,
      monthStart,
      monthEnd,
      reloadKey,
    });

    (async () => {
      const startedAt = Date.now();
      try {
        type RecRes = { data: AttendanceRecord[] | null; error: { message: string; code?: string } | null };
        type BrkRes = { data: AttendanceBreak[] | null; error: { message: string; code?: string } | null };
        type LvRes = {
          data: Array<{ id: string; leave_type: string; start_date: string; end_date: string }> | null;
          error: { message: string; code?: string } | null;
        };

        const toErr = (e: unknown) => ({
          message: e instanceof Error ? e.message : String(e),
        });

        const recP = withTimeout<RecRes>(
          supabase
            .from('attendance_records')
            .select('*')
            .eq('user_id', effectiveUserId)
            .gte('date', monthStart)
            .lte('date', monthEnd)
            .order('date', { ascending: true }) as unknown as Promise<RecRes>,
          10000,
          'SELECT attendance_records (monthly)'
        ).catch((e): RecRes => ({ data: null, error: toErr(e) }));

        const brkP = withTimeout<BrkRes>(
          supabase
            .from('attendance_breaks')
            .select('*')
            .eq('user_id', effectiveUserId)
            .gte('date', monthStart)
            .lte('date', monthEnd)
            .order('break_start', { ascending: true }) as unknown as Promise<BrkRes>,
          10000,
          'SELECT attendance_breaks (monthly)'
        ).catch((e): BrkRes => ({ data: null, error: toErr(e) }));

        // 承認済み休暇 (テーブル不存在でもエラーにしない)
        const lvP = withTimeout<LvRes>(
          supabase
            .from('leave_requests')
            .select('id, leave_type, start_date, end_date')
            .eq('user_id', effectiveUserId)
            .eq('status', 'approved')
            .lte('start_date', monthEnd)
            .gte('end_date', monthStart) as unknown as Promise<LvRes>,
          10000,
          'SELECT leave_requests (approved)'
        ).catch((e): LvRes => ({ data: null, error: toErr(e) }));

        const [recRes, brkRes, lvRes] = await Promise.all([recP, brkP, lvP]);

        const elapsedMs = Date.now() - startedAt;

        if (!active) return;
        logger.log('[OfficeHub:kintai:monthly] fetch done', {
          elapsedMs,
          recordsCount: recRes.data?.length ?? 0,
          recordError: recRes.error?.message ?? null,
          breaksCount: brkRes.data?.length ?? 0,
          breaksError: brkRes.error?.message ?? null,
          leaveCount: lvRes.data?.length ?? 0,
          leaveError: lvRes.error?.message ?? null,
        });

        if (recRes.error) {
          setError(`勤怠取得失敗 (code: ${recRes.error.code ?? '—'}): ${recRes.error.message}`);
          setRecords([]);
          setBreaks([]);
          setLeaveRequests([]);
        } else if (brkRes.error) {
          setError(`休憩取得失敗 (code: ${brkRes.error.code ?? '—'}): ${brkRes.error.message}`);
          setRecords((recRes.data as AttendanceRecord[] | null) ?? []);
          setBreaks([]);
          setLeaveRequests([]);
        } else {
          setRecords((recRes.data as AttendanceRecord[] | null) ?? []);
          setBreaks((brkRes.data as AttendanceBreak[] | null) ?? []);
          // 休暇テーブルはエラーでも黙ってスキップ
          setLeaveRequests(
            lvRes.error ? [] : ((lvRes.data as ApprovedLeave[] | null) ?? [])
          );
          setError(null);
        }
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('[OfficeHub:kintai:monthly] fetch threw', { errorMessage: msg });
        setError(`通信エラー: ${msg}`);
      } finally {
        setLoading(false);
        logger.log('[OfficeHub:kintai:monthly] fetch finally -> loading=false');
      }
    })();

    // 安全網: 10秒で強制 false
    const safetyTimer = window.setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          logger.warn(
            '[OfficeHub:kintai:monthly] safety timeout fired — forcing loading=false'
          );
        }
        return false;
      });
    }, 10000);

    return () => {
      active = false;
      window.clearTimeout(safetyTimer);
    };
    // supabase はモジュールシングルトンなので依存外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, year, month0, reloadKey]);

  return { records, breaks, leaveRequests, loading, error, configured, reload };
}
