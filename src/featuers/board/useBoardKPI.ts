import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { useProfitability } from '../profitability/useProfitability';
import { getFiscalPeriodNumber } from '../performance/fiscalPeriod';

/**
 * Phase C-3: 実績まとめ系 deal が DB から物理削除されたため、
 *   `.includes('実績まとめ')` フィルタは不要になった (削除済み)。
 *   projects_count 参照ナシのため、useProfitability の型変更影響もナシ。
 */

export type BoardKPI = {
  /** 当期売上 (期首〜期末の monthly_amount × 月数) */
  totalSales: number;
  /** 当期原価 */
  totalCost: number;
  /** 当期粗利 */
  totalGrossProfit: number;
  /** 全社稼働率 (実工数 / 所定工数 in %) */
  utilizationRate: number;
  /** 未請求金額 (draft の請求書) */
  unbilledAmount: number;
  /** 未入金金額 (paid / void 以外) */
  unpaidAmount: number;
  /** 進行中案件数 (won / in_support) */
  activeDealCount: number;
};

export type MonthlySales = {
  yearMonth: string;
  sales: number;
  cost: number;
};

export type CategorySales = {
  category: string;
  sales: number;
};

export type BoardData = {
  kpi: BoardKPI;
  monthlySales: MonthlySales[];
  categorySales: CategorySales[];
  loading: boolean;
  error: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  consulting: 'コンサル',
  media: '媒体',
  rpo: 'RPO',
  creative: 'クリエイティブ',
  maintenance: '保守',
  other: 'その他',
};

/**
 * 経営ボード用の集計フック (当期=現在の期)
 */
export function useBoardData(): BoardData {
  // 現在期を計算
  const today = new Date();
  const fiscalPeriod = getFiscalPeriodNumber(
    today.getFullYear(),
    today.getMonth() + 1
  );

  // クライアント別収支 (これで売上/原価/粗利の合計が出る)
  const { rows: profRows, loading: profLoading, error: profError } =
    useProfitability({
      type: 'fiscal',
      fiscalPeriod,
    });

  const [extra, setExtra] = useState<{
    utilizationRate: number;
    unbilledAmount: number;
    unpaidAmount: number;
    activeDealCount: number;
    monthlySales: MonthlySales[];
    categorySales: CategorySales[];
  }>({
    utilizationRate: 0,
    unbilledAmount: 0,
    unpaidAmount: 0,
    activeDealCount: 0,
    monthlySales: [],
    categorySales: [],
  });
  const [extraLoading, setExtraLoading] = useState<boolean>(true);
  const [extraError, setExtraError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setExtraLoading(true);
      setExtraError(null);
      const supabase = getSupabase();
      if (!supabase) {
        setExtraError('Supabase未設定');
        setExtraLoading(false);
        return;
      }

      // 当期の日付範囲 (8月始まり)
      const startYear =
        today.getMonth() + 1 >= 8
          ? today.getFullYear()
          : today.getFullYear() - 1;
      const periodStart = `${startYear}-08-01`;
      const periodEnd = `${startYear + 1}-07-31`;

      try {
        // ===== 1. 稼働率: time_entries 合計 / (社員数 × 所定 × 稼働日数概算) =====
        const teRes = await withTimeout(
          supabase
            .from('time_entries')
            .select('hours, date, user_id')
            .gte('date', periodStart)
            .lte('date', periodEnd),
          15000,
          'time_entries for board'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const teRows = (teRes.data || []) as any[];
        const totalActualHours = teRows.reduce(
          (a, r) => a + Number(r.hours || 0),
          0
        );

        // 社員 (status='active'、has_attendance_management=true 想定)
        const userRes = await withTimeout(
          supabase
            .from('users')
            .select('id, standard_work_hours, status')
            .eq('status', 'active'),
          10000,
          'users for utilization'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userRows = (userRes.data || []) as any[];

        // 経過月数 (期首から今月まで)
        const elapsedMonths = Math.max(
          1,
          (today.getFullYear() - startYear) * 12 +
            (today.getMonth() + 1 - 8) +
            1
        );
        // 月20稼働日 × 所定時間 × 経過月数 × 人数
        const standardTotal = userRows.reduce((a, u) => {
          const swh = Number(u.standard_work_hours || 8);
          return a + swh * 20 * elapsedMonths;
        }, 0);
        const utilizationRate =
          standardTotal > 0 ? (totalActualHours / standardTotal) * 100 : 0;

        // ===== 2. 請求書集計 (未請求/未入金) =====
        const invRes = await withTimeout(
          supabase
            .from('invoices')
            .select('total_amount, status, due_date, billing_month')
            .gte('billing_month', periodStart)
            .lte('billing_month', periodEnd),
          15000,
          'invoices for board'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invRows = (invRes.data || []) as any[];

        let unbilledAmount = 0;
        let unpaidAmount = 0;
        for (const inv of invRows) {
          const amt = Number(inv.total_amount || 0);
          if (inv.status === 'draft') {
            unbilledAmount += amt;
          } else if (
            inv.status !== 'paid' &&
            inv.status !== 'void' &&
            inv.status !== 'draft'
          ) {
            unpaidAmount += amt;
          }
        }

        // ===== 3. 進行中案件数 (社内案件を除外) =====
        const dealsRes = await withTimeout(
          supabase
            .from('performance_deals')
            .select(
              'id, status, category, monthly_amount, client_id, deal_name, client:clients(id, is_internal)'
            )
            .not('client_id', 'is', null),
          15000,
          'performance_deals for board'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dealRowsRaw = (dealsRes.data || []) as any[];
        // 社内クライアント (is_internal=true) の案件は集計対象外
        const dealRows = dealRowsRaw.filter((d) => {
          const c = Array.isArray(d.client) ? d.client[0] : d.client;
          return !c?.is_internal;
        });
        const activeDealCount = dealRows.filter(
          (d) => d.status === 'won' || d.status === 'in_support'
        ).length;

        // ===== 4. カテゴリ別売上 (当期累計) =====
        const catMap = new Map<string, number>();
        const elapsedMonthsForCat = Math.max(1, elapsedMonths);
        for (const d of dealRows) {
          const cat = d.category || 'other';
          const amount = Number(d.monthly_amount || 0) * elapsedMonthsForCat;
          catMap.set(cat, (catMap.get(cat) || 0) + amount);
        }
        const categorySales: CategorySales[] = Array.from(catMap.entries())
          .map(([cat, sales]) => ({
            category: CATEGORY_LABELS[cat] || cat,
            sales,
          }))
          .sort((a, b) => b.sales - a.sales);

        // ===== 5. 月別売上推移 (期首〜現在月、各月の monthly_amount 合計) =====
        // 簡易: deal の monthly_amount を各月一律で計上
        const monthlySales: MonthlySales[] = [];
        const monthlyDealAmount = dealRows.reduce(
          (a, d) => a + Number(d.monthly_amount || 0),
          0
        );

        // 各月の実工数原価
        const teByMonth = new Map<string, number>();
        // user_id ごとの cost_rate
        const costRateRes = await withTimeout(
          supabase.from('users').select('id, cost_rate'),
          10000,
          'users cost_rate'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const costRateRows = (costRateRes.data || []) as any[];
        const costRateMap = new Map<string, number>();
        for (const u of costRateRows) {
          costRateMap.set(u.id, Number(u.cost_rate || 0));
        }
        for (const te of teRows) {
          const ym = (te.date || '').slice(0, 7);
          if (!ym) continue;
          const cost =
            Number(te.hours || 0) * (costRateMap.get(te.user_id) || 0);
          teByMonth.set(ym, (teByMonth.get(ym) || 0) + cost);
        }

        for (let i = 0; i < elapsedMonths; i++) {
          const monthIdx = 7 + i; // 8月=index 7
          const y = startYear + Math.floor(monthIdx / 12);
          const m = (monthIdx % 12) + 1;
          const ym = `${y}-${String(m).padStart(2, '0')}`;
          monthlySales.push({
            yearMonth: ym,
            sales: monthlyDealAmount,
            cost: teByMonth.get(ym) || 0,
          });
        }

        if (alive) {
          setExtra({
            utilizationRate,
            unbilledAmount,
            unpaidAmount,
            activeDealCount,
            monthlySales,
            categorySales,
          });
          setExtraLoading(false);
        }
      } catch (e) {
        if (alive) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setExtraError((e as any).message || 'データ取得エラー');
          setExtraLoading(false);
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 集約
  const totalSales = profRows.reduce((a, r) => a + Number(r.sales || 0), 0);
  const totalCost = profRows.reduce((a, r) => a + Number(r.cost || 0), 0);
  const totalGrossProfit = totalSales - totalCost;

  return {
    kpi: {
      totalSales,
      totalCost,
      totalGrossProfit,
      utilizationRate: extra.utilizationRate,
      unbilledAmount: extra.unbilledAmount,
      unpaidAmount: extra.unpaidAmount,
      activeDealCount: extra.activeDealCount,
    },
    monthlySales: extra.monthlySales,
    categorySales: extra.categorySales,
    loading: profLoading || extraLoading,
    error: profError || extraError,
  };
}
