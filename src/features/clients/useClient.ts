import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import type { Client, ClientInput } from './types';

/**
 * Phase C-3: projects 廃止に伴う大改修
 *   - fetchProjectsForClient() を完全削除 (projects テーブルが無いため)
 *   - fetchTimeAggregateForClient() を client_id 直接集計に変更
 *   - ClientProject 型を削除 (もう存在しない概念)
 *   - byProject 集計は廃止 (代わりに byCategory: 作業カテゴリ別集計を追加)
 */

export function useClient(clientId: string | null) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clientId) {
      setClient(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error('Supabase クライアントが初期化されていません');
      }
      const { data, error: err } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      if (err) throw err;
      setClient(data as Client);
    } catch (e) {
      console.error('[useClient] reload error', e);
      setError(e instanceof Error ? e.message : String(e));
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { client, loading, error, reload };
}

/**
 * クライアントを新規作成 or 更新する
 * id が undefined なら新規、定義されていれば update
 */
export async function saveClient(
  input: ClientInput,
  id?: string
): Promise<{ id: string } | { error: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: 'Supabase クライアントが初期化されていません' };
    }
    const trimmedName = (input.name || '').trim();
    if (!trimmedName) {
      return { error: '会社名は必須です' };
    }
    const payload = {
      name: trimmedName,
      short_name: input.short_name?.trim() || null,
      industry: input.industry?.trim() || null,
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      website: input.website?.trim() || null,
      contact_person: input.contact_person?.trim() || null,
      contact_phone: input.contact_phone?.trim() || null,
      contact_email: input.contact_email?.trim() || null,
      notes: input.notes?.trim() || null,
      is_active: input.is_active ?? true,
    };

    if (id) {
      const { error } = await supabase
        .from('clients')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
      return { id };
    } else {
      const { data, error } = await supabase
        .from('clients')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return { id: (data as { id: string }).id };
    }
  } catch (e) {
    console.error('[saveClient] error', e);
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

/**
 * クライアントを削除する (関連する performance_deals は client_id が NULL になる)
 */
export async function deleteClient(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: 'Supabase クライアントが初期化されていません' };
    }
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error('[deleteClient] error', e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * クライアントに紐付く案件の一覧を取得
 */
export async function fetchDealsForClient(clientId: string) {
  const supabase = getSupabase();
  if (!supabase) {
    console.error('[fetchDealsForClient] supabase not configured');
    return [];
  }
  const { data, error } = await supabase
    .from('performance_deals')
    .select(`
      id,
      deal_name,
      category,
      status,
      monthly_amount,
      sales_amount,
      expected_close_date,
      closed_date,
      terminated_date,
      notes,
      assignees:performance_deal_assignees(
        id, user_id, role, allocation_ratio,
        user:users(id, name, employee_code)
      )
    `)
    .eq('client_id', clientId)
    .order('deal_name', { ascending: true });

  if (error) {
    console.error('[fetchDealsForClient] error', error);
    return [];
  }
  return data || [];
}

// ============================================================
// 派生表示用 (Phase B-1, Phase C-3 で大改修)
// ============================================================

export type ClientInvoice = {
  id: string;
  invoice_number: string;
  billing_month: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  status: string;
  paid_date: string | null;
};

/**
 * クライアントに紐付く請求書一覧を取得 (新しい順)
 */
export async function fetchInvoicesForClient(clientId: string): Promise<ClientInvoice[]> {
  const supabase = getSupabase();
  if (!supabase) {
    console.error('[fetchInvoicesForClient] supabase not configured');
    return [];
  }
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, billing_month, issue_date, due_date, total_amount, status, paid_date'
    )
    .eq('client_id', clientId)
    .order('billing_month', { ascending: false });

  if (error) {
    console.error('[fetchInvoicesForClient] error', error);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []) as any as ClientInvoice[];
}

export type ClientTimeAggregate = {
  totalHours: number;
  /** 作業カテゴリ別の集計 (Phase C-3: project別の代替) */
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    hours: number;
  }>;
  /** 月別集計 (直近12ヶ月) */
  byMonth: Array<{
    yearMonth: string; // 'YYYY-MM'
    hours: number;
  }>;
};

/**
 * クライアントの工数を集計 (client_id 直接、直近12ヶ月)
 *  Phase C-3: projects 経由を廃止、time_entries.client_id 直接参照
 *  byProject → byCategory (work_categories) に変更
 */
export async function fetchTimeAggregateForClient(
  clientId: string
): Promise<ClientTimeAggregate> {
  const empty: ClientTimeAggregate = {
    totalHours: 0,
    byCategory: [],
    byMonth: [],
  };

  const supabase = getSupabase();
  if (!supabase) {
    console.error('[fetchTimeAggregateForClient] supabase not configured');
    return empty;
  }

  // 直近12ヶ月の起点
  const now = new Date();
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)
  );
  const sinceStr = since.toISOString().slice(0, 10);

  // 1. time_entries を client_id 直接で取得 (+ category 名称 JOIN)
  const teRes = await supabase
    .from('time_entries')
    .select(
      'work_category_id, date, hours, category:work_categories(id, name)'
    )
    .eq('client_id', clientId)
    .gte('date', sinceStr);
  if (teRes.error) {
    console.error('[fetchTimeAggregateForClient] time_entries error', teRes.error);
    return empty;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (teRes.data || []) as any[];

  // 集計
  const byCategoryMap = new Map<string, { name: string; hours: number }>();
  const byMonthMap = new Map<string, number>();
  let total = 0;

  for (const e of entries) {
    const h = Number(e.hours || 0);
    total += h;

    const catId = e.work_category_id;
    // category は array で返る可能性に注意 (Supabase 仕様)
    const catObj = Array.isArray(e.category) ? e.category[0] : e.category;
    const catName = catObj?.name || '(未分類)';

    if (catId) {
      const cur = byCategoryMap.get(catId);
      if (cur) {
        cur.hours += h;
      } else {
        byCategoryMap.set(catId, { name: catName, hours: h });
      }
    }

    const ym = (e.date || '').slice(0, 7);
    if (ym) {
      byMonthMap.set(ym, (byMonthMap.get(ym) || 0) + h);
    }
  }

  const byCategory = Array.from(byCategoryMap.entries())
    .map(([cid, v]) => ({
      categoryId: cid,
      categoryName: v.name,
      hours: v.hours,
    }))
    .sort((a, b) => b.hours - a.hours);

  const byMonth = Array.from(byMonthMap.entries())
    .map(([ym, hours]) => ({ yearMonth: ym, hours }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  return {
    totalHours: total,
    byCategory,
    byMonth,
  };
}
