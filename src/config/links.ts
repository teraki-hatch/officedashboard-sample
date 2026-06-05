/**
 * 既存システムへのリンク定義
 * --------------------------------------------------------------
 * OfficeHub からは「URL リンクで繋ぐだけ」。
 * 既存システムのコード・テーブル・RLS には一切手を入れない方針。
 *
 * デフォルト URL は既存システムの本番 URL。
 * 環境変数 (.env / VITE_LINK_*) が設定されていればそちらを優先する。
 * --------------------------------------------------------------
 */

const DEFAULTS = {
  kintai: 'https://timetrack-app-clean.vercel.app/',
  kousu: 'https://timetrack-app-clean.vercel.app/',
  task: 'https://taskboard-qebo5fmi7-teraki0801-s-projects.vercel.app/',
} as const;

export const EXTERNAL_LINKS = {
  kintai: import.meta.env.VITE_LINK_KINTAI_URL || DEFAULTS.kintai,
  kousu: import.meta.env.VITE_LINK_KOUSU_URL || DEFAULTS.kousu,
  task: import.meta.env.VITE_LINK_TASK_URL || DEFAULTS.task,
} as const;

export type ExternalLinkKey = keyof typeof EXTERNAL_LINKS;
