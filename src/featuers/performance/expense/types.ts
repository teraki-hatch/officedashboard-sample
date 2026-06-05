export const EXPENSE_CATEGORIES = [
  'jinkenhi',
  'hokenryo',
  'chintairyo',
  'ryohi_kotsu',
  'tsushin',
  'subsc',
  'kounetsu',
  'settai',
  'komon',
  'genka',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  jinkenhi: '人件費',
  hokenryo: '保険料',
  chintairyo: '賃貸料',
  ryohi_kotsu: '旅費・交通費',
  tsushin: '通信費',
  subsc: 'サブスク費',
  kounetsu: '光熱費',
  settai: '接待費',
  komon: '顧問料',
  genka: '減価償却費',
  other: 'その他',
};

// アイコンは全カテゴリ空文字 (絵文字撤去)
export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  jinkenhi: '',
  hokenryo: '',
  chintairyo: '',
  ryohi_kotsu: '',
  tsushin: '',
  subsc: '',
  kounetsu: '',
  settai: '',
  komon: '',
  genka: '',
  other: '',
};

export const SUB_TYPE_OPTIONS: Record<ExpenseCategory, string[]> = {
  jinkenhi: ['給与賃金', '雑費', '福利厚生費', '法定福利費'],
  hokenryo: ['保険料'],
  chintairyo: ['賃貸料'],
  ryohi_kotsu: ['旅費交通費'],
  tsushin: ['通信費'],
  subsc: ['サブスク費'],
  kounetsu: ['光熱費'],
  settai: ['接待交際費'],
  komon: ['顧問料'],
  genka: ['減価償却費'],
  other: ['その他'],
};

export type ExpenseSource = 'manual' | 'expense_claim' | 'salary_master';

export type CompanyExpense = {
  id: string;
  year_month: string;
  category: ExpenseCategory;
  item_name: string;
  sub_type: string | null;
  amount_incl_tax: number;
  tax_rate: number;
  memo: string | null;
  is_completed: boolean;
  user_id: string | null;
  source: ExpenseSource;
  source_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseInput = {
  year_month: string;
  category: ExpenseCategory;
  item_name: string;
  sub_type: string | null;
  amount_incl_tax: number;
  tax_rate: number;
  memo: string | null;
  is_completed: boolean;
  user_id: string | null;
};

export const EMPTY_EXPENSE_INPUT: ExpenseInput = {
  year_month: '',
  category: 'other',
  item_name: '',
  sub_type: null,
  amount_incl_tax: 0,
  tax_rate: 0.1,
  memo: null,
  is_completed: false,
  user_id: null,
};

export function calcExclTax(incl: number, rate: number): number {
  if (rate === 0) return incl;
  return Math.round(incl / (1 + rate));
}

export const TAX_RATE_OPTIONS = [
  { value: 0.1, label: '10% (標準)' },
  { value: 0.08, label: '8% (軽減)' },
  { value: 0, label: '非課税' },
];

export function toYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseYearMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-');
  return { year: Number(y), month: Number(m) };
}
