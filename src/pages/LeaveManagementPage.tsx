import { LeaveAdminPanel } from '../features/requests/LeaveAdminPanel';

/**
 * 有休管理ページ (admin専用)
 * - 旧: 勤怠管理ページの「有休管理」タブ
 * - 新: サイドバー「社員・組織 > 有休管理」配下の独立ページ
 */
export function LeaveManagementPage() {
  return (
    <div style={{ padding: '0' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--ink)' }}>
          有休管理
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '4px 0 0' }}>
          全社員の有休残数・付与・履歴を管理します。
        </p>
      </header>
      <LeaveAdminPanel />
    </div>
  );
}

export default LeaveManagementPage;
