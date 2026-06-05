import { logger } from '../lib/logger';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';

/**
 * AuthContext (簡素化版)
 * --------------------------------------------------------------
 * このコンテキストは「Supabase Auth のセッション情報だけ」を扱う。
 *
 * かつては public.users から取得した appUser もここで持っていたが、
 * 「グローバル状態に依存して、一度ハングすると全画面が詰む」問題があった。
 *
 * 改修方針:
 *   - appUser は外した
 *   - 各画面が必要なタイミングで useAppUser フックを呼んで自前で取得
 *   - リロード手段も各画面で持つ (画面単位の自己治癒性)
 *
 * このコンテキストの責務:
 *   - Supabase Auth セッションの取得 / 監視 (onAuthStateChange)
 *   - signIn / signOut の薄いラッパ
 *   - デモモード (.env 未設定時のフォールバック)
 *
 * 既存テーブル・RLS は一切触らない。
 * --------------------------------------------------------------
 */

type AuthState = {
  /** Supabase Auth のユーザー (= auth.users) */
  user: User | null;
  session: Session | null;
  /** 初回セッション復元中 */
  loading: boolean;
  /** Supabase 未設定 (.env が空) */
  isDemoMode: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInAsDemo: (displayName: string) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const DEMO_USER_KEY = 'officehub.demoUser';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // デモモード (Supabase 未設定時)
  const [demoName, setDemoName] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : window.localStorage.getItem(DEMO_USER_KEY)
  );

  const supabase = getSupabase();
  const isDemoMode = supabase === null;

  // 安全網: 起動から 15 秒で強制 loading=false
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          logger.warn('[OfficeHub:auth] safety timeout — forcing loading=false');
        }
        return false;
      });
    }, 15000);
    return () => window.clearTimeout(timer);
  }, []);

  // セッション復元 + 監視
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    // 初回セッション取得 (try/finally で必ず loading=false にする)
    (async () => {
      logger.log('[OfficeHub:auth] init session start');
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        logger.log('[OfficeHub:auth] init session got', {
          hasSession: Boolean(data.session),
          hasUser: Boolean(data.session?.user),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('[OfficeHub:auth] init session threw', { errorMessage: msg });
      } finally {
        if (active) {
          setLoading(false);
          logger.log('[OfficeHub:auth] init session done -> loading=false');
        }
      }
    })();

    // Auth 状態変化のリスナ
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      logger.log('[OfficeHub:auth] onAuthStateChange', {
        event,
        hasUser: Boolean(s?.user),
      });
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
    // supabase はモジュールシングルトン
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthState>(() => {
    // デモユーザー (.env 未設定時のフォールバック)
    const demoUser: User | null = demoName
      ? ({
          id: 'demo-user',
          email: `${demoName}@demo.local`,
          user_metadata: { full_name: demoName },
          app_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User)
      : null;

    return {
      user: user ?? demoUser,
      session,
      loading,
      isDemoMode,
      signInWithEmail: async (email, password) => {
        if (!supabase) return { error: 'Supabase が未設定です' };
        logger.log('[OfficeHub:auth] signIn attempt');
        try {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) {
            logger.log('[OfficeHub:auth] signIn error', { message: error.message });
            return { error: error.message };
          }
          logger.log('[OfficeHub:auth] signIn result: OK');
          return { error: null };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.log('[OfficeHub:auth] signIn threw', { errorMessage: msg });
          return { error: msg };
        }
      },
      signInAsDemo: (displayName: string) => {
        window.localStorage.setItem(DEMO_USER_KEY, displayName);
        setDemoName(displayName);
      },
      signOut: async () => {
        window.localStorage.removeItem(DEMO_USER_KEY);
        setDemoName(null);
        if (supabase) {
          await supabase.auth.signOut();
        }
      },
    };
  }, [user, session, loading, isDemoMode, supabase, demoName]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
