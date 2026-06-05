import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { PerformanceDeal } from './types';
import { fiscalToCalendar, fiscalToYearMonth } from './fiscalPeriod';

type UsePerformanceDealsPeriodParams = {
  period: number; // 期番号 (例: 7)
};

type UsePerformanceDealsPeriodResult = {
  deals: PerformanceDeal[]; // 期内に関連する全案件 (全社員、全カテゴリ)
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * 指定期内 (8月始まり 12ヶ月) のすべての関連案件を取得
 * 期サマリー画面用 (グラフ + 表)
 *
 * 「関連案件」とは:
 * - 進行中/見込み (status=in_progress/prospect): 月跨ぎで継続するため期間関係なく全取得
 * - 成約 (won/in_support): 成約日が期末まで に該当するもの
 * - 終了 (terminated): 成約日が期末まで かつ 終了日が期始以降
 * - 失注 (lost): 失注日が期内のもの
 */
export function usePerformanceDealsPeriod(
  params: UsePerformanceDealsPeriodParams
): UsePerformanceDealsPeriodResult {
  const { period } = params;
  const [deals, setDeals] = useState<PerformanceDeal[]>([]);
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

        // 期の開始日と終了日を計算
        const startCal = fiscalToCalendar(period, 1); // 期内月1=8月
        const endCal = fiscalToCalendar(period, 12); // 期内月12=7月
        const start = `${startCal.year}-${String(startCal.month).padStart(2, '0')}-01`;
        // 期の最終月の月末を計算 (翌月の0日 = 当月末)
        const endLast = new Date(endCal.year, endCal.month, 0);
        const end = `${endCal.year}-${String(endCal.month).padStart(2, '0')}-${String(endLast.getDate()).padStart(2, '0')}`;

        const query = supabase
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
          15000,
          'performance_deals period fetch'
        );

        if (dbError) {
          throw dbError;
        }

        // 型変換 (usePerformanceDeals と同じパターン)
        let rows = (data ?? []) as unknown as PerformanceDeal[];

        // assignees.user が配列で返ってくるケースに対応
        rows = rows.map((d) => ({
          ...d,
          assignees: (d.assignees ?? []).map((a) => {
            const rawUser = (a as unknown as { user?: unknown }).user;
            const user = Array.isArray(rawUser) ? rawUser[0] ?? null : rawUser ?? null;
            return { ...a, user } as typeof a;
          }),
        }));

        // assignees を display_order でソート
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
        logger.log('usePerformanceDealsPeriod error:', msg);
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
  }, [period, reloadKey]);

  // fiscalToYearMonth はビルド時に未使用エラーになる可能性があるので、参照だけ残す
  void fiscalToYearMonth;

  return {
    deals,
    loading,
    error,
    reload: () => setReloadKey((k) => k + 1),
  };
}
