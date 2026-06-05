import { PlaceholderPage } from '../components/PlaceholderPage';
import { EXTERNAL_LINKS } from '../config/links';

export function TaskPage() {
  return (
    <PlaceholderPage
      title="タスク管理"
      subtitle="既存のタスク管理システムへの導線です"
      statusLabel={EXTERNAL_LINKS.task ? '外部システム' : '仮ページ'}
      externalUrl={EXTERNAL_LINKS.task || undefined}
      externalLabel="既存のタスク管理システムを開きます。"
    >
      <p className="placeholder__msg">
        タスク管理は現在、仮ページとして表示しています。
        既存タスク管理システムの URL を <code>.env</code> の <code>VITE_LINK_TASK_URL</code> に
        設定すると、サイドバーから直接遷移できるようになります。
      </p>
    </PlaceholderPage>
  );
}
