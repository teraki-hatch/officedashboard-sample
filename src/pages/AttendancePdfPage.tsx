import { AttendancePdfView } from '../features/admin/AttendancePdfView';

/**
 * 月次PDF出力ページ (admin専用)
 */
export function AttendancePdfPage() {
  return (
    <div style={{ padding: '0' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--ink)' }}>
          月次PDF出力
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '4px 0 0' }}>
          社員別の月次勤怠を PDF で出力します。
        </p>
      </header>
      <AttendancePdfView />
    </div>
  );
}

export default AttendancePdfPage;
