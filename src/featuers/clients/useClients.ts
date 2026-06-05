import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import type { Client } from './types';

export type ClientWithStats = Client & {
  deal_count: number;
  total_monthly: number;
};

export function useClients() {
  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error('Supabase クライアントが初期化されていません');
      }

      // クライアント一覧
      const { data: clientsData, error: cErr } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

      if (cErr) throw cErr;

      // 案件件数 + 月額合計を別クエリで取得
      const { data: dealsData, error: dErr } = await supabase
        .from('performance_deals')
        .select('client_id, monthly_amount');

      if (dErr) throw dErr;

      const statsMap = new Map<string, { count: number; total: number }>();
      for (const d of (dealsData || []) as Array<{
        client_id: string | null;
        monthly_amount: number | null;
      }>) {
        if (!d.client_id) continue;
        const prev = statsMap.get(d.client_id) || { count: 0, total: 0 };
        prev.count += 1;
        prev.total += Number(d.monthly_amount || 0);
        statsMap.set(d.client_id, prev);
      }

      const merged: ClientWithStats[] = ((clientsData || []) as Client[]).map(
        (c: Client) => {
          const stats = statsMap.get(c.id);
          return {
            ...c,
            deal_count: stats?.count || 0,
            total_monthly: stats?.total || 0,
          };
        }
      );

      setClients(merged);
    } catch (e) {
      console.error('[useClients] reload error', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { clients, loading, error, reload };
}
