import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import type { CorrectionRequest, LeaveRequest } from './types';
import { logger } from '../../lib/logger';

/**
 * 自分の申請一覧を取得するフック
 * --------------------------------------------------------------
 * leave_requests と attendance_correction_requests の両方を取得して
 * created_at 降順で統合表示する。
 *
 * 読み取り専用 (.select のみ)。
 * --------------------------------------------------------------
 */

export type MyRequestsState = {
  leaveRequests: LeaveRequest[];
  correctionRequests: CorrectionRequest[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useMyRequests(userId: string | null | undefined): MyRequestsState {
  const supabase = getSupabase();

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [correctionRequests, setCorrectionRequests] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(supabase) && Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!supabase || !userId) {
      setLeaveRequests([]);
      setCorrectionRequests([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    logger.log('[OfficeHub:requests:my] fetch start');

    (async () => {
      try {
        // それぞれに 10 秒のタイムアウトを付け、Promise.all 全体も完了/タイムアウト
        // どちらかで必ず終わるようにする (読み込み中…のまま固まる症状の安全網)
        type LeaveRes = { data: LeaveRequest[] | null; error: { message: string; code?: string } | null };
        type CorrRes = { data: CorrectionRequest[] | null; error: { message: string; code?: string } | null };

        const lvPromise = withTimeout<LeaveRes>(
          supabase
            .from('leave_requests')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }) as unknown as Promise<LeaveRes>,
          10000,
          'SELECT leave_requests'
        ).catch(
          (e): LeaveRes => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );
        const corrPromise = withTimeout<CorrRes>(
          supabase
            .from('attendance_correction_requests')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }) as unknown as Promise<CorrRes>,
          10000,
          'SELECT attendance_correction_requests'
        ).catch(
          (e): CorrRes => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        const [lvRes, corrRes] = await Promise.all([lvPromise, corrPromise]);

        if (!active) return;
        logger.log('[OfficeHub:requests:my] fetch done', {
          leaveCount: lvRes.data?.length ?? 0,
          leaveError: lvRes.error?.message ?? null,
          correctionCount: corrRes.data?.length ?? 0,
          correctionError: corrRes.error?.message ?? null,
        });

        // leave_requests と attendance_correction_requests の片方ずつエラー処理
        if (lvRes.error && corrRes.error) {
          setError(`申請取得失敗: ${lvRes.error.message}`);
          setLeaveRequests([]);
          setCorrectionRequests([]);
        } else {
          // 片方だけ取れたケースも graceful に
          setLeaveRequests(
            lvRes.error ? [] : ((lvRes.data as LeaveRequest[] | null) ?? [])
          );
          setCorrectionRequests(
            corrRes.error
              ? []
              : ((corrRes.data as CorrectionRequest[] | null) ?? [])
          );
          if (lvRes.error) {
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
        logger.log('[OfficeHub:requests:my] fetch finally -> loading=false');
      }
    })();

    const safetyTimer = window.setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          logger.warn('[OfficeHub:requests:my] safety timeout — forcing loading=false');
        }
        return false;
      });
    }, 10000);

    return () => {
      active = false;
      window.clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, reloadKey]);

  return { leaveRequests, correctionRequests, loading, error, reload };
}
