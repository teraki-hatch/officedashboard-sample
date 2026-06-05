import { PlaceholderPage } from '../components/PlaceholderPage';
import { useAuth } from '../contexts/AuthContext';
import { GoogleConnectionCard } from '../features/calendar/GoogleConnectionCard';

/**
 * 設定ページ (admin専用)
 * - アカウント情報
 * - Googleカレンダー連携 (admin自身の連携管理用に残す)
 */
export function SettingsPage() {
  const { user, isDemoMode } = useAuth();
  const name =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'ゲスト';

  return (
    <PlaceholderPage
      title="設定"
      subtitle="アカウント情報と連携状況を確認できます"
    >
      <div className="settings-stack">
        <section className="settings-section">
          <h3 className="settings-section__title">アカウント情報</h3>
          <dl className="settings-dl">
            <dt>ログインユーザー</dt>
            <dd>{name}</dd>

            <dt>認証モード</dt>
            <dd>{isDemoMode ? 'デモモード (Supabase 未接続)' : 'Supabase 認証'}</dd>
          </dl>
        </section>

        <section className="settings-section">
          <h3 className="settings-section__title">外部サービス連携</h3>
          <GoogleConnectionCard />
        </section>
      </div>

      <style>{`
        .settings-stack {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
        .settings-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .settings-section__title {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink-mute);
          letter-spacing: 0.04em;
          margin: 0;
          text-transform: uppercase;
          border-bottom: 1px solid var(--line);
          padding-bottom: 6px;
        }
        .settings-dl {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 10px 16px;
          margin: 0;
        }
        .settings-dl dt {
          color: var(--ink-mute);
          font-size: 13px;
        }
        .settings-dl dd {
          margin: 0;
          font-size: 14px;
        }
      `}</style>
    </PlaceholderPage>
  );
}
