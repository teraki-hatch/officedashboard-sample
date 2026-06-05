import { AdminApprovalPanel } from '../features/requests/AdminApprovalPanel';

/**
 * 申請承認ページ (admin専用)
 * - 旧: 勤怠管理ページの「管理者 > 申請の承認」
 * - 新: サイドバー「申請承認 > 申請の承認」配下の独立ページ
 */
export function ApprovalPage() {
  return (
    <div style={{ padding: '0' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--ink)' }}>
          申請の承認
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '4px 0 0' }}>
          全ユーザーの申請を確認し、承認または却下できます。
        </p>
      </header>
      <AdminApprovalPanel />
    </div>
  );
}

export default ApprovalPage;
