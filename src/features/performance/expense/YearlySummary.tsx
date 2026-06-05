import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../../lib/supabase';
import { withTimeout } from '../../../lib/withTimeout';
import {
  getFiscalPeriodNumber,
  fiscalToCalendar,
  FISCAL_MONTHS,
} from '../fiscalPeriod';
import type { CompanyExpense, ExpenseCategory } from './types';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ICONS,
  EXPENSE_CATEGORY_LABELS,
  calcExclTax,
} from './types';
import './YearlySummary.css';

type TaxMode = 'incl' | 'excl';

type FiscalMonth = {
  fiscalMonthIndex: number;
  year: number;
  month: number;
  yearMonth: string;
  label: string;
};

function formatYen(n: number): string {
  if (n === 0) return '—';
  return '¥' + Math.round(Number(n || 0)).toLocaleString('ja-JP');
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
      label: `${cal.month}月`,
    };
  });
}

export function YearlySummary() {
  const today = new Date();
  const currentPeriod = getFiscalPeriodNumber(
    today.getFullYear(),
    today.getMonth() + 1
  );

  const [period, setPeriod] = useState<number>(currentPeriod);
  const [taxMode, setTaxMode] = useState<TaxMode>('incl');
  const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fiscalMonths = useMemo(
    () => getFiscalMonthsForPeriod(period),
    [period]
  );

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      const supabase = getSupabase();
      if (!supabase) {
        if (alive) {
          setError('Supabase未設定');
          setLoading(false);
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
          'fetch yearly expenses'
        );
        if (res.error) throw res.error;

        const rows = (res.data || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (r: any): CompanyExpense => ({
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
          })
        );

        if (alive) {
          setExpenses(rows);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setError((e as any).message || 'データ取得エラー');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [period, fiscalMonths]);

  const matrix = useMemo(() => {
    const m = new Map<ExpenseCategory, Map<string, number>>();
    for (const cat of EXPENSE_CATEGORIES) {
      m.set(cat, new Map());
    }
    for (const e of expenses) {
      const amount =
        taxMode === 'incl'
          ? e.amount_incl_tax
          : calcExclTax(e.amount_incl_tax, e.tax_rate);
      const catMap = m.get(e.category as ExpenseCategory);
      if (!catMap) continue;
      const prev = catMap.get(e.year_month) || 0;
      catMap.set(e.year_month, prev + amount);
    }
    return m;
  }, [expenses, taxMode]);

  function catTotal(cat: ExpenseCategory): number {
    const catMap = matrix.get(cat);
    if (!catMap) return 0;
    let sum = 0;
    for (const v of catMap.values()) sum += v;
    return sum;
  }

  function monthTotal(ym: string): number {
    let sum = 0;
    for (const cat of EXPENSE_CATEGORIES) {
      const catMap = matrix.get(cat);
      if (!catMap) continue;
      sum += catMap.get(ym) || 0;
    }
    return sum;
  }

  const grandTotal = useMemo(() => {
    let sum = 0;
    for (const cat of EXPENSE_CATEGORIES) {
      sum += catTotal(cat);
    }
    return sum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix]);

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
    <div className="yearly-sum">
      <div className="yearly-sum__toolbar">
        <select
          className="yearly-sum__period-select"
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
        >
          {periodOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="yearly-sum__tax-toggle">
          <button
            type="button"
            className={
              'yearly-sum__tax-btn' +
              (taxMode === 'incl' ? ' yearly-sum__tax-btn--active' : '')
            }
            onClick={() => setTaxMode('incl')}
          >
            税込
          </button>
          <button
            type="button"
            className={
              'yearly-sum__tax-btn' +
              (taxMode === 'excl' ? ' yearly-sum__tax-btn--active' : '')
            }
            onClick={() => setTaxMode('excl')}
          >
            税抜
          </button>
        </div>

        <div className="yearly-sum__grand-total">
          <span className="yearly-sum__grand-label">通期合計</span>
          <span className="yearly-sum__grand-value">
            {formatYen(grandTotal)}
          </span>
        </div>
      </div>

      {error && <div className="yearly-sum__error">エラー: {error}</div>}

      {loading ? (
        <div className="yearly-sum__loading">読み込み中...</div>
      ) : (
        <div className="yearly-sum__table-wrap">
          <table className="yearly-sum__table">
            <thead>
              <tr>
                <th className="yearly-sum__th yearly-sum__th--category">
                  カテゴリ
                </th>
                <th className="yearly-sum__th yearly-sum__th--num yearly-sum__th--total">
                  集計
                </th>
                {fiscalMonths.map((fm) => (
                  <th
                    key={fm.yearMonth}
                    className="yearly-sum__th yearly-sum__th--num"
                  >
                    {fm.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EXPENSE_CATEGORIES.map((cat) => {
                const tot = catTotal(cat);
                if (tot === 0) return null;
                return (
                  <tr key={cat}>
                    <td className="yearly-sum__td yearly-sum__td--category">
                      <span className="yearly-sum__cat-icon">
                        {EXPENSE_CATEGORY_ICONS[cat]}
                      </span>
                      {EXPENSE_CATEGORY_LABELS[cat]}
                    </td>
                    <td className="yearly-sum__td yearly-sum__td--num yearly-sum__td--total">
                      {formatYen(tot)}
                    </td>
                    {fiscalMonths.map((fm) => {
                      const v = matrix.get(cat)?.get(fm.yearMonth) || 0;
                      return (
                        <td
                          key={fm.yearMonth}
                          className={
                            'yearly-sum__td yearly-sum__td--num' +
                            (v === 0 ? ' yearly-sum__td--zero' : '')
                          }
                        >
                          {formatYen(v)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="yearly-sum__foot-row">
                <td className="yearly-sum__td yearly-sum__td--category yearly-sum__td--foot">
                  経費合計 ({taxMode === 'incl' ? '税込' : '税抜'})
                </td>
                <td className="yearly-sum__td yearly-sum__td--num yearly-sum__td--total yearly-sum__td--foot">
                  {formatYen(grandTotal)}
                </td>
                {fiscalMonths.map((fm) => {
                  const v = monthTotal(fm.yearMonth);
                  return (
                    <td
                      key={fm.yearMonth}
                      className={
                        'yearly-sum__td yearly-sum__td--num yearly-sum__td--foot' +
                        (v === 0 ? ' yearly-sum__td--zero' : '')
                      }
                    >
                      {formatYen(v)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>

          {expenses.length === 0 && (
            <div className="yearly-sum__empty">
              この期の経費はまだ登録されていません。「📋 月次明細」タブから登録してください。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default YearlySummary;
