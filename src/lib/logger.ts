/**
 * Logger — 本番ビルドではログ出力を抑制するラッパ
 * --------------------------------------------------------------
 * Vite は `import.meta.env.DEV` を `true`/`false` の定数として
 * バンドル時に置換するため、本番ビルドでは `if (false) { ... }` となり
 * デッドコード除去で最適化される (= ログ呼び出しが本番には残らない)。
 *
 * 使い方:
 *   import { logger } from '../../lib/logger';
 *   logger.log('[OfficeHub:auth] init session start');
 *   logger.warn('[OfficeHub:auth] safety timeout');
 *
 * エラー (logger.error) は本番でも出力する。ブラウザの
 * デフォルトハンドラやエラー監視ツールに拾わせるため。
 *
 * デバッグ時は通常の console と同じく振る舞う。
 * --------------------------------------------------------------
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /** 開発時のみ出力 (通常の診断ログ) */
  log: (...args: unknown[]): void => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  },
  /** 開発時のみ出力 (警告系) */
  warn: (...args: unknown[]): void => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.warn(...args);
    }
  },
  /** 本番でも出力 (エラー系) */
  error: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    console.error(...args);
  },
};
