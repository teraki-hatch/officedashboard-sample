// Phase: Googleカレンダー接続管理フック
// - 接続状態の取得 (events関数を date 無しで叩いて connected を判定)
// - OAuth 開始 URL を取得して新タブを開く
// - 接続解除
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

type Status = {
  initialized: boolean;
  connected: boolean;
  googleEmail: string | null;
  loading: boolean;
  error: string | null;
};

type EventsResponse = {
  connected: boolean;
  google_email?: string | null;
  events?: unknown[];
  error?: string;
};

type AuthStartResponse = {
  // 実際のEdge Functionは authUrl (camelCase) で返してくる
  authUrl?: string;
  // 念のため auth_url (snake_case) も受け付ける
  auth_url?: string;
  error?: string;
};

export function useGoogleConnection() {
  const [status, setStatus] = useState<Status>({
    initialized: false,
    connected: false,
    googleEmail: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const supabase = getSupabase();
      if (!supabase) {
        setStatus({
          initialized: true,
          connected: false,
          googleEmail: null,
          loading: false,
          error: 'Supabase が未設定です',
        });
        return;
      }

      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        setStatus({
          initialized: true,
          connected: false,
          googleEmail: null,
          loading: false,
          error: 'ログインが必要です',
        });
        return;
      }

      const { data, error } = await withTimeout(
        supabase.functions.invoke<EventsResponse>('google-calendar-events', {
          body: {},
        }),
        15000,
        'google-calendar-events (status check)'
      );

      if (error) {
        setStatus({
          initialized: true,
          connected: false,
          googleEmail: null,
          loading: false,
          error: error.message,
        });
        return;
      }

      setStatus({
        initialized: true,
        connected: !!data?.connected,
        googleEmail: data?.google_email ?? null,
        loading: false,
        error: data?.error ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({
        initialized: true,
        connected: false,
        googleEmail: null,
        loading: false,
        error: msg,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * OAuth フローを開始する。
   * auth-start 関数から認証URLを受け取り、同タブで Google に遷移する。
   */
  const connect = useCallback(async (): Promise<void> => {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase が未設定です');

      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        throw new Error('ログインが必要です');
      }

      const { data, error } = await withTimeout(
        supabase.functions.invoke<AuthStartResponse>('google-calendar-auth-start', {
          body: {},
        }),
        10000,
        'google-calendar-auth-start'
      );

      if (error) throw error;
      // Edge Function は authUrl (camelCase) で返してくる。
      // 念のため auth_url (snake_case) も fallback で受け付ける。
      const url = data?.authUrl ?? data?.auth_url;
      if (!url) throw new Error('認証URLを取得できませんでした');

      logger.log('[OfficeHub:gcal] redirecting to Google OAuth');
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus((s) => ({ ...s, error: msg }));
    }
  }, []);

  const disconnect = useCallback(async (): Promise<boolean> => {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase が未設定です');

      const { error } = await withTimeout(
        supabase.functions.invoke('google-calendar-disconnect', { body: {} }),
        10000,
        'google-calendar-disconnect'
      );
      if (error) throw error;

      setStatus({
        initialized: true,
        connected: false,
        googleEmail: null,
        loading: false,
        error: null,
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus((s) => ({ ...s, error: msg }));
      return false;
    }
  }, []);

  return {
    ...status,
    refresh,
    connect,
    disconnect,
  };
}
