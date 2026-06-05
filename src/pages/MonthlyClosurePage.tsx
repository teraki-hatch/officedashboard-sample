import { MonthlyClosurePanel } from '../features/closure/MonthlyClosurePanel';

/**
 * 月次締めページ (admin専用)
 * - 旧: 勤怠管理ページの「管理者 > 月次締め」
 * - 新: サイドバー「申請承認 > 月次締め」配下の独立ページ
 */
export function MonthlyClosurePage() {
  return (
    <div style={{ padding: '0' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--ink)' }}>
          月次締め
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '4px 0 0' }}>
          月次の勤怠・工数を締めて確定します。
        </p>
      </header>
      <MonthlyClosurePanel />
    </div>
  );
}

export default MonthlyClosurePage;
