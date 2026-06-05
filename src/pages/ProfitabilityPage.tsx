import { useState } from 'react';
import { MonthlyProfitabilityTab } from '../features/profitability/MonthlyProfitabilityTab';
import { FiscalProfitabilityTab } from '../features/profitability/FiscalProfitabilityTab';
import '../features/profitability/ProfitabilityPage.css';

type TabKey = 'month' | 'fiscal';

export function ProfitabilityPage() {
  const [tab, setTab] = useState<TabKey>('month');

  return (
    <div className="prof-page">
      <header className="prof-page__header">
        <h1 className="prof-page__title">案件採算</h1>
        <p className="prof-page__subtitle">
          クライアントごとの売上・原価・粗利を集計します
        </p>
      </header>

      <div className="prof-page__tabs">
        <button
          type="button"
          className={
            'prof-page__tab' +
            (tab === 'month' ? ' prof-page__tab--active' : '')
          }
          onClick={() => setTab('month')}
        >
          月別
        </button>
        <button
          type="button"
          className={
            'prof-page__tab' +
            (tab === 'fiscal' ? ' prof-page__tab--active' : '')
          }
          onClick={() => setTab('fiscal')}
        >
          期サマリー
        </button>
      </div>

      <div className="prof-page__body">
        {tab === 'month' && <MonthlyProfitabilityTab />}
        {tab === 'fiscal' && <FiscalProfitabilityTab />}
      </div>
    </div>
  );
}

export default ProfitabilityPage;
