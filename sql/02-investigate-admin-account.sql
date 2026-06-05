-- =============================================================
-- 「管理者」アカウントの削除前調査
-- =============================================================
-- 目的:
--   不要な「管理者」アカウントを users テーブルから削除する前に、
--   そのユーザーに紐づくデータがあるかを確認する。
--
-- 重要:
--   外部キー制約により、関連データがあると削除できない (または
--   CASCADE 設定によっては関連データも一緒に消える) ため、
--   必ずこの SQL で事前確認すること。
-- =============================================================

-- ── Step 1: 「管理者」アカウントの存在と id を取得 ──
SELECT
  id,
  employee_code,
  name,
  email,
  role,
  status,
  created_at
FROM public.users
WHERE name LIKE '%管理者%'
   OR employee_code = 'ADMIN001'
   OR role = 'admin' AND name = '管理者';

-- 上記で id を控えてから、以下を実行 (id を貼り付け)
-- 仮に id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' とする

-- ── Step 2: 関連データのカウント ──
-- 以下のクエリの 'YOUR_USER_ID_HERE' を Step 1 で取得した id に置き換えて実行

/*
SELECT
  'attendance_records' AS table_name,
  COUNT(*) AS count
FROM public.attendance_records
WHERE user_id = 'YOUR_USER_ID_HERE'

UNION ALL

SELECT 'attendance_breaks', COUNT(*)
FROM public.attendance_breaks
WHERE user_id = 'YOUR_USER_ID_HERE'

UNION ALL

SELECT 'leave_requests', COUNT(*)
FROM public.leave_requests
WHERE user_id = 'YOUR_USER_ID_HERE'

UNION ALL

SELECT 'leave_balances', COUNT(*)
FROM public.leave_balances
WHERE user_id = 'YOUR_USER_ID_HERE'

UNION ALL

SELECT 'leave_grants', COUNT(*)
FROM public.leave_grants
WHERE user_id = 'YOUR_USER_ID_HERE'

UNION ALL

SELECT 'attendance_correction_requests', COUNT(*)
FROM public.attendance_correction_requests
WHERE user_id = 'YOUR_USER_ID_HERE'

UNION ALL

SELECT 'attendance_correction_requests (approved_by)', COUNT(*)
FROM public.attendance_correction_requests
WHERE approved_by = 'YOUR_USER_ID_HERE'

UNION ALL

SELECT 'attendance_correction_requests (rejected_by)', COUNT(*)
FROM public.attendance_correction_requests
WHERE rejected_by = 'YOUR_USER_ID_HERE'

UNION ALL

SELECT 'leave_requests (approved_by)', COUNT(*)
FROM public.leave_requests
WHERE approved_by = 'YOUR_USER_ID_HERE'

UNION ALL

SELECT 'leave_requests (rejected_by)', COUNT(*)
FROM public.leave_requests
WHERE rejected_by = 'YOUR_USER_ID_HERE';
*/

-- ── 結果の見方 ──
-- 全部 0 → 安全に DELETE できる
-- どこかに > 0 がある → 削除前にそのデータをどうするか検討
--   - 削除して問題ない: そのテーブルからも削除
--   - 残したい: 「管理者」を status='inactive' にする方が安全
