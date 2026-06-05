import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

export type SalesTarget = {
  id: string;
  fiscal_year: number;
  target_type: 'fiscal' | 'monthly';
  month: number | null;
  target_amount: number;
  user_id: string | null;
};

type UseSalesTargetsResult = {
  fiscalTarget: number; // 会社全体: 今期目標
  monthlyTargets: Record<number, number>; // 会社全体: 月別目標 (1-12)
  currentMonthTarget: number; // 会社全体: 今月の目標
  userFiscalTargets: Map<string, number>; // user_id -> 今期目標
  userMonthlyTargets: Map<string, Record<number, number>>; // user_id -> 月別目標
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  saveTargets: (params: SaveTargetsParams) => Promise<void>;
};

type SaveTargetsParams = {
  fiscalYear: number;
  userId: string | null; // null = 会社全体
  fiscalTarget: number;
  monthlyTargets: Record<number, number>;
};

export function useSalesTargets(
  fiscalYear: number,
  currentMonth: number
): UseSalesTargetsResult {
  const [fiscalTarget, setFiscalTarget] = useState<number>(0);
  const [monthlyTargets, setMonthlyTargets] = useState<Record<number, number>>(
    {}
  );
  const [userFiscalTargets, setUserFiscalTargets] = useState<Map<string, number>>(
    new Map()
  );
  const [userMonthlyTargets, setUserMonthlyTargets] = useState<
    Map<string, Record<number, number>>
  >(new Map());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not initialized');

      const { data, error: dbErr } = await supabase
        .from('sales_targets')
        .select('id, fiscal_year, target_type, month, target_amount, user_id')
        .eq('fiscal_year', fiscalYear);

      if (dbErr) throw dbErr;

      const rows = (data || []) as SalesTarget[];

      // 会社全体目標
      const companyFiscal = rows.find(
        (r) => r.target_type === 'fiscal' && r.user_id === null
      );
      setFiscalTarget(companyFiscal ? Number(companyFiscal.target_amount) : 0);

      const companyMonthly: Record<number, number> = {};
      for (const r of rows) {
        if (
          r.target_type === 'monthly' &&
          r.month != null &&
          r.user_id === null
        ) {
          companyMonthly[r.month] = Number(r.target_amount);
        }
      }
      setMonthlyTargets(companyMonthly);

      // 個人目標
      const userFiscal = new Map<string, number>();
      const userMonthly = new Map<string, Record<number, number>>();
      for (const r of rows) {
        if (!r.user_id) continue;
        if (r.target_type === 'fiscal') {
          userFiscal.set(r.user_id, Number(r.target_amount));
        } else if (r.target_type === 'monthly' && r.month != null) {
          const prev = userMonthly.get(r.user_id) || {};
          prev[r.month] = Number(r.target_amount);
          userMonthly.set(r.user_id, prev);
        }
      }
      setUserFiscalTargets(userFiscal);
      setUserMonthlyTargets(userMonthly);
    } catch (e) {
      console.error('[useSalesTargets] reload error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fiscalYear]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveTargets = useCallback(
    async ({
      fiscalYear: fy,
      userId,
      fiscalTarget: ft,
      monthlyTargets: mt,
    }: SaveTargetsParams) => {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not initialized');

      // user_id ごとに既存削除 → 一括挿入
      let delQuery = supabase
        .from('sales_targets')
        .delete()
        .eq('fiscal_year', fy);

      if (userId === null) {
        delQuery = delQuery.is('user_id', null);
      } else {
        delQuery = delQuery.eq('user_id', userId);
      }

      const { error: delErr } = await delQuery;
      if (delErr) throw delErr;

      const fiscalRow = {
        fiscal_year: fy,
        target_type: 'fiscal' as const,
        month: null,
        target_amount: ft,
        user_id: userId,
      };

      const monthlyRows = Object.entries(mt).map(([month, amount]) => ({
        fiscal_year: fy,
        target_type: 'monthly' as const,
        month: Number(month),
        target_amount: amount,
        user_id: userId,
      }));

      const { error: insErr } = await supabase
        .from('sales_targets')
        .insert([fiscalRow, ...monthlyRows]);
      if (insErr) throw insErr;

      await reload();
    },
    [reload]
  );

  const currentMonthTarget = monthlyTargets[currentMonth] || 0;

  return {
    fiscalTarget,
    monthlyTargets,
    currentMonthTarget,
    userFiscalTargets,
    userMonthlyTargets,
    loading,
    error,
    reload,
    saveTargets,
  };
}
