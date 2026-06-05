import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { MonthlyClosure, ClosureRow } from './types';

/**
 * 管理者画面用: 指定年月の全社員の締め状態を一覧で取得
 * --------------------------------------------------------------
 * 対象社員: has_attendance_management = true, employee_code != '999'
 * 各社員と monthly_closures を LEFT JOIN し、未提出の人も行として出す
 * --------------------------------------------------------------
 */

export type UseAllMonthlyClosuresState = {
  rows: ClosureRow[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

type UserRow = {
  id: string;
  name: string;
  employee_code: string | null;
};
type SbErr = { message: string; code?: string } | null;
type Res<T> = { data: T | null; error: SbErr };

export function useAllMonthlyClosures(
  yearMonth: string | null | undefined,
  enabled: boolean
): UseAllMonthlyClosuresState {
  const [rows, setRows] = useState<ClosureRow[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !enabled || !yearMonth) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const uP = withTimeout<Res<UserRow[]>>(
          supabase
            .from('users')
            .select('id, name, employee_code')
            .eq('status', 'active')
            .eq('has_attendance_management', true)
            .neq('employee_code', '999')
            .order('employee_code') as unknown as Promise<Res<UserRow[]>>,
          12000,
          'SELECT users (closure-list)'
        ).catch(
          (e): Res<UserRow[]> => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        const cP = withTimeout<Res<MonthlyClosure[]>>(
          supabase
            .from('monthly_closures')
            .select('*')
            .eq('year_month', yearMonth) as unknown as Promise<Res<MonthlyClosure[]>>,
          12000,
          'SELECT monthly_closures (list)'
        ).catch(
          (e): Res<MonthlyClosure[]> => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        const [uR, cR] = await Promise.all([uP, cP]);
        if (!active) return;

        if (uR.error) {
          setError(`社員一覧の取得失敗: ${uR.error.message}`);
          setRows([]);
          return;
        }
        if (cR.error) {
          setError(`締め状態の取得失敗: ${cR.error.message}`);
          setRows([]);
          return;
        }

        const users = uR.data ?? [];
        const closures = cR.data ?? [];

        const closureByUser = new Map<string, MonthlyClosure>();
        for (const c of closures) {
          closureByUser.set(c.user_id, c);
        }

        const result: ClosureRow[] = users.map((u) => ({
          user_id: u.id,
          user_name: u.name,
          employee_code: u.employee_code,
          year_month: yearMonth,
          closure: closureByUser.get(u.id) ?? null,
        }));

        logger.log('[OfficeHub:closure:list] loaded', {
          yearMonth,
          users: users.length,
          closures: closures.length,
        });

        setRows(result);
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
  }, [yearMonth, enabled, reloadKey]);

  return { rows, loading, error, reload };
}
