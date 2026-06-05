import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../../lib/supabase';
import { withTimeout } from '../../../lib/withTimeout';
import { usePerformanceDealsPeriod } from '../usePerformanceDealsPeriod';
import { usePerformanceTargetsPeriod } from '../usePerformanceTargetsYear';
import {
  FISCAL_MONTHS,
  fiscalToCalendar,
  getFiscalMonthLabel,
  getFiscalPeriodNumber,
} from '../fiscalPeriod';
import {
  calculateMonthlyDataForAll,
} from '../types';
import type { CompanyExpense } from './types';
import { calcExclTax } from './types';
import './ProfitCalculation.css';

type TaxMode = 'incl' | 'excl';

type FiscalMonth = {
  fiscalMonthIndex: number;
  year: number;
  month: number;
  yearMonth: string;
  monthLabel: string;
};

function formatYen(n: number): string {
  if (n === 0) return '—';
  const sign = n < 0 ? '-' : '';
  return sign + '¥' + Math.abs(Math.round(n)).toLocaleString('ja-JP');
}

function formatPercent(rate: number): string {
  if (!isFinite(rate) || isNaN(rate)) return '—';
  return Math.round(rate * 100) + '%';
}

function getFiscalMonthsForPeriod(period: number): FiscalMonth[] {
  return FISCAL_MONTHS.map((fm) => {
    const cal = fiscalToCalendar(period, fm.fiscalMonthIndex);
    const ym = `${cal.year}-${String(cal.month).padStart(2, '0')}`;
    return {
      fiscalMonthIndex: fm.fiscalMonthIndex,
      year: cal.year,
      month: cal.month,
      yearMonth: ym,
      monthLabel: getFiscalMonthLabel(fm.fiscalMonthIndex),
    };
  });
}

export function ProfitCalculation() {
  const today = new Date();
  const currentPeriod = getFiscalPeriodNumber(
    today.getFullYear(),
    today.getMonth() + 1
  );

  const [period, setPeriod] = useState<number>(currentPeriod);
  const [taxMode, setTaxMode] = useState<TaxMode>('incl');
  const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
  const [expenseLoading, setExpenseLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fiscalMonths = useMemo(
    () => getFiscalMonthsForPeriod(period),
    [period]
  );

  // 売上データを取得 (期内12ヶ月)
  const { deals, loading: dealsLoading } = usePerformanceDealsPeriod({ period });
  const { targets } = usePerformanceTargetsPeriod({ period });

  // 売上の月別データ
  const salesMonthlyData = useMemo(() => {
    return calculateMonthlyDataForAll(deals, targets, fiscalMonths);
  }, [deals, targets, fiscalMonths]);

  // 経費を取得
  useEffect(() => {
    let alive = true;
    async function load() {
      setExpenseLoading(true);
      setError(null);

      const supabase = getSupabase();
      if (!supabase) {
        if (alive) {
          setError('Supabase未設定');
          setExpenseLoading(false);
        }
        return;
      }

      const yms = fiscalMonths.map((fm) => fm.yearMonth);

      try {
        const res = await withTimeout(
          supabase
            .from('company_expenses')
            .select('*')
            .in('year_month', yms),
          15000,
          'fetch profit expenses'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        if (res.error) throw res.error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = (res.data || []).map((r: any): CompanyExpense => ({
          id: r.id,
          year_month: r.year_month,
          category: r.category,
          item_name: r.item_name,
          sub_type: r.sub_type,
          amount_incl_tax: Number(r.amount_incl_tax || 0),
          tax_rate: Number(r.tax_rate ?? 0.1),
          memo: r.memo,
          is_completed: !!r.is_completed,
          user_id: r.user_id,
          source: r.source,
          source_id: r.source_id,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));

        if (alive) {
          setExpenses(rows);
          setExpenseLoading(false);
        }
      } catch (e) {
        if (alive) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setError((e as any).message || 'データ取得エラー');
          setExpenseLoading(false);
        }
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [period, fiscalMonths]);

  // 月別経費合計
  const expensesByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const amount =
        taxMode === 'incl'
          ? e.amount_incl_tax
          : calcExclTax(e.amount_incl_tax, e.tax_rate);
      const prev = map.get(e.year_month) || 0;
      map.set(e.year_month, prev + amount);
    }
    return map;
  }, [expenses, taxMode]);

  // 月別の売上/経費/粗利/粗利率
  const monthlyRows = useMemo(() => {
    return fiscalMonths.map((fm) => {
      const sales = salesMonthlyData.find(
        (d) => d.fiscalMonthIndex === fm.fiscalMonthIndex
      )?.sales_actual || 0;
      const expense = expensesByMonth.get(fm.yearMonth) || 0;
      const profit = sales - expense;
      const rate = sales > 0 ? profit / sales : 0;
      return { fm, sales, expense, profit, rate };
    });
  }, [fiscalMonths, salesMonthlyData, expensesByMonth]);

  // 期合計
  const periodTotal = useMemo(() => {
    let salesTotal = 0;
    let expenseTotal = 0;
    for (const r of monthlyRows) {
      salesTotal += r.sales;
      expenseTotal += r.expense;
    }
    const profitTotal = salesTotal - expenseTotal;
    const rateTotal = salesTotal > 0 ? profitTotal / salesTotal : 0;
    return {
      sales: salesTotal,
      expense: expenseTotal,
      profit: profitTotal,
      rate: rateTotal,
    };
  }, [monthlyRows]);

  const loading = dealsLoading || expenseLoading;

  const periodOptions = useMemo(() => {
    const opts: { value: number; label: string }[] = [];
    for (let i = -2; i <= 2; i++) {
      const p = currentPeriod + i;
      if (p < 1) continue;
      const startYear = p + 2019;
      opts.push({
        value: p,
        label: `第${p}期 (${startYear}/8〜${startYear + 1}/7)`,
      });
    }
    return opts;
  }, [currentPeriod]);

  return (
    <div className="profit-calc">
      <div className="profit-calc__toolbar">
        <select
          className="profit-calc__period-select"
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
        >
          {periodOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="profit-calc__tax-toggle">
          <button
            type="button"
            className={
              'profit-calc__tax-btn' +
              (taxMode === 'incl' ? ' profit-calc__tax-btn--active' : '')
            }
            onClick={() => setTaxMode('incl')}
          >
            税込
          </button>
          <button
            type="button"
            className={
              'profit-calc__tax-btn' +
              (taxMode === 'excl' ? ' profit-calc__tax-btn--active' : '')
            }
            onClick={() => setTaxMode('excl')}
          >
            税抜
          </button>
        </div>

        <div className="profit-calc__period-total">
          <div className="profit-calc__total-item">
            <span className="profit-calc__total-label">通期 営業利益</span>
            <span
              className={
                'profit-calc__total-value' +
                (periodTotal.profit < 0
                  ? ' profit-calc__total-value--negative'
                  : '')
              }
            >
              {formatYen(periodTotal.profit)}
            </span>
          </div>
          <div className="profit-calc__total-item">
            <span className="profit-calc__total-label">利益率</span>
            <span
              className={
                'profit-calc__total-value' +
                (periodTotal.rate < 0
                  ? ' profit-calc__total-value--negative'
                  : '')
              }
            >
              {formatPercent(periodTotal.rate)}
            </span>
          </div>
        </div>
      </div>

      {error && <div className="profit-calc__error">エラー: {error}</div>}

      {loading ? (
        <div className="profit-calc__loading">読み込み中...</div>
      ) : (
        <div className="profit-calc__table-wrap">
          <table className="profit-calc__table">
            <thead>
              <tr>
                <th className="profit-calc__th profit-calc__th--label">
                  項目
                </th>
                <th className="profit-calc__th profit-calc__th--num profit-calc__th--total">
                  期合計
                </th>
                {fiscalMonths.map((fm) => (
                  <th
                    key={fm.yearMonth}
                    className="profit-calc__th profit-calc__th--num"
                  >
                    {fm.monthLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 売上行 */}
              <tr>
                <td className="profit-calc__td profit-calc__td--label">
                  売上
                </td>
                <td className="profit-calc__td profit-calc__td--num profit-calc__td--total">
                  {formatYen(periodTotal.sales)}
                </td>
                {monthlyRows.map((r) => (
                  <td
                    key={r.fm.yearMonth}
                    className="profit-calc__td profit-calc__td--num"
                  >
                    {formatYen(r.sales)}
                  </td>
                ))}
              </tr>

              {/* 経費行 */}
              <tr>
                <td className="profit-calc__td profit-calc__td--label">
                  経費
                </td>
                <td className="profit-calc__td profit-calc__td--num profit-calc__td--total">
                  {formatYen(periodTotal.expense)}
                </td>
                {monthlyRows.map((r) => (
                  <td
                    key={r.fm.yearMonth}
                    className="profit-calc__td profit-calc__td--num"
                  >
                    {formatYen(r.expense)}
                  </td>
                ))}
              </tr>

              {/* 営業利益行 (太字) */}
              <tr className="profit-calc__row-profit">
                <td className="profit-calc__td profit-calc__td--label profit-calc__td--strong">
                  営業利益
                </td>
                <td
                  className={
                    'profit-calc__td profit-calc__td--num profit-calc__td--total profit-calc__td--strong' +
                    (periodTotal.profit < 0
                      ? ' profit-calc__td--negative'
                      : '')
                  }
                >
                  {formatYen(periodTotal.profit)}
                </td>
                {monthlyRows.map((r) => (
                  <td
                    key={r.fm.yearMonth}
                    className={
                      'profit-calc__td profit-calc__td--num profit-calc__td--strong' +
                      (r.profit < 0 ? ' profit-calc__td--negative' : '')
                    }
                  >
                    {formatYen(r.profit)}
                  </td>
                ))}
              </tr>

              {/* 利益率行 */}
              <tr>
                <td className="profit-calc__td profit-calc__td--label">
                  利益率
                </td>
                <td
                  className={
                    'profit-calc__td profit-calc__td--num profit-calc__td--total' +
                    (periodTotal.rate < 0
                      ? ' profit-calc__td--negative'
                      : '')
                  }
                >
                  {formatPercent(periodTotal.rate)}
                </td>
                {monthlyRows.map((r) => (
                  <td
                    key={r.fm.yearMonth}
                    className={
                      'profit-calc__td profit-calc__td--num' +
                      (r.rate < 0 ? ' profit-calc__td--negative' : '')
                    }
                  >
                    {formatPercent(r.rate)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          <div className="profit-calc__note">
            営業利益 = 売上 - 経費。売上は業績管理タブの「全社の業績」と同じ計算。経費は「月次明細」「通期サマリー」と同じ。
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfitCalculation;
