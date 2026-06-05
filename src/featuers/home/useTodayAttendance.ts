import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

/**
 * 今日の社内出勤状況フック (ホーム画面用)
 * --------------------------------------------------------------
 * 表示対象: has_attendance_management = true の active ユーザー
 *           (ただし「会社」ダミーユーザー employee_code='999' は除外)
 * --------------------------------------------------------------
 */

export type TodayMemberStatus =
  | 'working'
  | 'breaking'
  | 'finished'
  | 'not-started';

export type TodayMember = {
  id: string;
  name: string;
  employee_code: string | null;
  status: TodayMemberStatus;
  updatedAt: string | null;
};

export type UseTodayAttendanceState = {
  members: TodayMember[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

type UserRow = {
  id: string;
  name: string;
  employee_code: string | null;
};

type AttRow = {
  user_id: string;
  clock_in: string | null;
  clock_out: string | null;
};

type BreakRow = {
  user_id: string;
  break_start: string;
  break_end: string | null;
};

type SupaErr = { message: string; code?: string } | null;
type UsersRes = { data: UserRow[] | null; error: SupaErr };
type AttRes = { data: AttRow[] | null; error: SupaErr };
type BrkRes = { data: BreakRow[] | null; error: SupaErr };

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
  return (
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0')
  );
}

function toErr(e: unknown): { message: string } {
  return { message: e instanceof Error ? e.message : String(e) };
}

export function useTodayAttendance(enabled: boolean): UseTodayAttendanceState {
  const [members, setMembers] = useState<TodayMember[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !enabled) {
      setMembers([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    const today = todayStr();

    (async () => {
      try {
        const uP = withTimeout<UsersRes>(
          supabase
            .from('users')
            .select('id, name, employee_code')
            .eq('status', 'active')
            .eq('has_attendance_management', true)
            .neq('employee_code', '999')
            .order('employee_code') as unknown as Promise<UsersRes>,
          10000,
          'SELECT users (today-attendance)'
        ).catch((e): UsersRes => ({ data: null, error: toErr(e) }));

        const aP = withTimeout<AttRes>(
          supabase
            .from('attendance_records')
            .select('user_id, clock_in, clock_out')
            .eq('date', today) as unknown as Promise<AttRes>,
          10000,
          'SELECT attendance_records (today)'
        ).catch((e): AttRes => ({ data: null, error: toErr(e) }));

        const bP = withTimeout<BrkRes>(
          supabase
            .from('attendance_breaks')
            .select('user_id, break_start, break_end')
            .eq('date', today) as unknown as Promise<BrkRes>,
          10000,
          'SELECT attendance_breaks (today)'
        ).catch((e): BrkRes => ({ data: null, error: toErr(e) }));

        const [uRes, aRes, bRes] = await Promise.all([uP, aP, bP]);
        if (!active) return;

        logger.log('[OfficeHub:home:today-attendance] loaded', {
          users: uRes.data?.length ?? 0,
          attendance: aRes.data?.length ?? 0,
          breaks: bRes.data?.length ?? 0,
        });

        if (uRes.error) {
          setError('社員一覧の取得失敗: ' + uRes.error.message);
          setMembers([]);
          return;
        }

        const users = uRes.data ?? [];
        const att = aRes.data ?? [];
        const brk = bRes.data ?? [];

        const attByUser = new Map<string, AttRow>();
        for (const a of att) attByUser.set(a.user_id, a);

        const onBreak = new Set<string>();
        for (const b of brk) {
          if (b.break_end === null) onBreak.add(b.user_id);
        }

        const result: TodayMember[] = users.map((u) => {
          const a = attByUser.get(u.id);
          let status: TodayMemberStatus = 'not-started';
          let updatedAt: string | null = null;
          if (a) {
            if (a.clock_out) {
              status = 'finished';
              updatedAt = hhmm(a.clock_out);
            } else if (a.clock_in) {
              if (onBreak.has(u.id)) {
                status = 'breaking';
              } else {
                status = 'working';
              }
              updatedAt = hhmm(a.clock_in);
            }
          }
          return {
            id: u.id,
            name: u.name,
            employee_code: u.employee_code,
            status,
            updatedAt,
          };
        });

        setMembers(result);
        setError(null);
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError('通信エラー: ' + msg);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [enabled, reloadKey]);

  return { members, loading, error, reload };
}
