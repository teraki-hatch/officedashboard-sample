import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import type { InvoiceFull, InvoiceItemInput, InvoiceStatus } from './types';

export function useInvoice(invoiceId: string | undefined) {
  const [invoice, setInvoice] = useState<InvoiceFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    if (!supabase) {
      setError('Supabase クライアントが初期化されていません');
      setLoading(false);
      return;
    }
    const { data, error: err } = await supabase
      .from('invoices')
      .select(
        `*,
        client:clients(id, name, short_name, client_code, address, phone, email, contact_person),
        items:invoice_items(*)`
      )
      .eq('id', invoiceId)
      .single();
    if (err) {
      setError(err.message);
      setInvoice(null);
    } else {
      const raw = data as any;
      // items を sort_order でソート
      if (raw?.items) {
        raw.items.sort((a: any, b: any) => a.sort_order - b.sort_order);
      }
      setInvoice(raw as InvoiceFull);
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  return { invoice, loading, error, reload: load };
}

/** 明細から税抜小計・消費税・税込合計を再計算 */
export function recalcAmounts(items: InvoiceItemInput[]): {
  subtotal_10: number;
  subtotal_8: number;
  tax_10: number;
  tax_8: number;
  total_amount: number;
} {
  let s10 = 0;
  let s8 = 0;
  for (const it of items) {
    const amt = Math.floor(it.unit_price * it.quantity);
    if (it.tax_rate === 8) s8 += amt;
    else s10 += amt;
  }
  const t10 = Math.floor(s10 * 0.1);
  const t8 = Math.floor(s8 * 0.08);
  return {
    subtotal_10: s10,
    subtotal_8: s8,
    tax_10: t10,
    tax_8: t8,
    total_amount: s10 + s8 + t10 + t8,
  };
}

/** 請求書ヘッダー + 明細をまとめて保存 */
export async function saveInvoice(
  invoiceId: string,
  patch: {
    issue_date?: string;
    due_date?: string;
    notes?: string | null;
    invoice_number?: string;
  },
  items: InvoiceItemInput[]
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase クライアント未初期化' };

  const totals = recalcAmounts(items);

  // 1. ヘッダー更新
  const { error: updErr } = await supabase
    .from('invoices')
    .update({
      ...patch,
      ...totals,
    })
    .eq('id', invoiceId);
  if (updErr) return { error: updErr.message };

  // 2. 既存明細を全削除して再挿入(シンプル方式)
  const { error: delErr } = await supabase
    .from('invoice_items')
    .delete()
    .eq('invoice_id', invoiceId);
  if (delErr) return { error: delErr.message };

  const rows = items.map((it, idx) => ({
    invoice_id: invoiceId,
    deal_id: it.deal_id || null,
    description: it.description,
    tax_rate: it.tax_rate,
    unit_price: it.unit_price,
    quantity: it.quantity,
    amount: Math.floor(it.unit_price * it.quantity),
    sort_order: it.sort_order ?? idx,
  }));
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('invoice_items').insert(rows);
    if (insErr) return { error: insErr.message };
  }

  return { ok: true };
}

/** ステータス変更 */
export async function updateInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus,
  paidDate?: string | null
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase クライアント未初期化' };

  const patch: any = { status };
  if (status === 'paid') {
    patch.paid_date = paidDate || new Date().toISOString().slice(0, 10);
  } else if (status === 'draft' || status === 'issued') {
    patch.paid_date = null;
  }

  const { error } = await supabase.from('invoices').update(patch).eq('id', invoiceId);
  if (error) return { error: error.message };
  return { ok: true };
}

/** 削除 */
export async function deleteInvoice(invoiceId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase クライアント未初期化' };
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
  if (error) return { error: error.message };
  return { ok: true };
}
