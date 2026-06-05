import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { PerformanceTarget } from './types';
import { fiscalToYearMonth } from './fiscalPeriod';

type UsePerformanceTargetsPeriodParams = {
  period: number; // 期番号 (例: 7)
};

type UsePerformanceTargetsPeriodResult = {
  targets: PerformanceTarget[]; // 指定期の12ヶ月、全社員、全カテゴリ
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * 指定期の全月、全社員、全カテゴリの目標を一括取得
 * 期 = 8月始まり、翌7月締めの12ヶ月
 * KPI設定モーダル(年間ビュー)用
 */
export function usePerformanceTargetsPeriod(
  params: UsePerformanceTargetsPeriodParams
): UsePerformanceTargetsPeriodResult {
  const { period } = params;
  const [targets, setTargets] = useState<PerformanceTarget[]>([]);
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

        // 期の最初の月 (期内月1=8月) と最後の月 (期内月12=7月) を取得
        const startYm = fiscalToYearMonth(period, 1); // YYYY-08
        const endYm = fiscalToYearMonth(period, 12); // (YYYY+1)-07

        const { data, error: dbError } = await withTimeout(
          supabase
            .from('performance_targets')
            .select(
              'id, user_id, year_month, category, sales_target, deal_target, gross_profit_target, meeting_target, created_at, updated_at, created_by'
            )
            .gte('year_month', startYm)
            .lte('year_month', endYm),
          15000,
          'performance_targets period fetch'
        );

        if (dbError) {
          throw dbError;
        }

        if (!cancelled) {
          setTargets((data || []) as PerformanceTarget[]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('usePerformanceTargetsPeriod error:', msg);
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
  }, [period, reloadKey]);

  return {
    targets,
    loading,
    error,
    reload: () => setReloadKey((k) => k + 1),
  };
}

// 後方互換: 旧名 usePerformanceTargetsYear としても呼べるようにエイリアス
export const usePerformanceTargetsYear = usePerformanceTargetsPeriod;
