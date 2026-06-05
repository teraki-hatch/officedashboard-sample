import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import type { Employee, EmployeeInput } from './types';

/**
 * Phase C-3: projects 廃止に伴う大改修
 *   - fetchProjectsForEmployee() を完全削除 (projects/project_members 廃止)
 *   - EmployeeProject 型を削除
 *   - fetchTimeAggregateForEmployee() を client_id 直接集計に変更
 *     - byProject → byClient (client 別工数集計)
 */

export function useEmployeeDetail(employeeId: string | null) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!employeeId) {
      setEmployee(null);
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
          .from('users')
          .select(
            'id, auth_user_id, employee_code, name, email, role, employment_type, standard_work_hours, joined_at, resigned_at, status, hourly_rate, cost_rate, hire_date, has_leave_management, has_attendance_management, created_at, updated_at'
          )
          .eq('id', employeeId)
          .maybeSingle(),
        10000,
        'fetch employee detail'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;
      if (res.error) throw res.error;
      setEmployee((res.data as Employee) || null);
      setLoading(false);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((e as any).message || 'データ取得エラー');
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { employee, loading, error, reload };
}

/** 基本情報を保存 (UPDATE) */
export async function saveEmployee(
  id: string,
  input: EmployeeInput
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase未設定' };
  const payload: Record<string, unknown> = {
    name: input.name,
    email: input.email,
    role: input.role,
    employment_type: input.employment_type,
    standard_work_hours: input.standard_work_hours,
    joined_at: input.joined_at,
    resigned_at: input.resigned_at,
    status: input.status,
    hourly_rate: input.hourly_rate,
    cost_rate: input.cost_rate,
    has_leave_management: input.has_leave_management,
    has_attendance_management: input.has_attendance_management,
    updated_at: new Date().toISOString(),
  };
  try {
    const res = await withTimeout(
      supabase.from('users').update(payload).eq('id', id),
      15000,
      'update employee'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
    if (res.error) return { error: res.error.message };
    return { ok: true };
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { error: (e as any).message || '保存エラー' };
  }
}

// ============================================================
// 派生表示用 (Phase B-2 / Phase C-3 で大改修)
// ============================================================

export type EmployeeDeal = {
  id: string;
  deal_name: string;
  category: string;
  status: string;
  monthly_amount: number;
  closed_date: string | null;
  terminated_date: string | null;
  role: string;
  allocation_ratio: number;
  client?: { id: string; name: string } | { id: string; name: string }[] | null;
};

/** 社員が assignee として参加している案件一覧 */
export async function fetchDealsForEmployee(
  userId: string
): Promise<EmployeeDeal[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('performance_deal_assignees')
    .select(`
      role, allocation_ratio,
      deal:performance_deals(
        id, deal_name, category, status, monthly_amount,
        closed_date, terminated_date,
        client:clients(id, name)
      )
    `)
    .eq('user_id', userId);
  if (error) {
    console.error('[fetchDealsForEmployee] error', error);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[];
  // フラット化
  const result: EmployeeDeal[] = rows
    .map((r) => {
      const deal = Array.isArray(r.deal) ? r.deal[0] : r.deal;
      if (!deal) return null;
      return {
        id: deal.id,
        deal_name: deal.deal_name,
        category: deal.category,
        status: deal.status,
        monthly_amount: Number(deal.monthly_amount || 0),
        closed_date: deal.closed_date,
        terminated_date: deal.terminated_date,
        role: r.role,
        allocation_ratio: Number(r.allocation_ratio || 0),
        client: deal.client,
      } as EmployeeDeal;
    })
    .filter((d): d is EmployeeDeal => d !== null)
    .sort((a, b) => a.deal_name.localeCompare(b.deal_name));
  return result;
}

export type EmployeeTimeAggregate = {
  totalHours: number;
  byMonth: Array<{ yearMonth: string; hours: number }>;
  /** クライアント別工数集計 (Phase C-3: byProject → byClient) */
  byClient: Array<{
    clientId: string;
    clientName: string;
    isInternal: boolean;
    hours: number;
  }>;
};

/** 社員の工数集計 (直近12ヶ月) - Phase C-3: client_id 直接集計 */
export async function fetchTimeAggregateForEmployee(
  userId: string
): Promise<EmployeeTimeAggregate> {
  const empty: EmployeeTimeAggregate = {
    totalHours: 0,
    byMonth: [],
    byClient: [],
  };
  const supabase = getSupabase();
  if (!supabase) return empty;

  const now = new Date();
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)
  );
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('time_entries')
    .select(`
      client_id, date, hours,
      client:clients(id, name, is_internal)
    `)
    .eq('user_id', userId)
    .gte('date', sinceStr);

  if (error) {
    console.error('[fetchTimeAggregateForEmployee] error', error);
    return empty;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[];

  let total = 0;
  const byMonthMap = new Map<string, number>();
  const byClientMap = new Map<
    string,
    { name: string; isInternal: boolean; hours: number }
  >();

  for (const r of rows) {
    const h = Number(r.hours || 0);
    total += h;
    const ym = (r.date || '').slice(0, 7);
    if (ym) byMonthMap.set(ym, (byMonthMap.get(ym) || 0) + h);

    const cli = Array.isArray(r.client) ? r.client[0] : r.client;
    const cid = r.client_id;
    if (!cid) continue;
    const cname = cli?.name || '(不明)';
    const isInternal = Boolean(cli?.is_internal);
    const cur = byClientMap.get(cid);
    if (cur) {
      cur.hours += h;
    } else {
      byClientMap.set(cid, { name: cname, isInternal, hours: h });
    }
  }

  return {
    totalHours: total,
    byMonth: Array.from(byMonthMap.entries())
      .map(([yearMonth, hours]) => ({ yearMonth, hours }))
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)),
    byClient: Array.from(byClientMap.entries())
      .map(([clientId, v]) => ({
        clientId,
        clientName: v.name,
        isInternal: v.isInternal,
        hours: v.hours,
      }))
      .sort((a, b) => b.hours - a.hours),
  };
}

export type EmployeeExpense = {
  id: string;
  date: string;
  category_code: string;
  amount: number;
  status: string;
  memo: string | null;
};

/** 社員の経費申請 (直近12ヶ月) */
export async function fetchExpensesForEmployee(
  userId: string
): Promise<EmployeeExpense[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const now = new Date();
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)
  );
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('expense_requests')
    .select('id, date, category_code, amount, status, memo')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: false });

  if (error) {
    console.error('[fetchExpensesForEmployee] error', error);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []) as any as EmployeeExpense[];
}

export type EmployeeAttendanceSummary = {
  yearMonth: string;
  workDays: number;
  totalWorkHours: number;
};

/** 社員の月別勤怠サマリ (直近3ヶ月、daily_attendance_summaries から月集計) */
export async function fetchAttendanceForEmployee(
  userId: string
): Promise<EmployeeAttendanceSummary[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const now = new Date();
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)
  );
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('daily_attendance_summaries')
    .select('date, actual_work_hours, attendance_status, is_workday')
    .eq('user_id', userId)
    .gte('date', sinceStr);

  if (error) {
    console.error('[fetchAttendanceForEmployee] error', error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[];
  const byMonth = new Map<string, { workDays: number; totalWorkHours: number }>();

  for (const r of rows) {
    const ym = (r.date || '').slice(0, 7);
    if (!ym) continue;
    const cur = byMonth.get(ym) || { workDays: 0, totalWorkHours: 0 };
    const hours = Number(r.actual_work_hours || 0);
    if (hours > 0) cur.workDays += 1;
    cur.totalWorkHours += hours;
    byMonth.set(ym, cur);
  }

  return Array.from(byMonth.entries())
    .map(([yearMonth, v]) => ({
      yearMonth,
      workDays: v.workDays,
      totalWorkHours: v.totalWorkHours,
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

export type EmployeeLeaveBalance = {
  fiscalYear: number;
  grantedDays: number;
  carryoverDays: number;
  adjustedDays: number;
  /** 付与+繰越+調整の合計 (実質「使える総量」のおおよそ) */
  totalAvailable: number;
};

/**
 * 社員の有休残 (leave_balances から最新年度を取得)
 * 注: 消化分は leave_requests から別途集計が必要だが、
 * 今は最新の付与レコードのみ表示する簡易版。
 */
export async function fetchLeaveBalanceForEmployee(
  userId: string
): Promise<EmployeeLeaveBalance | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('leave_balances')
    .select('fiscal_year, granted_days, carryover_days, adjusted_days')
    .eq('user_id', userId)
    .order('fiscal_year', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[fetchLeaveBalanceForEmployee] error', error);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  const granted = Number(r.granted_days || 0);
  const carryover = Number(r.carryover_days || 0);
  const adjusted = Number(r.adjusted_days || 0);
  return {
    fiscalYear: Number(r.fiscal_year || 0),
    grantedDays: granted,
    carryoverDays: carryover,
    adjustedDays: adjusted,
    totalAvailable: granted + carryover + adjusted,
  };
}
