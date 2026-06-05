import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { PerformanceTarget } from './types';
import { toYearMonth } from './types';

type UsePerformanceTargetsParams = {
  userId: string | null; // null の場合は全員(管理者用)
  year: number;
  month: number;
  scope: 'self' | 'all';
};

type UsePerformanceTargetsResult = {
  targets: PerformanceTarget[]; // self の場合でも複数カテゴリ分の行を持つ
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function usePerformanceTargets(
  params: UsePerformanceTargetsParams
): UsePerformanceTargetsResult {
  const { userId, year, month, scope } = params;
  const [targets, setTargets] = useState<PerformanceTarget[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (scope === 'self' && !userId) {
        setTargets([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabase();
        if (!supabase) {
          throw new Error('Supabase client not initialized');
        }

        const ym = toYearMonth(year, month);

        let query = supabase
          .from('performance_targets')
          .select(
            'id, user_id, year_month, category, sales_target, deal_target, gross_profit_target, meeting_target, created_at, updated_at, created_by'
          )
          .eq('year_month', ym);

        if (scope === 'self' && userId) {
          query = query.eq('user_id', userId);
        }

        const { data, error: dbError } = await withTimeout(
          query,
          10000,
          'performance_targets fetch'
        );

        if (dbError) {
          throw dbError;
        }

        if (!cancelled) {
          setTargets((data || []) as PerformanceTarget[]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('usePerformanceTargets error:', msg);
        if (!cancelled) {
          setError(msg);
          setTargets([]);
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
  }, [userId, year, month, scope, reloadKey]);

  return {
    targets,
    loading,
    error,
    reload: () => setReloadKey((k) => k + 1),
  };
}
