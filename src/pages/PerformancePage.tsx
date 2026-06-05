import { useState } from 'react';
import { useAppUser } from '../lib/useAppUser';
import { MyPerformanceTab } from '../features/performance/MyPerformanceTab';
import { AllPerformanceTab } from '../features/performance/AllPerformanceTab';
import { CompanyExpensesTab } from '../features/performance/CompanyExpensesTab';
import { TargetModal } from '../features/performance/TargetModal';
import { getFiscalPeriodNumber } from '../features/performance/fiscalPeriod';
import './PerformancePage.css';

type TabKey = 'self' | 'all' | 'expenses';

export function PerformancePage() {
  const { appUser } = useAppUser();
  const isAdmin = appUser?.role === 'admin';
  const authUserId = appUser?.auth_user_id || null;
  const [tab, setTab] = useState<TabKey>('self');
  const [kpiModalOpen, setKpiModalOpen] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const today = new Date();
  const initialPeriod = getFiscalPeriodNumber(
    today.getFullYear(),
    today.getMonth() + 1
  );

  function handleKpiSaved() {
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="perf-page">
      <header className="perf-page__header">
        <div className="perf-page__title-row">
          <div>
            <h1 className="perf-page__title">業績管理</h1>
            <p className="perf-page__subtitle">
              売上・成約・粗利・面談を案件単位で管理します
            </p>
          </div>
          {isAdmin && tab !== 'expenses' && (
            <button
              type="button"
              className="perf-page__kpi-btn"
              onClick={() => setKpiModalOpen(true)}
            >
              KPI設定
            </button>
          )}
        </div>
      </header>

      {isAdmin && (
        <div className="perf-page__tabs">
          <button
            type="button"
            className={
              'perf-page__tab' +
              (tab === 'self' ? ' perf-page__tab--active' : '')
            }
            onClick={() => setTab('self')}
          >
            自分の業績
          </button>
          <button
            type="button"
            className={
              'perf-page__tab' +
              (tab === 'all' ? ' perf-page__tab--active' : '')
            }
            onClick={() => setTab('all')}
          >
            全社の業績
          </button>
          <button
            type="button"
            className={
              'perf-page__tab' +
              (tab === 'expenses' ? ' perf-page__tab--active' : '')
            }
            onClick={() => setTab('expenses')}
          >
            ¥ 経費管理
          </button>
        </div>
      )}

      <div className="perf-page__body" key={reloadKey}>
        {tab === 'self' && <MyPerformanceTab />}
        {tab === 'all' && isAdmin && <AllPerformanceTab />}
        {tab === 'expenses' && isAdmin && <CompanyExpensesTab />}
      </div>

      {isAdmin && (
        <TargetModal
          open={kpiModalOpen}
          initialPeriod={initialPeriod}
          authUserId={authUserId}
          onClose={() => setKpiModalOpen(false)}
          onSaved={handleKpiSaved}
        />
      )}
    </div>
  );
}

export default PerformancePage;
