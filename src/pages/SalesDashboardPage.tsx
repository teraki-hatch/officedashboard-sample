import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../lib/supabase';
import { useAppUser } from '../lib/useAppUser';
import {
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
  getPipelineCategory,
} from '../features/performance/types';
import type {
  DealStatus,
} from '../features/performance/types';
import { useSalesTargets } from '../features/sales/useSalesTargets';
import { useUserRevenues } from '../features/sales/useUserRevenues';
import { SalesTargetEditModal } from '../features/sales/SalesTargetEditModal';
import { HalfGauge } from '../features/sales/HalfGauge';
import { MonthlyRevenueChart } from '../features/sales/MonthlyRevenueChart';
import { UserProgressList } from '../features/sales/UserProgressList';
import './SalesDashboardPage.css';

// 期: 8月〜7月
const FISCAL_YEAR_START_MONTH = 8;

type DealRow = {
  id: string;
  client_id: string | null;
  deal_name: string | null;
  status: DealStatus;
  sales_amount: number | null;
  monthly_amount: number | null;
  expected_close_date: string | null;
  closed_date: string | null;
  terminated_date: string | null;
  created_at: string | null;
  client?:
    | { id: string; name: string; is_internal?: boolean }
    | { id: string; name: string; is_internal?: boolean }[]
    | null;
};

function getCurrentMonth(): {
  startDate: string;
  endDate: string;
  label: string;
  monthNumber: number;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const mm = month.toString().padStart(2, '0');
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${lastDay.toString().padStart(2, '0')}`,
    label: `${year}年${month}月`,
    monthNumber: month,
  };
}

// 第6期 = 2025/8〜2026/7 を起点とする
// 期番号 → 開始西暦年(8月始まり)
function getStartYearByPeriod(period: number): number {
  return 2025 + (period - 6);
}

// 現在の期番号を取得 (2026/5 → 第6期)
function getCurrentPeriodNumber(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // 8月以降ならその年の期、それ以前なら前年の期
  const startYear = month >= FISCAL_YEAR_START_MONTH ? year : year - 1;
  return 6 + (startYear - 2025);
}

function getFiscalYearByPeriod(period: number): {
  startDate: string;
  endDate: string;
  label: string;
  fiscalYearNumber: number;
  period: number;
} {
  const startYear = getStartYearByPeriod(period);
  const endYear = startYear + 1;
  return {
    startDate: `${startYear}-08-01`,
    endDate: `${endYear}-07-31`,
    label: `第${period}期 (${startYear}/8〜${endYear}/7)`,
    fiscalYearNumber: startYear,
    period,
  };
}

function formatYen(n: number): string {
  return `¥${n.toLocaleString()}`;
}

export function SalesDashboardPage() {
  const navigate = useNavigate();
  const { appUser } = useAppUser();
  const isAdmin = appUser?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [editOpen, setEditOpen] = useState<boolean>(false);
  // 期切替: 現在の期をデフォルト、第6期未満は遡れない
  const currentPeriod = useMemo(() => getCurrentPeriodNumber(), []);
  const [selectedPeriod, setSelectedPeriod] = useState<number>(currentPeriod);
  // 「他N件」展開状態
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());

  const fiscalYear = useMemo(
    () => getFiscalYearByPeriod(selectedPeriod),
    [selectedPeriod]
  );
  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const isViewingCurrentPeriod = selectedPeriod === currentPeriod;

  // 売上目標 (DBから取得)
  const {
    fiscalTarget,
    monthlyTargets,
    currentMonthTarget,
    userFiscalTargets,
    userMonthlyTargets,
    loading: targetsLoading,
    saveTargets,
  } = useSalesTargets(fiscalYear.fiscalYearNumber, currentMonth.monthNumber);

  // 個人別売上実績 + 会社全体実績 (新ロジック: 5月までは monthly_performance_actuals、以降は案件按分)
  const { userRevenues, companyRevenue } = useUserRevenues({
    fiscalStartDate: fiscalYear.startDate,
    fiscalEndDate: fiscalYear.endDate,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabase();
        if (!supabase) throw new Error('Supabase client not initialized');

        // 全案件取得 (client情報JOIN)
        // 社内案件 (clients.is_internal=true) は除外する
        // ※ パイプライン表示用。実績集計は useUserRevenues 側でやる
        const { data: dealsData, error: dErr } = await supabase
          .from('performance_deals')
          .select(
            `id, client_id, deal_name, status,
             sales_amount, monthly_amount,
             expected_close_date, closed_date, terminated_date, created_at,
             client:clients (id, name, is_internal)`
          )
          .order('updated_at', { ascending: false });

        if (dErr) throw dErr;

        if (!cancelled) {
          // 社内クライアント (is_internal=true) の案件は集計対象外
          const filteredDeals = ((dealsData || []) as unknown as DealRow[]).filter(
            (d) => {
              const c = Array.isArray(d.client) ? d.client[0] : d.client;
              return !c?.is_internal;
            }
          );
          setDeals(filteredDeals);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[SalesDashboardPage] load error', e);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fiscalYear.startDate, fiscalYear.endDate]);

  // =====================================================
  // KPI 集計 (useUserRevenues の結果を集約)
  //   - 個人別実績 (userRevenues) + 会社全体実績 (companyRevenue) を合算
  //   - これにより半円ゲージ・月別グラフ・個人別ランキングが同じソースになる
  // =====================================================
  const kpis = useMemo(() => {
    // 今期累計実績
    let fiscalRevenue = 0;
    // 月別実績 (月番号 1-12 → 合計額)
    const monthlyRevenueByMonth: Record<number, number> = {};

    // 個人実績を集約
    for (const u of userRevenues.values()) {
      fiscalRevenue += u.fiscal_revenue;
      for (const [m, v] of Object.entries(u.monthly_revenue)) {
        const mn = Number(m);
        monthlyRevenueByMonth[mn] = (monthlyRevenueByMonth[mn] || 0) + v;
      }
    }
    // 会社全体実績 (川口分など) を加算
    fiscalRevenue += companyRevenue.fiscal_revenue;
    for (const [m, v] of Object.entries(companyRevenue.monthly_revenue)) {
      const mn = Number(m);
      monthlyRevenueByMonth[mn] = (monthlyRevenueByMonth[mn] || 0) + v;
    }

    // 当月見込み = 当月の実績合計
    const monthlyForecast = monthlyRevenueByMonth[currentMonth.monthNumber] || 0;
    const monthlyConfirmed = monthlyForecast;

    // 進行中案件数 = 進行中 + 高確度カテゴリの案件
    const activeDeals = deals.filter((d) => {
      const cat = getPipelineCategory(d.status);
      return cat === 'active' || cat === 'hot';
    });

    // 期内全月のキーが0でも揃うように初期化
    const startYear = Number(fiscalYear.startDate.slice(0, 4));
    for (let i = 0; i < 12; i++) {
      const m = ((FISCAL_YEAR_START_MONTH - 1 + i) % 12) + 1;
      if (!(m in monthlyRevenueByMonth)) {
        monthlyRevenueByMonth[m] = 0;
      }
      // 未使用変数警告対策で startYear を参照
      void startYear;
    }

    return {
      fiscalRevenue,
      fiscalProgress: fiscalTarget > 0 ? (fiscalRevenue / fiscalTarget) * 100 : 0,
      monthlyForecast,
      monthlyProgress: currentMonthTarget > 0 ? (monthlyForecast / currentMonthTarget) * 100 : 0,
      monthlyConfirmed,
      activeDealCount: activeDeals.length,
      monthlyRevenueByMonth,
    };
  }, [
    userRevenues,
    companyRevenue,
    deals,
    fiscalYear.startDate,
    fiscalTarget,
    currentMonthTarget,
    currentMonth.monthNumber,
  ]);

  // =====================================================
  // パイプライン (営業ヨミ) を3つの大カテゴリに再編
  //   selling: 営業中 (prospect, in_progress, proposed, negotiating, contract, on_hold)
  //   supporting: 支援中 (won, in_support)
  //   ended: 終了 (terminated, lost)
  // =====================================================
  type PipelineTab = 'selling' | 'supporting' | 'ended';

  function getTabCategory(status: DealStatus): PipelineTab {
    if (status === 'won' || status === 'in_support') return 'supporting';
    if (status === 'terminated' || status === 'lost') return 'ended';
    return 'selling'; // prospect, in_progress, proposed, negotiating, contract, on_hold
  }

  // 当該期内の案件のみフィルタ
  const periodDeals = useMemo(() => {
    const startDate = fiscalYear.startDate;
    const endDate = fiscalYear.endDate;
    return deals.filter((d) => {
      const tab = getTabCategory(d.status);
      if (tab === 'selling') {
        // 営業中: 現在期のみ表示
        return isViewingCurrentPeriod;
      }
      if (tab === 'supporting') {
        // 支援中: 期内に存在した案件
        if (d.closed_date && d.closed_date > endDate) return false;
        if (d.terminated_date && d.terminated_date < startDate) return false;
        return true;
      }
      // 終了 (ended): closed_date or terminated_date が期内
      const refDate = d.terminated_date || d.closed_date;
      if (!refDate) return false;
      return refDate >= startDate && refDate <= endDate;
    });
  }, [deals, fiscalYear.startDate, fiscalYear.endDate, isViewingCurrentPeriod]);

  // タブごとの集計 (期内案件のみ)
  const tabStats = useMemo(() => {
    const stats: Record<PipelineTab, { count: number; clientIds: Set<string> }> = {
      selling: { count: 0, clientIds: new Set() },
      supporting: { count: 0, clientIds: new Set() },
      ended: { count: 0, clientIds: new Set() },
    };
    for (const d of periodDeals) {
      const tab = getTabCategory(d.status);
      stats[tab].count++;
      if (d.client_id) stats[tab].clientIds.add(d.client_id);
    }
    return stats;
  }, [periodDeals]);

  // 支援中タブ用 active タブのデフォルト
  const [activeTab, setActiveTab] = useState<PipelineTab>('supporting');

  if (loading) {
    return (
      <div className="sales-dashboard">
        <h1 className="sales-dashboard__title">営業ダッシュボード</h1>
        <p className="sales-dashboard__mute">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sales-dashboard">
        <h1 className="sales-dashboard__title">営業ダッシュボード</h1>
        <p className="sales-dashboard__error">エラー: {error}</p>
      </div>
    );
  }

  return (
    <div className="sales-dashboard">
      <div className="sales-dashboard__header">
        <div>
          <h1 className="sales-dashboard__title">営業ダッシュボード</h1>
          <p className="sales-dashboard__sub">
            {fiscalYear.label} {isViewingCurrentPeriod && ` /  当月: ${currentMonth.label}`}
          </p>
        </div>
        <div className="sales-dashboard__header-actions">
          {/* 期切替 */}
          <div className="sales-dashboard__period-switcher">
            <button
              type="button"
              className="sales-dashboard__period-btn"
              onClick={() => setSelectedPeriod((p) => Math.max(6, p - 1))}
              disabled={selectedPeriod <= 6}
              aria-label="前期"
              title="前期"
            >
              ◀
            </button>
            <span className="sales-dashboard__period-label">
              第{selectedPeriod}期
            </span>
            <button
              type="button"
              className="sales-dashboard__period-btn"
              onClick={() => setSelectedPeriod((p) => Math.min(currentPeriod + 2, p + 1))}
              disabled={selectedPeriod >= currentPeriod + 2}
              aria-label="次期"
              title="次期"
            >
              ▶
            </button>
          </div>
          <button
            type="button"
            className="sales-dashboard__edit-btn"
            onClick={() => setEditOpen(true)}
            disabled={targetsLoading}
          >
            {isAdmin ? '目標を編集' : '目標を表示'}
          </button>
        </div>
      </div>

      {/* 達成率ゲージ＋月別推移グラフ (最上部に移動) */}
      <div className="sales-dashboard__charts-row">
        <div className="sales-dashboard__chart-card">
          <h3 className="sales-dashboard__chart-title">今期目標達成率</h3>
          <div className="sales-dashboard__gauge-wrap">
            <HalfGauge value={kpis.fiscalProgress} label="今期累計 vs 目標" />
            <div className="sales-dashboard__gauge-info">
              <div className="sales-dashboard__gauge-line">
                <span className="sales-dashboard__gauge-label">実績</span>
                <span className="sales-dashboard__gauge-value">{formatYen(kpis.fiscalRevenue)}</span>
              </div>
              <div className="sales-dashboard__gauge-line">
                <span className="sales-dashboard__gauge-label">目標</span>
                <span className="sales-dashboard__gauge-value">{formatYen(fiscalTarget)}</span>
              </div>
              <div className="sales-dashboard__gauge-line">
                <span className="sales-dashboard__gauge-label">差額</span>
                <span
                  className={
                    'sales-dashboard__gauge-value ' +
                    (kpis.fiscalRevenue >= fiscalTarget
                      ? 'sales-dashboard__gauge-value--ok'
                      : 'sales-dashboard__gauge-value--warn')
                  }
                >
                  {formatYen(kpis.fiscalRevenue - fiscalTarget)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="sales-dashboard__chart-card sales-dashboard__chart-card--wide">
          <h3 className="sales-dashboard__chart-title">月別売上推移</h3>
          <MonthlyRevenueChart
            monthlyRevenue={kpis.monthlyRevenueByMonth}
            monthlyTargets={monthlyTargets}
            currentMonth={currentMonth.monthNumber}
          />
        </div>
      </div>

      {/* KPI タイル (2個: 支援中クライアント / 営業中案件) */}
      <div className="sales-dashboard__kpi-grid sales-dashboard__kpi-grid--minimal">
        <div className="kpi-tile">
          <div className="kpi-tile__label">支援中クライアント</div>
          <div className="kpi-tile__value">
            {tabStats.supporting.clientIds.size}<span className="kpi-tile__unit">社</span>
          </div>
          <div className="kpi-tile__hint">受注・支援中の案件を持つ</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-tile__label">営業中案件</div>
          <div className="kpi-tile__value">
            {tabStats.selling.count}<span className="kpi-tile__unit">件</span>
          </div>
          <div className="kpi-tile__hint">受注前のすべての案件</div>
        </div>
      </div>

      {/* 個人別目標達成率 */}
      <div className="sales-dashboard__user-section">
        <h3 className="sales-dashboard__chart-title">個人別 目標達成率</h3>
        <UserProgressList
          userRevenues={userRevenues}
          userFiscalTargets={userFiscalTargets}
        />
      </div>

      {/* パイプライン (営業ヨミ) - タブ式 */}
      <div className="sales-dashboard__pipeline">
        <div className="sales-dashboard__pipeline-header">
          <h2 className="sales-dashboard__section-title">営業ヨミ管理 (パイプライン)</h2>
          <div className="sales-dashboard__tabs">
            <button
              type="button"
              className={
                'sales-dashboard__tab' +
                (activeTab === 'selling' ? ' sales-dashboard__tab--active' : '')
              }
              onClick={() => setActiveTab('selling')}
            >
              営業中 <span className="sales-dashboard__tab-count">{tabStats.selling.count}</span>
            </button>
            <button
              type="button"
              className={
                'sales-dashboard__tab' +
                (activeTab === 'supporting' ? ' sales-dashboard__tab--active' : '')
              }
              onClick={() => setActiveTab('supporting')}
            >
              支援中 <span className="sales-dashboard__tab-count">{tabStats.supporting.count}</span>
            </button>
            <button
              type="button"
              className={
                'sales-dashboard__tab' +
                (activeTab === 'ended' ? ' sales-dashboard__tab--active' : '')
              }
              onClick={() => setActiveTab('ended')}
            >
              終了 <span className="sales-dashboard__tab-count">{tabStats.ended.count}</span>
            </button>
          </div>
        </div>

        {(() => {
          // activeTab に該当する期内案件だけ抽出
          const filteredDeals = periodDeals.filter(
            (d) => getTabCategory(d.status) === activeTab
          );
          if (filteredDeals.length === 0) {
            return (
              <p className="sales-dashboard__mute">
                {activeTab === 'selling' && !isViewingCurrentPeriod
                  ? '営業中案件は現在期のみ表示されます'
                  : '該当案件はありません'}
              </p>
            );
          }

          // ステータスごとにグループ化
          const byStatus = new Map<DealStatus, DealRow[]>();
          for (const d of filteredDeals) {
            const list = byStatus.get(d.status) || [];
            list.push(d);
            byStatus.set(d.status, list);
          }

          const totalAmount = filteredDeals.reduce(
            (sum, d) => sum + Number(d.sales_amount || 0),
            0
          );

          return (
            <div className="pipeline-group">
              <div className="pipeline-group__header">
                <span className="pipeline-group__stats">
                  {filteredDeals.length}件 / 合計 {formatYen(totalAmount)}
                </span>
              </div>
              {Array.from(byStatus.entries()).map(([status, list]) => {
                const expandKey = `${activeTab}-${status}`;
                const isExpanded = expandedStatuses.has(expandKey);
                const showList = isExpanded ? list : list.slice(0, 10);
                return (
                <div key={status} className="pipeline-status">
                  <div
                    className="pipeline-status__badge"
                    style={{
                      backgroundColor: DEAL_STATUS_COLORS[status].bg,
                      color: DEAL_STATUS_COLORS[status].fg,
                    }}
                  >
                    {DEAL_STATUS_LABELS[status]} ({list.length})
                  </div>
                  <ul className="pipeline-status__list">
                    {showList.map((d) => {
                      const clientObj = Array.isArray(d.client)
                        ? d.client[0]
                        : d.client;
                      const clientName = clientObj?.name || '(クライアント未設定)';
                      const clientId = clientObj?.id;
                      return (
                        <li
                          key={d.id}
                          className="pipeline-deal"
                          onClick={() => {
                            if (clientId) navigate(`/sales/clients/${clientId}`);
                          }}
                        >
                          <div className="pipeline-deal__main">
                            <span className="pipeline-deal__client">{clientName}</span>
                            <span className="pipeline-deal__name">{d.deal_name || '(無名)'}</span>
                          </div>
                          <div className="pipeline-deal__amount">
                            {d.sales_amount ? formatYen(Number(d.sales_amount)) : '—'}
                          </div>
                        </li>
                      );
                    })}
                    {list.length > 10 && (
                      <li
                        className="pipeline-deal pipeline-deal--more pipeline-deal--clickable"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedStatuses((prev) => {
                            const next = new Set(prev);
                            if (next.has(expandKey)) {
                              next.delete(expandKey);
                            } else {
                              next.add(expandKey);
                            }
                            return next;
                          });
                        }}
                      >
                        {isExpanded
                          ? '▲ 折りたたむ'
                          : `▼ 他 ${list.length - 10} 件を表示`}
                      </li>
                    )}
                  </ul>
                </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* 売上目標編集モーダル */}
      <SalesTargetEditModal
        open={editOpen}
        fiscalYear={fiscalYear.fiscalYearNumber}
        fiscalYearLabel={fiscalYear.label}
        initialFiscalTarget={fiscalTarget}
        initialMonthlyTargets={monthlyTargets}
        userFiscalTargets={userFiscalTargets}
        userMonthlyTargets={userMonthlyTargets}
        isAdmin={isAdmin}
        onClose={() => setEditOpen(false)}
        onSave={saveTargets}
      />
    </div>
  );
}

export default SalesDashboardPage;
