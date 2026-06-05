import { useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { TargetInput } from './types';

type UseTargetMutationsResult = {
  upsertTarget: (input: TargetInput, authUserId: string | null) => Promise<boolean>;
  upsertTargets: (inputs: TargetInput[], authUserId: string | null) => Promise<boolean>;
  saving: boolean;
  error: string | null;
};

export function useTargetMutations(): UseTargetMutationsResult {
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function upsertTarget(
    input: TargetInput,
    authUserId: string | null
  ): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not initialized');

      const payload = {
        user_id: input.user_id,
        year_month: input.year_month,
        category: input.category,
        sales_target: input.sales_target,
        deal_target: input.deal_target,
        gross_profit_target: input.gross_profit_target,
        meeting_target: input.meeting_target,
        created_by: authUserId,
      };

      // UNIQUE(user_id, year_month, category) なので upsert で更新も同経路
      const { error: dbError } = await withTimeout(
        supabase
          .from('performance_targets')
          .upsert(payload, { onConflict: 'user_id,year_month,category' }),
        10000,
        'performance_targets upsert'
      );
      if (dbError) throw dbError;
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('upsertTarget error:', msg);
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  /**
   * 複数の目標を一括 upsert
   * (KPI設定モーダルでまとめて保存するため)
   */
  async function upsertTargets(
    inputs: TargetInput[],
    authUserId: string | null
  ): Promise<boolean> {
    if (inputs.length === 0) return true;

    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not initialized');

      const payloads = inputs.map((input) => ({
        user_id: input.user_id,
        year_month: input.year_month,
        category: input.category,
        sales_target: input.sales_target,
        deal_target: input.deal_target,
        gross_profit_target: input.gross_profit_target,
        meeting_target: input.meeting_target,
        created_by: authUserId,
      }));

      const { error: dbError } = await withTimeout(
        supabase
          .from('performance_targets')
          .upsert(payloads, { onConflict: 'user_id,year_month,category' }),
        15000,
        'performance_targets bulk upsert'
      );
      if (dbError) throw dbError;
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('upsertTargets error:', msg);
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { upsertTarget, upsertTargets, saving, error };
}
