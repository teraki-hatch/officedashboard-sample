// 案件採算管理用の型定義 (クライアント単位)
// Phase C-3: projects 廃止により projects_count を削除
export type ProfitabilityRow = {
  client_id: string;
  client_name: string;
  sales: number;           // Σ performance_deals.monthly_amount × 月数
  cost: number;            // Σ(hours × cost_rate)
  gross_profit: number;    // sales - cost
  gross_profit_rate: number | null; // sales > 0 のとき gross_profit / sales * 100
  total_hours: number;     // 工数合計
  deals_count: number;     // performance_deals 件数
};
export type ProfitabilityPeriodType = 'month' | 'fiscal';
export type ProfitabilityFilter = {
  type: ProfitabilityPeriodType;
  /** 月別の場合: "YYYY-MM" */
  yearMonth?: string;
  /** 期サマリーの場合: 期番号 */
  fiscalPeriod?: number;
};
