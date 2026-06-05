import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { ExpenseCategory } from './types';

type UseExpenseCategoriesResult = {
  categories: ExpenseCategory[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useExpenseCategories(): UseExpenseCategoriesResult {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabase();
        if (!supabase) {
          throw new Error('Supabase client not initialized');
        }
        const { data, error: dbError } = await withTimeout(
          supabase
            .from('expense_categories')
            .select('id, code, name, is_transport, display_order, status')
            .eq('status', 'active')
            .order('display_order', { ascending: true }),
          10000,
          'expense_categories fetch'
        );

        if (dbError) {
          throw dbError;
        }

        if (!cancelled) {
          setCategories((data || []) as ExpenseCategory[]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('useExpenseCategories error:', msg);
        if (!cancelled) {
          setError(msg);
          setCategories([]);
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
  }, [reloadKey]);

  return {
    categories,
    loading,
    error,
    reload: () => setReloadKey((k) => k + 1),
  };
}
