import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

/**
 * Phase C-3: projects 廃止に伴う大幅簡素化。
 *   旧: expense_requests → projects → clients (二段経由でフィルタ)
 *   新: expense_requests.client_id 直接フィルタ
 *
 * Bug fix 2026-05-29:
 *   1. category_code 'business_trip' → 'business' に修正
 *      (types.ts で Phase C-3 にリネーム済みだったが、ここだけ漏れていた)
 *   2. user_name 取得時の users 照合を auth_user_id → id に修正
 *      (expense_requests.user_id は public.users.id を参照しているため)
 */

export type BillableExpense = {
  id: string;
  date: string;
  amount: number;
  category_code: string;
  transport_type: string | null;
  trip_type: string | null;
  memo: string | null;
  user_id: string;
  user_name: string | null;
  client_id: string | null;
  client_name: string | null;
};

/**
 * 指定クライアント + 指定月 で請求対象になる経費を取得する
 *
 * 対象: category_code が 'business' (営業販管費) または 'reimbursement' (立替経費) で
 *       client_id がクライアントに一致する経費
 */
export function useBillableExpenses(opts: {
  clientId: string | null | undefined;
  billingMonth: string;
  enabled?: boolean;
}) {
  const [expenses, setExpenses] = useState<BillableExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!opts.enabled || !opts.clientId) {
      setExpenses([]);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    if (!supabase) {
      setError('Supabase クライアントが初期化されていません');
      setLoading(false);
      return;
    }

    // 月の範囲
    const start = opts.billingMonth;
    const d = new Date(start);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;

    // 1. その月の business/reimbursement 経費を client_id 直接フィルタで取得
    const { data: rawExpenses, error: expErr } = await supabase
      .from('expense_requests')
      .select(
        'id, date, amount, category_code, transport_type, trip_type, memo, user_id, client_id'
      )
      .in('category_code', ['business', 'reimbursement'])
      .eq('client_id', opts.clientId)
      .gte('date', start)
      .lt('date', nextStr);

    if (expErr) {
      setError(expErr.message);
      setExpenses([]);
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawList = (rawExpenses || []) as any[];
    if (rawList.length === 0) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    // 2. クライアント名を取得 (1回のみ、clientId に対応する name)
    let clientName: string | null = null;
    const { data: clientRow, error: cliErr } = await supabase
      .from('clients')
      .select('name')
      .eq('id', opts.clientId)
      .maybeSingle();
    if (!cliErr && clientRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientName = (clientRow as any).name ?? null;
    }

    // 3. user 情報を取得
    //    expense_requests.user_id は public.users.id を参照しているため、
    //    users.id で照合する (auth_user_id ではない)
    const userIds = Array.from(
      new Set(rawList.map((r) => r.user_id).filter(Boolean))
    );
    const userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users, error: usrErr } = await supabase
        .from('users')
        .select('id, name')
        .in('id', userIds);
      if (!usrErr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const u of (users || []) as any[]) {
          if (u.id) userMap.set(u.id, u.name);
        }
      }
    }

    // 4. 整形
    const result: BillableExpense[] = rawList.map((r) => {
      return {
        id: r.id,
        date: r.date,
        amount: Number(r.amount) || 0,
        category_code: r.category_code,
        transport_type: r.transport_type,
        trip_type: r.trip_type,
        memo: r.memo,
        user_id: r.user_id,
        user_name: userMap.get(r.user_id) || null,
        client_id: r.client_id,
        client_name: clientName,
      };
    });

    result.sort((a, b) => a.date.localeCompare(b.date));
    setExpenses(result);
    setLoading(false);
  }, [opts.clientId, opts.billingMonth, opts.enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { expenses, loading, error, reload: load };
}
