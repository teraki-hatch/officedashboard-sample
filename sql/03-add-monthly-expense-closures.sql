-- =================================================================
-- 月次経費精算の締め機構 (勤怠の monthly_closures と同じパターン)
-- 2026-06-01: 経費にも「この月を提出」機能を追加
-- =================================================================

-- ========== 本体テーブル ==========
CREATE TABLE IF NOT EXISTS public.monthly_expense_closures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  year_month   text NOT NULL CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  status       text NOT NULL CHECK (status IN ('submitted', 'confirmed')),
  submitted_at timestamptz,
  submitted_by uuid REFERENCES public.users(id),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES public.users(id),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_closures_user_ym
  ON public.monthly_expense_closures (user_id, year_month);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_closures_status
  ON public.monthly_expense_closures (status);

-- updated_at 自動更新トリガー
-- (set_updated_at() 関数は勤怠側で既に存在するはず。なければ別途定義)
DROP TRIGGER IF EXISTS trg_monthly_expense_closures_updated_at
  ON public.monthly_expense_closures;

CREATE TRIGGER trg_monthly_expense_closures_updated_at
  BEFORE UPDATE ON public.monthly_expense_closures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== 監査ログ ==========
CREATE TABLE IF NOT EXISTS public.monthly_expense_closure_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  year_month text NOT NULL CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  action     text NOT NULL CHECK (action IN ('submitted', 'confirmed', 'rejected', 'unlocked')),
  actor_id   uuid,
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_closure_logs_user_ym
  ON public.monthly_expense_closure_logs (user_id, year_month);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_closure_logs_action
  ON public.monthly_expense_closure_logs (action);

-- ========== RLS ポリシー ==========
-- ※ 既存 monthly_closures に設定されているのと同等のポリシーを適用してください。
--   下記コマンドで現状確認できます:
--     SELECT * FROM pg_policies WHERE tablename = 'monthly_closures';
--   出てきた policy を、テーブル名だけ
--     monthly_closures            → monthly_expense_closures
--     monthly_closure_logs        → monthly_expense_closure_logs
--   に置換して適用すればOK。
--
-- 例 (典型的なケース):
-- ALTER TABLE public.monthly_expense_closures ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.monthly_expense_closure_logs ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "own_or_admin_select" ON public.monthly_expense_closures
--   FOR SELECT USING (
--     auth.uid() = user_id
--     OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
--   );
-- (以下 INSERT/UPDATE/DELETE も同様)
