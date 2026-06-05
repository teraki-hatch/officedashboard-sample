import { useState } from 'react';
import { AnnualOverview } from './expense/AnnualOverview';
import { MonthlyExpenseDetail } from './expense/MonthlyExpenseDetail';
import './CompanyExpensesTab.css';

type SubTabKey = 'annual' | 'monthly';

export function CompanyExpensesTab() {
  const [subTab, setSubTab] = useState<SubTabKey>('annual');

  return (
    <div className="exp-tab">
      <div className="exp-tab__sub-tabs">
        <button
          type="button"
          className={
            'exp-tab__sub-tab' +
            (subTab === 'annual' ? ' exp-tab__sub-tab--active' : '')
          }
          onClick={() => setSubTab('annual')}
        >
          通期・粗利
        </button>
        <button
          type="button"
          className={
            'exp-tab__sub-tab' +
            (subTab === 'monthly' ? ' exp-tab__sub-tab--active' : '')
          }
          onClick={() => setSubTab('monthly')}
        >
          月次明細
        </button>
      </div>
      <div className="exp-tab__content">
        {subTab === 'annual' && <AnnualOverview />}
        {subTab === 'monthly' && <MonthlyExpenseDetail />}
      </div>
    </div>
  );
}

export default CompanyExpensesTab;
