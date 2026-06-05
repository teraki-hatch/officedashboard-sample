import { useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { ExpenseCategoryCode, TransportType } from './types';

/**
 * Phase C-3:
 *   projects 廃止に伴い project_id → client_id へ変更。
 *   カテゴリ business_trip → business にリネーム。
 *   trip_type (出張区分) 完全廃止。
 */

export type CreateExpenseInput = {
  user_id: string;
  date: string;
  category_code: ExpenseCategoryCode;
  amount: number;
  transport_type: TransportType | null;
  client_id: string | null;
  memo: string | null;
  receipt_url: string | null;
};

export type UpdateExpenseInput = {
  id: string;
  date: string;
  category_code: ExpenseCategoryCode;
  amount: number;
  transport_type: TransportType | null;
  client_id: string | null;
  memo: string | null;
  receipt_url: string | null;
};

type UseExpenseMutationsResult = {
  saving: boolean;
  error: string | null;
  createExpense: (input: CreateExpenseInput) => Promise<boolean>;
  updateExpense: (input: UpdateExpenseInput) => Promise<boolean>;
  deleteExpense: (id: string) => Promise<boolean>;
};

// 個人経費カテゴリ → 会社経費カテゴリのマッピング
function mapToCompanyCategory(
  code: ExpenseCategoryCode
): 'ryohi_kotsu' | 'other' {
  if (code === 'commute' || code === 'business') {
    return 'ryohi_kotsu';
  }
  return 'other';
}

function getCategoryLabel(code: ExpenseCategoryCode): string {
  if (code === 'commute') return '通勤交通費';
  if (code === 'business') return '営業販管費';
  return '立替経費';
}

function toYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

// ユーザー名取得 (item_name生成用)
async function fetchUserName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  authUserId: string
): Promise<string> {
  try {
    const res = await withTimeout(
      supabase
        .from('users')
        .select('name')
        .eq('auth_user_id', authUserId)
        .maybeSingle(),
      5000,
      'users fetch'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
    if (res.error || !res.data) return '社員';
    return res.data.name || '社員';
  } catch {
    return '社員';
  }
}

// client_id が NULL のときは社内擬似クライアントを使う
const INTERNAL_CLIENT_ID = '00000000-0000-0000-0000-000000000001';

function resolveClientId(clientId: string | null): string {
  return clientId || INTERNAL_CLIENT_ID;
}

export function useExpenseMutations(): UseExpenseMutationsResult {
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function createExpense(input: CreateExpenseInput): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      // 1. expense_requests に INSERT (returning で id を取得)
      const insertRes = await withTimeout(
        supabase
          .from('expense_requests')
          .insert({
            user_id: input.user_id,
            date: input.date,
            category_code: input.category_code,
            amount: input.amount,
            transport_type: input.transport_type,
            client_id: resolveClientId(input.client_id),
            memo: input.memo,
            receipt_url: input.receipt_url,
            status: 'approved',
          })
          .select('id')
          .single(),
        10000,
        'expense_requests insert'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

      if (insertRes.error) {
        throw insertRes.error;
      }

      const expenseId = insertRes.data?.id;
      if (!expenseId) {
        throw new Error('Failed to get expense id');
      }

      // 2. company_expenses に同時INSERT (user_id は auth_user_id を渡す)
      const userName = await fetchUserName(supabase, input.user_id);
      const itemName = `${userName} ${getCategoryLabel(input.category_code)}`;
      const subType = getCategoryLabel(input.category_code);

      const ceRes = await withTimeout(
        supabase.from('company_expenses').insert({
          year_month: toYearMonth(input.date),
          category: mapToCompanyCategory(input.category_code),
          item_name: itemName,
          sub_type: subType,
          amount_incl_tax: input.amount,
          tax_rate: 0.1,
          memo: input.memo,
          is_completed: false,
          user_id: input.user_id,
          source: 'expense_claim',
          source_id: expenseId,
        }),
        10000,
        'company_expenses insert from expense_claim'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

      if (ceRes.error) {
        logger.log(
          'company_expenses insert error (ignored):',
          ceRes.error.message
        );
      }

      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('createExpense error:', msg);
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateExpense(input: UpdateExpenseInput): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      const updateRes = await withTimeout(
        supabase
          .from('expense_requests')
          .update({
            date: input.date,
            category_code: input.category_code,
            amount: input.amount,
            transport_type: input.transport_type,
            client_id: resolveClientId(input.client_id),
            memo: input.memo,
            receipt_url: input.receipt_url,
          })
          .eq('id', input.id)
          .select('user_id')
          .single(),
        10000,
        'expense_requests update'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

      if (updateRes.error) {
        throw updateRes.error;
      }

      const userAuthId = updateRes.data?.user_id;
      const userName = userAuthId
        ? await fetchUserName(supabase, userAuthId)
        : '社員';
      const itemName = `${userName} ${getCategoryLabel(input.category_code)}`;
      const subType = getCategoryLabel(input.category_code);

      // company_expenses 側を UPDATE
      const ceUpdate = await withTimeout(
        supabase
          .from('company_expenses')
          .update({
            year_month: toYearMonth(input.date),
            category: mapToCompanyCategory(input.category_code),
            item_name: itemName,
            sub_type: subType,
            amount_incl_tax: input.amount,
            memo: input.memo,
          })
          .eq('source', 'expense_claim')
          .eq('source_id', input.id),
        10000,
        'company_expenses update from expense_claim'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

      if (ceUpdate.error) {
        logger.log(
          'company_expenses update error (ignored):',
          ceUpdate.error.message
        );
      }

      // 対応レコードが無ければ INSERT で補完
      const ceCheck = await withTimeout(
        supabase
          .from('company_expenses')
          .select('id')
          .eq('source', 'expense_claim')
          .eq('source_id', input.id)
          .maybeSingle(),
        5000,
        'company_expenses check'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

      if (!ceCheck.error && !ceCheck.data) {
        await withTimeout(
          supabase.from('company_expenses').insert({
            year_month: toYearMonth(input.date),
            category: mapToCompanyCategory(input.category_code),
            item_name: itemName,
            sub_type: subType,
            amount_incl_tax: input.amount,
            tax_rate: 0.1,
            memo: input.memo,
            is_completed: false,
            user_id: userAuthId,
            source: 'expense_claim',
            source_id: input.id,
          }),
          10000,
          'company_expenses backfill insert'
        );
      }

      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('updateExpense error:', msg);
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(id: string): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      // 1. company_expenses 側を先に削除 (cascade)
      const ceDelete = await withTimeout(
        supabase
          .from('company_expenses')
          .delete()
          .eq('source', 'expense_claim')
          .eq('source_id', id),
        10000,
        'company_expenses delete from expense_claim'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

      if (ceDelete.error) {
        logger.log(
          'company_expenses delete error (ignored):',
          ceDelete.error.message
        );
      }

      // 2. expense_requests を削除
      const delRes = await withTimeout(
        supabase.from('expense_requests').delete().eq('id', id),
        10000,
        'expense_requests delete'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

      if (delRes.error) {
        throw delRes.error;
      }

      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('deleteExpense error:', msg);
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    saving,
    error,
    createExpense,
    updateExpense,
    deleteExpense,
  };
}
