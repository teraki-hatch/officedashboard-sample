import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase';
import { withTimeout } from '../../../lib/withTimeout';
import type { CompanyExpense, ExpenseInput } from './types';

/**
 * 指定月の経費明細をすべて取得
 */
export function useCompanyExpenses(yearMonth: string | null) {
  const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!yearMonth) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = getSupabase();
    if (!supabase) {
      setError('Supabase未設定');
      setLoading(false);
      return;
    }

    try {
      const res = await withTimeout(
        supabase
          .from('company_expenses')
          .select('*')
          .eq('year_month', yearMonth)
          .order('category', { ascending: true })
          .order('created_at', { ascending: true }),
        10000,
        'fetch company expenses'
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

      setExpenses(rows);
      setLoading(false);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((e as any).message || 'データ取得エラー');
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { expenses, loading, error, reload };
}

/**
 * 経費明細を新規追加
 */
export async function createExpense(
  input: ExpenseInput
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase未設定' };

  try {
    const res = await withTimeout(
      supabase.from('company_expenses').insert({
        year_month: input.year_month,
        category: input.category,
        item_name: input.item_name,
        sub_type: input.sub_type,
        amount_incl_tax: input.amount_incl_tax,
        tax_rate: input.tax_rate,
        memo: input.memo,
        is_completed: input.is_completed,
        user_id: input.user_id,
        source: 'manual',
      }),
      15000,
      'insert expense'
    );
    if (res.error) return { error: res.error.message };
    return { ok: true };
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { error: (e as any).message || '保存エラー' };
  }
}

/**
 * 経費明細を更新
 */
export async function updateExpense(
  id: string,
  input: ExpenseInput
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase未設定' };

  try {
    const res = await withTimeout(
      supabase
        .from('company_expenses')
        .update({
          year_month: input.year_month,
          category: input.category,
          item_name: input.item_name,
          sub_type: input.sub_type,
          amount_incl_tax: input.amount_incl_tax,
          tax_rate: input.tax_rate,
          memo: input.memo,
          is_completed: input.is_completed,
          user_id: input.user_id,
        })
        .eq('id', id),
      15000,
      'update expense'
    );
    if (res.error) return { error: res.error.message };
    return { ok: true };
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { error: (e as any).message || '保存エラー' };
  }
}

/**
 * 完了フラグだけサクッと切り替え
 */
export async function toggleExpenseCompleted(
  id: string,
  isCompleted: boolean
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase未設定' };

  try {
    const res = await withTimeout(
      supabase
        .from('company_expenses')
        .update({ is_completed: isCompleted })
        .eq('id', id),
      10000,
      'toggle completed'
    );
    if (res.error) return { error: res.error.message };
    return { ok: true };
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { error: (e as any).message || '更新エラー' };
  }
}

/**
 * 経費明細を削除
 */
export async function deleteExpense(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase未設定' };

  try {
    const res = await withTimeout(
      supabase.from('company_expenses').delete().eq('id', id),
      15000,
      'delete expense'
    );
    if (res.error) return { error: res.error.message };
    return { ok: true };
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { error: (e as any).message || '削除エラー' };
  }
}
