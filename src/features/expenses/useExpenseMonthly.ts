import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { ExpenseRequest } from './types';
import { getMonthRange } from './expenseUtils';

/**
 * Phase C-3:
 *   - projects 廃止に伴い select 文の project_id → client_id へ変更。
 *   - trip_type (出張区分) 完全廃止につき SELECT から削除。
 */

type UseExpenseMonthlyParams = {
  userId: string | null;
  year: number;
  month: number; // 1-12
};

type UseExpenseMonthlyResult = {
  expenses: ExpenseRequest[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useExpenseMonthly(
  params: UseExpenseMonthlyParams
): UseExpenseMonthlyResult {
  const { userId, year, month } = params;
  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId) {
        setExpenses([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { start, end } = getMonthRange(year, month);
        const supabase = getSupabase();
        if (!supabase) {
          throw new Error('Supabase client not initialized');
        }
        const { data, error: dbError } = await withTimeout(
          supabase
            .from('expense_requests')
            .select(
              'id, user_id, date, category_code, amount, transport_type, client_id, memo, receipt_url, status, created_at, updated_at'
            )
            .eq('user_id', userId)
            .gte('date', start)
            .lte('date', end)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true }),
          10000,
          'expense_requests monthly fetch'
        );
        if (dbError) {
          throw dbError;
        }
        if (!cancelled) {
          setExpenses((data || []) as ExpenseRequest[]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('useExpenseMonthly error:', msg);
        if (!cancelled) {
          setError(msg);
          setExpenses([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, year, month, reloadKey]);

  return {
    expenses,
    loading,
    error,
    reload: () => setReloadKey((k) => k + 1),
  };
}
