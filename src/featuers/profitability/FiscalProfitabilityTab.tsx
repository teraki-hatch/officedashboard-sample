import { useState } from 'react';
import { useProfitability } from './useProfitability';
import { ProfitabilityTable } from './ProfitabilityTable';
import {
  getFiscalPeriodNumber,
  getFiscalPeriodLabel,
} from '../performance/fiscalPeriod';

function getCurrentFiscalPeriod(): number {
  const now = new Date();
  return getFiscalPeriodNumber(now.getFullYear(), now.getMonth() + 1);
}

export function FiscalProfitabilityTab() {
  const [period, setPeriod] = useState<number>(getCurrentFiscalPeriod());
  const { rows, loading, error } = useProfitability({
    type: 'fiscal',
    fiscalPeriod: period,
  });

  const currentPeriod = getCurrentFiscalPeriod();

  return (
    <div className="prof-tab">
      <div className="prof-tab__controls">
        <button
          type="button"
          className="prof-tab__nav-btn"
          onClick={() => setPeriod((p) => p - 1)}
          aria-label="前期"
        >
          ‹
        </button>
        <div className="prof-tab__period-label">
          {getFiscalPeriodLabel(period)}
        </div>
        <button
          type="button"
          className="prof-tab__nav-btn"
          onClick={() => setPeriod((p) => p + 1)}
          aria-label="次期"
        >
          ›
        </button>
        <button
          type="button"
          className="prof-tab__today-btn"
          onClick={() => setPeriod(currentPeriod)}
        >
          今期
        </button>
      </div>
      <ProfitabilityTable rows={rows} loading={loading} error={error} />
    </div>
  );
}
