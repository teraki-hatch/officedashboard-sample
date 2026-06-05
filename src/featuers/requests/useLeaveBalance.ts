import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { currentFiscalYear } from './requestUtils';
import {
  calcRemainingDaysFromGrants,
  consumedDaysOf,
  isPaidLeaveType,
  type GrantRemainState,
  type GrantWithExpiry,
} from './leaveUtils';
import { logger } from '../../lib/logger';

/**
 * 有休残日数フック (leave_grants ベース / FIFO計算)
 * --------------------------------------------------------------
 * 2026-05-20 全面刷新:
 * - 旧: leave_balances (granted/carryover/adjusted) を読んで合算
 * - 新: leave_grants (期限付き) を FIFO で消化、残数を計算
 *
 * 戻り値:
 *  - totalGranted: 有効な付与の合計 (失効分除く)
 *  - totalExpired: 失効済み合計
 *  - totalConsumed: 承認済みの取得日数
 *  - totalPending: 承認待ちの取得日数
 *  - remainingDays: FIFO計算後の使用可能残
 *  - grants: 各 grant の状態 (期限付き、UI表示用)
 * --------------------------------------------------------------
 */

export type LeaveBalanceState = {
  totalGranted: number;
  totalExpired: number;
  totalConsumed: number;
  totalPending: number;
  remainingDays: number;
  grants: GrantRemainState[];
  loading: boolean;
  error: string | null;
  fiscalYear: number;
};

const EMPTY_STATE: Omit<LeaveBalanceState, 'loading' | 'error' | 'fiscalYear'> = {
  totalGranted: 0,
  totalExpired: 0,
  totalConsumed: 0,
  totalPending: 0,
  remainingDays: 0,
  grants: [],
};

export function useLeaveBalance(userId: string | null | undefined): LeaveBalanceState {
  const supabase = getSupabase();
  const fiscalYear = currentFiscalYear();
  const [state, setState] = useState<Omit<LeaveBalanceState, 'loading' | 'error' | 'fiscalYear'>>(
    EMPTY_STATE
  );
  const [loading, setLoading] = useState<boolean>(Boolean(supabase) && Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !userId) {
      setLoading(false);
      setState(EMPTY_STATE);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    logger.log('[OfficeHub:requests:balance] fetch start (grants base)', { userId });

    (async () => {
      try {
        type GrantRow = GrantWithExpiry;
        type GrantRes = {
          data: GrantRow[] | null;
          error: { message: string; code?: string } | null;
        };
        type ReqRow = {
          leave_type: string;
          status: string;
          days: number | null;
        };
        type ReqRes = {
          data: ReqRow[] | null;
          error: { message: string; code?: string } | null;
        };

        // 並列取得: leave_grants + leave_requests
        const grantsP = withTimeout<GrantRes>(
          supabase
            .from('leave_grants')
            .select('id, user_id, grant_date, granted_days, expired_days, expires_at, grant_type')
            .eq('user_id', userId) as unknown as Promise<GrantRes>,
          10000,
          'SELECT leave_grants'
        );

        const reqP = withTimeout<ReqRes>(
          supabase
            .from('leave_requests')
            .select('leave_type, status, days')
            .eq('user_id', userId)
            .in('status', ['approved', 'pending']) as unknown as Promise<ReqRes>,
          10000,
          'SELECT leave_requests (used calc)'
        );

        const [{ data: grantsData, error: gErr }, { data: reqData, error: rErr }] =
          await Promise.all([grantsP, reqP]);

        if (!active) return;

        if (gErr) {
          setError(`残日数取得失敗 (grants): ${gErr.message}`);
          setState(EMPTY_STATE);
          return;
        }

        const grants: GrantWithExpiry[] = grantsData ?? [];
        const requests: ReqRow[] = reqData ?? [];

        if (rErr) {
          logger.warn('[OfficeHub:requests:balance] leave_requests fetch failed', rErr);
          // requests 取れなくても grants の表示だけはする
        }

        // 消費分を approved / pending で分けて集計 (paid 系のみ)
        let approvedDays = 0;
        let pendingDays = 0;
        for (const r of requests) {
          if (!isPaidLeaveType(r.leave_type)) continue;
          const d = consumedDaysOf(r.leave_type, r.days);
          if (r.status === 'approved') approvedDays += d;
          else if (r.status === 'pending') pendingDays += d;
        }
        const totalConsumed = +approvedDays.toFixed(1);
        const totalPending = +pendingDays.toFixed(1);

        // FIFO 計算 (approved + pending を合算して割り当て)
        const { totalRemaining, states } = calcRemainingDaysFromGrants(
          grants,
          totalConsumed + totalPending
        );

        // 集計値
        const totalGranted = grants.reduce(
          (sum, g) => sum + (Number(g.granted_days) || 0),
          0
        );
        const totalExpired = grants.reduce(
          (sum, g) => sum + (Number(g.expired_days) || 0),
          0
        );

        logger.log('[OfficeHub:requests:balance] fetch done (grants base)', {
          grantsCount: grants.length,
          totalGranted,
          totalExpired,
          totalConsumed,
          totalPending,
          remainingDays: totalRemaining,
        });

        setState({
          totalGranted: +totalGranted.toFixed(1),
          totalExpired: +totalExpired.toFixed(1),
          totalConsumed,
          totalPending,
          remainingDays: totalRemaining,
          grants: states,
        });
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(`通信エラー: ${msg}`);
        setState(EMPTY_STATE);
      } finally {
        if (active) setLoading(false);
        logger.log('[OfficeHub:requests:balance] fetch finally -> loading=false');
      }
    })();

    const safetyTimer = window.setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          logger.warn('[OfficeHub:requests:balance] safety timeout — forcing loading=false');
        }
        return false;
      });
    }, 10000);

    return () => {
      active = false;
      window.clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { ...state, loading, error, fiscalYear };
}
