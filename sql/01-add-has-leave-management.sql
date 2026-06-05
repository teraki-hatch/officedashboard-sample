-- =============================================================
-- Phase 3-8 補完: users テーブルに「有休管理対象」フラグを追加
-- =============================================================
-- 目的:
--   役員・パートなど「有休管理の対象外」のユーザーを
--   OfficeHub の有休管理タブから除外できるようにする。
--
-- 既存システム (timetrack-app-clean) への影響:
--   ✅ なし
--   - 全 SELECT は明示的なカラム指定 or `SELECT *` (キーアクセスのみ)
--   - UPDATE は payload に含まれるカラムだけを更新
--   - 新カラムが追加されても、既存コードは無視するだけ
--
-- 実行手順:
--   1. Supabase ダッシュボード → SQL Editor を開く
--   2. このファイルの内容を貼り付け
--   3. RUN ボタンをクリック
--   4. 完了後、データ更新 (下の UPDATE 文を必要に応じて編集して実行)
-- =============================================================

-- ── 1) カラム追加 (デフォルト true = 有休管理対象) ──
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS has_leave_management BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.has_leave_management IS
  'OfficeHub有休管理タブの表示対象。役員・パート等で年休管理しない人は false。';

-- ── 2) 役員・パートを false に (氏名で対象を特定) ──
-- 注意: 実際の氏名や employee_code に合わせて条件を編集してください。
-- 下記は「教えていただいた4名」を対象としています:
--   - 長下 大樹  (役員)
--   - 寺木 美鈴  (役員)
--   - 浦田 瑶子  (パート)
--   - 山口 順子  (パート)

UPDATE public.users
SET has_leave_management = false
WHERE
  -- 名前で指定 (姓と名の間にスペースを入れているケースも考慮)
  REPLACE(REPLACE(name, ' ', ''), ' ', '') IN (
    '長下大樹',
    '寺木美鈴',
    '浦田瑶子',
    '山口順子'
  );

-- ── 3) 結果確認 ──
SELECT
  employee_code,
  name,
  email,
  role,
  has_leave_management
FROM public.users
WHERE status = 'active'
ORDER BY employee_code;
