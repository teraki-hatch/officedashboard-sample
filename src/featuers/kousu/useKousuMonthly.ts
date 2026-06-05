import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import { pad } from './kousuUtils';
import type { TimeEntry } from './types';

/**
 * 月次工数取得フック (Phase 4-1)
 * --------------------------------------------------------------
 * Phase C-3: projects 廃止により JOIN 対象が clients に変更。
 *
 * - 指定の (userId, year, month0) で time_entries を取得
 * - JOIN: client (id,name,color,is_internal) / category (id,name,icon)
 * - date 昇順、created_at 昇順
 * - reload() で再取得可能
 * --------------------------------------------------------------
 */
export type UseKousuMonthlyParams = {
  userId: string | null | undefined;
  year: number;
  /** 0-11 */
  month0: number;
};
export type UseKousuMonthlyState = {
  entries: TimeEntry[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};
export function useKousuMonthly(params: UseKousuMonthlyParams): UseKousuMonthlyState {
  const { userId, year, month0 } = params;
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    if (!userId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        if (!cancelled) {
          setError('Supabase が未設定です');
          setLoading(false);
        }
        return;
      }
      const ym = `${year}-${pad(month0 + 1)}`;
      const lastDay = new Date(year, month0 + 1, 0).getDate();
      const startDt = `${ym}-01`;
      const endDt = `${ym}-${pad(lastDay)}`;
      logger.log('[OfficeHub:kousu:monthly] fetch start', {
        userId,
        startDt,
        endDt,
      });
      type Res = {
        data: TimeEntry[] | null;
        error: { message: string; code?: string } | null;
      };
      const res = await withTimeout<Res>(
        supabase
          .from('time_entries')
          .select(
            '*, client:clients(id,name,color,is_internal), deal:performance_deals(id, deal_name, client_id), category:work_categories(id,name,icon)'
          )
          .eq('user_id', userId)
          .gte('date', startDt)
          .lte('date', endDt)
          .order('date', { ascending: true })
          .order('created_at', { ascending: true }) as unknown as Promise<Res>,
        12000,
        'SELECT time_entries (monthly)'
      ).catch(
        (e): Res => ({
          data: null,
          error: { message: e instanceof Error ? e.message : String(e) },
        })
      );
      if (cancelled) return;
      if (res.error) {
        const msg = `工数取得失敗: ${res.error.message}`;
        logger.warn('[OfficeHub:kousu:monthly] error', { msg });
        setError(msg);
        setEntries([]);
      } else {
        const data = res.data ?? [];
        logger.log('[OfficeHub:kousu:monthly] loaded', { count: data.length });
        setEntries(data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, year, month0, reloadKey]);
  return { entries, loading, error, reload };
}
