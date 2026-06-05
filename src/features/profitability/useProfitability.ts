import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import {
  fiscalPeriodToStartYear,
} from '../performance/fiscalPeriod';
import type { ProfitabilityRow, ProfitabilityFilter } from './types';

/**
 * Phase C-3: projects 廃止に伴い大幅簡素化。
 *   旧: time_entries → projects → clients (二段経由マップ構築)
 *   新: time_entries.client_id 直接参照
 *   projects_count フィールドは型から削除済み
 */

// 期番号から期内の日付範囲を返す (例: 第6期 -> 2025-08-01 〜 2026-07-31)
function getFiscalPeriodDateRange(period: number): { from: string; to: string; months: number } {
  const startYear = fiscalPeriodToStartYear(period);
  const endYear = startYear + 1;
  return {
    from: `${startYear}-08-01`,
    to: `${endYear}-07-31`,
    months: 12,
  };
}

// "YYYY-MM" から月の日付範囲を返す
function getMonthDateRange(yearMonth: string): { from: string; to: string; months: number } {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${yearMonth}-01`,
    to: `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
    months: 1,
  };
}

type UseProfitabilityResult = {
  rows: ProfitabilityRow[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useProfitability(
  filter: ProfitabilityFilter
): UseProfitabilityResult {
  const [rows, setRows] = useState<ProfitabilityRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const filterKey =
    filter.type === 'month'
      ? `month:${filter.yearMonth || ''}`
      : `fiscal:${filter.fiscalPeriod || ''}`;

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      const supabase = getSupabase();
      if (!supabase) {
        if (alive) {
          setError('Supabase未設定');
          setLoading(false);
        }
        return;
      }

      // 日付範囲と月数を決定
      let dateFrom: string;
      let dateTo: string;
      let monthsCount: number;
      if (filter.type === 'month') {
        if (!filter.yearMonth) {
          if (alive) {
            setRows([]);
            setLoading(false);
          }
          return;
        }
        const r = getMonthDateRange(filter.yearMonth);
        dateFrom = r.from;
        dateTo = r.to;
        monthsCount = r.months;
      } else {
        if (!filter.fiscalPeriod) {
          if (alive) {
            setRows([]);
            setLoading(false);
          }
          return;
        }
        const r = getFiscalPeriodDateRange(filter.fiscalPeriod);
        dateFrom = r.from;
        dateTo = r.to;
        monthsCount = r.months;
      }

      try {
        // 1. クライアント一覧 (is_active = true、社内擬似は採算対象外なので除外)
        const clientRes = await withTimeout(
          supabase
            .from('clients')
            .select('id, name, is_active, is_internal')
            .eq('is_active', true)
            .order('name', { ascending: true }),
          15000,
          'fetch clients'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        if (clientRes.error) throw clientRes.error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allClients = (clientRes.data || []) as any[];
        // 採算分析の対象は外部クライアントのみ (社内は除外)
        const clients = allClients.filter((c) => !c.is_internal);

        if (clients.length === 0) {
          if (alive) {
            setRows([]);
            setLoading(false);
          }
          return;
        }

        // 2. performance_deals (client_id NOT NULL のみ)
        const dealsRes = await withTimeout(
          supabase
            .from('performance_deals')
            .select('id, client_id, monthly_amount')
            .not('client_id', 'is', null),
          15000,
          'fetch performance_deals'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        if (dealsRes.error) throw dealsRes.error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const deals = (dealsRes.data || []) as any[];

        // 3. time_entries を期間で取得 (project_id 経由なし、client_id 直接)
        const teRes = await withTimeout(
          supabase
            .from('time_entries')
            .select('client_id, user_id, hours, date')
            .gte('date', dateFrom)
            .lte('date', dateTo),
          15000,
          'fetch time_entries'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        if (teRes.error) throw teRes.error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const timeEntries = (teRes.data || []) as any[];

        // 4. users (cost_rate) を取得
        const userRes = await withTimeout(
          supabase.from('users').select('id, cost_rate'),
          10000,
          'fetch users cost_rate'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        if (userRes.error) throw userRes.error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const users = (userRes.data || []) as any[];
        const userCostMap = new Map<string, number>();
        for (const u of users) {
          userCostMap.set(u.id, Number(u.cost_rate || 0));
        }

        // 5. クライアントごとに集計
        // client_id -> { sales, cost, hours, deals_count }
        type Agg = {
          sales: number;
          cost: number;
          hours: number;
          deals_count: number;
        };
        const aggMap = new Map<string, Agg>();
        const ensureAgg = (cid: string): Agg => {
          const cur = aggMap.get(cid);
          if (cur) return cur;
          const fresh: Agg = {
            sales: 0,
            cost: 0,
            hours: 0,
            deals_count: 0,
          };
          aggMap.set(cid, fresh);
          return fresh;
        };

        // 売上: performance_deals.monthly_amount × 月数
        for (const d of deals) {
          if (!d.client_id) continue;
          const agg = ensureAgg(d.client_id);
          agg.sales += Number(d.monthly_amount || 0) * monthsCount;
          agg.deals_count += 1;
        }

        // 原価: time_entries × cost_rate (client_id 直接)
        for (const te of timeEntries) {
          if (!te.client_id) continue;
          const agg = ensureAgg(te.client_id);
          const hours = Number(te.hours || 0);
          const cost = hours * (userCostMap.get(te.user_id) || 0);
          agg.cost += cost;
          agg.hours += hours;
        }

        // 6. ProfitabilityRow 構築 (社内は除外済みの clients を使う)
        const result: ProfitabilityRow[] = clients.map((c) => {
          const agg = aggMap.get(c.id) || {
            sales: 0,
            cost: 0,
            hours: 0,
            deals_count: 0,
          };
          const gross_profit = agg.sales - agg.cost;
          const gross_profit_rate =
            agg.sales > 0 ? (gross_profit / agg.sales) * 100 : null;
          return {
            client_id: c.id,
            client_name: c.name || '',
            sales: agg.sales,
            cost: agg.cost,
            gross_profit,
            gross_profit_rate,
            total_hours: agg.hours,
            deals_count: agg.deals_count,
          };
        });

        if (alive) {
          setRows(result);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setError((e as any).message || 'データ取得エラー');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [filterKey, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    rows,
    loading,
    error,
    reload: () => setReloadKey((k) => k + 1),
  };
}
