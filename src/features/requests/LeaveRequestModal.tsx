import { useEffect, useState } from 'react';
import type { LeaveRequest, LeaveType } from './types';
import { useLeaveRequest } from './useLeaveRequest';
import {
  HALF_LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  PAID_TYPES,
  calcLeaveDays,
  calcPaidUsed,
} from './requestUtils';
import './LeaveRequestModal.css';

/**
 * 休暇申請モーダル (Phase 3-6)
 * --------------------------------------------------------------
 * 既存 RequestsView.jsx のフォーム部分を踏襲。
 *
 * - 休暇種別を選ぶと、半休なら終了日を開始日に自動同期
 * - 有休系は残日数プレビュー
 * - 申請成功後は onSubmitted を呼んで親に再フェッチさせる
 * --------------------------------------------------------------
 */

export type LeaveRequestModalProps = {
  /** public.users.id */
  userId: string;
  /** ユーザーが管理者か (バリデーション分岐) */
  isAdmin: boolean;
  /** 残日数の計算用 (available = granted + carryover + adjusted) */
  availableDays: number | null;
  /** 既存の自分の申請 (残日数計算で消化分を引く) */
  existingRequests: LeaveRequest[];
  /** モーダルを閉じる */
  onClose: () => void;
  /** 申請成功時 */
  onSubmitted: () => void;
};

const LEAVE_TYPE_OPTIONS: Array<{ value: LeaveType; label: string }> = (
  Object.entries(LEAVE_TYPE_LABEL) as Array<[LeaveType, string]>
).map(([value, label]) => ({ value, label }));

export function LeaveRequestModal({
  userId,
  isAdmin,
  availableDays,
  existingRequests,
  onClose,
  onSubmitted,
}: LeaveRequestModalProps) {
  const [leaveType, setLeaveType] = useState<LeaveType>('paid');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { saving, lastError, submit, clearError } = useLeaveRequest();

  const isHalf = HALF_LEAVE_TYPES.has(leaveType);
  const isPaid = PAID_TYPES.has(leaveType);

  // 種別変更時に半休なら終了日を開始日に
  const handleTypeChange = (v: LeaveType) => {
    setLeaveType(v);
    if (HALF_LEAVE_TYPES.has(v) && startDate) {
      setEndDate(startDate);
    }
  };

  // 開始日変更時
  const handleStartChange = (v: string) => {
    setStartDate(v);
    if (isHalf) {
      setEndDate(v);
    } else if (!endDate) {
      setEndDate(v);
    }
  };

  // 日数プレビュー
  const previewDays =
    startDate && (isHalf ? true : endDate && endDate >= startDate)
      ? calcLeaveDays(leaveType, startDate, isHalf ? startDate : endDate)
      : null;

  // 残日数プレビュー (有休系のみ)
  const taken = calcPaidUsed(existingRequests, ['approved']);
  const pend = calcPaidUsed(existingRequests, ['pending']);
  const remaining =
    availableDays != null ? Math.round((availableDays - taken - pend) * 10) / 10 : null;

  const willExceed =
    isPaid && remaining != null && previewDays != null && previewDays > remaining;

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const onClickBackdrop = () => {
    if (saving) return;
    onClose();
  };

  const handleSubmit = async () => {
    clearError();
    // 残日数バリデーション用の値を計算 (UI で表示している値と一致)
    const consumedDays = Math.round((taken + pend) * 10) / 10;
    const r = await submit({
      userId,
      leaveType,
      startDate,
      endDate: isHalf ? startDate : endDate,
      reason,
      isAdmin,
      availableDays,
      consumedDays,
    });
    if (r.ok) {
      setSuccessMsg(`休暇申請を送信しました (${r.days}日)`);
    }
  };

  const handleCloseAfterSuccess = () => {
    onSubmitted();
    onClose();
  };

  return (
    <div
      className="leave-modal__backdrop"
      onClick={onClickBackdrop}
      role="presentation"
    >
      <div
        className="leave-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="leave-modal__header">
          <h3 id="leave-modal-title" className="leave-modal__title">
            休暇申請
          </h3>
          <p className="leave-modal__sub">
            申請後は「承認待ち」になります。承認・却下は管理者が行います。
          </p>
        </header>

        {successMsg ? (
          <div className="leave-modal__success">
            <div className="leave-modal__success-card">
              <p className="leave-modal__success-msg">✅ {successMsg}</p>
              <p className="leave-modal__success-sub">
                申請一覧から状況を確認できます
              </p>
            </div>
            <button
              type="button"
              className="leave-modal__btn leave-modal__btn--secondary"
              onClick={handleCloseAfterSuccess}
            >
              閉じる
            </button>
          </div>
        ) : (
          <>
            {lastError && (
              <div className="leave-modal__error">
                <p>{lastError}</p>
              </div>
            )}

            <div className="leave-modal__body">
              {/* 種別 */}
              <div className="leave-modal__field">
                <label className="leave-modal__label">
                  休暇種別 <span className="leave-modal__required">*</span>
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => handleTypeChange(e.target.value as LeaveType)}
                  className="leave-modal__select"
                  disabled={saving}
                >
                  {LEAVE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {isHalf && (
                  <p className="leave-modal__hint">半休は 0.5 日として計算します</p>
                )}
              </div>

              {/* 日付 */}
              <div className="leave-modal__row">
                <div className="leave-modal__field">
                  <label className="leave-modal__label">
                    開始日 <span className="leave-modal__required">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className="leave-modal__input"
                    disabled={saving}
                  />
                </div>
                <div className="leave-modal__field">
                  <label className="leave-modal__label">
                    終了日 <span className="leave-modal__required">*</span>
                  </label>
                  <input
                    type="date"
                    value={isHalf ? startDate : endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="leave-modal__input"
                    disabled={saving || isHalf}
                    min={startDate || undefined}
                  />
                </div>
              </div>

              {/* 日数プレビュー */}
              {previewDays != null && (
                <div className="leave-modal__preview">
                  <span className="leave-modal__preview-label">申請日数:</span>
                  <strong className="leave-modal__preview-value">{previewDays}日</strong>
                  {isPaid && remaining != null && (
                    <span
                      className={`leave-modal__preview-remain ${
                        willExceed ? 'leave-modal__preview-remain--neg' : ''
                      }`}
                    >
                      (残日数: {remaining}日)
                    </span>
                  )}
                </div>
              )}
              {willExceed && (
                <div className="leave-modal__warn">
                  <p>
                    ⚠ 有休残日数を超える申請です。このまま申請するとエラーになります。
                  </p>
                </div>
              )}

              {/* 理由 */}
              <div className="leave-modal__field">
                <label className="leave-modal__label">
                  申請理由 <span className="leave-modal__required">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="休暇取得の理由を記入してください"
                  className="leave-modal__textarea"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="leave-modal__actions">
              <button
                type="button"
                className="leave-modal__btn leave-modal__btn--primary"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? '送信中…' : '申請する'}
              </button>
              <button
                type="button"
                className="leave-modal__btn leave-modal__btn--secondary"
                onClick={onClose}
                disabled={saving}
              >
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
