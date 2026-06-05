import { useState } from 'react';
import { useMonthlyExpenseClosure } from './useMonthlyExpenseClosure';
import { useExpenseClosureActions } from './useExpenseClosureActions';
import {
  fmtShortTime,
  expenseStatusBadgeClass,
  expenseStatusLabel,
} from './expenseClosureUtils';
// CSS は勤怠側と完全に同じものを再利用 (見た目を揃えるため)
import '../closure/ClosureSubmitButton.css';

/**
 * 経費画面右上に置く「提出ボタン / 状態バッジ」 (勤怠の ClosureSubmitButton と同形)
 * --------------------------------------------------------------
 * - 未提出 → 「📤 この月を提出」ボタン
 * - 提出済 → バッジ「提出済 (M/D HH:mm)」
 * - 確定済 → バッジ「🔒 確定済 (M/D HH:mm by 〇〇)」
 * --------------------------------------------------------------
 */

export type ExpenseClosureSubmitButtonProps = {
  /** 対象の社員 ID (本人 or 管理者代行) */
  userId: string;
  /** 操作者 ID */
  actorId: string;
  /** 対象年月 'YYYY-MM' */
  yearMonth: string;
  /** 確定者の名前表示用マップ (省略可) */
  confirmerNameMap?: Map<string, string>;
};

export function ExpenseClosureSubmitButton({
  userId,
  actorId,
  yearMonth,
  confirmerNameMap,
}: ExpenseClosureSubmitButtonProps) {
  const { closure, lock, loading, reload } = useMonthlyExpenseClosure(userId, yearMonth);
  const { submit, processing, lastError, clearError } = useExpenseClosureActions();

  const [modalOpen, setModalOpen] = useState(false);
  const [note, setNote] = useState('');

  if (loading) {
    return <span className="closure-btn__loading">読み込み中…</span>;
  }

  // 確定済
  if (lock.locked && closure) {
    const cName = confirmerNameMap?.get(closure.confirmed_by ?? '') ?? '管理者';
    return (
      <span
        className={`badge ${expenseStatusBadgeClass(closure.status)}`}
        title={`確定: ${fmtShortTime(closure.confirmed_at)} by ${cName}`}
      >
        🔒 {expenseStatusLabel(closure.status)} ({fmtShortTime(closure.confirmed_at)})
      </span>
    );
  }

  // 提出済
  if (lock.submitted && closure) {
    return (
      <span
        className={`badge ${expenseStatusBadgeClass(closure.status)}`}
        title={`提出: ${fmtShortTime(closure.submitted_at)}`}
      >
        📤 {expenseStatusLabel(closure.status)} ({fmtShortTime(closure.submitted_at)})
      </span>
    );
  }

  // 未提出 → 提出ボタン
  const onConfirmSubmit = async () => {
    const r = await submit({
      userId,
      actorId,
      yearMonth,
      note: note.trim() || undefined,
    });
    if (r.ok) {
      setModalOpen(false);
      setNote('');
      reload();
    }
  };

  return (
    <>
      <button
        type="button"
        className="closure-btn closure-btn--submit"
        onClick={() => setModalOpen(true)}
      >
        📤 この月を提出
      </button>

      {modalOpen && (
        <div
          className="closure-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !processing) setModalOpen(false);
          }}
        >
          <div className="closure-modal" role="dialog" aria-modal="true">
            <h3 className="closure-modal__title">経費を提出</h3>
            <p className="closure-modal__lead">
              {yearMonth} 分の経費を提出します。提出後は管理者が確認し、確定するとロックされます。
            </p>

            <label className="closure-modal__label">
              メモ (任意)
              <textarea
                className="closure-modal__textarea"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="特記事項があれば入力 (例: 5/15 の交際費はクライアント接待)"
              />
            </label>

            {lastError && (
              <div className="closure-modal__error">
                <span>⚠</span>
                <p>{lastError}</p>
                <button
                  type="button"
                  className="closure-modal__error-close"
                  onClick={clearError}
                >
                  ✕
                </button>
              </div>
            )}

            <div className="closure-modal__actions">
              <button
                type="button"
                className="closure-modal__btn closure-modal__btn--cancel"
                onClick={() => setModalOpen(false)}
                disabled={processing}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="closure-modal__btn closure-modal__btn--submit"
                onClick={onConfirmSubmit}
                disabled={processing}
              >
                {processing ? '提出中…' : '提出する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
