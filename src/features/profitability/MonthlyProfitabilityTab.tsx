import { useState } from 'react';
import { useProfitability } from './useProfitability';
import { ProfitabilityTable } from './ProfitabilityTable';

function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

function fmtYearMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  return `${y}年${Number(m)}月`;
}

export function MonthlyProfitabilityTab() {
  const [yearMonth, setYearMonth] = useState<string>(getCurrentYearMonth());
  const { rows, loading, error } = useProfitability({
    type: 'month',
    yearMonth,
  });

  return (
    <div className="prof-tab">
      <div className="prof-tab__controls">
        <button
          type="button"
          className="prof-tab__nav-btn"
          onClick={() => setYearMonth((ym) => shiftYearMonth(ym, -1))}
          aria-label="前月"
        >
          ‹
        </button>
        <div className="prof-tab__period-label">
          {fmtYearMonthLabel(yearMonth)}
        </div>
        <button
          type="button"
          className="prof-tab__nav-btn"
          onClick={() => setYearMonth((ym) => shiftYearMonth(ym, 1))}
          aria-label="翌月"
        >
          ›
        </button>
        <button
          type="button"
          className="prof-tab__today-btn"
          onClick={() => setYearMonth(getCurrentYearMonth())}
        >
          今月
        </button>
      </div>
      <ProfitabilityTable rows={rows} loading={loading} error={error} />
    </div>
  );
}
