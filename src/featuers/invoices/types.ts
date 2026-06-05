export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled';

export type Invoice = {
  id: string;
  client_id: string;
  invoice_number: string;
  billing_month: string;       // 'YYYY-MM-01'
  issue_date: string;          // 'YYYY-MM-DD'
  due_date: string;            // 'YYYY-MM-DD'
  subtotal_10: number;         // 10%対象 税抜小計
  subtotal_8: number;          // 8%対象 税抜小計
  tax_10: number;              // 10%消費税
  tax_8: number;               // 8%消費税
  total_amount: number;        // 税込合計
  status: InvoiceStatus;
  paid_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  deal_id: string | null;
  description: string;
  tax_rate: number;            // 10 or 8
  unit_price: number;          // 税抜
  quantity: number;
  amount: number;              // 税抜 = unit_price * quantity
  sort_order: number;
  created_at: string;
};

/** 一覧表示用に client 情報を joinした型 */
export type InvoiceWithClient = Invoice & {
  client: {
    id: string;
    name: string;
    short_name: string | null;
    client_code: string | null;
  } | null;
};

/** 詳細表示用 (明細含む) */
export type InvoiceFull = Invoice & {
  client: {
    id: string;
    name: string;
    short_name: string | null;
    client_code: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    contact_person: string | null;
  } | null;
  items: InvoiceItem[];
};

export type InvoiceItemInput = {
  id?: string;                 // 編集時は既存ID
  deal_id?: string | null;
  description: string;
  tax_rate: number;
  unit_price: number;
  quantity: number;
  sort_order?: number;
};

export type InvoiceInput = {
  client_id: string;
  billing_month: string;
  issue_date: string;
  due_date: string;
  status?: InvoiceStatus;
  paid_date?: string | null;
  notes?: string | null;
};

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'PM入力待ち',
  issued: 'PM承認待ち',
  paid: '入金済',
  cancelled: 'キャンセル',
};

export const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: '#999',
  issued: '#2563eb',
  paid: '#16a34a',
  cancelled: '#dc2626',
};
