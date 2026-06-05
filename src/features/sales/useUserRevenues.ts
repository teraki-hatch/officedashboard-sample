import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

export type UserRevenue = {
  user_id: string;
  user_name: string;
  display_order: number | null;
  fiscal_revenue: number; // 今期累計実績
  monthly_revenue: Record<number, number>; // 月別実績 (1-12)
};

type UseUserRevenuesParams = {
  fiscalStartDate: string; // 例: '2025-08-01'
  fiscalEndDate: string; // 例: '2026-07-31'
};

type UseUserRevenuesResult = {
  userRevenues: Map<string, UserRevenue>;
  // 会社全体扱い (user_id NULL) の月別実績
  // 個人別表示には出さないが、全社累計・月別グラフには加算する
  companyRevenue: { fiscal_revenue: number; monthly_revenue: Record<number, number> };
  loading: boolean;
  error: string | null;
};

// 確定実績テーブルから読み込む境界月
// この月以前: monthly_performance_actuals テーブル (スプシ手入力の確定値)
// この月より後: 案件按分計算 (allocation_ratio で配分)
const ACTUALS_CUTOFF_YM = '2026-05';

/**
 * 個人別売上集計
 *
 * ロジック:
 *   - 2026/5以前: monthly_performance_actuals テーブルから読む (スプシ手入力の確定値)
 *     - user_id NULL のレコード = 会社全体 (元社員分など) → companyRevenue に集計
 *   - 2026/6以降: 案件 (performance_deals + assignees) から按分計算
 *     - 社内クライアント (is_internal=true) は除外
 *     - 未来月は計上しない
 *   - display_order がセットされてる社員は実績ゼロでもエントリを作る (画面表示用)
 */
export function useUserRevenues(
  params: UseUserRevenuesParams
): UseUserRevenuesResult {
  const { fiscalStartDate, fiscalEndDate } = params;
  const [userRevenues, setUserRevenues] = useState<Map<string, UserRevenue>>(
    new Map()
  );
  const [companyRevenue, setCompanyRevenue] = useState<{
    fiscal_revenue: number;
    monthly_revenue: Record<number, number>;
  }>({ fiscal_revenue: 0, monthly_revenue: {} });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not initialized');

      // 0. display_order がセットされてる社員を取得 (表示順序の正となるリスト)
      const { data: orderedUsers, error: uErr } = await supabase
        .from('users')
        .select('id, name, display_order')
        .not('display_order', 'is', null)
        .order('display_order', { ascending: true });
      if (uErr) throw uErr;

      type OrderedUser = { id: string; name: string; display_order: number | null };

      const result = new Map<string, UserRevenue>();
      for (const u of (orderedUsers || []) as OrderedUser[]) {
        result.set(u.id, {
          user_id: u.id,
          user_name: u.name || '(名前未設定)',
          display_order: u.display_order,
          fiscal_revenue: 0,
          monthly_revenue: {},
        });
      }

      // 会社全体実績の集計用 (user_id NULL のレコードを集約)
      const companyAgg = {
        fiscal_revenue: 0,
        monthly_revenue: {} as Record<number, number>,
      };

      const startYM = fiscalStartDate.slice(0, 7);
      const endYM = fiscalEndDate.slice(0, 7);

      // 期内月リスト
      const monthList: string[] = [];
      {
        const [sy, sm] = startYM.split('-').map(Number);
        const [ey, em] = endYM.split('-').map(Number);
        let y = sy;
        let m = sm;
        while (y < ey || (y === ey && m <= em)) {
          monthList.push(`${y}-${String(m).padStart(2, '0')}`);
          m++;
          if (m > 12) {
            m = 1;
            y++;
          }
        }
      }

      // 集計上限は当月末まで
      const now = new Date();
      const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // share加算ヘルパ
      function addShare(
        userId: string | null,
        userName: string,
        displayOrder: number | null,
        monthNumber: number,
        share: number
      ) {
        if (!userId) {
          // 会社全体
          companyAgg.fiscal_revenue += share;
          companyAgg.monthly_revenue[monthNumber] =
            (companyAgg.monthly_revenue[monthNumber] || 0) + share;
          return;
        }
        let entry = result.get(userId);
        if (!entry) {
          entry = {
            user_id: userId,
            user_name: userName,
            display_order: displayOrder,
            fiscal_revenue: 0,
            monthly_revenue: {},
          };
          result.set(userId, entry);
        }
        entry.fiscal_revenue += share;
        entry.monthly_revenue[monthNumber] =
          (entry.monthly_revenue[monthNumber] || 0) + share;
      }

      // =========================================================
      // パート1: ACTUALS_CUTOFF_YM以前は monthly_performance_actuals から
      // =========================================================
      const cutoffYM = ACTUALS_CUTOFF_YM;
      if (startYM <= cutoffYM) {
        const histEnd = endYM < cutoffYM ? endYM : cutoffYM;

        const { data: actuals, error: aErr } = await supabase
          .from('monthly_performance_actuals')
          .select('user_id, year_month, amount, user:users(id, name, display_order)')
          .gte('year_month', startYM)
          .lte('year_month', histEnd);
        if (aErr) throw aErr;

        type ActualRow = {
          user_id: string | null;
          year_month: string;
          amount: number;
          user:
            | { id: string; name: string; display_order: number | null }
            | { id: string; name: string; display_order: number | null }[]
            | null;
        };

        for (const a of (actuals || []) as unknown as ActualRow[]) {
          if (a.year_month > currentYM) continue; // 念のため未来除外
          const monthNumber = Number(a.year_month.slice(5, 7));
          const u = Array.isArray(a.user) ? a.user[0] : a.user;
          addShare(
            a.user_id,
            u?.name || '(名前未設定)',
            u?.display_order ?? null,
            monthNumber,
            Number(a.amount || 0)
          );
        }
      }

      // =========================================================
      // パート2: ACTUALS_CUTOFF_YMの翌月以降は案件 (performance_deals) から按分
      // =========================================================
      const futureStartYM =
        cutoffYM >= startYM ? incrementYM(cutoffYM) : startYM;

      if (futureStartYM <= endYM && futureStartYM <= currentYM) {
        // 受注済案件 (社内除外)
        const { data: deals, error: dErr } = await supabase
          .from('performance_deals')
          .select(
            `id, monthly_amount, status, closed_date, terminated_date,
             client:clients(id, is_internal)`
          )
          .in('status', ['won', 'in_support', 'terminated'])
          .not('client_id', 'is', null);
        if (dErr) throw dErr;

        type DealRow = {
          id: string;
          monthly_amount: number | null;
          status: string;
          closed_date: string | null;
          terminated_date: string | null;
          client:
            | { id: string; is_internal?: boolean }
            | { id: string; is_internal?: boolean }[]
            | null;
        };
        const dealRows = ((deals || []) as unknown as DealRow[]).filter((d) => {
          const c = Array.isArray(d.client) ? d.client[0] : d.client;
          return !c?.is_internal && !!d.closed_date;
        });

        if (dealRows.length > 0) {
          const dealIds = dealRows.map((d) => d.id);

          // 担当者按分情報
          const { data: assignees, error: asgnErr } = await supabase
            .from('performance_deal_assignees')
            .select(
              'deal_id, user_id, allocation_ratio, user:users(id, name, display_order)'
            )
            .in('deal_id', dealIds);
          if (asgnErr) throw asgnErr;

          type AssigneeRow = {
            deal_id: string;
            user_id: string;
            allocation_ratio: number | null;
            user:
              | { id: string; name: string; display_order: number | null }
              | { id: string; name: string; display_order: number | null }[]
              | null;
          };

          type AssigneeInfo = {
            user_id: string;
            user_name: string;
            display_order: number | null;
            ratio: number;
          };

          const dealAssignees = new Map<string, AssigneeInfo[]>();
          for (const a of (assignees || []) as unknown as AssigneeRow[]) {
            const u = Array.isArray(a.user) ? a.user[0] : a.user;
            if (!u?.id) continue;
            const ratio = Number(a.allocation_ratio || 0);
            const prev = dealAssignees.get(a.deal_id) || [];
            prev.push({
              user_id: u.id,
              user_name: u.name || '(名前未設定)',
              display_order: u.display_order,
              ratio,
            });
            dealAssignees.set(a.deal_id, prev);
          }

          // 案件 × 月 で計算 (futureStartYM以降のみ)
          for (const deal of dealRows) {
            const monthly = Number(deal.monthly_amount || 0);
            if (monthly === 0) continue;

            const assigns = dealAssignees.get(deal.id);
            if (!assigns || assigns.length === 0) continue;

            const totalRatio = assigns.reduce((s, a) => s + a.ratio, 0);
            if (totalRatio <= 0) continue;

            const closedYM = deal.closed_date!.slice(0, 7);
            const termYM = deal.terminated_date
              ? deal.terminated_date.slice(0, 7)
              : null;

            for (const ym of monthList) {
              if (ym < futureStartYM) continue;
              if (ym > currentYM) continue;
              if (ym < closedYM) continue;
              if (termYM && ym > termYM) continue;

              const monthNumber = Number(ym.slice(5, 7));
              for (const a of assigns) {
                if (a.ratio <= 0) continue;
                const share = monthly * (a.ratio / totalRatio);
                addShare(
                  a.user_id,
                  a.user_name,
                  a.display_order,
                  monthNumber,
                  share
                );
              }
            }
          }
        }
      }

      setUserRevenues(result);
      setCompanyRevenue(companyAgg);
    } catch (e) {
      console.error('[useUserRevenues] load error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fiscalStartDate, fiscalEndDate]);

  useEffect(() => {
    load();
  }, [load]);

  return { userRevenues, companyRevenue, loading, error };
}

/**
 * 'YYYY-MM' を1ヶ月進める
 */
function incrementYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const nm = m + 1;
  if (nm > 12) return `${y + 1}-01`;
  return `${y}-${String(nm).padStart(2, '0')}`;
}
