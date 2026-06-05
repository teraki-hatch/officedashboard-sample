// ============================================
// 案件カテゴリ (業務領域)
// ============================================
export type DealCategory =
  | 'consulting'   // コンサル: 個人(案件ごとに担当者)
  | 'media'        // 媒体: 個人(既定=溝上)
  | 'rpo'          // RPO: 個人(既定=溝上)
  | 'creative'     // クリエイティブ: 個人(既定=平石)
  | 'maintenance'  // 保守: 会社(ダミーユーザー)
  | 'other';       // その他: 会社(ダミーユーザー)

export const DEAL_CATEGORY_LABELS: Record<DealCategory, string> = {
  consulting: 'コンサル',
  media: '媒体',
  rpo: 'RPO',
  creative: 'クリエイティブ',
  maintenance: '保守',
  other: 'その他',
};

export const DEAL_CATEGORY_ICONS: Record<DealCategory, string> = {
  consulting: '💼',
  media: '📺',
  rpo: '👥',
  creative: '🎨',
  maintenance: '🔧',
  other: '📌',
};

export const DEAL_CATEGORY_ORDER: DealCategory[] = [
  'consulting',
  'media',
  'rpo',
  'creative',
  'maintenance',
  'other',
];

export const PERSONAL_CATEGORIES: DealCategory[] = [
  'consulting',
  'media',
  'rpo',
  'creative',
];

export const COMPANY_CATEGORIES: DealCategory[] = ['maintenance', 'other'];

export const COMPANY_USER_ID = '00000000-0000-0000-0000-000000000999';
export const COMPANY_USER_CODE = '999';

export const CATEGORY_DEFAULT_OWNERS: Partial<Record<DealCategory, string>> = {
  media: '002',
  rpo: '002',
  creative: '005',
  maintenance: COMPANY_USER_CODE,
  other: COMPANY_USER_CODE,
};

// ============================================
// 担当者の役割
// ============================================
export type AssigneeRole = 'pm' | 'pl' | 'member';

export const ASSIGNEE_ROLE_LABELS: Record<AssigneeRole, string> = {
  pm: 'PM',
  pl: 'PL',
  member: 'メンバー',
};

export const ASSIGNEE_ROLE_ORDER: AssigneeRole[] = ['pm', 'pl', 'member'];

// 役割のデフォルト按分率(目安、案件ごとに調整可能)
export const DEFAULT_ALLOCATION_BY_ROLE: Record<AssigneeRole, number> = {
  pm: 0.3,
  pl: 0.7,
  member: 0.5,
};

// ============================================
// 案件ステータス
// ============================================
export type DealStatus =
  | 'prospect'      // 相談あり
  | 'in_progress'   // 商談中
  | 'proposed'      // 提案済み
  | 'negotiating'   // 条件調整中
  | 'contract'      // 契約手続き中
  | 'won'           // 受注
  | 'in_support'    // 支援中
  | 'on_hold'       // 保留
  | 'terminated'    // 終了
  | 'lost';         // 失注

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  prospect: '相談あり',
  in_progress: '商談中',
  proposed: '提案済み',
  negotiating: '条件調整中',
  contract: '契約手続き中',
  won: '受注',
  in_support: '支援中',
  on_hold: '保留',
  terminated: '終了',
  lost: '失注',
};

export const DEAL_STATUS_COLORS: Record<DealStatus, { bg: string; fg: string }> = {
  prospect: { bg: '#e8eaf6', fg: '#3949ab' },
  in_progress: { bg: '#fff3e0', fg: '#ef6c00' },
  proposed: { bg: '#fff8e1', fg: '#f57c00' },
  negotiating: { bg: '#fce4ec', fg: '#c2185b' },
  contract: { bg: '#f3e5f5', fg: '#7b1fa2' },
  won: { bg: '#e8f5e9', fg: '#2e7d32' },
  in_support: { bg: '#e1f5fe', fg: '#0277bd' },
  on_hold: { bg: '#fff3e0', fg: '#bf360c' },
  terminated: { bg: '#ede7f6', fg: '#5e35b1' },
  lost: { bg: '#fafafa', fg: '#757575' },
};

export const DEAL_STATUS_ORDER: DealStatus[] = [
  'prospect',
  'in_progress',
  'proposed',
  'negotiating',
  'contract',
  'won',
  'in_support',
  'on_hold',
  'terminated',
  'lost',
];

// パイプライン（営業ヨミ）カテゴリ
export type DealPipelineCategory =
  | 'active'       // 進行中: prospect, in_progress, proposed
  | 'hot'          // 高確度: negotiating, contract
  | 'closed'       // 受注済: won, in_support
  | 'stalled'      // 停滞: on_hold
  | 'finished';    // 終了: terminated, lost

export const DEAL_PIPELINE_LABELS: Record<DealPipelineCategory, string> = {
  active: '進行中',
  hot: '高確度',
  closed: '受注済',
  stalled: '停滞',
  finished: '終了',
};

export const DEAL_PIPELINE_COLORS: Record<DealPipelineCategory, string> = {
  active: '#3949ab',
  hot: '#c2185b',
  closed: '#2e7d32',
  stalled: '#bf360c',
  finished: '#757575',
};

export function getPipelineCategory(status: DealStatus): DealPipelineCategory {
  switch (status) {
    case 'prospect':
    case 'in_progress':
    case 'proposed':
      return 'active';
    case 'negotiating':
    case 'contract':
      return 'hot';
    case 'won':
    case 'in_support':
      return 'closed';
    case 'on_hold':
      return 'stalled';
    case 'terminated':
    case 'lost':
      return 'finished';
  }
}

export const ACTIVE_STATUSES: DealStatus[] = ['won', 'in_support', 'terminated'];

// ============================================
// 案件担当者 (按分情報)
// ============================================
export type DealAssignee = {
  id: string;
  deal_id: string;
  user_id: string;
  role: AssigneeRole;
  allocation_ratio: number;
  display_order: number;
  created_at?: string;
  updated_at?: string;
  // 表示用に user を含めることがある
  user?: {
    id: string;
    name: string;
    employee_code: string;
  } | null;
};

// 担当者の入力用 (案件保存時に渡す)
export type DealAssigneeInput = {
  user_id: string;
  role: AssigneeRole;
  allocation_ratio: number;
  display_order: number;
};

// ============================================
// 案件レコード(DBと一致)
// ============================================
export type PerformanceDeal = {
  id: string;
  user_id: string;          // 主担当 (互換性のため残置、業績集計には assignees を使う)
  category: DealCategory;
  deal_name: string;
  status: DealStatus;
  expected_close_date: string | null;
  closed_date: string | null;
  terminated_date: string | null;
  sales_amount: number;
  monthly_amount: number;
  gross_profit: number;
  meeting_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // JOIN: 担当者一覧
  assignees?: DealAssignee[];
};

// 案件 INSERT/UPDATE 用ペイロード
export type DealInput = {
  user_id: string;          // 主担当 (互換性のため残置)
  client_id?: string | null;  // クライアントID (クライアント詳細から作成時にセット)
  category: DealCategory;
  deal_name: string;
  status: DealStatus;
  expected_close_date?: string | null;
  closed_date?: string | null;
  terminated_date?: string | null;
  sales_amount: number;
  monthly_amount: number;
  gross_profit: number;
  meeting_count: number;
  notes?: string | null;
  // 担当者リスト (按分付き)
  assignees: DealAssigneeInput[];
};

// ============================================
// 月次目標レコード
// ============================================
export type PerformanceTarget = {
  id: string;
  user_id: string;
  year_month: string;
  category: DealCategory;
  sales_target: number;
  deal_target: number;
  gross_profit_target: number;
  meeting_target: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type TargetInput = {
  user_id: string;
  year_month: string;
  category: DealCategory;
  sales_target: number;
  deal_target: number;
  gross_profit_target: number;
  meeting_target: number;
};

// 集計サマリー(計算結果)
export type PerformanceSummary = {
  sales_actual: number;
  sales_target: number;
  sales_rate: number;
  deal_actual: number;
  deal_target: number;
  deal_rate: number;
  gross_profit_actual: number;
  gross_profit_target: number;
  gross_profit_rate: number;
  meeting_actual: number;
  meeting_target: number;
  meeting_rate: number;
};

// ============================================
// 日付ユーティリティ
// ============================================
export function toYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function getMonthDateRange(year: number, month: number): {
  start: string;
  end: string;
} {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  return { start: fmt(startDate), end: fmt(endDate) };
}

function dateToYearMonth(d: string | null | undefined): string | null {
  if (!d) return null;
  return d.substring(0, 7);
}

// ============================================
// 過去データ移行 (実績まとめ案件) の判定
// ============================================
/** 過去データ移行案件のカットオフ月 (この月以降は月額案件を使う) */
export const HISTORICAL_CUTOFF_YM = '2026-05';

/** "実績まとめ" 案件 (過去データ移行用) かどうか */
export function isHistoricalDeal(deal: { deal_name?: string }): boolean {
  return Boolean(deal.deal_name && deal.deal_name.includes('実績まとめ'));
}

/**
 * 案件をその月に売上として計上すべきか判定。
 * - 実績まとめ (移行データ): カットオフ月より前の月のみ集計
 * - 月額案件 (個別登録): カットオフ月以降のみ集計
 */
export function shouldCountInMonth(
  deal: { deal_name?: string },
  year: number,
  month: number
): boolean {
  const ym = toYearMonth(year, month);
  if (isHistoricalDeal(deal)) {
    return ym < HISTORICAL_CUTOFF_YM;
  } else {
    return ym >= HISTORICAL_CUTOFF_YM;
  }
}

// ============================================
// 会社名抽出 (社数集計用)
// ============================================
/**
 * deal_name から会社名を取り出す。
 * 例: "株式会社ナサ工業(採用支援費/寺木)" → "株式会社ナサ工業"
 * 例: "株式会社丸野(採用支援費/長下)" → "株式会社丸野"
 * 括弧がなければそのまま返す。
 */
export function extractClientName(dealName: string): string {
  if (!dealName) return '(不明)';
  // 半角 ( または 全角 ( のどちらが先に出てくるか
  const idxHalf = dealName.indexOf('(');
  const idxFull = dealName.indexOf('(');
  let cut = -1;
  if (idxHalf >= 0 && idxFull >= 0) {
    cut = Math.min(idxHalf, idxFull);
  } else if (idxHalf >= 0) {
    cut = idxHalf;
  } else if (idxFull >= 0) {
    cut = idxFull;
  }
  if (cut < 0) return dealName.trim();
  const name = dealName.slice(0, cut).trim();
  return name || '(不明)';
}

// ============================================
// 案件の月内判定
// ============================================
export function isActiveInMonth(
  deal: PerformanceDeal,
  year: number,
  month: number
): boolean {
  if (!ACTIVE_STATUSES.includes(deal.status)) return false;
  const targetYm = toYearMonth(year, month);
  const closedYm = dateToYearMonth(deal.closed_date);
  if (!closedYm) return false;
  if (closedYm > targetYm) return false;
  if (deal.terminated_date) {
    const terminatedYm = dateToYearMonth(deal.terminated_date);
    if (terminatedYm && terminatedYm < targetYm) {
      return false;
    }
  }
  return true;
}

export function isClosedInMonth(
  deal: PerformanceDeal,
  year: number,
  month: number
): boolean {
  if (!ACTIVE_STATUSES.includes(deal.status)) return false;
  const targetYm = toYearMonth(year, month);
  const closedYm = dateToYearMonth(deal.closed_date);
  return closedYm === targetYm;
}

// ============================================
// 按分率ユーティリティ
// ============================================

/** 指定ユーザーの案件における按分率を取得 (assignee がなければ 0) */
export function getUserAllocation(
  deal: PerformanceDeal,
  userId: string
): number {
  if (!deal.assignees) return 0;
  const a = deal.assignees.find((x) => x.user_id === userId);
  return a ? Number(a.allocation_ratio) : 0;
}

/** 案件の按分合計が 1.0 (許容誤差 0.001) かどうか */
export function isAllocationValid(assignees: DealAssigneeInput[]): boolean {
  if (assignees.length === 0) return false;
  const total = assignees.reduce(
    (s, a) => s + Number(a.allocation_ratio || 0),
    0
  );
  return Math.abs(total - 1.0) < 0.001;
}

// ============================================
// 社数集計関数
// ============================================

/**
 * 指定ユーザーが参加する案件のうち、指定月にアクティブな案件の社数 (unique 会社名)。
 * 実績まとめ案件は除外。
 */
export function calculateUserClientCount(
  deals: PerformanceDeal[],
  userId: string,
  year: number,
  month: number
): number {
  const set = new Set<string>();
  for (const d of deals) {
    if (isHistoricalDeal(d)) continue;
    const ratio = getUserAllocation(d, userId);
    if (ratio <= 0) continue;
    if (!shouldCountInMonth(d, year, month)) continue;
    if (!isActiveInMonth(d, year, month)) continue;
    set.add(extractClientName(d.deal_name));
  }
  return set.size;
}

/**
 * 指定カテゴリで指定月にアクティブな案件の社数 (unique 会社名)。
 * 実績まとめ案件は除外。
 */
export function calculateCategoryClientCount(
  deals: PerformanceDeal[],
  category: DealCategory,
  year: number,
  month: number
): number {
  const set = new Set<string>();
  for (const d of deals) {
    if (isHistoricalDeal(d)) continue;
    if (d.category !== category) continue;
    if (!shouldCountInMonth(d, year, month)) continue;
    if (!isActiveInMonth(d, year, month)) continue;
    set.add(extractClientName(d.deal_name));
  }
  return set.size;
}

/**
 * 全カテゴリ全社員の月単位社数 (unique 会社名)
 */
export function calculateAllClientCount(
  deals: PerformanceDeal[],
  year: number,
  month: number
): number {
  const set = new Set<string>();
  for (const d of deals) {
    if (isHistoricalDeal(d)) continue;
    if (!shouldCountInMonth(d, year, month)) continue;
    if (!isActiveInMonth(d, year, month)) continue;
    set.add(extractClientName(d.deal_name));
  }
  return set.size;
}

/**
 * 指定ユーザーの期サマリー社数 (期内12ヶ月のいずれかでアクティブな会社のunique数)
 */
export function calculateUserClientCountPeriod(
  deals: PerformanceDeal[],
  userId: string,
  fiscalMonths: Array<{ year: number; month: number }>
): number {
  const set = new Set<string>();
  for (const d of deals) {
    if (isHistoricalDeal(d)) continue;
    const ratio = getUserAllocation(d, userId);
    if (ratio <= 0) continue;
    for (const fm of fiscalMonths) {
      if (!shouldCountInMonth(d, fm.year, fm.month)) continue;
      if (!isActiveInMonth(d, fm.year, fm.month)) continue;
      set.add(extractClientName(d.deal_name));
      break;
    }
  }
  return set.size;
}

/**
 * 指定カテゴリの期サマリー社数 (期内12ヶ月のいずれかでアクティブな会社のunique数)
 */
export function calculateCategoryClientCountPeriod(
  deals: PerformanceDeal[],
  category: DealCategory,
  fiscalMonths: Array<{ year: number; month: number }>
): number {
  const set = new Set<string>();
  for (const d of deals) {
    if (isHistoricalDeal(d)) continue;
    if (d.category !== category) continue;
    for (const fm of fiscalMonths) {
      if (!shouldCountInMonth(d, fm.year, fm.month)) continue;
      if (!isActiveInMonth(d, fm.year, fm.month)) continue;
      set.add(extractClientName(d.deal_name));
      break;
    }
  }
  return set.size;
}

/**
 * 全社全カテゴリの期サマリー社数 (期内12ヶ月のいずれかでアクティブな会社のunique数)
 */
export function calculateAllClientCountPeriod(
  deals: PerformanceDeal[],
  fiscalMonths: Array<{ year: number; month: number }>
): number {
  const set = new Set<string>();
  for (const d of deals) {
    if (isHistoricalDeal(d)) continue;
    for (const fm of fiscalMonths) {
      if (!shouldCountInMonth(d, fm.year, fm.month)) continue;
      if (!isActiveInMonth(d, fm.year, fm.month)) continue;
      set.add(extractClientName(d.deal_name));
      break;
    }
  }
  return set.size;
}

// ============================================
// 集計関数
// ============================================

/**
 * 個人サマリー: 指定ユーザーが assignee として参加する案件を按分集計
 *
 * 2026-05-20: 過去データ移行対応
 * - "実績まとめ" 案件は 2026-05 より前の月のみ集計
 * - 月額案件は 2026-05 以降のみ集計
 */
export function calculateUserSummary(
  deals: PerformanceDeal[],
  target: PerformanceTarget | null,
  userId: string,
  year: number,
  month: number
): PerformanceSummary {
  let sales_actual = 0;
  let gross_profit_actual = 0;
  let deal_actual = 0;

  for (const d of deals) {
    const ratio = getUserAllocation(d, userId);
    if (ratio <= 0) continue;

    // 過去データ移行カットオフによる集計対象判定
    if (!shouldCountInMonth(d, year, month)) continue;

    if (isActiveInMonth(d, year, month)) {
      sales_actual += Number(d.monthly_amount || 0) * ratio;
    }
    if (isClosedInMonth(d, year, month)) {
      sales_actual += Number(d.sales_amount || 0) * ratio;
      gross_profit_actual += Number(d.gross_profit || 0) * ratio;
      deal_actual += ratio; // 件数も按分
    }
  }

  // 面談数: 案件単位の値を按分(参考)
  const meeting_actual = deals.reduce((s, d) => {
    const ratio = getUserAllocation(d, userId);
    return s + Number(d.meeting_count || 0) * ratio;
  }, 0);

  const sales_target = Number(target?.sales_target || 0);
  const deal_target = Number(target?.deal_target || 0);
  const gross_profit_target = Number(target?.gross_profit_target || 0);
  const meeting_target = Number(target?.meeting_target || 0);

  const safeRate = (actual: number, t: number): number => {
    if (t <= 0) return 0;
    return actual / t;
  };

  return {
    sales_actual,
    sales_target,
    sales_rate: safeRate(sales_actual, sales_target),
    deal_actual,
    deal_target,
    deal_rate: safeRate(deal_actual, deal_target),
    gross_profit_actual,
    gross_profit_target,
    gross_profit_rate: safeRate(gross_profit_actual, gross_profit_target),
    meeting_actual,
    meeting_target,
    meeting_rate: safeRate(meeting_actual, meeting_target),
  };
}

/**
 * カテゴリサマリー: 案件の純粋な金額の合計 (按分しない)
 *
 * 2026-05-20 修正:
 * - 目標: そのカテゴリ × 当月の全社員目標を合算 (年月フィルタ追加)
 * - 実績: "実績まとめ" は 2026-05 より前、月額案件は 2026-05 以降のみ
 */
export function calculateCategorySummary(
  deals: PerformanceDeal[],
  targets: PerformanceTarget[],
  category: DealCategory,
  year: number,
  month: number
): PerformanceSummary {
  const catDeals = deals.filter((d) => d.category === category);
  let sales_actual = 0;
  let gross_profit_actual = 0;
  let deal_actual = 0;

  for (const d of catDeals) {
    // 過去データ移行カットオフによる集計対象判定
    if (!shouldCountInMonth(d, year, month)) continue;

    if (isActiveInMonth(d, year, month)) {
      sales_actual += Number(d.monthly_amount || 0);
    }
    if (isClosedInMonth(d, year, month)) {
      sales_actual += Number(d.sales_amount || 0);
      gross_profit_actual += Number(d.gross_profit || 0);
      deal_actual += 1;
    }
  }

  const meeting_actual = catDeals.reduce(
    (s, d) => s + Number(d.meeting_count || 0),
    0
  );

  // カテゴリ目標: そのカテゴリ × 当月の全社員目標を合算
  const ym = toYearMonth(year, month);
  const catTargets = targets.filter(
    (t) => t.category === category && t.year_month === ym
  );
  const sales_target = catTargets.reduce(
    (s, t) => s + Number(t.sales_target || 0),
    0
  );
  const deal_target = catTargets.reduce(
    (s, t) => s + Number(t.deal_target || 0),
    0
  );
  const gross_profit_target = catTargets.reduce(
    (s, t) => s + Number(t.gross_profit_target || 0),
    0
  );
  const meeting_target = catTargets.reduce(
    (s, t) => s + Number(t.meeting_target || 0),
    0
  );

  const safeRate = (actual: number, t: number): number => {
    if (t <= 0) return 0;
    return actual / t;
  };

  return {
    sales_actual,
    sales_target,
    sales_rate: safeRate(sales_actual, sales_target),
    deal_actual,
    deal_target,
    deal_rate: safeRate(deal_actual, deal_target),
    gross_profit_actual,
    gross_profit_target,
    gross_profit_rate: safeRate(gross_profit_actual, gross_profit_target),
    meeting_actual,
    meeting_target,
    meeting_rate: safeRate(meeting_actual, meeting_target),
  };
}

/**
 * 全カテゴリサマリーをまとめて計算
 */
export function calculateAllCategoriesSummary(
  deals: PerformanceDeal[],
  targets: PerformanceTarget[],
  year: number,
  month: number
): Record<DealCategory, PerformanceSummary> {
  const result: Partial<Record<DealCategory, PerformanceSummary>> = {};
  for (const cat of DEAL_CATEGORY_ORDER) {
    result[cat] = calculateCategorySummary(deals, targets, cat, year, month);
  }
  return result as Record<DealCategory, PerformanceSummary>;
}

/**
 * 複数サマリーの合算
 */
export function aggregateSummaries(
  summaries: PerformanceSummary[]
): PerformanceSummary {
  const sum = {
    sales_actual: 0,
    sales_target: 0,
    deal_actual: 0,
    deal_target: 0,
    gross_profit_actual: 0,
    gross_profit_target: 0,
    meeting_actual: 0,
    meeting_target: 0,
  };

  for (const s of summaries) {
    sum.sales_actual += s.sales_actual;
    sum.sales_target += s.sales_target;
    sum.deal_actual += s.deal_actual;
    sum.deal_target += s.deal_target;
    sum.gross_profit_actual += s.gross_profit_actual;
    sum.gross_profit_target += s.gross_profit_target;
    sum.meeting_actual += s.meeting_actual;
    sum.meeting_target += s.meeting_target;
  }

  const safeRate = (actual: number, t: number): number => {
    if (t <= 0) return 0;
    return actual / t;
  };

  return {
    ...sum,
    sales_rate: safeRate(sum.sales_actual, sum.sales_target),
    deal_rate: safeRate(sum.deal_actual, sum.deal_target),
    gross_profit_rate: safeRate(sum.gross_profit_actual, sum.gross_profit_target),
    meeting_rate: safeRate(sum.meeting_actual, sum.meeting_target),
  };
}

/**
 * 旧API互換: calculateSummary (カテゴリ無視・全合算)
 * 一部の既存コードが参照しているため残置
 */
export function calculateSummary(
  deals: PerformanceDeal[],
  target: PerformanceTarget | null,
  year: number,
  month: number
): PerformanceSummary {
  let sales_actual = 0;
  let gross_profit_actual = 0;
  let deal_actual = 0;

  for (const d of deals) {
    if (!shouldCountInMonth(d, year, month)) continue;
    if (isActiveInMonth(d, year, month)) {
      sales_actual += Number(d.monthly_amount || 0);
    }
    if (isClosedInMonth(d, year, month)) {
      sales_actual += Number(d.sales_amount || 0);
      gross_profit_actual += Number(d.gross_profit || 0);
      deal_actual += 1;
    }
  }

  const meeting_actual = deals.reduce(
    (s, d) => s + Number(d.meeting_count || 0),
    0
  );

  const sales_target = Number(target?.sales_target || 0);
  const deal_target = Number(target?.deal_target || 0);
  const gross_profit_target = Number(target?.gross_profit_target || 0);
  const meeting_target = Number(target?.meeting_target || 0);

  const safeRate = (actual: number, t: number): number => {
    if (t <= 0) return 0;
    return actual / t;
  };

  return {
    sales_actual,
    sales_target,
    sales_rate: safeRate(sales_actual, sales_target),
    deal_actual,
    deal_target,
    deal_rate: safeRate(deal_actual, deal_target),
    gross_profit_actual,
    gross_profit_target,
    gross_profit_rate: safeRate(gross_profit_actual, gross_profit_target),
    meeting_actual,
    meeting_target,
    meeting_rate: safeRate(meeting_actual, meeting_target),
  };
}

// ============================================
// 期サマリー集計関数 (8月始まり12ヶ月の合算)
// ============================================

/** 月別の実績データ (1社員1ヶ月の集計結果) */
export type MonthlyDataPoint = {
  /** 期内月インデックス (1=8月, 12=7月) */
  fiscalMonthIndex: number;
  /** カレンダー上の月ラベル (例: "8月") */
  monthLabel: string;
  /** 売上実績 */
  sales_actual: number;
  /** 売上目標 */
  sales_target: number;
  /** 成約件数実績 */
  deal_actual: number;
  /** 成約件数目標 */
  deal_target: number;
  /** 粗利実績 */
  gross_profit_actual: number;
  /** 粗利目標 */
  gross_profit_target: number;
  /** 社数実績 (unique 会社名) */
  client_count_actual: number;
};

/**
 * 指定ユーザーの当月の全カテゴリ目標を合算した仮想 PerformanceTarget を返す
 */
function sumUserTargetsForMonth(
  targets: PerformanceTarget[],
  userId: string,
  year: number,
  month: number
): PerformanceTarget | null {
  const ym = toYearMonth(year, month);
  const matched = targets.filter(
    (t) => t.user_id === userId && t.year_month === ym
  );
  if (matched.length === 0) return null;
  const sum = matched.reduce(
    (acc, t) => {
      acc.sales_target += Number(t.sales_target || 0);
      acc.deal_target += Number(t.deal_target || 0);
      acc.gross_profit_target += Number(t.gross_profit_target || 0);
      acc.meeting_target += Number(t.meeting_target || 0);
      return acc;
    },
    {
      sales_target: 0,
      deal_target: 0,
      gross_profit_target: 0,
      meeting_target: 0,
    }
  );
  // PerformanceTarget の他のフィールドは集計に使われないため、ダミー値で埋める
  return {
    id: '',
    user_id: userId,
    year_month: ym,
    category: 'other',
    sales_target: sum.sales_target,
    deal_target: sum.deal_target,
    gross_profit_target: sum.gross_profit_target,
    meeting_target: sum.meeting_target,
    created_at: '',
    updated_at: '',
    created_by: null,
  };
}

/**
 * 指定ユーザーの期サマリー: 期内12ヶ月の合算 (按分後の金額)
 */
export function calculateUserPeriodSummary(
  deals: PerformanceDeal[],
  targets: PerformanceTarget[],
  userId: string,
  fiscalMonths: Array<{ fiscalMonthIndex: number; year: number; month: number }>
): PerformanceSummary {
  const summaries = fiscalMonths.map((fm) => {
    const target = sumUserTargetsForMonth(targets, userId, fm.year, fm.month);
    return calculateUserSummary(deals, target, userId, fm.year, fm.month);
  });
  return aggregateSummaries(summaries);
}

/**
 * 指定カテゴリの期サマリー: 期内12ヶ月の合算 (純粋金額)
 */
export function calculateCategoryPeriodSummary(
  deals: PerformanceDeal[],
  targets: PerformanceTarget[],
  category: DealCategory,
  fiscalMonths: Array<{ fiscalMonthIndex: number; year: number; month: number }>
): PerformanceSummary {
  const summaries = fiscalMonths.map((fm) => {
    return calculateCategorySummary(deals, targets, category, fm.year, fm.month);
  });
  return aggregateSummaries(summaries);
}

/**
 * 期内の月別データを返す (グラフ用)
 * 指定ユーザーがいない場合は全社合算 (純粋金額) のデータを返す
 */
export function calculateMonthlyDataForUser(
  deals: PerformanceDeal[],
  targets: PerformanceTarget[],
  userId: string,
  fiscalMonths: Array<{ fiscalMonthIndex: number; year: number; month: number; monthLabel: string }>
): MonthlyDataPoint[] {
  return fiscalMonths.map((fm) => {
    const target = sumUserTargetsForMonth(targets, userId, fm.year, fm.month);
    const s = calculateUserSummary(deals, target, userId, fm.year, fm.month);
    const cc = calculateUserClientCount(deals, userId, fm.year, fm.month);
    return {
      fiscalMonthIndex: fm.fiscalMonthIndex,
      monthLabel: fm.monthLabel,
      sales_actual: s.sales_actual,
      sales_target: s.sales_target,
      deal_actual: s.deal_actual,
      deal_target: s.deal_target,
      gross_profit_actual: s.gross_profit_actual,
      gross_profit_target: s.gross_profit_target,
      client_count_actual: cc,
    };
  });
}

/**
 * 期内の月別データを返す (グラフ用) — 全社・全カテゴリ合算版 (純粋金額)
 */
export function calculateMonthlyDataForAll(
  deals: PerformanceDeal[],
  targets: PerformanceTarget[],
  fiscalMonths: Array<{ fiscalMonthIndex: number; year: number; month: number; monthLabel: string }>
): MonthlyDataPoint[] {
  return fiscalMonths.map((fm) => {
    // 全カテゴリのサマリーを合算
    const catSummaries = DEAL_CATEGORY_ORDER.map((cat) =>
      calculateCategorySummary(deals, targets, cat, fm.year, fm.month)
    );
    const s = aggregateSummaries(catSummaries);
    const cc = calculateAllClientCount(deals, fm.year, fm.month);
    return {
      fiscalMonthIndex: fm.fiscalMonthIndex,
      monthLabel: fm.monthLabel,
      sales_actual: s.sales_actual,
      sales_target: s.sales_target,
      deal_actual: s.deal_actual,
      deal_target: s.deal_target,
      gross_profit_actual: s.gross_profit_actual,
      gross_profit_target: s.gross_profit_target,
      client_count_actual: cc,
    };
  });
}
