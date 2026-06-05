import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import { pad } from './kousuUtils';

/**
 * 月次勤怠データ取得フック (Phase 4-1: 工数カレンダーの差分表示用)
 * --------------------------------------------------------------
 * 指定の (userId, year, month0) で attendance_records + attendance_breaks を
 * まとめて取得。
 *
 * 読み取り専用 (SELECT のみ)。既存システムへの影響なし。
 *
 * 返すのは「日付ごと」に整理された差分計算可能な形:
 *   { '2026-05-16': { clockIn, clockOut, workType, breaks[] }, ... }
 *
 * 工数差分は工数カレンダー側で計算する (このフックは raw データの提供だけ)。
 * --------------------------------------------------------------
 */

export type DailyRaw = {
  clockIn: string | null;
  clockOut: string | null;
  workType: string | null;
  breaks: Array<{ start: string | null; end: string | null }>;
};

export type MonthlyAttendanceMap = Record<string, DailyRaw>;

export type UseKousuMonthlyAttendanceState = {
  /** 日付("YYYY-MM-DD") をキーにしたマップ */
  daily: MonthlyAttendanceMap;
  loading: boolean;
  error: string | null;
};

export function useKousuMonthlyAttendance(
  userId: string | null | undefined,
  year: number,
  month0: number
): UseKousuMonthlyAttendanceState {
  const [daily, setDaily] = useState<MonthlyAttendanceMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setDaily({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        if (!cancelled) {
          setError('Supabase が未設定です');
          setLoading(false);
        }
        return;
      }

      const ym = `${year}-${pad(month0 + 1)}`;
      const lastDay = new Date(year, month0 + 1, 0).getDate();
      const startDt = `${ym}-01`;
      const endDt = `${ym}-${pad(lastDay)}`;

      logger.log('[OfficeHub:kousu:monthly-attendance] fetch start', {
        userId,
        startDt,
        endDt,
      });

      type RecRes = {
        data: Array<{
          date: string;
          clock_in: string | null;
          clock_out: string | null;
          work_type: string | null;
        }> | null;
        error: { message: string } | null;
      };
      type BrkRes = {
        data: Array<{
          date: string;
          break_start: string | null;
          break_end: string | null;
        }> | null;
        error: { message: string } | null;
      };

      const recP = withTimeout<RecRes>(
        supabase
          .from('attendance_records')
          .select('date, clock_in, clock_out, work_type')
          .eq('user_id', userId)
          .gte('date', startDt)
          .lte('date', endDt) as unknown as Promise<RecRes>,
        12000,
        'SELECT attendance_records (kousu monthly)'
      ).catch(
        (e): RecRes => ({
          data: null,
          error: { message: e instanceof Error ? e.message : String(e) },
        })
      );

      const brkP = withTimeout<BrkRes>(
        supabase
          .from('attendance_breaks')
          .select('date, break_start, break_end')
          .eq('user_id', userId)
          .gte('date', startDt)
          .lte('date', endDt) as unknown as Promise<BrkRes>,
        12000,
        'SELECT attendance_breaks (kousu monthly)'
      ).catch(
        (e): BrkRes => ({
          data: null,
          error: { message: e instanceof Error ? e.message : String(e) },
        })
      );

      const [rec, brk] = await Promise.all([recP, brkP]);
      if (cancelled) return;

      const errs: string[] = [];
      if (rec.error) errs.push(`attendance: ${rec.error.message}`);
      if (brk.error) errs.push(`breaks: ${brk.error.message}`);

      const map: MonthlyAttendanceMap = {};
      // 勤怠記録ベースに初期化
      for (const r of rec.data ?? []) {
        const d = String(r.date).slice(0, 10);
        map[d] = {
          clockIn: r.clock_in,
          clockOut: r.clock_out,
          workType: r.work_type,
          breaks: [],
        };
      }
      // 休憩を該当日に紐付け
      for (const b of brk.data ?? []) {
        const d = String(b.date).slice(0, 10);
        if (!map[d]) {
          // 勤怠記録なしで休憩だけある異常ケース → スキップ (ないはず)
          continue;
        }
        map[d].breaks.push({ start: b.break_start, end: b.break_end });
      }

      logger.log('[OfficeHub:kousu:monthly-attendance] loaded', {
        records: Object.keys(map).length,
        errors: errs.length,
      });

      setDaily(map);
      setError(errs.length > 0 ? errs.join(' / ') : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, year, month0]);

  return { daily, loading, error };
}
