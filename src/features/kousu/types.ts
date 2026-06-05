// Phase C-5 (cont.): clients.color 復活
/**
 * 工数管理 (Phase 4-1) の型定義
 * --------------------------------------------------------------
 * Phase C-3: クライアント直紐付け方式に変更
 *   旧: time_entries → projects → clients (二段経由)
 *   新: time_entries → clients (直接)
 *
 * 「社内業務」も clients に擬似クライアント (is_internal=true) として持つ。
 *
 * Phase C-5: clients.color を追加 (DB に color カラム追加済)
 * --------------------------------------------------------------
 */

export type Client = {
  id: string;
  name: string;
  is_active?: boolean;
  is_internal?: boolean;
  color?: string | null;
};

/** 案件 (performance_deals) - 工数の紐付け先 */
export type Deal = {
  id: string;
  client_id: string | null;
  deal_name: string | null;
  status: string;
  /** JOIN: client */
  client?: Client | null;
};

export type WorkCategory = {
  id: string;
  name: string;
  icon?: string | null;
  display_order?: number;
  status?: string;
};

/** 工数エントリ (time_entries テーブル) */
export type TimeEntry = {
  id: string;
  user_id: string;
  /** "YYYY-MM-DD" */
  date: string;
  client_id: string;
  /** 案件ID (新規追加 - 既存データは null の可能性あり) */
  deal_id?: string | null;
  work_category_id: string;
  hours: number;
  /** 作業のタイトル (短く要約) */
  title: string | null;
  /** 詳細メモ (任意) */
  memo: string | null;
  source: string | null;
  google_calendar_event_id?: string | null;
  event_title?: string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  imported_at?: string | null;
  created_at?: string;
  updated_at?: string;
  /** JOIN: client (client_id 経由) */
  client?: Client | null;
  /** JOIN: deal (deal_id 経由) */
  deal?: Deal | null;
  /** JOIN: category (work_category_id 経由) */
  category?: WorkCategory | null;
};

/** モーダル等で入力されるエントリのフォーム値 */
export type EntryFormValues = {
  clientId: string;
  workCategoryId: string;
  hours: string; // 文字列のまま保持して、保存時にパース
  title: string;
  memo: string;
};
