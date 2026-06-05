import { useState } from 'react';
import { ClockPanel } from '../features/kintai/ClockPanel';
import { AttendanceCalendar } from '../features/kintai/AttendanceCalendar';
import { CorrectionRequestList } from '../features/kintai/CorrectionRequestList';
import { RequestsPanel } from '../features/requests/RequestsPanel';
import './KintaiPage.css';

/**
 * 勤怠管理ページ
 * - 打刻 / 勤怠カレンダー / 休暇申請 / 修正申請 の4タブ
 * - 有休管理(管理者)・申請承認・月次締め・月次PDF出力 は
 *   サイドバー側の「社員・組織」「申請承認」に移動済み
 */

type TabKey = 'clock' | 'calendar' | 'requests' | 'corrections';

type TabDef = {
  key: TabKey;
  label: string;
  description: string;
};

const TABS: TabDef[] = [
  {
    key: 'clock',
    label: '打刻',
    description: '出勤・退勤・休憩開始・休憩終了の打刻を行います。',
  },
  {
    key: 'calendar',
    label: '勤怠カレンダー',
    description: '月別の勤怠実績を確認します。',
  },
  {
    key: 'requests',
    label: '休暇申請',
    description: '休暇申請の作成、申請履歴の確認を行います。',
  },
  {
    key: 'corrections',
    label: '修正申請',
    description: '勤怠修正の申請履歴・ステータス確認、承認待ち申請の取下げを行います。',
  },
];

export function KintaiPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('clock');

  return (
    <div className="kintai">
      <header className="kintai__head">
        <div>
          <h1 className="kintai__title">勤怠管理</h1>
          <p className="kintai__subtitle">
            打刻・勤怠カレンダー・休暇申請・修正申請を行います。
          </p>
        </div>
      </header>

      <nav className="kintai-tabs" role="tablist" aria-label="勤怠管理メニュー">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className={`kintai-tabs__tab ${activeTab === t.key ? 'kintai-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeTab === 'clock' ? (
        <ClockPanel />
      ) : activeTab === 'calendar' ? (
        <AttendanceCalendar />
      ) : activeTab === 'requests' ? (
        <RequestsPanel />
      ) : (
        <CorrectionRequestList />
      )}
    </div>
  );
}
