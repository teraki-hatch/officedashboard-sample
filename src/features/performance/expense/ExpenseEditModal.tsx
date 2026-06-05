import { useEffect, useState } from 'react';
import { createExpense, updateExpense } from './useCompanyExpenses';
import type {
  CompanyExpense,
  ExpenseCategory,
  ExpenseInput,
} from './types';
import {
  EMPTY_EXPENSE_INPUT,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ICONS,
  EXPENSE_CATEGORY_LABELS,
  SUB_TYPE_OPTIONS,
  TAX_RATE_OPTIONS,
  calcExclTax,
} from './types';
import './ExpenseEditModal.css';

type Props = {
  open: boolean;
  /** null = 新規作成 / CompanyExpense = 編集 */
  expense: CompanyExpense | null;
  /** 新規作成時のデフォルト年月 (YYYY-MM) */
  defaultYearMonth: string;
  /** 新規作成時のデフォルトカテゴリ */
  defaultCategory?: ExpenseCategory;
  onClose: () => void;
  onSaved: () => void;
};

export function ExpenseEditModal({
  open,
  expense,
  defaultYearMonth,
  defaultCategory,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<ExpenseInput>(EMPTY_EXPENSE_INPUT);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setForm({
        year_month: expense.year_month,
        category: expense.category,
        item_name: expense.item_name,
        sub_type: expense.sub_type,
        amount_incl_tax: expense.amount_incl_tax,
        tax_rate: expense.tax_rate,
        memo: expense.memo,
        is_completed: expense.is_completed,
        user_id: expense.user_id,
      });
    } else {
      setForm({
        ...EMPTY_EXPENSE_INPUT,
        year_month: defaultYearMonth,
        category: defaultCategory || 'other',
      });
    }
    setError(null);
  }, [open, expense, defaultYearMonth, defaultCategory]);

  if (!open) return null;

  async function handleSubmit() {
    setError(null);
    if (!form.item_name.trim()) {
      setError('計上項目は必須です');
      return;
    }
    if (!form.year_month) {
      setError('年月は必須です');
      return;
    }

    setSaving(true);
    const result = expense
      ? await updateExpense(expense.id, form)
      : await createExpense(form);
    setSaving(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  const subTypeOptions = SUB_TYPE_OPTIONS[form.category] || [];
  const exclTax = calcExclTax(form.amount_incl_tax, form.tax_rate);

  return (
    <div className="exp-modal__overlay">
      <div
        className="exp-modal__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="exp-modal__header">
          <h2 className="exp-modal__title">
            {expense ? '経費を編集' : '経費を追加'}
          </h2>
          <button
            type="button"
            className="exp-modal__close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="exp-modal__body">
          {/* 年月 */}
          <div className="exp-modal__row">
            <label className="exp-modal__field">
              <span className="exp-modal__label">
                年月 <span className="exp-modal__required">*</span>
              </span>
              <input
                type="month"
                value={form.year_month}
                onChange={(e) =>
                  setForm({ ...form, year_month: e.target.value })
                }
              />
            </label>
          </div>

          {/* カテゴリ */}
          <div className="exp-modal__row">
            <label className="exp-modal__field">
              <span className="exp-modal__label">
                カテゴリ <span className="exp-modal__required">*</span>
              </span>
              <select
                value={form.category}
                onChange={(e) => {
                  const newCat = e.target.value as ExpenseCategory;
                  // カテゴリ変更で sub_type を初期化
                  setForm({
                    ...form,
                    category: newCat,
                    sub_type: SUB_TYPE_OPTIONS[newCat]?.[0] || null,
                  });
                }}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_ICONS[c]} {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* 計上項目 + 種別 */}
          <div className="exp-modal__row exp-modal__row--double">
            <label className="exp-modal__field">
              <span className="exp-modal__label">
                計上項目 <span className="exp-modal__required">*</span>
                <span className="exp-modal__hint">(例: 長下大樹、家賃)</span>
              </span>
              <input
                type="text"
                value={form.item_name}
                onChange={(e) =>
                  setForm({ ...form, item_name: e.target.value })
                }
              />
            </label>
            <label className="exp-modal__field">
              <span className="exp-modal__label">種別</span>
              <select
                value={form.sub_type || ''}
                onChange={(e) =>
                  setForm({ ...form, sub_type: e.target.value || null })
                }
              >
                <option value="">—</option>
                {subTypeOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* 金額 + 税率 */}
          <div className="exp-modal__row exp-modal__row--double">
            <label className="exp-modal__field">
              <span className="exp-modal__label">
                金額 (税込) <span className="exp-modal__required">*</span>
              </span>
              <div className="exp-modal__input-with-unit">
                <span className="exp-modal__unit">¥</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.amount_incl_tax}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      amount_incl_tax: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </label>
            <label className="exp-modal__field">
              <span className="exp-modal__label">税率</span>
              <select
                value={form.tax_rate}
                onChange={(e) =>
                  setForm({ ...form, tax_rate: Number(e.target.value) })
                }
              >
                {TAX_RATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* 税抜表示 */}
          <div className="exp-modal__row">
            <div className="exp-modal__excl-tax">
              税抜換算: <strong>¥{exclTax.toLocaleString('ja-JP')}</strong>
              {form.tax_rate === 0 && (
                <span className="exp-modal__hint"> (非課税)</span>
              )}
            </div>
          </div>

          {/* メモ */}
          <div className="exp-modal__row">
            <label className="exp-modal__field">
              <span className="exp-modal__label">備考</span>
              <textarea
                rows={2}
                value={form.memo || ''}
                onChange={(e) =>
                  setForm({ ...form, memo: e.target.value || null })
                }
                placeholder="例: 子ども誕生日手当x2"
              />
            </label>
          </div>

          {/* 完了フラグ */}
          <div className="exp-modal__row">
            <label className="exp-modal__checkbox">
              <input
                type="checkbox"
                checked={form.is_completed}
                onChange={(e) =>
                  setForm({ ...form, is_completed: e.target.checked })
                }
              />
              支払い完了 (済)
            </label>
          </div>

          {error && <div className="exp-modal__error">エラー: {error}</div>}
        </div>

        <footer className="exp-modal__footer">
          <button
            type="button"
            className="exp-modal__btn exp-modal__btn--cancel"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="exp-modal__btn exp-modal__btn--primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ExpenseEditModal;
