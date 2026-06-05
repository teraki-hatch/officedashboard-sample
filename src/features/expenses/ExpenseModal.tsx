import { useEffect, useState } from 'react';
import type {
  ExpenseRequest,
  ExpenseCategory,
  ExpenseCategoryCode,
  TransportType,
} from './types';
import {
  TRANSPORT_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_ICONS,
} from './types';
import { useExpenseMutations } from './useExpenseMutations';
import { useReceiptUpload } from './useReceiptUpload';

/**
 * Phase C-3:
 *   - projects 廃止に伴い projects → clients に変更
 *   - business_trip → business にリネーム + クライアント選択必須化
 *   - trip_type (出張区分) 完全廃止
 *
 * カテゴリ毎の UI 仕様:
 *   commute (通勤交通費): 交通手段 必須 / クライアント なし
 *   business (営業販管費): 交通手段 任意 / クライアント 必須
 *   reimbursement (立替経費): 交通手段 なし / クライアント なし
 */

type ClientOption = {
  id: string;
  name: string;
  is_internal?: boolean;
};

type ExpenseModalProps = {
  open: boolean;
  userId: string;
  categories: ExpenseCategory[];
  clients: ClientOption[];
  editing: ExpenseRequest | null;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function ExpenseModal(props: ExpenseModalProps) {
  const {
    open,
    userId,
    categories,
    clients,
    editing,
    defaultDate,
    onClose,
    onSaved,
  } = props;

  const [date, setDate] = useState<string>('');
  const [categoryCode, setCategoryCode] = useState<ExpenseCategoryCode>('commute');
  const [amount, setAmount] = useState<string>('');
  const [transportType, setTransportType] = useState<TransportType | ''>('');
  const [clientId, setClientId] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  const { saving, createExpense, updateExpense, deleteExpense } =
    useExpenseMutations();
  const { uploading, uploadReceipt, deleteReceipt } = useReceiptUpload();

  // モーダル開閉時にフォームを初期化
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.date);
      setCategoryCode(editing.category_code);
      setAmount(String(editing.amount));
      setTransportType(editing.transport_type || '');
      setClientId(editing.client_id || '');
      setMemo(editing.memo || '');
      setExistingReceiptUrl(editing.receipt_url);
    } else {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      setDate(defaultDate || `${y}-${m}-${d}`);
      setCategoryCode('commute');
      setAmount('');
      setTransportType('');
      setClientId('');
      setMemo('');
      setExistingReceiptUrl(null);
    }
    setReceiptFile(null);
    setPreviewUrl(null);
    setFormError(null);
    setConfirmDelete(false);
  }, [open, editing, defaultDate]);

  // ファイル選択時のプレビュー生成
  useEffect(() => {
    if (!receiptFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(receiptFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [receiptFile]);

  if (!open) return null;

  const currentCategory = categories.find((c) => c.code === categoryCode);

  // カテゴリ毎の UI 制御
  const showTransport = categoryCode === 'commute' || categoryCode === 'business';
  const transportRequired = categoryCode === 'commute'; // commute は必須、business は任意
  const showClient = categoryCode === 'business';
  const clientRequired = categoryCode === 'business'; // business は必須

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) {
      setReceiptFile(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setFormError('ファイルサイズは10MB以下にしてください');
      return;
    }
    setFormError(null);
    setReceiptFile(f);
  }

  async function handleSave() {
    setFormError(null);

    // バリデーション
    if (!date) {
      setFormError('日付を入力してください');
      return;
    }
    const amountNum = Number(amount);
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      setFormError('金額を正しく入力してください');
      return;
    }
    if (transportRequired && !transportType) {
      setFormError('交通手段を選択してください');
      return;
    }
    if (clientRequired && !clientId) {
      setFormError('クライアントを選択してください');
      return;
    }

    // 領収書アップロード(新しいファイルが選択されている場合のみ)
    let receiptUrl: string | null = existingReceiptUrl;
    if (receiptFile) {
      const uploadedPath = await uploadReceipt(userId, receiptFile);
      if (!uploadedPath) {
        setFormError('領収書のアップロードに失敗しました');
        return;
      }
      // 既存の領収書があれば削除
      if (existingReceiptUrl) {
        await deleteReceipt(existingReceiptUrl);
      }
      receiptUrl = uploadedPath;
    }

    if (editing) {
      const ok = await updateExpense({
        id: editing.id,
        date,
        category_code: categoryCode,
        amount: amountNum,
        transport_type: showTransport && transportType
          ? (transportType as TransportType)
          : null,
        client_id: showClient && clientId ? clientId : null,
        memo: memo.trim() || null,
        receipt_url: receiptUrl,
      });
      if (!ok) {
        setFormError('更新に失敗しました');
        return;
      }
    } else {
      const ok = await createExpense({
        user_id: userId,
        date,
        category_code: categoryCode,
        amount: amountNum,
        transport_type: showTransport && transportType
          ? (transportType as TransportType)
          : null,
        client_id: showClient && clientId ? clientId : null,
        memo: memo.trim() || null,
        receipt_url: receiptUrl,
      });
      if (!ok) {
        setFormError('保存に失敗しました');
        return;
      }
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const ok = await deleteExpense(editing.id);
    if (ok) {
      // 領収書ファイルも削除
      if (editing.receipt_url) {
        await deleteReceipt(editing.receipt_url);
      }
      onSaved();
      onClose();
    } else {
      setFormError('削除に失敗しました');
    }
  }

  const busy = saving || uploading;

  return (
    <div className="expense-modal__backdrop">
      <div
        className="expense-modal__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="expense-modal__header">
          <h2 className="expense-modal__title">
            {editing ? '経費を編集' : '経費を追加'}
          </h2>
          <button
            type="button"
            className="expense-modal__close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>

        <div className="expense-modal__body">
          {/* 日付 */}
          <div className="expense-field">
            <label className="expense-field__label">日付</label>
            <input
              type="date"
              className="expense-field__input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* カテゴリ */}
          <div className="expense-field">
            <label className="expense-field__label">カテゴリ</label>
            <div className="expense-category-grid">
              {categories.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={
                    'expense-category-btn' +
                    (categoryCode === c.code ? ' expense-category-btn--active' : '')
                  }
                  onClick={() => setCategoryCode(c.code)}
                >
                  {EXPENSE_CATEGORY_ICONS[c.code] && (
                    <span className="expense-category-btn__icon">
                      {EXPENSE_CATEGORY_ICONS[c.code]}
                    </span>
                  )}
                  <span className="expense-category-btn__label">
                    {EXPENSE_CATEGORY_LABELS[c.code]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 金額 */}
          <div className="expense-field">
            <label className="expense-field__label">金額(円)</label>
            <input
              type="number"
              inputMode="numeric"
              className="expense-field__input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例: 1500"
              min={0}
            />
          </div>

          {/* 交通手段 (通勤=必須、営業販管費=任意) */}
          {showTransport && (
            <div className="expense-field">
              <label className="expense-field__label">
                交通手段
                {transportRequired ? (
                  <span style={{ color: '#c25555', marginLeft: 4 }}>*</span>
                ) : (
                  <span style={{ color: '#8a8470', marginLeft: 4, fontSize: '0.85em' }}>
                    (任意)
                  </span>
                )}
              </label>
              <select
                className="expense-field__input"
                value={transportType}
                onChange={(e) =>
                  setTransportType(e.target.value as TransportType | '')
                }
              >
                <option value="">選択してください</option>
                {Object.entries(TRANSPORT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* クライアント (営業販管費=必須) */}
          {showClient && (
            <div className="expense-field">
              <label className="expense-field__label">
                クライアント
                <span style={{ color: '#c25555', marginLeft: 4 }}>*</span>
              </label>
              <select
                className="expense-field__input"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">選択してください</option>
                {clients
                  .filter((c) => !c.is_internal)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* メモ */}
          <div className="expense-field">
            <label className="expense-field__label">メモ(任意)</label>
            <textarea
              className="expense-field__textarea"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              placeholder="補足があれば記入"
            />
          </div>

          {/* 領収書 */}
          <div className="expense-field">
            <label className="expense-field__label">領収書画像(任意)</label>
            <input
              type="file"
              accept="image/*,.pdf"
              className="expense-field__file"
              onChange={handleFileChange}
            />
            {previewUrl && (
              <div className="expense-receipt-preview">
                <img src={previewUrl} alt="プレビュー" />
              </div>
            )}
            {!previewUrl && existingReceiptUrl && (
              <div className="expense-receipt-existing">
                <span>✅ 既存の領収書あり</span>
                <span className="expense-receipt-existing__hint">
                  新しい画像を選ぶと差し替えられます
                </span>
              </div>
            )}
          </div>

          {currentCategory && (
            <div className="expense-modal__hint">
              {EXPENSE_CATEGORY_LABELS[currentCategory.code]} を選択中
            </div>
          )}

          {formError && (
            <div className="expense-modal__error">{formError}</div>
          )}
        </div>

        <footer className="expense-modal__footer">
          {editing && (
            <button
              type="button"
              className={
                'expense-modal__btn expense-modal__btn--danger' +
                (confirmDelete ? ' expense-modal__btn--danger-confirm' : '')
              }
              onClick={handleDelete}
              disabled={busy}
            >
              {confirmDelete ? '本当に削除しますか?' : '削除'}
            </button>
          )}
          <div className="expense-modal__footer-spacer" />
          <button
            type="button"
            className="expense-modal__btn"
            onClick={onClose}
            disabled={busy}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="expense-modal__btn expense-modal__btn--primary"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? '保存中...' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ExpenseModal;
