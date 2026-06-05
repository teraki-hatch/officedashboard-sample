import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

/**
 * Bug fix 2026-05-29:
 *   PM全員が「確認した」を押した瞬間に、invoice.status を draft → issued に自動遷移する。
 *   PMの誰かが取り消した場合は逆に issued → draft に戻す。
 *   ただし status が paid / cancelled の場合は自動遷移しない (誤操作防止)。
 */

export type Confirmer = {
  user_id: string;
  user_name: string;
  confirmed_at: string | null;     // null = まだ確認していない
};

/**
 * 請求書に紐づく業績案件の担当者一覧と、各人の確認状況を返す
 *
 * 1. invoice_items の deal_id を集約
 * 2. それらの performance_deal_assignees から user_id を集める (重複排除)
 * 3. invoice_confirmations と LEFT JOIN して、確認状況を返す
 */
export function useInvoiceConfirmations(invoiceId: string | undefined) {
  const [confirmers, setConfirmers] = useState<Confirmer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

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

    // ログインユーザーの users.id を取得 (users.auth_user_id = auth.uid())
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData?.user?.id;
    if (authUserId) {
      const { data: meRow } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMyUserId((meRow as any)?.id || null);
    }

    // 1. 明細の deal_id を集める
    const { data: items, error: itemsErr } = await supabase
      .from('invoice_items')
      .select('deal_id')
      .eq('invoice_id', invoiceId)
      .not('deal_id', 'is', null);
    if (itemsErr) {
      setError(itemsErr.message);
      setLoading(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dealIds = Array.from(new Set(((items || []) as any[]).map((r) => r.deal_id))).filter(Boolean);

    if (dealIds.length === 0) {
      setConfirmers([]);
      setLoading(false);
      return;
    }

    // 2. 担当者を集める
    const { data: assignees, error: asgnErr } = await supabase
      .from('performance_deal_assignees')
      .select('user_id, user:users(id, name)')
      .in('deal_id', dealIds);
    if (asgnErr) {
      setError(asgnErr.message);
      setLoading(false);
      return;
    }

    const userMap = new Map<string, string>();  // user_id -> name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (assignees || []) as any[]) {
      const u = Array.isArray(a.user) ? a.user[0] : a.user;
      if (u?.id && !userMap.has(u.id)) {
        userMap.set(u.id, u.name || '(名前未設定)');
      }
    }

    // 3. 既存の確認レコードを取得
    const { data: confirms, error: confErr } = await supabase
      .from('invoice_confirmations')
      .select('user_id, confirmed_at')
      .eq('invoice_id', invoiceId);
    if (confErr) {
      setError(confErr.message);
      setLoading(false);
      return;
    }
    const confirmMap = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (confirms || []) as any[]) {
      confirmMap.set(c.user_id, c.confirmed_at);
    }

    // 4. 担当者一覧 + 各人の確認状況
    const list: Confirmer[] = Array.from(userMap.entries()).map(([userId, name]) => ({
      user_id: userId,
      user_name: name,
      confirmed_at: confirmMap.get(userId) || null,
    }));
    list.sort((a, b) => a.user_name.localeCompare(b.user_name));

    setConfirmers(list);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  return { confirmers, myUserId, loading, error, reload: load };
}

// ===== ヘルパー: 請求書に紐づく案件のPMを取得 =====
/**
 * 請求書に紐づく業績案件 (invoice_items.deal_id) のうち、PM (role='pm') の user_id を返す
 */
async function fetchPmUserIds(invoiceId: string): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  // invoice_items の deal_id 一覧
  const { data: items, error: itemsErr } = await supabase
    .from('invoice_items')
    .select('deal_id')
    .eq('invoice_id', invoiceId)
    .not('deal_id', 'is', null);
  if (itemsErr) return [];
  const dealIds = Array.from(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Set(((items || []) as any[]).map((r) => r.deal_id))
  ).filter(Boolean);
  if (dealIds.length === 0) return [];

  // PM だけ抽出
  const { data: assignees, error: asgnErr } = await supabase
    .from('performance_deal_assignees')
    .select('user_id, role')
    .in('deal_id', dealIds)
    .eq('role', 'pm');
  if (asgnErr) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = ((assignees || []) as any[]).map((a) => a.user_id).filter(Boolean);
  return Array.from(new Set(ids));
}

/**
 * 自動ステータス遷移を判定:
 *   - PM全員が確認済みなら status を 'issued' にする
 *   - そうでなければ status を 'draft' に戻す
 *   - ただし status が 'paid' / 'cancelled' の場合は触らない
 */
async function syncInvoiceStatusByPmConfirmations(invoiceId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  // 1. PM の user_id 一覧
  const pmIds = await fetchPmUserIds(invoiceId);
  if (pmIds.length === 0) return; // PMがいない案件は対象外

  // 2. 現在の請求書 status を取得 (paid/cancelled は触らない)
  const { data: invRow, error: invErr } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .maybeSingle();
  if (invErr || !invRow) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentStatus = (invRow as any).status as string;
  if (currentStatus !== 'draft' && currentStatus !== 'issued') {
    // paid / cancelled は触らない (誤操作防止)
    return;
  }

  // 3. 全PMが confirm 済みかチェック
  const { data: confirms, error: confErr } = await supabase
    .from('invoice_confirmations')
    .select('user_id, confirmed_at')
    .eq('invoice_id', invoiceId)
    .in('user_id', pmIds);
  if (confErr) return;
  const confirmedSet = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((confirms || []) as any[])
      .filter((c) => c.confirmed_at)
      .map((c) => c.user_id)
  );
  const allPmConfirmed = pmIds.every((id) => confirmedSet.has(id));

  // 4. 自動遷移
  const desiredStatus = allPmConfirmed ? 'issued' : 'draft';
  if (desiredStatus !== currentStatus) {
    await supabase
      .from('invoices')
      .update({ status: desiredStatus })
      .eq('id', invoiceId);
  }
}

/** 自分が「確認した」を記録する */
export async function confirmInvoice(
  invoiceId: string,
  userId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase 未初期化' };

  const { error } = await supabase
    .from('invoice_confirmations')
    .insert({
      invoice_id: invoiceId,
      user_id: userId,
      confirmed_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };

  // PM全員確認なら status を issued に自動遷移
  await syncInvoiceStatusByPmConfirmations(invoiceId);

  return { ok: true };
}

/** 確認を取り消す */
export async function unconfirmInvoice(
  invoiceId: string,
  userId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase 未初期化' };

  const { error } = await supabase
    .from('invoice_confirmations')
    .delete()
    .eq('invoice_id', invoiceId)
    .eq('user_id', userId);
  if (error) return { error: error.message };

  // 取り消し後の状態に合わせて status を再評価 (PM が外れたら draft に戻る)
  await syncInvoiceStatusByPmConfirmations(invoiceId);

  return { ok: true };
}
