import { useMemo, useState } from 'react';
import { usePerformanceDeals } from './usePerformanceDeals';
import { usePerformanceDealsPeriod } from './usePerformanceDealsPeriod';
import { usePerformanceTargets } from './usePerformanceTargets';
import { usePerformanceTargetsPeriod } from './usePerformanceTargetsYear';
import { useActiveUsers } from './useActiveUsers';
import { PerformanceCard } from './PerformanceCard';
import { MemberDealsModal } from './MemberDealsModal';
import { PerformanceMonthlyChart } from './PerformanceMonthlyChart';
import {
  aggregateSummaries,
  calculateAllCategoriesSummary,
  calculateAllClientCount,
  calculateAllClientCountPeriod,
  calculateCategoryClientCount,
  calculateCategoryClientCountPeriod,
  calculateCategoryPeriodSummary,
  calculateMonthlyDataForAll,
  calculateUserClientCount,
  calculateUserClientCountPeriod,
  calculateUserPeriodSummary,
  calculateUserSummary,
  COMPANY_USER_CODE,
  DEAL_CATEGORY_ICONS,
  DEAL_CATEGORY_LABELS,
  DEAL_CATEGORY_ORDER,
  extractClientName,
  isActiveInMonth,
  isHistoricalDeal,
} from './types';
import {
  FISCAL_MONTHS,
  fiscalToCalendar,
  getFiscalMonthLabel,
  getFiscalPeriodLabel,
  getFiscalPeriodNumber,
  getFiscalPeriodShortLabel,
} from './fiscalPeriod';
import type { ActiveUser } from './useActiveUsers';
import './AllPerformanceTab.css';

type InnerTab = 'period' | 'month';
type ChartMetric = 'sales' | 'client' | 'gross_profit';

function formatYen(n: number): string {
  return '¥' + Math.round(Number(n || 0)).toLocaleString('ja-JP');
}

function formatRate(rate: number): string {
  if (!isFinite(rate) || rate <= 0) return '—';
  return Math.round(rate * 100) + '%';
}

/**
 * 会社別の集計を作る (期サマリーモード用)
 * 12ヶ月にわたって isActiveInMonth が true の月の monthly_amount × allocation_ratio を加算
 * 実績まとめ案件は除外
 */
function calculateClientSummariesPeriod(
  deals: Array<{
    deal_name: string;
    monthly_amount: number;
    sales_amount: number;
    gross_profit: number;
    assignees?: Array<{ allocation_ratio: number }>;
    [key: string]: unknown;
  }>,
  periodMonths: Array<{ year: number; month: number }>
): Array<{ clientName: string; sales: number; dealCount: number }> {
  const map = new Map<string, { sales: number; dealCount: number }>();

  for (const deal of deals) {
    // 実績まとめ案件は社数集計から除外
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (isHistoricalDeal(deal as any)) continue;

    const name = extractClientName(deal.deal_name);
    let dealSales = 0;

    // 全アサイニーの allocation_ratio 合計 (按分済み売上を出すため)
    const totalRatio =
      (deal.assignees || []).reduce(
        (acc, a) => acc + (Number(a.allocation_ratio) || 0),
        0
      ) || 1;

    for (const pm of periodMonths) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (isActiveInMonth(deal as any, pm.year, pm.month)) {
        dealSales += Number(deal.monthly_amount || 0) * totalRatio;
      }
    }

    const prev = map.get(name) || { sales: 0, dealCount: 0 };
    prev.sales += dealSales;
    prev.dealCount += 1;
    map.set(name, prev);
  }

  return Array.from(map.entries())
    .map(([clientName, v]) => ({
      clientName,
      sales: v.sales,
      dealCount: v.dealCount,
    }))
    .sort((a, b) => b.sales - a.sales);
}

/**
 * 会社別の集計を作る (月単位モード用)
 * 当該年月で isActiveInMonth が true なら monthly_amount を加算
 * 実績まとめ案件は除外
 */
function calculateClientSummariesMonth(
  deals: Array<{
    deal_name: string;
    monthly_amount: number;
    assignees?: Array<{ allocation_ratio: number }>;
    [key: string]: unknown;
  }>,
  year: number,
  month: number
): Array<{ clientName: string; sales: number; dealCount: number }> {
  const map = new Map<string, { sales: number; dealCount: number }>();

  for (const deal of deals) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (isHistoricalDeal(deal as any)) continue;

    const name = extractClientName(deal.deal_name);
    let dealSales = 0;

    const totalRatio =
      (deal.assignees || []).reduce(
        (acc, a) => acc + (Number(a.allocation_ratio) || 0),
        0
      ) || 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (isActiveInMonth(deal as any, year, month)) {
      dealSales = Number(deal.monthly_amount || 0) * totalRatio;
    }

    const prev = map.get(name) || { sales: 0, dealCount: 0 };
    prev.sales += dealSales;
    prev.dealCount += 1;
    map.set(name, prev);
  }

  return Array.from(map.entries())
    .map(([clientName, v]) => ({
      clientName,
      sales: v.sales,
      dealCount: v.dealCount,
    }))
    .sort((a, b) => b.sales - a.sales);
}

export function AllPerformanceTab() {
  const today = new Date();
  const initialPeriod = getFiscalPeriodNumber(
    today.getFullYear(),
    today.getMonth() + 1
  );

  // 内側タブ
  const [innerTab, setInnerTab] = useState<InnerTab>('period');

  // ===== 期サマリーモードの state =====
  const [period, setPeriod] = useState<number>(initialPeriod);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('sales');

  // ===== 月単位モードの state =====
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);

  const { users: allUsers } = useActiveUsers();
  const users = useMemo(
    () => allUsers.filter((u) => u.employee_code !== COMPANY_USER_CODE),
    [allUsers]
  );

  // ====================================
  // 期サマリーモード用のデータ取得
  // ====================================
  const { deals: periodDeals, loading: periodLoading, error: periodError } =
    usePerformanceDealsPeriod({ period });
  const { targets: periodTargets } = usePerformanceTargetsPeriod({ period });

  // 期内12ヶ月のメタデータ
  const periodMonths = useMemo(() => {
    return FISCAL_MONTHS.map((fm) => {
      const cal = fiscalToCalendar(period, fm.fiscalMonthIndex);
      return {
        fiscalMonthIndex: fm.fiscalMonthIndex,
        year: cal.year,
        month: cal.month,
        monthLabel: getFiscalMonthLabel(fm.fiscalMonthIndex),
      };
    });
  }, [period]);

  // 期全体: 全社合計サマリー
  const periodTotalSummary = useMemo(() => {
    const catSummaries = DEAL_CATEGORY_ORDER.map((cat) =>
      calculateCategoryPeriodSummary(periodDeals, periodTargets, cat, periodMonths)
    );
    return aggregateSummaries(catSummaries);
  }, [periodDeals, periodTargets, periodMonths]);

  // 期全体: 全社合計社数
  const periodTotalClientCount = useMemo(() => {
    return calculateAllClientCountPeriod(periodDeals, periodMonths);
  }, [periodDeals, periodMonths]);

  // 期全体: カテゴリ別サマリー
  const periodCategorySummaries = useMemo(() => {
    const result: Record<string, ReturnType<typeof calculateCategoryPeriodSummary>> = {};
    for (const cat of DEAL_CATEGORY_ORDER) {
      result[cat] = calculateCategoryPeriodSummary(
        periodDeals,
        periodTargets,
        cat,
        periodMonths
      );
    }
    return result;
  }, [periodDeals, periodTargets, periodMonths]);

  // 期全体: カテゴリ別社数
  const periodCategoryClientCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const cat of DEAL_CATEGORY_ORDER) {
      result[cat] = calculateCategoryClientCountPeriod(
        periodDeals,
        cat,
        periodMonths
      );
    }
    return result;
  }, [periodDeals, periodMonths]);

  // 期全体: 社員別サマリー (按分後)
  const periodMemberSummaries = useMemo(() => {
    return users.map((u) => {
      const summary = calculateUserPeriodSummary(
        periodDeals,
        periodTargets,
        u.id,
        periodMonths
      );
      const clientCount = calculateUserClientCountPeriod(
        periodDeals,
        u.id,
        periodMonths
      );
      return { user: u, summary, clientCount };
    });
  }, [users, periodDeals, periodTargets, periodMonths]);

  // 期全体: 会社別サマリー
  const periodClientSummaries = useMemo(() => {
    return calculateClientSummariesPeriod(periodDeals, periodMonths);
  }, [periodDeals, periodMonths]);

  // 期全体: 月別データ (グラフ用)
  const periodMonthlyData = useMemo(() => {
    return calculateMonthlyDataForAll(periodDeals, periodTargets, periodMonths);
  }, [periodDeals, periodTargets, periodMonths]);

  // ====================================
  // 月単位モード用のデータ取得
  // ====================================
  const { deals, loading, error } = usePerformanceDeals({
    userId: null,
    year,
    month,
    scope: 'all',
  });
  const { targets } = usePerformanceTargets({
    userId: null,
    year,
    month,
    scope: 'all',
  });

  const categorySummaries = useMemo(
    () => calculateAllCategoriesSummary(deals, targets, year, month),
    [deals, targets, year, month]
  );

  const totalSummary = useMemo(
    () =>
      aggregateSummaries(
        DEAL_CATEGORY_ORDER.map((cat) => categorySummaries[cat])
      ),
    [categorySummaries]
  );

  // 月単位: 全社合計社数
  const totalClientCount = useMemo(() => {
    return calculateAllClientCount(deals, year, month);
  }, [deals, year, month]);

  // 月単位: カテゴリ別社数
  const categoryClientCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const cat of DEAL_CATEGORY_ORDER) {
      result[cat] = calculateCategoryClientCount(deals, cat, year, month);
    }
    return result;
  }, [deals, year, month]);

  const memberSummaries = useMemo(() => {
    return users.map((u) => {
      const perCategory = DEAL_CATEGORY_ORDER.map((cat) => {
        const catDeals = deals.filter((d) => d.category === cat);
        const catTarget = targets.find(
          (t) => t.category === cat && t.user_id === u.id
        ) ?? null;
        return calculateUserSummary(catDeals, catTarget, u.id, year, month);
      });
      const summary = aggregateSummaries(perCategory);
      const clientCount = calculateUserClientCount(deals, u.id, year, month);
      return { user: u, summary, clientCount };
    });
  }, [users, deals, targets, year, month]);

  // 月単位モード: 会社別サマリー
  const monthClientSummaries = useMemo(() => {
    return calculateClientSummariesMonth(deals, year, month);
  }, [deals, year, month]);

  // 社員クリック時のモーダル (両モード共通) — 実績まとめ案件は除外
  const [selectedUser, setSelectedUser] = useState<ActiveUser | null>(null);
  const selectedDealsForMonth = useMemo(() => {
    if (!selectedUser) return [];
    return deals.filter(
      (d) =>
        !isHistoricalDeal(d) &&
        (d.assignees || []).some((a) => a.user_id === selectedUser.id)
    );
  }, [selectedUser, deals]);
  const selectedDealsForPeriod = useMemo(() => {
    if (!selectedUser) return [];
    return periodDeals.filter(
      (d) =>
        !isHistoricalDeal(d) &&
        (d.assignees || []).some((a) => a.user_id === selectedUser.id)
    );
  }, [selectedUser, periodDeals]);

  function handlePrevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  }

  function handleNextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  }

  const periodOptions = [initialPeriod, initialPeriod + 1, initialPeriod + 2];

  return (
    <div className="all-tab">
      <header className="all-tab__header">
        <h2 className="all-tab__subtitle">全社の業績</h2>

        {/* 内側タブ: 期サマリー / 月単位 */}
        <div className="all-tab__inner-tabs">
          <button
            type="button"
            className={
              'all-tab__inner-tab' +
              (innerTab === 'period' ? ' all-tab__inner-tab--active' : '')
            }
            onClick={() => setInnerTab('period')}
          >
            期サマリー
          </button>
          <button
            type="button"
            className={
              'all-tab__inner-tab' +
              (innerTab === 'month' ? ' all-tab__inner-tab--active' : '')
            }
            onClick={() => setInnerTab('month')}
          >
            月単位
          </button>
        </div>
      </header>

      {/* ===== 期サマリーモード ===== */}
      {innerTab === 'period' && (
        <>
          <div className="all-tab__period-nav">
            <div className="all-tab__period-toggle">
              {periodOptions.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={
                    'all-tab__period-btn' +
                    (period === p ? ' all-tab__period-btn--active' : '')
                  }
                  onClick={() => setPeriod(p)}
                  title={getFiscalPeriodLabel(p)}
                >
                  {getFiscalPeriodShortLabel(p)}
                </button>
              ))}
            </div>
            <div className="all-tab__period-label">
              {getFiscalPeriodLabel(period)}
            </div>
          </div>

          {periodError && (
            <div className="all-tab__error">データ取得エラー: {periodError}</div>
          )}

          <section className="all-tab__total">
            <div className="all-tab__total-label">
              {getFiscalPeriodShortLabel(period)} 全社合計
            </div>
            <PerformanceCard
              summary={periodTotalSummary}
              clientCount={periodTotalClientCount}
            />
          </section>

          {/* 月別推移グラフ */}
          <section className="all-tab__chart-section">
            <div className="all-tab__chart-tabs">
              <button
                type="button"
                className={
                  'all-tab__chart-tab' +
                  (chartMetric === 'sales' ? ' all-tab__chart-tab--active' : '')
                }
                onClick={() => setChartMetric('sales')}
              >
                売上
              </button>
              <button
                type="button"
                className={
                  'all-tab__chart-tab' +
                  (chartMetric === 'client' ? ' all-tab__chart-tab--active' : '')
                }
                onClick={() => setChartMetric('client')}
              >
                社数
              </button>
              <button
                type="button"
                className={
                  'all-tab__chart-tab' +
                  (chartMetric === 'gross_profit'
                    ? ' all-tab__chart-tab--active'
                    : '')
                }
                onClick={() => setChartMetric('gross_profit')}
              >
                粗利
              </button>
            </div>
            <PerformanceMonthlyChart data={periodMonthlyData} metric={chartMetric} />
          </section>

          {/* カテゴリ別サマリー (期合計) */}
          <section className="all-tab__categories">
            <h3 className="all-tab__section-title">領域別の達成率 (期合計)</h3>
            <div className="all-tab__category-grid">
              {DEAL_CATEGORY_ORDER.map((cat) => {
                const s = periodCategorySummaries[cat];
                const cc = periodCategoryClientCounts[cat] ?? 0;
                return (
                  <div key={cat} className="all-tab__category-card">
                    <div className="all-tab__category-header">
                      <span className="all-tab__category-icon">
                        {DEAL_CATEGORY_ICONS[cat]}
                      </span>
                      <span className="all-tab__category-name">
                        {DEAL_CATEGORY_LABELS[cat]}
                      </span>
                    </div>
                    <div className="all-tab__category-sales">
                      {formatYen(s.sales_actual)}
                    </div>
                    <div className="all-tab__category-target">
                      目標 {formatYen(s.sales_target)}
                    </div>
                    <div className="all-tab__category-rate">
                      達成率 {formatRate(s.sales_rate)} / {cc} 社
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 社員別 (期合計) */}
          <section className="all-tab__member-list">
            <h3 className="all-tab__section-title">
              社員別 ({periodMemberSummaries.length}名) — 期合計
            </h3>
            <div className="all-tab__table-wrap">
              <table className="all-tab__table">
                <thead>
                  <tr>
                    <th className="all-tab__th all-tab__th--name">社員</th>
                    <th className="all-tab__th all-tab__th--num">売上目標</th>
                    <th className="all-tab__th all-tab__th--num">売上</th>
                    <th className="all-tab__th all-tab__th--num">達成率</th>
                    <th className="all-tab__th all-tab__th--num">粗利</th>
                    <th className="all-tab__th all-tab__th--num">社数</th>
                  </tr>
                </thead>
                <tbody>
                  {periodLoading ? (
                    <tr>
                      <td colSpan={6} className="all-tab__empty">
                        読み込み中...
                      </td>
                    </tr>
                  ) : periodMemberSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="all-tab__empty">
                        社員が登録されていません
                      </td>
                    </tr>
                  ) : (
                    periodMemberSummaries.map(({ user, summary, clientCount }) => (
                      <tr
                        key={user.id}
                        className="all-tab__row"
                        onClick={() => setSelectedUser(user)}
                      >
                        <td className="all-tab__td all-tab__td--name">
                          <div className="all-tab__member-code">
                            {user.employee_code}
                          </div>
                          <div className="all-tab__member-name">{user.name}</div>
                        </td>
                        <td className="all-tab__td all-tab__td--num all-tab__td--mute">
                          {summary.sales_target > 0
                            ? formatYen(summary.sales_target)
                            : '—'}
                        </td>
                        <td className="all-tab__td all-tab__td--num">
                          {formatYen(summary.sales_actual)}
                        </td>
                        <td className="all-tab__td all-tab__td--num">
                          {formatRate(summary.sales_rate)}
                        </td>
                        <td className="all-tab__td all-tab__td--num">
                          {formatYen(summary.gross_profit_actual)}
                        </td>
                        <td className="all-tab__td all-tab__td--num">
                          {clientCount} 社
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 会社別 (期合計) */}
          <section className="all-tab__member-list">
            <h3 className="all-tab__section-title">
              会社別 ({periodClientSummaries.length}社) — 期合計
            </h3>
            <div className="all-tab__table-wrap">
              <table className="all-tab__table">
                <thead>
                  <tr>
                    <th className="all-tab__th all-tab__th--name">会社名</th>
                    <th className="all-tab__th all-tab__th--num">売上</th>
                    <th className="all-tab__th all-tab__th--num">案件数</th>
                  </tr>
                </thead>
                <tbody>
                  {periodLoading ? (
                    <tr>
                      <td colSpan={3} className="all-tab__empty">
                        読み込み中...
                      </td>
                    </tr>
                  ) : periodClientSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="all-tab__empty">
                        案件が登録されていません
                      </td>
                    </tr>
                  ) : (
                    periodClientSummaries.map((c) => (
                      <tr key={c.clientName} className="all-tab__row">
                        <td className="all-tab__td all-tab__td--name">
                          <div className="all-tab__member-name">
                            {c.clientName}
                          </div>
                        </td>
                        <td className="all-tab__td all-tab__td--num">
                          {formatYen(c.sales)}
                        </td>
                        <td className="all-tab__td all-tab__td--num all-tab__td--mute">
                          {c.dealCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ===== 月単位モード ===== */}
      {innerTab === 'month' && (
        <>
          <div className="all-tab__month-nav">
            <button
              type="button"
              className="all-tab__month-btn"
              onClick={handlePrevMonth}
            >
              ‹ 前月
            </button>
            <div className="all-tab__month-label">
              {year}年 {month}月
            </div>
            <button
              type="button"
              className="all-tab__month-btn"
              onClick={handleNextMonth}
            >
              翌月 ›
            </button>
          </div>

          {error && <div className="all-tab__error">データ取得エラー: {error}</div>}

          <section className="all-tab__total">
            <div className="all-tab__total-label">全社合計</div>
            <PerformanceCard
              summary={totalSummary}
              clientCount={totalClientCount}
            />
          </section>

          <section className="all-tab__categories">
            <h3 className="all-tab__section-title">領域別の達成率</h3>
            <div className="all-tab__category-grid">
              {DEAL_CATEGORY_ORDER.map((cat) => {
                const s = categorySummaries[cat];
                const cc = categoryClientCounts[cat] ?? 0;
                return (
                  <div key={cat} className="all-tab__category-card">
                    <div className="all-tab__category-header">
                      <span className="all-tab__category-icon">
                        {DEAL_CATEGORY_ICONS[cat]}
                      </span>
                      <span className="all-tab__category-name">
                        {DEAL_CATEGORY_LABELS[cat]}
                      </span>
                    </div>
                    <div className="all-tab__category-sales">
                      {formatYen(s.sales_actual)}
                    </div>
                    <div className="all-tab__category-target">
                      目標 {formatYen(s.sales_target)}
                    </div>
                    <div className="all-tab__category-rate">
                      達成率 {formatRate(s.sales_rate)} / {cc} 社
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="all-tab__member-list">
            <h3 className="all-tab__section-title">
              社員別 ({memberSummaries.length}名)
            </h3>
            <div className="all-tab__table-wrap">
              <table className="all-tab__table">
                <thead>
                  <tr>
                    <th className="all-tab__th all-tab__th--name">社員</th>
                    <th className="all-tab__th all-tab__th--num">売上目標</th>
                    <th className="all-tab__th all-tab__th--num">売上</th>
                    <th className="all-tab__th all-tab__th--num">達成率</th>
                    <th className="all-tab__th all-tab__th--num">粗利</th>
                    <th className="all-tab__th all-tab__th--num">社数</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="all-tab__empty">
                        読み込み中...
                      </td>
                    </tr>
                  ) : memberSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="all-tab__empty">
                        社員が登録されていません
                      </td>
                    </tr>
                  ) : (
                    memberSummaries.map(({ user, summary, clientCount }) => (
                      <tr
                        key={user.id}
                        className="all-tab__row"
                        onClick={() => setSelectedUser(user)}
                      >
                        <td className="all-tab__td all-tab__td--name">
                          <div className="all-tab__member-code">
                            {user.employee_code}
                          </div>
                          <div className="all-tab__member-name">{user.name}</div>
                        </td>
                        <td className="all-tab__td all-tab__td--num all-tab__td--mute">
                          {summary.sales_target > 0
                            ? formatYen(summary.sales_target)
                            : '—'}
                        </td>
                        <td className="all-tab__td all-tab__td--num">
                          {formatYen(summary.sales_actual)}
                        </td>
                        <td className="all-tab__td all-tab__td--num">
                          {formatRate(summary.sales_rate)}
                        </td>
                        <td className="all-tab__td all-tab__td--num">
                          {formatYen(summary.gross_profit_actual)}
                        </td>
                        <td className="all-tab__td all-tab__td--num">
                          {clientCount} 社
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 会社別 (月単位) */}
          <section className="all-tab__member-list">
            <h3 className="all-tab__section-title">
              会社別 ({monthClientSummaries.length}社)
            </h3>
            <div className="all-tab__table-wrap">
              <table className="all-tab__table">
                <thead>
                  <tr>
                    <th className="all-tab__th all-tab__th--name">会社名</th>
                    <th className="all-tab__th all-tab__th--num">売上</th>
                    <th className="all-tab__th all-tab__th--num">案件数</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="all-tab__empty">
                        読み込み中...
                      </td>
                    </tr>
                  ) : monthClientSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="all-tab__empty">
                        案件が登録されていません
                      </td>
                    </tr>
                  ) : (
                    monthClientSummaries.map((c) => (
                      <tr key={c.clientName} className="all-tab__row">
                        <td className="all-tab__td all-tab__td--name">
                          <div className="all-tab__member-name">
                            {c.clientName}
                          </div>
                        </td>
                        <td className="all-tab__td all-tab__td--num">
                          {formatYen(c.sales)}
                        </td>
                        <td className="all-tab__td all-tab__td--num all-tab__td--mute">
                          {c.dealCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <MemberDealsModal
        open={selectedUser !== null}
        memberName={selectedUser?.name || ''}
        deals={innerTab === 'period' ? selectedDealsForPeriod : selectedDealsForMonth}
        loading={innerTab === 'period' ? periodLoading : loading}
        year={year}
        month={month}
        onClose={() => setSelectedUser(null)}
      />
    </div>
  );
}

export default AllPerformanceTab;
