import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

/**
 * マイステータス用の軽量サマリーフック (ホーム画面用)
 * --------------------------------------------------------------
 * 取得するもの:
 *   - 自分の今日の打刻状況 (出勤中 / 退勤済 / 未出勤)
 *   - 自分の未処理 (pending) 申請数
 *   - admin の場合のみ: 全社の未処理 (pending) 申請数
 *
 * 有休残日数は useLeaveBalance を別途使う (既存)。
 *
 * パフォーマンス重視: 並列で取得、最小限のカラムだけ SELECT。
 * 失敗してもホーム画面はクラッシュさせない。
 * --------------------------------------------------------------
 */

export type MyStatusData = {
  /** 今日の打刻状況 */
  todayClockState: 'not-started' | 'working' | 'finished' | 'unknown';
  /** 出勤時刻 (HH:MM) */
  clockInTime: string | null;
  /** 退勤時刻 (HH:MM) */
  clockOutTime: string | null;
  /** 自分の未処理申請数 (leave + correction の合計) */
  myPendingCount: number;
  /** admin のみ: 全社の未処理申請数 (leave + correction の合計) */
  adminPendingCount: number | null;
};

const DEFAULT_DATA: MyStatusData = {
  todayClockState: 'unknown',
  clockInTime: null,
  clockOutTime: null,
  myPendingCount: 0,
  adminPendingCount: null,
};

export type UseMyStatusState = {
  data: MyStatusData;
  loading: boolean;
  reload: () => void;
};

function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hhmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function useMyStatus(
  userId: string | null | undefined,
  isAdmin: boolean
): UseMyStatusState {
  const [data, setData] = useState<MyStatusData>(DEFAULT_DATA);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!userId) {
      setData(DEFAULT_DATA);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }

      const today = todayStr();

      type AttRes = {
        data: Array<{
          clock_in: string | null;
          clock_out: string | null;
        }> | null;
        error: unknown;
      };
      type CntRes = {
        count: number | null;
        error: unknown;
      };

      // 並列取得
      const attP = withTimeout<AttRes>(
        supabase
          .from('attendance_records')
          .select('clock_in, clock_out')
          .eq('user_id', userId)
          .eq('date', today)
          .limit(1) as unknown as Promise<AttRes>,
        8000,
        'SELECT today attendance (mystatus)'
      ).catch((): AttRes => ({ data: null, error: null }));

      const myLeaveP = withTimeout<CntRes>(
        supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'pending') as unknown as Promise<CntRes>,
        8000,
        'COUNT my pending leave'
      ).catch((): CntRes => ({ count: 0, error: null }));

      const myCorrP = withTimeout<CntRes>(
        supabase
          .from('attendance_correction_requests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'pending') as unknown as Promise<CntRes>,
        8000,
        'COUNT my pending correction'
      ).catch((): CntRes => ({ count: 0, error: null }));

      const adminLeaveP = isAdmin
        ? withTimeout<CntRes>(
            supabase
              .from('leave_requests')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending') as unknown as Promise<CntRes>,
            8000,
            'COUNT all pending leave (admin)'
          ).catch((): CntRes => ({ count: 0, error: null }))
        : Promise.resolve<CntRes>({ count: null, error: null });

      const adminCorrP = isAdmin
        ? withTimeout<CntRes>(
            supabase
              .from('attendance_correction_requests')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending') as unknown as Promise<CntRes>,
            8000,
            'COUNT all pending correction (admin)'
          ).catch((): CntRes => ({ count: 0, error: null }))
        : Promise.resolve<CntRes>({ count: null, error: null });

      const [att, myL, myC, adL, adC] = await Promise.all([
        attP,
        myLeaveP,
        myCorrP,
        adminLeaveP,
        adminCorrP,
      ]);

      if (cancelled) return;

      // 打刻状態
      const rec = att.data?.[0];
      let todayClockState: MyStatusData['todayClockState'] = 'not-started';
      let clockInTime: string | null = null;
      let clockOutTime: string | null = null;
      if (rec) {
        clockInTime = hhmm(rec.clock_in);
        clockOutTime = hhmm(rec.clock_out);
        if (rec.clock_out) todayClockState = 'finished';
        else if (rec.clock_in) todayClockState = 'working';
        else todayClockState = 'not-started';
      }

      const myPending = (myL.count ?? 0) + (myC.count ?? 0);
      const adminPending = isAdmin ? (adL.count ?? 0) + (adC.count ?? 0) : null;

      logger.log('[OfficeHub:home:mystatus] loaded', {
        todayClockState,
        myPending,
        adminPending,
      });

      setData({
        todayClockState,
        clockInTime,
        clockOutTime,
        myPendingCount: myPending,
        adminPendingCount: adminPending,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, isAdmin, reloadKey]);

  return { data, loading, reload };
}
