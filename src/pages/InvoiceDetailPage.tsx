import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useInvoice,
  saveInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  recalcAmounts,
} from '../features/invoices/useInvoice';
import {
  STATUS_LABEL,
  STATUS_COLOR,
  type InvoiceItemInput,
} from '../features/invoices/types';
import {
  useInvoiceConfirmations,
  confirmInvoice,
  unconfirmInvoice,
} from '../features/invoices/useInvoiceConfirmations';
import InvoiceExpensesModal from './InvoiceExpensesModal';
import InvoicePrintView from './InvoicePrintView';
import './InvoiceDetailPage.css';

/**
 * 2026-05-29 Bug fix:
 *   PM の確認/取り消し後は invoice 本体も reload して、
 *   自動遷移後の status (draft ↔ issued) が画面に反映されるようにする。
 */

function formatYen(n: number): string {
  return `¥${n.toLocaleString()}`;
}

function formatDateTime(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${dd} ${hh}:${mm}`;
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { invoice, loading, error, reload } = useInvoice(id);
  const {
    confirmers,
    myUserId,
    reload: reloadConfirmers,
  } = useInvoiceConfirmations(id);

  // 編集用ローカルstate
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InvoiceItemInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setInvoiceNumber(invoice.invoice_number);
    setIssueDate(invoice.issue_date);
    setDueDate(invoice.due_date);
    setNotes(invoice.notes || '');
    setItems(
      invoice.items.map((it) => ({
        id: it.id,
        deal_id: it.deal_id,
        description: it.description,
        tax_rate: it.tax_rate,
        unit_price: it.unit_price,
        quantity: it.quantity,
        sort_order: it.sort_order,
      }))
    );
  }, [invoice]);

  if (loading && !invoice) {
    return <div className="invoice-detail">読み込み中...</div>;
  }
  if (error) {
    return <div className="invoice-detail invoice-detail__error">{error}</div>;
  }
  if (!invoice) {
    return <div className="invoice-detail">請求書が見つかりません</div>;
  }

  const totals = recalcAmounts(items);

  function updateItem(idx: number, patch: Partial<InvoiceItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        description: '',
        tax_rate: 10,
        unit_price: 0,
        quantity: 1,
        sort_order: prev.length,
      },
    ]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addExpenseRows(rows: Array<{
    description: string;
    unit_price: number;
    quantity: number;
    tax_rate: number;
  }>) {
    setItems((prev) => [
      ...prev,
      ...rows.map((r, i) => ({
        ...r,
        sort_order: prev.length + i,
      })),
    ]);
    setSaveMsg(`経費 ${rows.length}件を明細に追加しました。「保存」を押すと確定します。`);
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setSaveMsg(null);
    const res = await saveInvoice(
      id,
      {
        invoice_number: invoiceNumber,
        issue_date: issueDate,
        due_date: dueDate,
        notes: notes || null,
      },
      items
    );
    setSaving(false);
    if ('error' in res) {
      setSaveMsg(`エラー: ${res.error}`);
    } else {
      setSaveMsg('保存しました');
      reload();
    }
  }

  async function handleStatus(next: 'draft' | 'issued' | 'paid' | 'cancelled') {
    if (!id) return;
    if (next === 'paid') {
      const today = new Date().toISOString().slice(0, 10);
      const inputDate = window.prompt('入金日 (YYYY-MM-DD)', today);
      if (!inputDate) return;
      setStatusBusy(true);
      const res = await updateInvoiceStatus(id, 'paid', inputDate);
      setStatusBusy(false);
      if ('error' in res) {
        alert(`エラー: ${res.error}`);
      } else {
        reload();
      }
      return;
    }
    if (!window.confirm(`ステータスを「${STATUS_LABEL[next]}」に変更しますか?`)) return;
    setStatusBusy(true);
    const res = await updateInvoiceStatus(id, next);
    setStatusBusy(false);
    if ('error' in res) {
      alert(`エラー: ${res.error}`);
    } else {
      reload();
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('この請求書を削除します。よろしいですか?')) return;
    const res = await deleteInvoice(id);
    if ('error' in res) {
      alert(`エラー: ${res.error}`);
    } else {
      navigate('/invoices');
    }
  }

  async function handleConfirmToggle(userId: string, currentlyConfirmed: boolean) {
    if (!id) return;
    setConfirmBusy(true);
    const res = currentlyConfirmed
      ? await unconfirmInvoice(id, userId)
      : await confirmInvoice(id, userId);
    setConfirmBusy(false);
    if ('error' in res) {
      alert(`エラー: ${res.error}`);
    } else {
      // 確認状態だけでなく、PM 全員確認による status 自動遷移も反映する
      reloadConfirmers();
      reload();
    }
  }

  // PDFファイル名生成: "X月度_クライアント名_御中"
  function getPdfFileName(): string {
    if (!invoice) return '請求書';
    const d = new Date(invoice.billing_month);
    const month = d.getMonth() + 1;
    const clientName = invoice.client?.name || 'クライアント';
    return `${month}月度_${clientName}_御中`;
  }

  function handlePrint() {
    // タイトルを請求書用に書き換え → 印刷ダイアログでPDF保存時のファイル名になる
    const originalTitle = document.title;
    document.title = getPdfFileName();

    setPreviewOpen(true);

    setTimeout(() => {
      window.print();
      // 印刷ダイアログが閉じた後にタイトルを戻す
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    }, 200);
  }

  // プレビューモーダル内の「🖨️ 印刷」ボタンからもタイトル書き換え
  function handlePrintFromPreview() {
    const originalTitle = document.title;
    document.title = getPdfFileName();
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  }

  const excludeExpenseIds: string[] = [];
  const confirmedCount = confirmers.filter((c) => c.confirmed_at).length;

  return (
    <>
      <div className="invoice-detail invoice-detail__no-print">
      <div className="invoice-detail__nav">
        <button
          type="button"
          className="invoice-detail__back"
          onClick={() => navigate('/invoices')}
        >
          ← 一覧へ
        </button>
      </div>

      <div className="invoice-detail__header">
        <div>
          <h1 className="invoice-detail__title">
            請求書 #{invoice.invoice_number}
          </h1>
          <div className="invoice-detail__client">
            {invoice.client?.name || '(クライアント不明)'}
          </div>
        </div>
        <div className="invoice-detail__status-area">
          <span
            className="invoice-detail__badge"
            style={{ background: STATUS_COLOR[invoice.status] }}
          >
            {STATUS_LABEL[invoice.status]}
          </span>
          <div className="invoice-detail__status-buttons">
            <button
              type="button"
              className="invoice-detail__btn"
              onClick={handlePrint}
            >
              🖨️ PDF印刷
            </button>
            {invoice.status === 'draft' && (
              <button
                type="button"
                className="invoice-detail__btn invoice-detail__btn--primary"
                onClick={() => handleStatus('issued')}
                disabled={statusBusy}
              >
                発行する
              </button>
            )}
            {invoice.status === 'issued' && (
              <>
                <button
                  type="button"
                  className="invoice-detail__btn invoice-detail__btn--primary"
                  onClick={() => handleStatus('paid')}
                  disabled={statusBusy}
                >
                  入金記録
                </button>
                <button
                  type="button"
                  className="invoice-detail__btn"
                  onClick={() => handleStatus('draft')}
                  disabled={statusBusy}
                >
                  下書きに戻す
                </button>
              </>
            )}
            {invoice.status === 'paid' && (
              <button
                type="button"
                className="invoice-detail__btn"
                onClick={() => handleStatus('issued')}
                disabled={statusBusy}
              >
                発行済に戻す
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="invoice-detail__section">
        <h2 className="invoice-detail__section-title">基本情報</h2>
        <div className="invoice-detail__grid">
          <label className="invoice-detail__field">
            <span>請求番号</span>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </label>
          <label className="invoice-detail__field">
            <span>請求月</span>
            <input
              type="text"
              value={(() => {
                const d = new Date(invoice.billing_month);
                return `${d.getFullYear()}年${d.getMonth() + 1}月`;
              })()}
              disabled
            />
          </label>
          <label className="invoice-detail__field">
            <span>発行日</span>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </label>
          <label className="invoice-detail__field">
            <span>支払期限</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          {invoice.paid_date && (
            <label className="invoice-detail__field">
              <span>入金日</span>
              <input type="text" value={invoice.paid_date} disabled />
            </label>
          )}
        </div>
      </section>

      <section className="invoice-detail__section">
        <div className="invoice-detail__section-head">
          <h2 className="invoice-detail__section-title">明細</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="invoice-detail__btn"
              onClick={() => setExpModalOpen(true)}
              disabled={!invoice.client_id}
              title={!invoice.client_id ? 'クライアントが紐付いていません' : ''}
            >
              💸 経費を追加
            </button>
            <button
              type="button"
              className="invoice-detail__btn"
              onClick={addItem}
            >
              + 行を追加
            </button>
          </div>
        </div>

        <div className="invoice-detail__table-wrapper">
          <table className="invoice-detail__table">
            <thead>
              <tr>
                <th>品番・品名</th>
                <th>税率</th>
                <th className="invoice-detail__num">単価(税抜)</th>
                <th className="invoice-detail__num">数量</th>
                <th className="invoice-detail__num">金額(税抜)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="invoice-detail__empty">
                    明細がありません。
                  </td>
                </tr>
              )}
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      type="text"
                      value={it.description}
                      onChange={(e) =>
                        updateItem(idx, { description: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={it.tax_rate}
                      onChange={(e) =>
                        updateItem(idx, { tax_rate: Number(e.target.value) })
                      }
                    >
                      <option value={10}>10%</option>
                      <option value={8}>8%</option>
                    </select>
                  </td>
                  <td className="invoice-detail__num">
                    <input
                      type="number"
                      className="invoice-detail__num-input"
                      value={it.unit_price}
                      onChange={(e) =>
                        updateItem(idx, { unit_price: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="invoice-detail__num">
                    <input
                      type="number"
                      className="invoice-detail__num-input"
                      value={it.quantity}
                      step="0.01"
                      onChange={(e) =>
                        updateItem(idx, { quantity: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="invoice-detail__num">
                    {formatYen(Math.floor(it.unit_price * it.quantity))}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="invoice-detail__btn invoice-detail__btn--danger"
                      onClick={() => removeItem(idx)}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="invoice-detail__section invoice-detail__totals">
        <h2 className="invoice-detail__section-title">合計</h2>
        <table className="invoice-detail__totals-table">
          <tbody>
            <tr>
              <th>10%対象 (税抜)</th>
              <td className="invoice-detail__num">{formatYen(totals.subtotal_10)}</td>
              <th>消費税(10%)</th>
              <td className="invoice-detail__num">{formatYen(totals.tax_10)}</td>
            </tr>
            <tr>
              <th>8%対象 (税抜)</th>
              <td className="invoice-detail__num">{formatYen(totals.subtotal_8)}</td>
              <th>消費税(8%)</th>
              <td className="invoice-detail__num">{formatYen(totals.tax_8)}</td>
            </tr>
            <tr className="invoice-detail__totals-grand">
              <th colSpan={3}>税込合計</th>
              <td className="invoice-detail__num">{formatYen(totals.total_amount)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="invoice-detail__section">
        <div className="invoice-detail__section-head">
          <h2 className="invoice-detail__section-title">
            担当者の確認 ({confirmedCount}/{confirmers.length})
          </h2>
        </div>
        {confirmers.length === 0 ? (
          <div className="invoice-detail__empty">
            関連業績案件の担当者がいません
          </div>
        ) : (
          <div className="invoice-detail__confirmers">
            {confirmers.map((c) => {
              const isMe = c.user_id === myUserId;
              const confirmed = !!c.confirmed_at;
              return (
                <div key={c.user_id} className="invoice-detail__confirmer">
                  <div className="invoice-detail__confirmer-info">
                    <span className="invoice-detail__confirmer-name">
                      {c.user_name}
                      {isMe && <small> (自分)</small>}
                    </span>
                    {confirmed ? (
                      <span className="invoice-detail__confirmer-time">
                        ✅ {formatDateTime(c.confirmed_at)}
                      </span>
                    ) : (
                      <span className="invoice-detail__confirmer-pending">未確認</span>
                    )}
                  </div>
                  {isMe && (
                    <button
                      type="button"
                      className={
                        confirmed
                          ? 'invoice-detail__btn'
                          : 'invoice-detail__btn invoice-detail__btn--primary'
                      }
                      onClick={() => handleConfirmToggle(c.user_id, confirmed)}
                      disabled={confirmBusy}
                    >
                      {confirmed ? '取り消す' : '✓ 確認した'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="invoice-detail__section">
        <h2 className="invoice-detail__section-title">備考</h2>
        <textarea
          className="invoice-detail__textarea"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="備考・特記事項"
        />
      </section>

      <div className="invoice-detail__footer">
        <button
          type="button"
          className="invoice-detail__btn invoice-detail__btn--danger"
          onClick={handleDelete}
        >
          削除
        </button>
        <div className="invoice-detail__footer-right">
          {saveMsg && <span className="invoice-detail__save-msg">{saveMsg}</span>}
          <button
            type="button"
            className="invoice-detail__btn invoice-detail__btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <InvoiceExpensesModal
        open={expModalOpen}
        clientId={invoice.client_id}
        billingMonth={invoice.billing_month}
        excludeExpenseIds={excludeExpenseIds}
        onClose={() => setExpModalOpen(false)}
        onAdd={addExpenseRows}
      />

      {previewOpen && (
        <div
          className="invoice-detail__preview-overlay invoice-detail__no-print"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="invoice-detail__preview-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="invoice-detail__preview-toolbar">
              <button
                type="button"
                className="invoice-detail__btn"
                onClick={() => setPreviewOpen(false)}
              >
                閉じる
              </button>
              <button
                type="button"
                className="invoice-detail__btn invoice-detail__btn--primary"
                onClick={handlePrintFromPreview}
              >
                🖨️ 印刷
              </button>
            </div>
            <InvoicePrintView invoice={invoice} />
          </div>
        </div>
      )}
      </div>

      {previewOpen && (
        <div className="invoice-detail__print-only">
          <InvoicePrintView invoice={invoice} />
        </div>
      )}
    </>
  );
}
