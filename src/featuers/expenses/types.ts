/**
 * 経費管理 - 型定義
 * --------------------------------------------------------------
 * Phase C-3: projects 廃止により project_id → client_id に変更
 *   さらに カテゴリ code を実態に合わせて変更:
 *     business_trip → business (営業販管費)
 *   trip_type (出張区分) は完全廃止 (現実的に使われていないため)
 *
 * カテゴリ毎の UI 仕様:
 *   commute:      交通手段 必須 / クライアント なし
 *   business:     交通手段 任意 / クライアント 必須
 *   reimbursement: 交通手段 なし / クライアント なし
 * --------------------------------------------------------------
 */

// 経費カテゴリ(マスタ)
export type ExpenseCategory = {
  id: string;
  code: ExpenseCategoryCode;
  name: string;
  is_transport: boolean;
  display_order: number;
  status: string;
};

export type ExpenseCategoryCode = 'commute' | 'business' | 'reimbursement';

// 交通手段(commute / business で使用)
export type TransportType =
  | 'train'
  | 'bus'
  | 'taxi'
  | 'car'
  | 'flight'
  | 'shinkansen'
  | 'other';

export const TRANSPORT_TYPE_LABELS: Record<TransportType, string> = {
  train: '電車',
  bus: 'バス',
  taxi: 'タクシー',
  car: '車(ガソリン代)',
  flight: '飛行機',
  shinkansen: '新幹線',
  other: 'その他',
};

// 経費申請レコード(DBの行)
export type ExpenseRequest = {
  id: string;
  user_id: string;
  date: string;
  category_code: ExpenseCategoryCode;
  amount: number;
  transport_type: TransportType | null;
  client_id: string | null;
  memo: string | null;
  receipt_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

// フォーム入力値
export type ExpenseFormValues = {
  date: string;
  category_code: ExpenseCategoryCode;
  amount: number | '';
  transport_type: TransportType | '';
  client_id: string | '';
  memo: string;
  receipt_file: File | null;
  existing_receipt_url: string | null;
};

// 個人経費カテゴリのラベル
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryCode, string> = {
  commute: '通勤交通費',
  business: '営業販管費',
  reimbursement: '立替経費',
};

// アイコン (絵文字撤去で全て空文字)
export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategoryCode, string> = {
  commute: '',
  business: '',
  reimbursement: '',
};
