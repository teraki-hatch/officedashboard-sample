import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { Client, Deal, WorkCategory } from './types';

/**
 * 工数マスタ取得フック (Phase 4-1)
 * --------------------------------------------------------------
 * - clients: is_active=true のもの (社内擬似クライアント含む)
 * - deals: アクティブな案件 (won/in_support/in_progress/prospect 等 - lost/terminated 除く)
 * - work_categories: status='active' のみ display_order 順
 * --------------------------------------------------------------
 */

export type UseKousuMastersState = {
  clients: Client[];
  deals: Deal[];
  categories: WorkCategory[];
  loading: boolean;
  error: string | null;
};

export function useKousuMasters(): UseKousuMastersState {
  const [clients, setClients] = useState<Client[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [categories, setCategories] = useState<WorkCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        if (!cancelled) {
          setError('Supabase が未設定です');
          setLoading(false);
        }
        return;
      }
      type Res<T> = { data: T[] | null; error: { message: string } | null };

      // clients は is_active=true のみ (社内擬似クライアント含む)
      const cliP = withTimeout<Res<Client>>(
        supabase
          .from('clients')
          .select('id, name, is_active, is_internal, color')
          .eq('is_active', true)
          .order('is_internal', { ascending: false })
          .order('name') as unknown as Promise<Res<Client>>,
        10000,
        'SELECT clients'
      ).catch(
        (e): Res<Client> => ({
          data: null,
          error: { message: e instanceof Error ? e.message : String(e) },
        })
      );

      // deals: 終了系(lost/terminated)を除く全件、クライアント情報JOIN
      const dealP = withTimeout<Res<Deal>>(
        supabase
          .from('performance_deals')
          .select(`id, client_id, deal_name, status, client:clients(id, name, is_internal, color)`)
          .not('status', 'in', '("lost","terminated")')
          .order('deal_name') as unknown as Promise<Res<Deal>>,
        10000,
        'SELECT deals'
      ).catch(
        (e): Res<Deal> => ({
          data: null,
          error: { message: e instanceof Error ? e.message : String(e) },
        })
      );

      const catP = withTimeout<Res<WorkCategory>>(
        supabase
          .from('work_categories')
          .select('id, name, icon, display_order, status')
          .eq('status', 'active')
          .order('display_order') as unknown as Promise<Res<WorkCategory>>,
        10000,
        'SELECT work_categories'
      ).catch(
        (e): Res<WorkCategory> => ({
          data: null,
          error: { message: e instanceof Error ? e.message : String(e) },
        })
      );

      const [cliRes, dealRes, catRes] = await Promise.all([cliP, dealP, catP]);
      if (cancelled) return;

      const errMsgs: string[] = [];
      if (cliRes.error) errMsgs.push(`clients: ${cliRes.error.message}`);
      if (dealRes.error) errMsgs.push(`deals: ${dealRes.error.message}`);
      if (catRes.error) errMsgs.push(`work_categories: ${catRes.error.message}`);

      logger.log('[OfficeHub:kousu:masters] loaded', {
        clients: cliRes.data?.length ?? 0,
        deals: dealRes.data?.length ?? 0,
        categories: catRes.data?.length ?? 0,
        errors: errMsgs.length,
      });

      setClients(cliRes.data ?? []);
      // deal の client は配列で返るので最初の1個に正規化
      const normalizedDeals: Deal[] = (dealRes.data ?? []).map((d) => {
        const c = d.client as unknown;
        const clientObj = Array.isArray(c) ? (c[0] as Client | undefined) : (c as Client | undefined);
        return { ...d, client: clientObj ?? null };
      });
      setDeals(normalizedDeals);
      setCategories(catRes.data ?? []);
      setError(errMsgs.length > 0 ? errMsgs.join(' / ') : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { clients, deals, categories, loading, error };
}
