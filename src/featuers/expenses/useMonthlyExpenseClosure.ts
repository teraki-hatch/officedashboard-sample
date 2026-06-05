import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { MonthlyExpenseClosure, ExpenseLockState } from './expenseClosureTypes';
import { toExpenseLockState } from './expenseClosureUtils';

/**
 * 個人の特定年月の経費締め状態を取得するフック
 * --------------------------------------------------------------
 * - 経費画面右上に「提出ボタン/確定済バッジ」を表示する用途
 * - 経費登録のロック判定にも使う
 * 勤怠の useMonthlyClosure と同形
 * --------------------------------------------------------------
 */

export type UseMonthlyExpenseClosureState = {
  closure: MonthlyExpenseClosure | null;
  lock: ExpenseLockState;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const DEFAULT_LOCK: ExpenseLockState = { locked: false, submitted: false, closure: null };

export function useMonthlyExpenseClosure(
  userId: string | null | undefined,
  yearMonth: string | null | undefined
): UseMonthlyExpenseClosureState {
  const [closure, setClosure] = useState<MonthlyExpenseClosure | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(userId && yearMonth));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId || !yearMonth) {
      setClosure(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        type Res = {
          data: MonthlyExpenseClosure | null;
          error: { message: string; code?: string } | null;
        };
        const r = await withTimeout<Res>(
          supabase
            .from('monthly_expense_closures')
            .select('*')
            .eq('user_id', userId)
            .eq('year_month', yearMonth)
            .maybeSingle() as unknown as Promise<Res>,
          10000,
          'SELECT monthly_expense_closures (one)'
        ).catch(
          (e): Res => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        if (!active) return;

        if (r.error) {
          logger.log('[OfficeHub:expenseClosure:one] fetch error', r.error);
          setError(`経費締め状態の取得失敗: ${r.error.message}`);
          setClosure(null);
        } else {
          logger.log('[OfficeHub:expenseClosure:one] fetch done', {
            userId,
            yearMonth,
            status: r.data?.status ?? 'none',
          });
          setClosure(r.data ?? null);
        }
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
  }, [userId, yearMonth, reloadKey]);

  return {
    closure,
    lock: closure ? toExpenseLockState(closure) : DEFAULT_LOCK,
    loading,
    error,
    reload,
  };
}
