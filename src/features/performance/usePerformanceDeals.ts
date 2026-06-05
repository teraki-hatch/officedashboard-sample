import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { PerformanceDeal } from './types';
import { getMonthDateRange } from './types';

type UsePerformanceDealsParams = {
  userId: string | null;
  year: number;
  month: number;
  scope: 'self' | 'all';
};

type UsePerformanceDealsResult = {
  deals: PerformanceDeal[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function usePerformanceDeals(
  params: UsePerformanceDealsParams
): UsePerformanceDealsResult {
  const { userId, year, month, scope } = params;
  const [deals, setDeals] = useState<PerformanceDeal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (scope === 'self' && !userId) {
        setDeals([]);
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

        const { start, end } = getMonthDateRange(year, month);

        let query = supabase
          .from('performance_deals')
          .select(
            `id, user_id, category, deal_name, status,
             expected_close_date, closed_date, terminated_date,
             sales_amount, monthly_amount, gross_profit, meeting_count,
             notes, created_at, updated_at, created_by,
             assignees:performance_deal_assignees (
               id, deal_id, user_id, role, allocation_ratio, display_order,
               user:users (id, name, employee_code)
             )`
          )
          .or(
            [
              'status.in.(prospect,in_progress)',
              `and(status.in.(won,in_support),closed_date.lte.${end})`,
              `and(status.eq.terminated,closed_date.lte.${end},terminated_date.gte.${start})`,
              `and(status.eq.lost,closed_date.gte.${start},closed_date.lte.${end})`,
            ].join(',')
          )
          .order('closed_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false });

        const { data, error: dbError } = await withTimeout(
          query,
          10000,
          'performance_deals fetch'
        );

        if (dbError) {
          throw dbError;
        }

        // Supabase の JOIN 結果は user が配列推論されるが、実際は1対1なので
        // unknown 経由で PerformanceDeal[] にキャスト
        let rows = (data ?? []) as unknown as PerformanceDeal[];

        // assignees.user が配列で返ってくるケースに対応 (1要素なら最初の1つを取り出す)
        rows = rows.map((d) => ({
          ...d,
          assignees: (d.assignees ?? []).map((a) => {
            const rawUser = (a as unknown as { user?: unknown }).user;
            const user = Array.isArray(rawUser) ? rawUser[0] ?? null : rawUser ?? null;
            return { ...a, user } as typeof a;
          }),
        }));

        // self の場合は assignees に userId が含まれる案件だけ残す
        if (scope === 'self' && userId) {
          rows = rows.filter((d) =>
            (d.assignees || []).some((a) => a.user_id === userId)
          );
        }

        // 各案件の assignees を display_order でソート
        for (const d of rows) {
          if (d.assignees) {
            d.assignees.sort(
              (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
            );
          }
        }

        if (!cancelled) {
          setDeals(rows);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('usePerformanceDeals error:', msg);
        if (!cancelled) {
          setError(msg);
          setDeals([]);
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
    deals,
    loading,
    error,
    reload: () => setReloadKey((k) => k + 1),
  };
}
