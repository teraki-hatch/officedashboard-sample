import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from './supabase';
import { withTimeout } from './withTimeout';
import { logger } from './logger';

/**
 * useAppUser — 画面が自分で public.users から自分の行を取得するフック
 * --------------------------------------------------------------
 * 設計理由:
 *   従来は AuthContext で `appUser` を全画面共有していたが、
 *   - 取得経路が複数 (init / onAuthStateChange / self-heal / 手動)
 *   - グローバル状態に依存するので一度ハングすると全画面が詰む
 *   - 復旧手段が「再ログイン or リロード」だけ
 *   という不安定さがあった。
 *
 *   このフックは各画面が独立に必要なタイミングで取得する:
 *   - Supabase Auth セッションが取れたら、その user.id を auth_user_id として SELECT
 *   - タイムアウト 10秒で諦める
 *   - 失敗時は reload() で再試行可能
 *   - グローバル状態を一切持たない
 *
 * 既存テーブル・RLS は変更しない。SELECT のみ。
 * --------------------------------------------------------------
 */

export type AppUser = {
  id: string;
  auth_user_id?: string | null;
  email?: string | null;
  name?: string | null;
  employee_code?: string | null;
  role?: string | null;
  status?: string | null;
  has_leave_management?: boolean | null;
};

export type UseAppUserState = {
  /** 取得済みの appUser (null = 未取得 or 取得失敗) */
  appUser: AppUser | null;
  /** Supabase Auth がまだセッション復元中 or users SELECT 実行中 */
  loading: boolean;
  /** 接続未設定 (.env 未設定) */
  configured: boolean;
  /** エラーメッセージ (取得失敗の理由) */
  error: string | null;
  /** Supabase Auth に user が存在するか (true なのに appUser が null なら異常) */
  hasAuthUser: boolean;
  /** 手動再取得 */
  reload: () => void;
};

function rowToAppUser(row: Record<string, unknown>): AppUser {
  return {
    id: String(row.id),
    auth_user_id: (row.auth_user_id as string | null | undefined) ?? null,
    email: (row.email as string | null | undefined) ?? null,
    name: (row.name as string | null | undefined) ?? null,
    employee_code:
      (row.employee_code as string | null | undefined) ?? null,
    role: (row.role as string | null | undefined) ?? null,
    status: (row.status as string | null | undefined) ?? null,
    has_leave_management:
      (row.has_leave_management as boolean | null | undefined) ?? null,
  };
}

export function useAppUser(): UseAppUserState {
  const supabase = getSupabase();
  const configured = supabase !== null;

  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState<boolean>(configured);
  const [error, setError] = useState<string | null>(null);
  const [hasAuthUser, setHasAuthUser] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError(null);
      setAppUser(null);
      setHasAuthUser(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    logger.log('[OfficeHub:appuser] fetch start');

    (async () => {
      try {
        // 1) Auth セッションから auth_user_id を取る
        type AuthRes = { data: { user: { id: string } | null } };
        const authRes = await withTimeout<AuthRes>(
          supabase.auth.getUser() as unknown as Promise<AuthRes>,
          10000,
          'auth.getUser'
        );

        if (!active) return;

        const authUserId = authRes.data.user?.id ?? null;
        setHasAuthUser(Boolean(authUserId));

        if (!authUserId) {
          logger.log('[OfficeHub:appuser] no auth user');
          setAppUser(null);
          setError(null);
          setLoading(false);
          return;
        }

        // 2) public.users から自分の行を取る
        type UserRes = {
          data: Record<string, unknown> | null;
          error: { message: string; code?: string } | null;
        };
        const res = await withTimeout<UserRes>(
          supabase
            .from('users')
            .select('*')
            .eq('auth_user_id', authUserId)
            .maybeSingle() as unknown as Promise<UserRes>,
          10000,
          'SELECT users (own row)'
        );

        if (!active) return;
        logger.log('[OfficeHub:appuser] fetch done', {
          hasData: Boolean(res.data),
          errorCode: res.error?.code ?? null,
          errorMessage: res.error?.message ?? null,
        });

        if (res.error) {
          setError(`プロフィール取得エラー: ${res.error.message}`);
          setAppUser(null);
        } else if (!res.data) {
          setError(
            '社員マスタ (public.users) に該当ユーザーが見つかりません。管理者にご確認ください。'
          );
          setAppUser(null);
        } else {
          setError(null);
          setAppUser(rowToAppUser(res.data));
        }
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('[OfficeHub:appuser] fetch threw', { errorMessage: msg });
        setError(`プロフィール取得エラー: ${msg}`);
        setAppUser(null);
      } finally {
        if (active) {
          setLoading(false);
          logger.log('[OfficeHub:appuser] fetch finally -> loading=false');
        }
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  return { appUser, loading, configured, error, hasAuthUser, reload };
}
