import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type {
  LeaveBalance,
  LeaveGrant,
  UserForLeaveAdmin,
} from './types';

/**
 * 有休管理 admin 用データ取得 (Phase 3-8)
 * --------------------------------------------------------------
 * 既存システム MasterManagementView.jsx の load を踏襲。
 *
 * 4本の SELECT を並列発行:
 *   1) users (active, employee_code, hire_date を含む)
 *   2) leave_balances (指定年度)
 *   3) leave_requests (status in ['approved', 'pending'], 消費計算用)
 *   4) leave_grants (全期間, 自動付与判定用)
 *
 * 全て user_id 制限なし → RLS で admin のみが他人の行を見られる前提
 *
 * 読み取り専用 (.select のみ)。
 * --------------------------------------------------------------
 */

type LeaveReqBrief = {
  user_id: string;
  leave_type: string;
  days: number;
  status: string;
};

export type UseLeaveAdminState = {
  users: UserForLeaveAdmin[];
  balances: LeaveBalance[];
  leaveRequests: LeaveReqBrief[];
  grants: LeaveGrant[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useLeaveAdminData(
  enabled: boolean,
  fiscalYear: number
): UseLeaveAdminState {
  const supabase = getSupabase();

  const [users, setUsers] = useState<UserForLeaveAdmin[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveReqBrief[]>([]);
  const [grants, setGrants] = useState<LeaveGrant[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(supabase) && enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!supabase || !enabled) {
      setUsers([]);
      setBalances([]);
      setLeaveRequests([]);
      setGrants([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    logger.log('[OfficeHub:leave-admin] fetch start', { fiscalYear });

    (async () => {
      try {
        const toErr = (e: unknown) => ({
          message: e instanceof Error ? e.message : String(e),
        });

        type UserRes = {
          data: UserForLeaveAdmin[] | null;
          error: { message: string; code?: string } | null;
        };
        type BalRes = {
          data: LeaveBalance[] | null;
          error: { message: string; code?: string } | null;
        };
        type LvRes = {
          data: LeaveReqBrief[] | null;
          error: { message: string; code?: string } | null;
        };
        type GrantRes = {
          data: LeaveGrant[] | null;
          error: { message: string; code?: string } | null;
        };

        const uP = withTimeout<UserRes>(
          supabase
            .from('users')
            .select('id, name, email, employee_code, hire_date, has_leave_management')
            .eq('status', 'active')
            .order('employee_code') as unknown as Promise<UserRes>,
          10000,
          'SELECT users (leave-admin)'
        ).catch((e): UserRes => ({ data: null, error: toErr(e) }));

        const bP = withTimeout<BalRes>(
          supabase
            .from('leave_balances')
            .select('*')
            .eq('fiscal_year', fiscalYear) as unknown as Promise<BalRes>,
          10000,
          'SELECT leave_balances (leave-admin)'
        ).catch((e): BalRes => ({ data: null, error: toErr(e) }));

        const lP = withTimeout<LvRes>(
          supabase
            .from('leave_requests')
            .select('user_id, leave_type, days, status')
            .in('status', ['approved', 'pending']) as unknown as Promise<LvRes>,
          10000,
          'SELECT leave_requests (leave-admin)'
        ).catch((e): LvRes => ({ data: null, error: toErr(e) }));

        const gP = withTimeout<GrantRes>(
          supabase
            .from('leave_grants')
            .select('*')
            .order('grant_date', { ascending: false }) as unknown as Promise<GrantRes>,
          10000,
          'SELECT leave_grants (leave-admin)'
        ).catch((e): GrantRes => ({ data: null, error: toErr(e) }));

        const [uRes, bRes, lRes, gRes] = await Promise.all([uP, bP, lP, gP]);

        if (!active) return;
        logger.log('[OfficeHub:leave-admin] fetch done', {
          usersCount: uRes.data?.length ?? 0,
          balancesCount: bRes.data?.length ?? 0,
          leaveRequestsCount: lRes.data?.length ?? 0,
          grantsCount: gRes.data?.length ?? 0,
          usersError: uRes.error?.message ?? null,
          balancesError: bRes.error?.message ?? null,
          leaveRequestsError: lRes.error?.message ?? null,
          grantsError: gRes.error?.message ?? null,
        });

        // users 取得失敗は致命的
        if (uRes.error) {
          setError(
            `ユーザー一覧の取得失敗: ${uRes.error.message} (管理者権限が必要です)`
          );
          setUsers([]);
          setBalances([]);
          setLeaveRequests([]);
          setGrants([]);
        } else {
          setUsers(uRes.data ?? []);
          setBalances(bRes.error ? [] : (bRes.data ?? []));
          setLeaveRequests(lRes.error ? [] : (lRes.data ?? []));
          setGrants(gRes.error ? [] : (gRes.data ?? []));
          const partial = [
            bRes.error && `残日数: ${bRes.error.message}`,
            lRes.error && `申請: ${lRes.error.message}`,
            gRes.error && `付与履歴: ${gRes.error.message}`,
          ].filter(Boolean);
          setError(partial.length > 0 ? `一部取得失敗 — ${partial.join(' / ')}` : null);
        }
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(`通信エラー: ${msg}`);
      } finally {
        if (active) {
          setLoading(false);
          logger.log('[OfficeHub:leave-admin] fetch finally -> loading=false');
        }
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fiscalYear, reloadKey]);

  return { users, balances, leaveRequests, grants, loading, error, reload };
}
