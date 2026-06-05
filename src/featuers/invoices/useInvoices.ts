import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import type { InvoiceWithClient, InvoiceStatus } from './types';

/**
 * 月末日を返す ('YYYY-MM-01' → 'YYYY-MM-末日')
 */
function getMonthEndDate(monthStart: string): string {
  const d = new Date(monthStart);
  // 翌月の0日 = 当月末日
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, '0');
  const dd = String(end.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 翌月末日を返す
 */
function getNextMonthEndDate(monthStart: string): string {
  const d = new Date(monthStart);
  const end = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, '0');
  const dd = String(end.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 請求書一覧を取得する Hook
 */
export function useInvoices(opts: {
  billingMonth?: string;       // 'YYYY-MM-01' 指定で月絞り込み
  status?: InvoiceStatus;
}) {
  const [invoices, setInvoices] = useState<InvoiceWithClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    if (!supabase) {
      setError('Supabase クライアントが初期化されていません');
      setLoading(false);
      return;
    }
    let query = supabase
      .from('invoices')
      .select(
        `*, client:clients(id, name, short_name, client_code)`
      )
      .order('billing_month', { ascending: false })
      .order('invoice_number', { ascending: true });

    if (opts.billingMonth) {
      query = query.eq('billing_month', opts.billingMonth);
    }
    if (opts.status) {
      query = query.eq('status', opts.status);
    }
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setInvoices([]);
    } else {
      setInvoices((data as unknown as InvoiceWithClient[]) || []);
    }
    setLoading(false);
  }, [opts.billingMonth, opts.status]);

  useEffect(() => {
    load();
  }, [load]);

  return { invoices, loading, error, reload: load };
}

/**
 * 指定月の業績案件から請求書を一括生成
 * 同月+同クライアントの請求書が既にあればスキップ
 *
 * @param billingMonth 'YYYY-MM-01'
 * @returns { created, skipped, errors }
 */
export async function generateMonthlyInvoices(billingMonth: string): Promise<{
  created: number;
  skipped: number;
  errors: string[];
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { created: 0, skipped: 0, errors: ['Supabase クライアント未初期化'] };
  }

  const monthEnd = getMonthEndDate(billingMonth);
  const dueDate = getNextMonthEndDate(billingMonth);

  // 1. 既存の請求書 (この月) を取得して、二重生成を防ぐ
  const { data: existing, error: existingErr } = await supabase
    .from('invoices')
    .select('client_id')
    .eq('billing_month', billingMonth);
  if (existingErr) {
    return { created: 0, skipped: 0, errors: [existingErr.message] };
  }
  const existingClientIds = new Set((existing || []).map((r: any) => r.client_id));

  // 2. 対象案件を取得 (closed_date <= 月末 AND (terminated_date IS NULL OR terminated_date > 月末))
  //    かつ client_id が紐付いている案件のみ
  const { data: deals, error: dealsErr } = await supabase
    .from('performance_deals')
    .select(`
      id,
      client_id,
      deal_name,
      monthly_amount,
      closed_date,
      terminated_date
    `)
    .lte('closed_date', monthEnd)
    .or(`terminated_date.is.null,terminated_date.gt.${monthEnd}`)
    .not('client_id', 'is', null);

  if (dealsErr) {
    return { created: 0, skipped: 0, errors: [dealsErr.message] };
  }

  if (!deals || deals.length === 0) {
    return { created: 0, skipped: 0, errors: ['対象案件がありません'] };
  }

  // 3. クライアント情報取得 (client_code が必要)
  const clientIds = Array.from(new Set(deals.map((d: any) => d.client_id)));
  const { data: clients, error: clientsErr } = await supabase
    .from('clients')
    .select('id, name, client_code')
    .in('id', clientIds);
  if (clientsErr) {
    return { created: 0, skipped: 0, errors: [clientsErr.message] };
  }
  const clientMap = new Map<string, { id: string; name: string; client_code: string | null }>();
  (clients || []).forEach((c: any) => clientMap.set(c.id, c));

  // 4. client_id ごとに deals をグループ化
  const grouped = new Map<string, any[]>();
  for (const d of deals as any[]) {
    if (!grouped.has(d.client_id)) grouped.set(d.client_id, []);
    grouped.get(d.client_id)!.push(d);
  }

  // 5. 請求書 issue_date ベース (月末日)
  const issueDate = monthEnd;
  // 請求番号フォーマット: {client_code}-{YYYYMMDD}
  const issueYYYYMMDD = issueDate.replace(/-/g, '');

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [clientId, clientDeals] of grouped) {
    if (existingClientIds.has(clientId)) {
      skipped++;
      continue;
    }
    const client = clientMap.get(clientId);
    if (!client) {
      errors.push(`クライアント情報取得失敗: ${clientId}`);
      continue;
    }
    if (!client.client_code) {
      errors.push(`${client.name}: 会社コード未設定のためスキップ`);
      skipped++;
      continue;
    }
    const invoiceNumber = `${client.client_code}-${issueYYYYMMDD}`;

    // 小計計算 (全部10%扱い)
    let subtotal10 = 0;
    for (const d of clientDeals) {
      subtotal10 += Number(d.monthly_amount) || 0;
    }
    const tax10 = Math.floor(subtotal10 * 0.1);
    const totalAmount = subtotal10 + tax10;

    // invoices INSERT
    const { data: inserted, error: insErr } = await supabase
      .from('invoices')
      .insert({
        client_id: clientId,
        invoice_number: invoiceNumber,
        billing_month: billingMonth,
        issue_date: issueDate,
        due_date: dueDate,
        subtotal_10: subtotal10,
        subtotal_8: 0,
        tax_10: tax10,
        tax_8: 0,
        total_amount: totalAmount,
        status: 'draft',
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      errors.push(`${client.name}: ${insErr?.message || '挿入失敗'}`);
      continue;
    }

    // invoice_items INSERT
    const items = clientDeals.map((d: any, idx: number) => ({
      invoice_id: (inserted as any).id,
      deal_id: d.id,
      description: d.deal_name,
      tax_rate: 10,
      unit_price: Number(d.monthly_amount) || 0,
      quantity: 1,
      amount: Number(d.monthly_amount) || 0,
      sort_order: idx,
    }));
    const { error: itemsErr } = await supabase.from('invoice_items').insert(items);
    if (itemsErr) {
      errors.push(`${client.name} 明細挿入失敗: ${itemsErr.message}`);
      continue;
    }
    created++;
  }

  return { created, skipped, errors };
}
