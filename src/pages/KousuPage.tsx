import { KousuCalendar } from '../features/kousu/KousuCalendar';
import './KousuPage.css';

/**
 * 工数管理ページ (Phase 4-1)
 * --------------------------------------------------------------
 * /kousu でアクセス可能。
 * 自分の月次工数を閲覧 + CRUD。
 * --------------------------------------------------------------
 */

export function KousuPage() {
  return (
    <div className="kousu">
      <header className="kousu__head">
        <div>
          <h1 className="kousu__title">工数管理</h1>
          <p className="kousu__subtitle">
            自分の工数を月ごとに登録・編集できます。
          </p>
        </div>
      </header>

      <KousuCalendar />
    </div>
  );
}
