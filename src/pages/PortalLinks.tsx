import { useState } from 'react';

type PortalItem = {
  key: string;
  title: string;
  description: string;
  icon: string;
};

const PORTAL_ITEMS: PortalItem[] = [
  {
    key: 'rules',
    title: 'ルール・制度',
    description: '社内規程・各種制度の確認',
    icon: '📋',
  },
  {
    key: 'company',
    title: '会社について',
    description: '会社情報・組織図など',
    icon: '🏢',
  },
  {
    key: 'meeting',
    title: '定例会議',
    description: 'クライアント別進捗管理',
    icon: '💬',
  },
];

// デモ用のダミー内容（画面内にインライン表示）
const PORTAL_CONTENT: Record<string, { h: string; lines: string[] }[]> = {
  rules: [
    { h: '勤務時間', lines: ['フレックスタイム制（標準7時間/日）', 'コアタイムなし'] },
    {
      h: '休暇制度',
      lines: ['年次有給休暇 / 慶弔休暇 / 特別休暇', '取得は「申請承認」から'],
    },
    {
      h: '経費精算',
      lines: ['月末締め・翌月10日まで申請', '領収書は写真を添付'],
    },
  ],
  company: [
    {
      h: '会社概要',
      lines: [
        '会社名: 株式会社サンプル（デモ）',
        '設立: 20XX年',
        '事業内容: マーケティング支援・組織開発',
      ],
    },
    { h: '拠点', lines: ['本社 / 支社（デモ用ダミー）'] },
  ],
  meeting: [
    {
      h: 'クライアント別進捗（サンプル）',
      lines: [
        'あおぞら商事 — 隔週MTG',
        'みどり製作所 — 月次レビュー',
        'ひかりデザイン — 週次共有',
      ],
    },
  ],
};

const STYLE = `
.pl-wrap { max-width: 1100px; }
.pl-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}
.pl-title { font-size: 18px; font-weight: 700; color: #1A1A1A; margin: 0; }
.pl-sub { font-size: 12px; color: #9A9A9A; }
.pl-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
@media (max-width: 900px) { .pl-grid { grid-template-columns: 1fr; } }
.pl-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid #E6E6E6;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: border-color .15s ease, background .15s ease;
}
.pl-card:hover { border-color: #1A1A1A; background: #FAFAFA; }
.pl-card:focus { outline: none; }
.pl-card:focus-visible { outline: 2px solid #1A1A1A; outline-offset: 2px; }
.pl-card.is-active { border-color: #1A1A1A; background: #F5F5F5; }
.pl-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #F0F0F0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex: 0 0 auto;
}
.pl-card-text { display: flex; flex-direction: column; }
.pl-card-title { font-size: 14px; font-weight: 700; color: #1A1A1A; }
.pl-card-desc { font-size: 12px; color: #6B6B6B; margin-top: 2px; }
.pl-panel {
  border: 1px solid #E6E6E6;
  border-radius: 12px;
  background: #fff;
  padding: 24px;
}
.pl-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #1A1A1A;
  margin-bottom: 16px;
}
.pl-section { margin-bottom: 16px; }
.pl-section-h { font-weight: 700; color: #1A1A1A; margin-bottom: 6px; }
.pl-section ul { margin: 0; padding-left: 18px; color: #444444; line-height: 1.8; }
.pl-note {
  margin-top: 8px;
  padding: 10px 12px;
  background: #F5F5F5;
  border: 1px solid #E6E6E6;
  border-radius: 8px;
  font-size: 12px;
  color: #6B6B6B;
}
`;

export function PortalLinks() {
  const [activeKey, setActiveKey] = useState<string>('rules');
  const active = PORTAL_ITEMS.find((i) => i.key === activeKey) ?? PORTAL_ITEMS[0];
  const sections = PORTAL_CONTENT[active.key] ?? [];

  return (
    <section className="pl-wrap">
      <style>{STYLE}</style>

      <div className="pl-header">
        <h2 className="pl-title">ポータル</h2>
        <span className="pl-sub">カードを選ぶと内容が表示されます（デモ用）</span>
      </div>

      <div className="pl-grid">
        {PORTAL_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={item.key === active.key ? 'pl-card is-active' : 'pl-card'}
            onClick={() => setActiveKey(item.key)}
          >
            <span className="pl-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="pl-card-text">
              <span className="pl-card-title">{item.title}</span>
              <span className="pl-card-desc">{item.description}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="pl-panel">
        <div className="pl-panel-head">
          {active.icon} {active.title}
        </div>
        {sections.map((sec, i) => (
          <div className="pl-section" key={i}>
            <div className="pl-section-h">{sec.h}</div>
            <ul>
              {sec.lines.map((line, j) => (
                <li key={j}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
        <div className="pl-note">※ これはデモ用のサンプル内容です。</div>
      </div>
    </section>
  );
}
