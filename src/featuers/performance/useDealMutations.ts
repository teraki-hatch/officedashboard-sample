import { useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { DealInput, DealAssigneeInput } from './types';

type UseDealMutationsResult = {
  createDeal: (input: DealInput, authUserId: string | null) => Promise<boolean>;
  updateDeal: (id: string, input: DealInput) => Promise<boolean>;
  deleteDeal: (id: string) => Promise<boolean>;
  saving: boolean;
  error: string | null;
};

export function useDealMutations(): UseDealMutationsResult {
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /** assignees を全削除 → 新規挿入 (差分計算より単純で確実) */
  async function replaceAssignees(
    dealId: string,
    assignees: DealAssigneeInput[]
  ): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client not initialized');

    // 既存の assignees を全削除
    const { error: delError } = await withTimeout(
      supabase
        .from('performance_deal_assignees')
        .delete()
        .eq('deal_id', dealId),
      10000,
      'performance_deal_assignees delete'
    );
    if (delError) throw delError;

    // 新規挿入
    if (assignees.length > 0) {
      const payload = assignees.map((a, idx) => ({
        deal_id: dealId,
        user_id: a.user_id,
        role: a.role,
        allocation_ratio: a.allocation_ratio,
        display_order: a.display_order ?? idx,
      }));

      const { error: insError } = await withTimeout(
        supabase.from('performance_deal_assignees').insert(payload),
        10000,
        'performance_deal_assignees insert'
      );
      if (insError) throw insError;
    }
  }

  async function createDeal(
    input: DealInput,
    authUserId: string | null
  ): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not initialized');

      const payload = {
        user_id: input.user_id,
        client_id: input.client_id ?? null,
        category: input.category,
        deal_name: input.deal_name,
        status: input.status,
        expected_close_date: input.expected_close_date ?? null,
        closed_date: input.closed_date ?? null,
        terminated_date: input.terminated_date ?? null,
        sales_amount: input.sales_amount,
        monthly_amount: input.monthly_amount,
        gross_profit: input.gross_profit,
        meeting_count: input.meeting_count,
        notes: input.notes ?? null,
        created_by: authUserId,
      };

      // 案件本体を INSERT
      const { data, error: dbError } = await withTimeout(
        supabase
          .from('performance_deals')
          .insert(payload)
          .select('id')
          .single(),
        10000,
        'performance_deals insert'
      );
      if (dbError) throw dbError;
      if (!data) throw new Error('案件作成失敗: ID取得できず');

      const dealId = (data as { id: string }).id;

      // assignees を保存
      await replaceAssignees(dealId, input.assignees);

      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('createDeal error:', msg);
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateDeal(id: string, input: DealInput): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not initialized');

      const payload = {
        category: input.category,
        deal_name: input.deal_name,
        status: input.status,
        expected_close_date: input.expected_close_date ?? null,
        closed_date: input.closed_date ?? null,
        terminated_date: input.terminated_date ?? null,
        sales_amount: input.sales_amount,
        monthly_amount: input.monthly_amount,
        gross_profit: input.gross_profit,
        meeting_count: input.meeting_count,
        notes: input.notes ?? null,
      };

      const { error: dbError } = await withTimeout(
        supabase.from('performance_deals').update(payload).eq('id', id),
        10000,
        'performance_deals update'
      );
      if (dbError) throw dbError;

      // assignees を replace
      await replaceAssignees(id, input.assignees);

      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('updateDeal error:', msg);
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteDeal(id: string): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not initialized');

      // assignees は ON DELETE CASCADE で自動削除される
      const { error: dbError } = await withTimeout(
        supabase.from('performance_deals').delete().eq('id', id),
        10000,
        'performance_deals delete'
      );
      if (dbError) throw dbError;
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('deleteDeal error:', msg);
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { createDeal, updateDeal, deleteDeal, saving, error };
}
