import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import type { CorrectionRequest, LeaveRequest, UserBrief } from './types';
import { logger } from '../../lib/logger';

/**
 * 管理者向け: 全ユーザーの申請を取得 (Phase 3-7)
 * --------------------------------------------------------------
 * 既存システム RequestsView.jsx の ApprovalTab.load と同じクエリ。
 * - leave_requests / attendance_correction_requests を user_id 制限なしで取得
 * - users (status='active') も併せて取得 (ユーザー名表示用)
 *
 * RLS で admin role のみが他人の行を見られる前提。
 * admin でない場合は SELECT が空配列になるか権限エラーになる。
 *
 * 読み取り専用 (.select のみ)。
 * --------------------------------------------------------------
 */

export type AllRequestsState = {
  leaveRequests: LeaveRequest[];
  correctionRequests: CorrectionRequest[];
  users: UserBrief[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useAllRequestsForAdmin(
  enabled: boolean
): AllRequestsState {
  const supabase = getSupabase();

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [correctionRequests, setCorrectionRequests] = useState<CorrectionRequest[]>([]);
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(supabase) && enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!supabase || !enabled) {
      setLeaveRequests([]);
      setCorrectionRequests([]);
      setUsers([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    logger.log('[OfficeHub:admin:all] fetch start');

    (async () => {
      try {
        type LvRes = {
          data: LeaveRequest[] | null;
          error: { message: string; code?: string } | null;
        };
        type CorrRes = {
          data: CorrectionRequest[] | null;
          error: { message: string; code?: string } | null;
        };
        type UserRes = {
          data: UserBrief[] | null;
          error: { message: string; code?: string } | null;
        };
        const toErr = (e: unknown) => ({
          message: e instanceof Error ? e.message : String(e),
        });

        const lvP = withTimeout<LvRes>(
          supabase
            .from('leave_requests')
            .select('*')
            .order('created_at', { ascending: false }) as unknown as Promise<LvRes>,
          10000,
          'SELECT leave_requests (all)'
        ).catch((e): LvRes => ({ data: null, error: toErr(e) }));

        const corrP = withTimeout<CorrRes>(
          supabase
            .from('attendance_correction_requests')
            .select('*')
            .order('created_at', { ascending: false }) as unknown as Promise<CorrRes>,
          10000,
          'SELECT attendance_correction_requests (all)'
        ).catch((e): CorrRes => ({ data: null, error: toErr(e) }));

        const usrP = withTimeout<UserRes>(
          supabase
            .from('users')
            .select('id, name, email')
            .eq('status', 'active') as unknown as Promise<UserRes>,
          10000,
          'SELECT users (active)'
        ).catch((e): UserRes => ({ data: null, error: toErr(e) }));

        const [lvRes, corrRes, usrRes] = await Promise.all([lvP, corrP, usrP]);

        if (!active) return;
        logger.log('[OfficeHub:admin:all] fetch done', {
          leaveCount: lvRes.data?.length ?? 0,
          leaveError: lvRes.error?.message ?? null,
          correctionCount: corrRes.data?.length ?? 0,
          correctionError: corrRes.error?.message ?? null,
          usersCount: usrRes.data?.length ?? 0,
          usersError: usrRes.error?.message ?? null,
        });

        // エラー優先度: ユーザー取得失敗は致命的 (名前が出ないと申請が読めない)
        if (usrRes.error) {
          setError(
            `ユーザー一覧の取得失敗: ${usrRes.error.message} ` +
              '(管理者権限が必要です)'
          );
          setLeaveRequests([]);
          setCorrectionRequests([]);
          setUsers([]);
        } else {
          setUsers(usrRes.data ?? []);
          setLeaveRequests(lvRes.error ? [] : (lvRes.data ?? []));
          setCorrectionRequests(corrRes.error ? [] : (corrRes.data ?? []));
          if (lvRes.error && corrRes.error) {
            setError(`申請取得失敗: ${lvRes.error.message}`);
          } else if (lvRes.error) {
            setError(`休暇申請の取得失敗: ${lvRes.error.message}`);
          } else if (corrRes.error) {
            setError(`修正申請の取得失敗: ${corrRes.error.message}`);
          } else {
            setError(null);
          }
        }
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(`通信エラー: ${msg}`);
      } finally {
        setLoading(false);
        logger.log('[OfficeHub:admin:all] fetch finally -> loading=false');
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reloadKey]);

  return { leaveRequests, correctionRequests, users, loading, error, reload };
}
