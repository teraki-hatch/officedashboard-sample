import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import { getMonthRange } from './expenseUtils';

type UseExpenseDatesInMonthParams = {
  userId: string | null;
  year: number;
  month: number; // 1-12
};

type UseExpenseDatesInMonthResult = {
  /** その月で経費がある日付の Set (YYYY-MM-DD) */
  expenseDates: Set<string>;
  loading: boolean;
  error: string | null;
};

/**
 * 月内で経費登録のある日付一覧を返す軽量フック。
 * カレンダーに経費アイコンを表示するための判定用。
 */
export function useExpenseDatesInMonth(
  params: UseExpenseDatesInMonthParams
): UseExpenseDatesInMonthResult {
  const { userId, year, month } = params;
  const [expenseDates, setExpenseDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) {
        setExpenseDates(new Set());
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
            .select('date')
            .eq('user_id', userId)
            .gte('date', start)
            .lte('date', end),
          10000,
          'expense_dates fetch'
        );

        if (dbError) {
          throw dbError;
        }

        if (!cancelled) {
          const set = new Set<string>();
          for (const row of (data || []) as { date: string }[]) {
            if (row.date) set.add(row.date);
          }
          setExpenseDates(set);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('useExpenseDatesInMonth error:', msg);
        if (!cancelled) {
          setError(msg);
          setExpenseDates(new Set());
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
  }, [userId, year, month]);

  return { expenseDates, loading, error };
}
