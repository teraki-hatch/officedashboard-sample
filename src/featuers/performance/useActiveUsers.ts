import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

export type ActiveUser = {
  id: string;
  name: string;
  employee_code: string;
};

type UseActiveUsersResult = {
  users: ActiveUser[];
  loading: boolean;
  error: string | null;
};

/**
 * 業績管理の対象外とする社員の employee_code
 * (浦田 瑶子, 山口 順子)
 */
const PERFORMANCE_EXCLUDED_CODES = ['0001', '003'];

// resigned_at が null の社員一覧 (業績管理対象外の社員は除外)
export function useActiveUsers(): UseActiveUsersResult {
  const [users, setUsers] = useState<ActiveUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabase();
        if (!supabase) {
          throw new Error('Supabase client not initialized');
        }

        const { data, error: dbError } = await withTimeout(
          supabase
            .from('users')
            .select('id, name, employee_code')
            .is('resigned_at', null)
            .order('employee_code', { ascending: true }),
          10000,
          'active users fetch'
        );

        if (dbError) throw dbError;

        if (!cancelled) {
          const filtered = ((data || []) as ActiveUser[]).filter(
            (u) => !PERFORMANCE_EXCLUDED_CODES.includes(u.employee_code)
          );
          setUsers(filtered);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('useActiveUsers error:', msg);
        if (!cancelled) {
          setError(msg);
          setUsers([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { users, loading, error };
}
