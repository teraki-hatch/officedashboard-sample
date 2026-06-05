import { useState } from 'react';
import { useBillableExpenses } from '../features/invoices/useInvoiceExpenses';
import './InvoiceExpensesModal.css';

/**
 * Phase C-3: projects 廃止に伴い「プロジェクト」列を撤去。
 *   clients 直接紐付けで取得しているため、表示は申請者・メモで十分。
 *   (このモーダル自体がクライアント指定で開かれるので、クライアント名再表示は不要)
 *
 * Bug fix 2026-05-29:
 *   CATEGORY_LABEL の 'business_trip' を 'business' (営業販管費) に修正。
 *   types.ts で Phase C-3 にリネーム済みだったが、ここだけ古いまま残っていた。
 */

type Props = {
  open: boolean;
  clientId: string | null;
  billingMonth: string;            // 'YYYY-MM-01'
  /** 既に明細に追加済みの expense_id (チェック済みとして除外したい) */
  excludeExpenseIds?: string[];
  onClose: () => void;
  /** ユーザーが選択した経費を明細として追加 */
  onAdd: (rows: Array<{
    description: string;
    unit_price: number;       // 税抜
    quantity: number;
    tax_rate: number;
  }>) => void;
};

const CATEGORY_LABEL: Record<string, string> = {
  business: '営業販管費',
  reimbursement: '立替経費',
  commute: '通勤交通費',
  other: 'その他',
};

function formatYen(n: number) {
  return `¥${n.toLocaleString()}`;
}

export default function InvoiceExpensesModal({
  open,
  clientId,
  billingMonth,
  excludeExpenseIds = [],
  onClose,
  onAdd,
}: Props) {
  const { expenses, loading, error } = useBillableExpenses({
    clientId,
    billingMonth,
    enabled: open,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (!open) return null;

  const availableExpenses = expenses.filter((e) => !excludeExpenseIds.includes(e.id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === availableExpenses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableExpenses.map((e) => e.id)));
    }
  }

  function handleAdd() {
    const selected = availableExpenses.filter((e) => selectedIds.has(e.id));
    const rows = selected.map((e) => {
      // 経費の amount は税込で保管されていることが多いので、税抜換算する
      // ここでは category_code に関わらず 10% 税込→税抜
      const taxIncluded = e.amount;
      const taxExcluded = Math.floor(taxIncluded / 1.1);
      const dateStr = e.date.slice(5);  // 'MM-DD'
      const userPart = e.user_name ? ` / ${e.user_name}` : '';
      const memoPart = e.memo ? ` - ${e.memo}` : '';
      return {
        description: `[${CATEGORY_LABEL[e.category_code] || e.category_code}] ${dateStr}${userPart}${memoPart}`,
        unit_price: taxExcluded,
        quantity: 1,
        tax_rate: 10,
      };
    });
    onAdd(rows);
    onClose();
  }

  const total = availableExpenses
    .filter((e) => selectedIds.has(e.id))
    .reduce((s, e) => s + e.amount, 0);

  return (
    <div className="exp-modal__overlay">
      <div className="exp-modal" onClick={(e) => e.stopPropagation()}>
        <header className="exp-modal__header">
          <h2 className="exp-modal__title">経費を追加</h2>
          <button
            type="button"
            className="exp-modal__close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>

        <div className="exp-modal__hint">
          このクライアントで発生した「営業販管費・立替経費」が表示されます。
          税込→税抜換算して明細に追加します。
        </div>

        {loading && <div className="exp-modal__empty">読み込み中...</div>}
        {error && <div className="exp-modal__error">{error}</div>}

        {!loading && !error && availableExpenses.length === 0 && (
          <div className="exp-modal__empty">
            該当する経費はありません
          </div>
        )}

        {!loading && availableExpenses.length > 0 && (
          <div className="exp-modal__table-wrapper">
            <table className="exp-modal__table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.size === availableExpenses.length &&
                        availableExpenses.length > 0
                      }
                      onChange={toggleAll}
                    />
                  </th>
                  <th>日付</th>
                  <th>カテゴリ</th>
                  <th>申請者</th>
                  <th>メモ</th>
                  <th className="exp-modal__num">金額(税込)</th>
                </tr>
              </thead>
              <tbody>
                {availableExpenses.map((e) => (
                  <tr
                    key={e.id}
                    className={selectedIds.has(e.id) ? 'exp-modal__row--selected' : ''}
                    onClick={() => toggle(e.id)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(e.id)}
                        onChange={() => toggle(e.id)}
                        onClick={(ev) => ev.stopPropagation()}
                      />
                    </td>
                    <td>{e.date}</td>
                    <td>{CATEGORY_LABEL[e.category_code] || e.category_code}</td>
                    <td>{e.user_name || '-'}</td>
                    <td className="exp-modal__memo">{e.memo || '-'}</td>
                    <td className="exp-modal__num">{formatYen(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="exp-modal__footer">
          <div className="exp-modal__total">
            選択中: {selectedIds.size}件 / 合計(税込): {formatYen(total)}
          </div>
          <div className="exp-modal__actions">
            <button
              type="button"
              className="exp-modal__btn"
              onClick={onClose}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="exp-modal__btn exp-modal__btn--primary"
              onClick={handleAdd}
              disabled={selectedIds.size === 0}
            >
              {selectedIds.size}件を明細に追加
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
