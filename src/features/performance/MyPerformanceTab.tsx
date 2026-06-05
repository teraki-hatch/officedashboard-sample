import { useMemo, useState } from 'react';
import { useAppUser } from '../../lib/useAppUser';
import { usePerformanceDeals } from './usePerformanceDeals';
import { usePerformanceDealsPeriod } from './usePerformanceDealsPeriod';
import { usePerformanceTargets } from './usePerformanceTargets';
import { usePerformanceTargetsPeriod } from './usePerformanceTargetsYear';
import { PerformanceCard } from './PerformanceCard';
import { DealList } from './DealList';
import { DealModal } from './DealModal';
import { PerformanceMonthlyChart } from './PerformanceMonthlyChart';
import {
  aggregateSummaries,
  calculateMonthlyDataForUser,
  calculateUserClientCount,
  calculateUserClientCountPeriod,
  calculateUserPeriodSummary,
  calculateUserSummary,
  DEAL_CATEGORY_ORDER,
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
import type { PerformanceDeal } from './types';

type InnerTab = 'period' | 'month';
type ChartMetric = 'sales' | 'client' | 'gross_profit';

export function MyPerformanceTab() {
  const { appUser } = useAppUser();
  const userId = appUser?.id || null;
  const authUserId = appUser?.auth_user_id || null;

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

  // ====================================
  // 期サマリーモード用のデータ取得
  // ====================================
  const { deals: periodDeals, loading: periodLoading, error: periodError, reload: reloadPeriod } =
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

  // 期全体: 個人サマリー (按分後)
  const periodUserSummary = useMemo(() => {
    if (!userId) return null;
    return calculateUserPeriodSummary(
      periodDeals,
      periodTargets,
      userId,
      periodMonths
    );
  }, [periodDeals, periodTargets, userId, periodMonths]);

  // 期全体: 個人社数
  const periodUserClientCount = useMemo(() => {
    if (!userId) return 0;
    return calculateUserClientCountPeriod(periodDeals, userId, periodMonths);
  }, [periodDeals, userId, periodMonths]);

  // 期内月別データ (グラフ用)
  const periodMonthlyData = useMemo(() => {
    if (!userId) return [];
    return calculateMonthlyDataForUser(
      periodDeals,
      periodTargets,
      userId,
      periodMonths
    );
  }, [periodDeals, periodTargets, userId, periodMonths]);

  // 期内の自分の案件 (実績まとめ案件は除外して案件一覧に表示)
  const periodMyDeals = useMemo(() => {
    if (!userId) return [];
    return periodDeals.filter(
      (d) =>
        !isHistoricalDeal(d) &&
        (d.assignees || []).some((a) => a.user_id === userId)
    );
  }, [periodDeals, userId]);

  // ====================================
  // 月単位モード用のデータ取得
  // ====================================
  const { deals, loading, error, reload } = usePerformanceDeals({
    userId,
    year,
    month,
    scope: 'self',
  });
  const { targets } = usePerformanceTargets({
    userId,
    year,
    month,
    scope: 'self',
  });

  const monthSummary = useMemo(() => {
    if (!userId) return null;
    const perCategorySummaries = DEAL_CATEGORY_ORDER.map((cat) => {
      const catDeals = deals.filter((d) => d.category === cat);
      const catTarget = targets.find((t) => t.category === cat) ?? null;
      return calculateUserSummary(catDeals, catTarget, userId, year, month);
    });
    return aggregateSummaries(perCategorySummaries);
  }, [deals, targets, userId, year, month]);

  const monthClientCount = useMemo(() => {
    if (!userId) return 0;
    return calculateUserClientCount(deals, userId, year, month);
  }, [deals, userId, year, month]);

  // 月単位: 案件一覧 (実績まとめ案件は除外)
  const monthMyDeals = useMemo(() => {
    return deals.filter((d) => !isHistoricalDeal(d));
  }, [deals]);

  // ====================================
  // 案件モーダル (共通)
  // ====================================
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<PerformanceDeal | null>(null);

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

  function handleAddNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function handleEdit(deal: PerformanceDeal) {
    setEditing(deal);
    setModalOpen(true);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleSaved() {
    // 両方のデータを再取得
    reload();
    reloadPeriod();
  }

  const periodOptions = [initialPeriod, initialPeriod + 1, initialPeriod + 2];

  // 「+ 案件を追加」ボタン (DealListの上で再利用)
  const addBtn = (
    <div className="perf-tab__add-row">
      <button
        type="button"
        className="perf-tab__add-btn"
        onClick={handleAddNew}
        disabled={!userId}
      >
        + 案件を追加
      </button>
    </div>
  );

  return (
    <div className="perf-tab">
      <header className="perf-tab__header">
        <div className="perf-tab__title-row">
          <h2 className="perf-tab__subtitle">自分の業績</h2>
        </div>

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
            <div className="perf-tab__error">データ取得エラー: {periodError}</div>
          )}

          {periodUserSummary && (
            <PerformanceCard
              summary={periodUserSummary}
              clientCount={periodUserClientCount}
            />
          )}

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

          {/* ★ 案件追加ボタン: グラフと案件一覧の間に右寄せ */}
          {addBtn}

          <DealList deals={periodMyDeals} loading={periodLoading} onEdit={handleEdit} />
        </>
      )}

      {/* ===== 月単位モード ===== */}
      {innerTab === 'month' && (
        <>
          <div className="perf-tab__month-nav">
            <button
              type="button"
              className="perf-tab__month-btn"
              onClick={handlePrevMonth}
            >
              ‹ 前月
            </button>
            <div className="perf-tab__month-label">
              {year}年 {month}月
            </div>
            <button
              type="button"
              className="perf-tab__month-btn"
              onClick={handleNextMonth}
            >
              翌月 ›
            </button>
          </div>

          {error && <div className="perf-tab__error">データ取得エラー: {error}</div>}

          {monthSummary && (
            <PerformanceCard
              summary={monthSummary}
              clientCount={monthClientCount}
            />
          )}

          {/* ★ 案件追加ボタン: サマリーと案件一覧の間に右寄せ */}
          {addBtn}

          <DealList deals={monthMyDeals} loading={loading} onEdit={handleEdit} />
        </>
      )}

      {userId && authUserId && (
        <DealModal
          open={modalOpen}
          userId={userId}
          authUserId={authUserId}
          editing={editing}
          onClose={handleCloseModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

export default MyPerformanceTab;
