import { useState } from 'react';
import './PortalLinks.css';

type PortalLink = {
  key: string;
  title: string;
  description: string;
  icon: string;
};

const PORTAL_LINKS: PortalLink[] = [
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
    key: 'library',
    title: 'てらき文庫',
    description: '社内ナレッジ・資料集',
    icon: '📚',
  },
  {
    key: 'meeting',
    title: '定例会議',
    description: 'クライアント別進捗管理',
    icon: '💬',
  },
];

// デモ用のダミー内容（外部リンクの代わりに、クリックでモーダル表示）
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
  library: [
    {
      h: '資料一覧（サンプル）',
      lines: [
        '提案書テンプレート',
        '議事録フォーマット',
        'デザインガイドライン',
        '新人研修マニュアル',
      ],
    },
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

export function PortalLinks() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const active = PORTAL_LINKS.find((l) => l.key === openKey);
  const sections = openKey ? PORTAL_CONTENT[openKey] ?? [] : [];

  return (
    <section className="portal-links">
      <div className="portal-links__header">
        <h2 className="portal-links__title">ポータル</h2>
        <span className="portal-links__subtitle">クリックで内容を表示（デモ用）</span>
      </div>
      <div className="portal-links__grid">
        {PORTAL_LINKS.map(({ key, title, description, icon }) => (
          <a
            key={key}
            role="button"
            tabIndex={0}
            className="portal-links__card"
            style={{ cursor: 'pointer' }}
            onClick={() => setOpenKey(key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpenKey(key);
              }
            }}
          >
            <div className="portal-links__icon-wrap" aria-hidden>
              {icon}
            </div>
            <div className="portal-links__body">
              <div className="portal-links__card-title">{title}</div>
              <div className="portal-links__card-desc">{description}</div>
            </div>
          </a>
        ))}
      </div>

      {active && (
        <div
          onClick={() => setOpenKey(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 560,
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #E6E6E6',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>
                {active.icon} {active.title}
              </div>
              <button
                type="button"
                onClick={() => setOpenKey(null)}
                aria-label="閉じる"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 22,
                  lineHeight: 1,
                  cursor: 'pointer',
                  color: '#6B6B6B',
                  padding: '4px 8px',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 20 }}>
              {sections.map((sec, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: '#1A1A1A',
                      marginBottom: 6,
                    }}
                  >
                    {sec.h}
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      color: '#444444',
                      lineHeight: 1.8,
                    }}
                  >
                    {sec.lines.map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  background: '#F5F5F5',
                  border: '1px solid #E6E6E6',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#6B6B6B',
                }}
              >
                ※ これはデモ用のサンプル内容です。
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
