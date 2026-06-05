import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

/**
 * 自分の勤怠修正申請一覧を取得するフック
 * --------------------------------------------------------------
 * attendance_correction_requests テーブルから自分の申請を取得。
 * 月とステータスでフィルタ。
 * --------------------------------------------------------------
 */

export type CorrectionRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type CorrectionRequest = {
  id: string;
  user_id: string;
  date: string | null;
  target_date: string | null;
  status: CorrectionRequestStatus;
  request_type: string | null;
  reason: string | null;

  // 修正前
  before_clock_in: string | null;
  before_clock_out: string | null;
  before_breaks: unknown; // jsonb array

  // 修正後
  after_clock_in: string | null;
  after_clock_out: string | null;
  after_breaks: unknown; // jsonb array

  // 互換用 (旧形式)
  requested_clock_in: string | null;
  requested_clock_out: string | null;
  requested_break_minutes: number | null;
  requested_work_type: string | null;

  // 処理情報
  requested_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  admin_comment: string | null;
  comment: string | null;

  created_at: string;
  updated_at: string;
};

export type StatusFilter = 'all' | CorrectionRequestStatus;

export type UseMyCorrectionRequestsState = {
  requests: CorrectionRequest[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useMyCorrectionRequests(
  userId: string | null | undefined,
  year: number,
  month: number, // 1-12
  statusFilter: StatusFilter = 'all'
): UseMyCorrectionRequestsState {
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      setRequests([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const lastDay = new Date(year, month, 0).getDate();
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    logger.log('[OfficeHub:kintai:myCorrections] fetch start', {
      userId,
      year,
      month,
      monthStart,
      monthEnd,
      statusFilter,
      reloadKey,
    });

    (async () => {
      try {
        type Res = {
          data: CorrectionRequest[] | null;
          error: { message: string; code?: string } | null;
        };

        // target_date でフィルタ。target_date が NULL のものは date でも見る
        // (古い 寺木入力 系の一部は target_date のみ入ってる)
        let query = supabase
          .from('attendance_correction_requests')
          .select('*')
          .eq('user_id', userId)
          .gte('target_date', monthStart)
          .lte('target_date', monthEnd)
          .order('requested_at', { ascending: false });

        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter);
        }

        const r = await withTimeout<Res>(
          query as unknown as Promise<Res>,
          10000,
          'SELECT attendance_correction_requests (my list)'
        ).catch(
          (e): Res => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        if (!active) return;

        if (r.error) {
          logger.log('[OfficeHub:kintai:myCorrections] fetch error', r.error);
          setError(`申請一覧の取得失敗: ${r.error.message}`);
          setRequests([]);
        } else {
          logger.log('[OfficeHub:kintai:myCorrections] fetch done', {
            count: r.data?.length ?? 0,
          });
          setRequests(r.data ?? []);
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
  }, [userId, year, month, statusFilter, reloadKey]);

  return { requests, loading, error, reload };
}

/* =================================================================
   取下げ (キャンセル) アクション
   ================================================================= */

export type CancelResult = { ok: boolean; error: string | null };

export type UseCancelCorrectionRequestState = {
  cancelling: boolean;
  lastError: string | null;
  cancel: (params: { requestId: string; userId: string }) => Promise<CancelResult>;
  clearError: () => void;
};

/**
 * pending な申請を自分で取下げる (status='cancelled')
 */
export function useCancelCorrectionRequest(): UseCancelCorrectionRequestState {
  const [cancelling, setCancelling] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = useCallback(() => setLastError(null), []);

  const cancel = useCallback(
    async (params: { requestId: string; userId: string }): Promise<CancelResult> => {
      const supabase = getSupabase();
      if (!supabase) {
        return { ok: false, error: 'Supabase が未設定です' };
      }
      setCancelling(true);
      setLastError(null);

      const nowISO = new Date().toISOString();
      logger.log('[OfficeHub:kintai:myCorrections] cancel start', params);

      try {
        type Res = {
          data: unknown[] | null;
          error: { message: string; code?: string } | null;
        };
        const r = await withTimeout<Res>(
          supabase
            .from('attendance_correction_requests')
            .update({ status: 'cancelled', updated_at: nowISO })
            .eq('id', params.requestId)
            .eq('user_id', params.userId)
            .eq('status', 'pending') // 念のためpendingのみに限定
            .select() as unknown as Promise<Res>,
          15000,
          'UPDATE attendance_correction_requests (cancel)'
        );

        if (r.error) {
          const msg = `取下げ失敗: ${r.error.message} (code: ${r.error.code ?? '—'})`;
          setLastError(msg);
          return { ok: false, error: msg };
        }
        if (!r.data || r.data.length === 0) {
          const msg = '取下げ失敗: 対象の申請が見つかりません (既に処理済みの可能性)';
          setLastError(msg);
          return { ok: false, error: msg };
        }
        logger.log('[OfficeHub:kintai:myCorrections] cancel done');
        return { ok: true, error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLastError(`通信エラー: ${msg}`);
        return { ok: false, error: msg };
      } finally {
        setCancelling(false);
      }
    },
    []
  );

  return { cancelling, lastError, cancel, clearError };
}
