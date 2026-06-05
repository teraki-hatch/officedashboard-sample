// Phase D-4-c (cont.): タスク管理を独立項目化 (ポータルの下に配置)
// 2026-05-29: 申請承認グループに「経費一覧」を追加
import { EXTERNAL_LINKS } from '../config/links';

export type NavItem = {
  key: string;
  label: string;
  to?: string;
  href?: string;
  /** 旧コード互換用。新サイドバーでは表示しない */
  icon?: string;
  description?: string;
  /** true なら admin だけに表示 */
  requireAdmin?: boolean;
};

export type NavGroup = {
  key: string;
  label: string;
  /** lucide-react アイコン名 (例: 'Home', 'User', 'Clock') */
  icon?: string;
  /** アイコンの色 (例: '#6b8e23') */
  iconColor?: string;
  /** トップレベル直下に置く単一リンクの場合は items を空にして to/href を直接持つ */
  to?: string;
  href?: string;
  description?: string;
  requireAdmin?: boolean;
  /** サブメニュー (空 or undefined ならグループではなく単一リンク扱い) */
  items?: NavItem[];
  /** このアイテムの「前」に区切り線を入れる */
  dividerBefore?: boolean;
};

// EXTERNAL_LINKS が使われていない警告を抑止 (互換のため import は残す)
void EXTERNAL_LINKS;

/**
 * 11カテゴリ構成 (2026-05-21)
 * メンバー領域 → 区切り → 管理者領域 の順で並べる
 */
export const NAV_GROUPS: NavGroup[] = [
  // ===== メンバー領域 (全員に表示) =====
  {
    key: 'home',
    label: 'ホーム',
    to: '/',
    icon: 'Home',
    iconColor: '#687d3b',
    description: 'OfficeHub トップ',
  },
  {
    key: 'me',
    label: 'マイページ',
    to: '/me',
    icon: 'User',
    iconColor: '#6b8e23',
    description: '自分の勤怠・工数・申請・有休',
  },
  {
    key: 'work',
    label: '勤怠・工数',
    icon: 'Clock',
    iconColor: '#d4793a',
    description: '打刻・勤怠修正・工数登録・月次集計',
    items: [
      { key: 'kintai', label: '勤怠管理', to: '/work/kintai' },
      { key: 'kousu', label: '工数管理', to: '/work/kousu' },
    ],
  },
  {
    key: 'expenses',
    label: '経費精算',
    to: '/billing/expenses',
    icon: 'ClipboardCheck',
    iconColor: '#7c5295',
    description: '経費の申請・精算',
  },
  {
    key: 'portal',
    label: 'ポータル',
    to: '/portal',
    icon: 'Globe',
    iconColor: '#4a90b8',
    description: '就業規則・ルール・マニュアル',
  },
  {
    key: 'tasks',
    label: 'タスク管理',
    to: '/sales/tasks',
    icon: 'CheckSquare',
    iconColor: '#2e8b57',
    description: 'タスクボード・ガント・カレンダー',
  },
  {
    key: 'sales',
    label: '営業・案件',
    icon: 'Briefcase',
    iconColor: '#b07b3a',
    description: 'リード・商談・案件',
    items: [
      { key: 'dashboard', label: 'ダッシュボード', to: '/sales/dashboard' },
      { key: 'clients', label: 'クライアント', to: '/sales/clients' },
    ],
  },
  {
    key: 'invoices',
    label: '請求書',
    to: '/billing/invoices',
    icon: 'Receipt',
    iconColor: '#c75f5f',
    description: '請求書の作成・PM承認・送付・入金管理',
  },

  // ===== 管理者領域 (admin のみ) =====
  {
    key: 'approval',
    label: '申請承認',
    icon: 'ClipboardCheck',
    iconColor: '#7c5295',
    description: '申請の承認・月次締め・メンバー勤怠状況の確認',
    requireAdmin: true,
    dividerBefore: true,
    items: [
      { key: 'approval-list', label: '申請の承認', to: '/admin/approval' },
      { key: 'member-attendance', label: 'メンバー勤怠状況', to: '/admin/member-attendance' },
      { key: 'expense-list', label: '経費一覧', to: '/admin/expense-list' },
      { key: 'closure', label: '月次締め', to: '/admin/closure' },
      { key: 'pdf', label: '月次PDF出力', to: '/admin/attendance-pdf' },
    ],
  },
  {
    key: 'board',
    label: '経営ボード',
    to: '/board',
    icon: 'BarChart3',
    iconColor: '#5e9b76',
    description: '売上・粗利・稼働率・案件収支',
    requireAdmin: true,
  },
  {
    key: 'org',
    label: '社員・組織',
    icon: 'Users',
    iconColor: '#c8896b',
    description: '社員マスタ・権限・有休・勤務条件',
    requireAdmin: true,
    items: [
      { key: 'employees', label: '社員マスタ', to: '/org/employees' },
      { key: 'leave', label: '有休管理', to: '/org/leave' },
    ],
  },
  {
    key: 'admin',
    label: '管理設定',
    icon: 'Settings',
    iconColor: '#888888',
    description: '通知・権限・連携設定',
    requireAdmin: true,
    items: [
      { key: 'settings', label: '設定', to: '/admin/settings' },
    ],
  },
];

/**
 * 旧 NAV_ITEMS 互換用
 */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => {
  if (g.items && g.items.length > 0) {
    return g.items.map((it) => ({
      ...it,
      requireAdmin: g.requireAdmin || it.requireAdmin,
    }));
  }
  return [
    {
      key: g.key,
      label: g.label,
      to: g.to,
      href: g.href,
      description: g.description,
      requireAdmin: g.requireAdmin,
    },
  ];
});
