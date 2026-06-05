import './PortalLinks.css';

type PortalLink = {
  key: string;
  title: string;
  description: string;
  url: string;
  icon: string;
};

const PORTAL_LINKS: PortalLink[] = [
  {
    key: 'rules',
    title: 'ルール・制度',
    description: '社内規程・各種制度の確認',
    url: 'https://sites.google.com/as-partner.biz/portal-site/%E3%83%AB%E3%83%BC%E3%83%AB%E5%88%B6%E5%BA%A6?authuser=0',
    icon: '📋',
  },
  {
    key: 'company',
    title: '会社について',
    description: '会社情報・組織図など',
    url: 'https://sites.google.com/as-partner.biz/portal-site/%E4%BC%9A%E7%A4%BE%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6?authuser=0',
    icon: '🏢',
  },
  {
    key: 'library',
    title: 'てらき文庫',
    description: '社内ナレッジ・資料集',
    url: 'https://drive.google.com/drive/u/0/folders/1GECzu-kKXjpHWkxFpsW1bcFwX0rOc9cr',
    icon: '📚',
  },
  {
    key: 'meeting',
    title: '定例会議',
    description: 'クライアント別進捗管理',
    url: 'https://sites.google.com/as-partner.biz/portal-site/%E5%AE%9A%E4%BE%8B%E4%BC%9A%E8%AD%B0?authuser=0',
    icon: '💬',
  },
];

export function PortalLinks() {
  return (
    <section className="portal-links">
      <div className="portal-links__header">
        <h2 className="portal-links__title">ポータル</h2>
        <span className="portal-links__subtitle">外部サイトが別タブで開きます</span>
      </div>
      <div className="portal-links__grid">
        {PORTAL_LINKS.map(({ key, title, description, url, icon }) => (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="portal-links__card"
          >
            <div className="portal-links__icon-wrap" aria-hidden>
              {icon}
            </div>
            <div className="portal-links__body">
              <div className="portal-links__card-title">
                {title}
                <span className="portal-links__external" aria-hidden>↗</span>
              </div>
              <div className="portal-links__card-desc">{description}</div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
