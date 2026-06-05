// 経費CSV出力ヘルパー
// - 明細レベル(行ごと)で出力
// - BOM付きUTF-8で Excel でも文字化けしないようにする
import type { ExpenseRequest } from './types';
import { EXPENSE_CATEGORY_LABELS, TRANSPORT_TYPE_LABELS } from './types';

type UserInfo = {
  id: string;
  employee_code: string;
  name: string;
};

type ClientInfo = {
  id: string;
  name: string;
};

// CSVフィールドのエスケープ
// - ダブルクォート / カンマ / 改行を含む場合は ダブルクォートで囲み、内部のダブルクォートは "" に
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildExpenseCsv(
  expenses: ExpenseRequest[],
  users: UserInfo[],
  clients: ClientInfo[]
): string {
  const userMap = new Map(users.map((u) => [u.id, u]));
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  // 社員番号順に並べ替え、その中で日付昇順
  const sorted = [...expenses].sort((a, b) => {
    const ua = userMap.get(a.user_id);
    const ub = userMap.get(b.user_id);
    const codeA = ua?.employee_code ?? '';
    const codeB = ub?.employee_code ?? '';
    if (codeA !== codeB) return codeA.localeCompare(codeB);
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.created_at.localeCompare(b.created_at);
  });

  const header = [
    '社員番号',
    '社員名',
    '日付',
    'カテゴリ',
    '交通手段',
    'クライアント',
    '金額',
    'メモ',
    '領収書',
  ];

  const rows: string[][] = sorted.map((e) => {
    const u = userMap.get(e.user_id);
    const c = e.client_id ? clientMap.get(e.client_id) : null;
    return [
      u?.employee_code ?? '',
      u?.name ?? '',
      e.date,
      EXPENSE_CATEGORY_LABELS[e.category_code] || e.category_code,
      e.transport_type ? TRANSPORT_TYPE_LABELS[e.transport_type] || e.transport_type : '',
      c?.name ?? '',
      String(e.amount),
      e.memo ?? '',
      e.receipt_url ? 'あり' : '',
    ];
  });

  const lines = [header, ...rows].map((r) => r.map(csvField).join(','));
  return lines.join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM付きUTF-8 (Excel対策)
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
