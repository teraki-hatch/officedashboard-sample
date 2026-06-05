import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  FileCheck,
  Send,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useInvoices, generateMonthlyInvoices } from '../features/invoices/useInvoices';
import { STATUS_LABEL } from '../features/invoices/types';
import type { InvoiceStatus } from '../features/invoices/types';
import './InvoicesPage.css';

/** 現在から12ヶ月分のオプション ('YYYY-MM-01' 値, 'YYYY年M月' ラベル) */
function buildMonthOptions(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = -12; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    out.push({
      value: `${y}-${String(m).padStart(2, '0')}-01`,
      label: `${y}年${m}月`,
    });
  }
  return out.reverse(); // 新しい順
}

function formatYen(n: number): string {
  return `¥${n.toLocaleString()}`;
}

/**
 * ステータスごとのアイコン・色を定義
 * - lucide-react アイコンで統一感を出す
 */
const STATUS_CONFIG: Record<
  InvoiceStatus,
  { icon: typeof FileText; color: string; bg: string; rowBg: string; rowBorder: string }
> = {
  draft: {
    icon: FileText,
    color: '#9A9A9A',
    bg: '#F5F5F5',
    rowBg: 'transparent',
    rowBorder: 'transparent',
  },
  issued: {
    icon: Send,
    color: '#6B6B6B',
    bg: '#EFEFEF',
    rowBg: '#FAFAFA',
    rowBorder: '#E6E6E6',
  },
  paid: {
    icon: CheckCircle2,
    color: '#1A1A1A',
    bg: '#E4E4E4',
    rowBg: '#F5F5F5',
    rowBorder: '#D6D6D6',
  },
  cancelled: {
    icon: XCircle,
    color: '#dc2626',
    bg: '#fee2e2',
    rowBg: '#fef2f2',
    rowBorder: '#fecaca',
  },
};

export default function InvoicesPage() {
  const navigate = useNavigate();
  const monthOptions = useMemo(() => buildMonthOptions(), []);

  // デフォルトは当月
  const [billingMonth, setBillingMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');

  const { invoices, loading, error, reload } = useInvoices({
    billingMonth: billingMonth || undefined,
    status: statusFilter || undefined,
  });

  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  async function handleGenerate() {
    const monthLabel =
      monthOptions.find((o) => o.value === billingMonth)?.label || billingMonth;
    if (!window.confirm(`${monthLabel} の請求書を一括生成します。よろしいですか?`)) return;
    setGenerating(true);
    setGenResult(null);
    const res = await generateMonthlyInvoices(billingMonth);
    setGenerating(false);
    const msg = `生成: ${res.created}件 / スキップ: ${res.skipped}件${
      res.errors.length > 0 ? `\nエラー:\n${res.errors.join('\n')}` : ''
    }`;
    setGenResult(msg);
    reload();
  }

  // 合計金額
  const totalAmount = invoices.reduce((s, inv) => s + (inv.total_amount || 0), 0);

  // ステータスごとの件数 (サマリー用)
  const statusCounts = useMemo(() => {
    const counts: Record<InvoiceStatus, number> = {
      draft: 0,
      issued: 0,
      paid: 0,
      cancelled: 0,
    };
    for (const inv of invoices) {
      counts[inv.status] = (counts[inv.status] || 0) + 1;
    }
    return counts;
  }, [invoices]);

  return (
    <div className="invoices-page">
      <div className="invoices-page__header">
        <h1 className="invoices-page__title">請求管理</h1>
      </div>

      <div className="invoices-page__toolbar">
        <div className="invoices-page__filters">
          <label className="invoices-page__filter">
            <span>請求月</span>
            <select
              value={billingMonth}
              onChange={(e) => setBillingMonth(e.target.value)}
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="invoices-page__filter">
            <span>ステータス</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter((e.target.value as InvoiceStatus) || '')
              }
            >
              <option value="">すべて</option>
              <option value="draft">PM入力待ち</option>
              <option value="issued">PM承認待ち</option>
              <option value="paid">入金済</option>
              <option value="cancelled">キャンセル</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          className="invoices-page__btn invoices-page__btn--primary"
          onClick={handleGenerate}
          disabled={generating}
        >
          <FileCheck size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          {generating ? '生成中...' : 'この月を一括生成'}
        </button>
      </div>

      {genResult && (
        <div className="invoices-page__gen-result">
          <pre>{genResult}</pre>
        </div>
      )}

      {/* ===== サマリー (件数 + 合計) ===== */}
      <div className="invoices-page__summary">
        <div className="invoices-page__summary-total">
          {invoices.length} 件 / 合計: <strong>{formatYen(totalAmount)}</strong>
        </div>
        <div className="invoices-page__summary-status">
          {(Object.keys(STATUS_CONFIG) as InvoiceStatus[]).map((s) => {
            const cfg = STATUS_CONFIG[s];
            const Icon = cfg.icon;
            const count = statusCounts[s];
            if (count === 0) return null;
            return (
              <span
                key={s}
                className="invoices-page__summary-pill"
                style={{ background: cfg.bg, color: cfg.color }}
              >
                <Icon size={12} strokeWidth={2.2} />
                {STATUS_LABEL[s]} {count}
              </span>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="invoices-page__error">エラー: {error}</div>
      )}

      <div className="invoices-page__table-wrap">
        <table className="invoices-page__table">
          <thead>
            <tr>
              <th>ステータス</th>
              <th>請求番号</th>
              <th>請求月</th>
              <th>クライアント</th>
              <th>発行日</th>
              <th>支払期限</th>
              <th style={{ textAlign: 'right' }}>税込金額</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="invoices-page__empty">
                  読み込み中...
                </td>
              </tr>
            )}
            {!loading && invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="invoices-page__empty">
                  該当する請求書はありません
                </td>
              </tr>
            )}
            {invoices.map((inv, idx) => {
              const cfg = STATUS_CONFIG[inv.status];
              const Icon = cfg.icon;
              // draft の場合は zebra (縞模様)、それ以外はステータス色背景
              const isZebra = inv.status === 'draft';
              const rowBg = isZebra
                ? (idx % 2 === 0 ? '#ffffff' : '#FAFAFA')
                : cfg.rowBg;
              return (
                <tr
                  key={inv.id}
                  className="invoices-page__row"
                  style={{
                    background: rowBg,
                    borderLeft: `3px solid ${cfg.color}`,
                  }}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                >
                  <td className="invoices-page__status-cell">
                    <span
                      className="invoices-page__badge"
                      style={{ background: cfg.bg, color: cfg.color }}
                    >
                      <Icon size={13} strokeWidth={2.2} />
                      {STATUS_LABEL[inv.status]}
                    </span>
                  </td>
                  <td className="invoices-page__num-cell">{inv.invoice_number}</td>
                  <td>
                    {(() => {
                      const d = new Date(inv.billing_month);
                      return `${d.getFullYear()}年${d.getMonth() + 1}月`;
                    })()}
                  </td>
                  <td>
                    {inv.client?.name || '(クライアント不明)'}
                  </td>
                  <td>{inv.issue_date}</td>
                  <td>{inv.due_date}</td>
                  <td className="invoices-page__num">
                    {formatYen(inv.total_amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
