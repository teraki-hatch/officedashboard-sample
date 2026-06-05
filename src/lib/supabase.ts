import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

/**
 * Supabase クライアント (OfficeHub 専用)
 * --------------------------------------------------------------
 * 接続方針 (Phase 3-3 時点):
 *
 * - 既存勤怠システム (timetrack-app-clean) と **同じ Supabase プロジェクト**
 *   に接続する。.env で VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を設定。
 *
 * - ただし**セッションは完全に分離**する:
 *     既存システム: storageKey = 'timetrack-auth'
 *     OfficeHub  : storageKey = 'officehub-auth'
 *
 * - 現フェーズでは **読み取り専用**。
 *
 * - .env 未設定時はクラッシュさせず、null を返す。
 * --------------------------------------------------------------
 */

// 既存システム (timetrack-app-clean) と同じ変数名を使用
const ENV_NAMES = {
  url: 'VITE_SUPABASE_URL',
  anonKey: 'VITE_SUPABASE_ANON_KEY',
} as const;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// ─────────────────────────────────────────────────────────────
// 安全なデバッグログ (キー本体は絶対に出さない)
// ─────────────────────────────────────────────────────────────
// 出すのは「存在するか」「形式が妥当か」「使っている変数名」だけ。
// 値そのもの (URL本体・ANON KEY本体) は console にも画面にも出さない。
//
// 開発本番問わず一度だけ実行。Vercel のデプロイ後に DevTools >
// Console を開いて確認できる。
// ─────────────────────────────────────────────────────────────
let _debugLogged = false;
function debugLogConfigOnce() {
  if (_debugLogged) return;
  _debugLogged = true;

  const urlHasValue = Boolean(url && url.length > 0);
  const urlStartsWithHttps = Boolean(url && url.startsWith('https://'));
  const urlContainsSupabase = Boolean(url && url.includes('supabase.co'));
  const anonKeyHasValue = Boolean(anonKey && anonKey.length > 0);

  // 念のため: 値そのものは出さず、長さだけ参考情報として出す
  const urlLength = url?.length ?? 0;
  const anonKeyLength = anonKey?.length ?? 0;
  logger.log('[OfficeHub:supabase] config check', {
    envVarNames: ENV_NAMES,
    VITE_SUPABASE_URL_present: urlHasValue,
    VITE_SUPABASE_URL_starts_with_https: urlStartsWithHttps,
    VITE_SUPABASE_URL_contains_supabase_co: urlContainsSupabase,
    VITE_SUPABASE_URL_length: urlLength,
    VITE_SUPABASE_ANON_KEY_present: anonKeyHasValue,
    VITE_SUPABASE_ANON_KEY_length: anonKeyLength,
  });

  // 形式不正なら追加で警告
  if (urlHasValue && !urlStartsWithHttps) {
    logger.warn(
      '[OfficeHub:supabase] VITE_SUPABASE_URL が "https://" で始まっていません。' +
        'Vercel の環境変数を確認してください (前後の空白・引用符・スキーム漏れ等)。'
    );
  }
  if (urlHasValue && !urlContainsSupabase) {
    logger.warn(
      '[OfficeHub:supabase] VITE_SUPABASE_URL に "supabase.co" が含まれていません。' +
        '別のドメインや誤入力の可能性があります。'
    );
  }
  if (!urlHasValue || !anonKeyHasValue) {
    logger.warn(
      `[OfficeHub:supabase] 必要な環境変数が未設定です: ` +
        `${!urlHasValue ? ENV_NAMES.url : ''}${!urlHasValue && !anonKeyHasValue ? ', ' : ''}` +
        `${!anonKeyHasValue ? ENV_NAMES.anonKey : ''}`
    );
  }
}

// モジュール読み込み時に1回だけログ出力
debugLogConfigOnce();

let _client: SupabaseClient | null = null;

/**
 * Supabase クライアントを返す。未設定なら null。
 */
export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) {
    return null;
  }
  if (!_client) {
    _client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'officehub-auth',
      },
    });
  }
  return _client;
}

/** Supabase 接続情報が設定されているか */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

/**
 * 接続診断情報 (画面表示用)。
 * キー本体は含めない。
 */
export type SupabaseConfigDiagnosis = {
  envVarNames: { url: string; anonKey: string };
  urlPresent: boolean;
  urlStartsWithHttps: boolean;
  urlContainsSupabaseCo: boolean;
  urlLength: number;
  anonKeyPresent: boolean;
  anonKeyLength: number;
};

export function getSupabaseConfigDiagnosis(): SupabaseConfigDiagnosis {
  return {
    envVarNames: { url: ENV_NAMES.url, anonKey: ENV_NAMES.anonKey },
    urlPresent: Boolean(url && url.length > 0),
    urlStartsWithHttps: Boolean(url && url.startsWith('https://')),
    urlContainsSupabaseCo: Boolean(url && url.includes('supabase.co')),
    urlLength: url?.length ?? 0,
    anonKeyPresent: Boolean(anonKey && anonKey.length > 0),
    anonKeyLength: anonKey?.length ?? 0,
  };
}
