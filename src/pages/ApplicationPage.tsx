import { PlaceholderPage } from '../components/PlaceholderPage';

export function ApplicationPage() {
  return (
    <PlaceholderPage
      title="申請管理"
      subtitle="休暇申請・経費申請などをここに集約予定です"
      statusLabel="準備中"
    >
      <p className="placeholder__msg">
        申請管理の入口ページです。今後、申請フォームや承認ワークフローを追加していきます。
      </p>
    </PlaceholderPage>
  );
}
