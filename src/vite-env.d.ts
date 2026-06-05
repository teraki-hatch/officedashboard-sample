/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_LINK_KINTAI_URL?: string;
  readonly VITE_LINK_KOUSU_URL?: string;
  readonly VITE_LINK_TASK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
