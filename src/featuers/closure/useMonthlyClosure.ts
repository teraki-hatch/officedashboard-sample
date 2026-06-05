import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { MonthlyClosure, LockState } from './types';
import { toLockState } from './closureUtils';

/**
 * 個人の特定年月の締め状態を取得するフック
 * --------------------------------------------------------------
 * - 勤怠カレンダーの右上に「提出ボタン/確定済バッジ」を表示する用途
 * - 申請作成や打刻時のロック判定にも使う
 * --------------------------------------------------------------
 */

export type UseMonthlyClosureState = {
  closure: MonthlyClosure | null;
  lock: LockState;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const DEFAULT_LOCK: LockState = { locked: false, submitted: false, closure: null };

export function useMonthlyClosure(
  userId: string | null | undefined,
  yearMonth: string | null | undefined
): UseMonthlyClosureState {
  const [closure, setClosure] = useState<MonthlyClosure | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(userId && yearMonth));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId || !yearMonth) {
      setClosure(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        type Res = {
          data: MonthlyClosure | null;
          error: { message: string; code?: string } | null;
        };
        const r = await withTimeout<Res>(
          supabase
            .from('monthly_closures')
            .select('*')
            .eq('user_id', userId)
            .eq('year_month', yearMonth)
            .maybeSingle() as unknown as Promise<Res>,
          10000,
          'SELECT monthly_closures (one)'
        ).catch(
          (e): Res => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        if (!active) return;

        if (r.error) {
          logger.log('[OfficeHub:closure:one] fetch error', r.error);
          setError(`締め状態の取得失敗: ${r.error.message}`);
          setClosure(null);
        } else {
          logger.log('[OfficeHub:closure:one] fetch done', {
            userId,
            yearMonth,
            status: r.data?.status ?? 'none',
          });
          setClosure(r.data ?? null);
        }
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(`通信エラー: ${msg}`);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, yearMonth, reloadKey]);

  return {
    closure,
    lock: closure ? toLockState(closure) : DEFAULT_LOCK,
    loading,
    error,
    reload,
  };
}
