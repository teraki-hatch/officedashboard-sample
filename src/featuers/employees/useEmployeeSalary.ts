import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { SalaryRecord, SalaryInput } from './types';

type UseEmployeeSalaryHistoryResult = {
  records: SalaryRecord[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * 注意: employee_salary_master.user_id は auth.users.id を参照する。
 * このフックを呼ぶ際の userId は users.auth_user_id の値を渡すこと。
 */
export function useEmployeeSalaryHistory(
  userId: string | null
): UseEmployeeSalaryHistoryResult {
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    if (!userId) {
      setRecords([]);
      setLoading(false);
      return;
    }

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

      try {
        const res = await withTimeout(
          supabase
            .from('employee_salary_master')
            .select('*')
            .eq('user_id', userId)
            .order('effective_from', { ascending: false }),
          15000,
          'employee_salary_master fetch'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        if (res.error) throw res.error;

        const rows = (res.data || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (r: any): SalaryRecord => ({
            id: r.id,
            user_id: r.user_id,
            effective_from: r.effective_from,
            effective_to: r.effective_to,
            base_salary: Number(r.base_salary || 0),
            hourly_wage: Number(r.hourly_wage || 0),
            overtime_rate: Number(r.overtime_rate || 1.25),
            fixed_allowances: Array.isArray(r.fixed_allowances)
              ? r.fixed_allowances
              : [],
            memo: r.memo,
            created_at: r.created_at,
            updated_at: r.updated_at,
          })
        );

        if (alive) {
          setRecords(rows);
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
  }, [userId, reloadKey]);

  return {
    records,
    loading,
    error,
    reload: () => setReloadKey((k) => k + 1),
  };
}

function subOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ========== company_expenses への自動展開ヘルパー ==========

// ユーザー名取得 (item_name 生成用、auth_user_id で検索)
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

// 月リスト生成: effective_from から effective_to or (今月+12ヶ月) まで
function generateYearMonths(
  effectiveFrom: string,
  effectiveTo: string | null
): string[] {
  const fromDate = new Date(effectiveFrom + 'T00:00:00Z');
  fromDate.setUTCDate(1);

  let toDate: Date;
  if (effectiveTo) {
    toDate = new Date(effectiveTo + 'T00:00:00Z');
    toDate.setUTCDate(1);
  } else {
    // NULL の場合は今月+12ヶ月
    const now = new Date();
    toDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 12, 1));
  }

  const result: string[] = [];
  const current = new Date(fromDate);
  while (current <= toDate) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    result.push(`${y}-${m}`);
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return result;
}

// 給与マスタの amount 合計 (基本給 + 固定手当)
function calcSalaryAmount(input: SalaryInput): number {
  const base = Number(input.base_salary || 0);
  const allowances = (input.fixed_allowances || []).reduce(
    (sum, a) => sum + Number(a.amount || 0),
    0
  );
  return base + allowances;
}

// company_expenses に給与レコードを展開
async function expandSalaryToCompanyExpenses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  salaryId: string,
  userAuthId: string,
  input: SalaryInput
): Promise<void> {
  // 基本給が0なら展開しない (時給制レコード)
  if (Number(input.base_salary || 0) <= 0) {
    return;
  }

  const amount = calcSalaryAmount(input);
  const userName = await fetchUserName(supabase, userAuthId);
  const itemName = `${userName} 給与`;
  const months = generateYearMonths(input.effective_from, input.effective_to);

  // 1. このsalaryIdに紐づく既存のcompany_expensesを全削除
  await withTimeout(
    supabase
      .from('company_expenses')
      .delete()
      .eq('source', 'salary_master')
      .eq('source_id', salaryId),
    10000,
    'company_expenses delete old salary records'
  );

  // 2. 新しい月リストでINSERT (バルクインサート)
  if (months.length === 0) return;

  const rows = months.map((ym) => ({
    year_month: ym,
    category: 'jinkenhi',
    item_name: itemName,
    sub_type: '給与賃金',
    amount_incl_tax: amount,
    tax_rate: 0,
    memo: input.memo,
    is_completed: false,
    user_id: userAuthId,
    source: 'salary_master',
    source_id: salaryId,
  }));

  const insertRes = await withTimeout(
    supabase.from('company_expenses').insert(rows),
    15000,
    'company_expenses bulk insert salary'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  if (insertRes.error) {
    logger.log(
      'company_expenses salary expand error (ignored):',
      insertRes.error.message
    );
  }
}

// ========== 公開API ==========

type CreateResult = { id: string } | { error: string };

/**
 * 注意: userId には users.auth_user_id を渡すこと。
 */
export async function createSalaryRecord(
  userId: string,
  input: SalaryInput
): Promise<CreateResult> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase未設定' };

  // 既存の effective_to=NULL レコードを締める
  const closeRes = await withTimeout(
    supabase
      .from('employee_salary_master')
      .update({
        effective_to: subOneDay(input.effective_from),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .is('effective_to', null),
    10000,
    'employee_salary_master close existing'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
  if (closeRes.error) {
    return { error: closeRes.error.message };
  }

  // 新規追加
  const insertRes = await withTimeout(
    supabase
      .from('employee_salary_master')
      .insert({
        user_id: userId,
        effective_from: input.effective_from,
        effective_to: input.effective_to,
        base_salary: input.base_salary,
        hourly_wage: input.hourly_wage,
        overtime_rate: input.overtime_rate,
        fixed_allowances: input.fixed_allowances,
        memo: input.memo,
      })
      .select('id')
      .single(),
    10000,
    'employee_salary_master insert'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  if (insertRes.error) {
    return { error: insertRes.error.message };
  }

  const newId = insertRes.data?.id || '';

  // company_expenses に展開
  if (newId) {
    await expandSalaryToCompanyExpenses(supabase, newId, userId, input);
  }

  // 締めた既存レコードがあれば、それも再展開する必要あり
  // (effective_to が変わったので)
  // → 簡単のため、このユーザーの全給与レコードを再展開
  await reexpandAllSalariesForUser(supabase, userId);

  return { id: newId };
}

type UpdateResult = { ok: true } | { error: string };

export async function updateSalaryRecord(
  recordId: string,
  input: SalaryInput
): Promise<UpdateResult> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase未設定' };

  // user_idを取得しておく
  const fetchRes = await withTimeout(
    supabase
      .from('employee_salary_master')
      .select('user_id')
      .eq('id', recordId)
      .maybeSingle(),
    5000,
    'employee_salary_master fetch user_id'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  if (fetchRes.error) {
    return { error: fetchRes.error.message };
  }
  const userAuthId = fetchRes.data?.user_id;

  const res = await withTimeout(
    supabase
      .from('employee_salary_master')
      .update({
        effective_from: input.effective_from,
        effective_to: input.effective_to,
        base_salary: input.base_salary,
        hourly_wage: input.hourly_wage,
        overtime_rate: input.overtime_rate,
        fixed_allowances: input.fixed_allowances,
        memo: input.memo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recordId),
    10000,
    'employee_salary_master update'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  if (res.error) {
    return { error: res.error.message };
  }

  // company_expenses 再展開
  if (userAuthId) {
    await expandSalaryToCompanyExpenses(supabase, recordId, userAuthId, input);
  }

  return { ok: true };
}

type DeleteResult = { ok: true } | { error: string };

export async function deleteSalaryRecord(
  recordId: string
): Promise<DeleteResult> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase未設定' };

  // 関連する company_expenses も削除
  await withTimeout(
    supabase
      .from('company_expenses')
      .delete()
      .eq('source', 'salary_master')
      .eq('source_id', recordId),
    10000,
    'company_expenses delete salary cascade'
  );

  const res = await withTimeout(
    supabase.from('employee_salary_master').delete().eq('id', recordId),
    10000,
    'employee_salary_master delete'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  if (res.error) {
    return { error: res.error.message };
  }
  return { ok: true };
}

// ユーザーの全給与レコードを再展開 (effective_to 変更時の整合性確保用)
async function reexpandAllSalariesForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userAuthId: string
): Promise<void> {
  const res = await withTimeout(
    supabase
      .from('employee_salary_master')
      .select('*')
      .eq('user_id', userAuthId),
    10000,
    'employee_salary_master fetch all for reexpand'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  if (res.error || !res.data) return;

  for (const r of res.data) {
    const input: SalaryInput = {
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      base_salary: Number(r.base_salary || 0),
      hourly_wage: Number(r.hourly_wage || 0),
      overtime_rate: Number(r.overtime_rate || 1.25),
      fixed_allowances: Array.isArray(r.fixed_allowances)
        ? r.fixed_allowances
        : [],
      memo: r.memo,
    };
    await expandSalaryToCompanyExpenses(supabase, r.id, userAuthId, input);
  }
}
