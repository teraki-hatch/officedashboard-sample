import { useEffect, useState } from 'react';
import type { ReviewAction, ReviewableItem } from './useReviewRequest';
import {
  LEAVE_TYPE_LABEL,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from './requestUtils';
import type { LeaveType } from './types';
import './ReviewModal.css';

/**
 * 承認/却下モーダル (Phase 3-7)
 * --------------------------------------------------------------
 * 既存システム RequestsView.jsx の承認モーダルを踏襲。
 * - 申請の詳細をプレビュー
 * - admin_comment (任意) を入力
 * - 「承認する」or 「却下する」ボタン
 *
 * 実際の処理は useReviewRequest フックで実行する。
 * --------------------------------------------------------------
 */

const WORK_TYPE_LABEL: Record<string, string> = {
  remote: '在宅',
  office: '出社',
  business_trip: '出張',
  normal: '出社',
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDateWithDow(ds: string): string {
  const d = new Date(ds + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${
    WEEKDAYS[d.getDay()]
  })`;
}

export type ReviewModalProps = {
  item: ReviewableItem;
  action: ReviewAction;
  /** ユーザー名取得用 */
  userName: string;
  /** 処理中フラグ */
  saving: boolean;
  /** エラーメッセージ (フック側から) */
  errorMessage: string | null;
  onConfirm: (adminComment: string) => void;
  onClose: () => void;
};

export function ReviewModal({
  item,
  action,
  userName,
  saving,
  errorMessage,
  onConfirm,
  onClose,
}: ReviewModalProps) {
  const [adminComment, setAdminComment] = useState<string>('');

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

  const isApprove = action === 'approve';
  const title = isApprove ? '申請を承認' : '申請を却下';
  const ctaLabel = isApprove ? '承認する' : '却下する';
  const ctaSavingLabel = isApprove ? '承認中…' : '却下中…';

  return (
    <div
      className="review-modal__backdrop"
      onClick={onClickBackdrop}
      role="presentation"
    >
      <div
        className={`review-modal__panel ${
          isApprove ? 'review-modal__panel--approve' : 'review-modal__panel--reject'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="review-modal__header">
          <h3 id="review-modal-title" className="review-modal__title">
            {title}
          </h3>
        </header>

        {errorMessage && (
          <div className="review-modal__error">
            <p>{errorMessage}</p>
          </div>
        )}

        {/* ===== 申請詳細 ===== */}
        <section className="review-modal__detail">
          <div className="review-modal__detail-row">
            <span className="review-modal__detail-label">申請者</span>
            <span className="review-modal__detail-value">
              <strong>{userName}</strong>
            </span>
          </div>
          <div className="review-modal__detail-row">
            <span className="review-modal__detail-label">種別</span>
            <span className="review-modal__detail-value">
              <span
                className={`review-modal__kind ${
                  item._kind === 'leave'
                    ? 'review-modal__kind--leave'
                    : 'review-modal__kind--correction'
                }`}
              >
                {item._kind === 'leave' ? '休暇申請' : '勤怠修正申請'}
              </span>
              <span className={`badge ${STATUS_BADGE_CLASS[item.status]}`}>
                {STATUS_LABEL[item.status]}
              </span>
            </span>
          </div>

          {item._kind === 'leave' ? (
            <>
              <div className="review-modal__detail-row">
                <span className="review-modal__detail-label">休暇種別</span>
                <span className="review-modal__detail-value">
                  {LEAVE_TYPE_LABEL[item.leave_type as LeaveType]}
                </span>
              </div>
              <div className="review-modal__detail-row">
                <span className="review-modal__detail-label">期間</span>
                <span className="review-modal__detail-value">
                  {item.start_date === item.end_date
                    ? fmtDateWithDow(item.start_date)
                    : `${fmtDateWithDow(item.start_date)} 〜 ${fmtDateWithDow(item.end_date)}`}
                  <span className="review-modal__days">({item.days}日)</span>
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="review-modal__detail-row">
                <span className="review-modal__detail-label">対象日</span>
                <span className="review-modal__detail-value">
                  {fmtDateWithDow(item.target_date)}
                </span>
              </div>
              <div className="review-modal__detail-row">
                <span className="review-modal__detail-label">勤務区分</span>
                <span className="review-modal__detail-value">
                  {item.requested_work_type
                    ? WORK_TYPE_LABEL[item.requested_work_type] ??
                      item.requested_work_type
                    : '—'}
                </span>
              </div>
              <div className="review-modal__detail-row">
                <span className="review-modal__detail-label">出退勤</span>
                <span className="review-modal__detail-value">
                  {item.requested_clock_in ?? '—'} 〜{' '}
                  {item.requested_clock_out ?? '—'}
                </span>
              </div>
              <div className="review-modal__detail-row">
                <span className="review-modal__detail-label">休憩</span>
                <span className="review-modal__detail-value">
                  {item.requested_break_minutes != null
                    ? `${item.requested_break_minutes}分`
                    : '—'}
                </span>
              </div>
            </>
          )}

          {item.reason && (
            <div className="review-modal__detail-reason">
              <span className="review-modal__detail-label">申請理由</span>
              <p>{item.reason}</p>
            </div>
          )}
        </section>

        {/* ===== 承認時の自動反映の注意 ===== */}
        {isApprove && item._kind === 'correction' && (
          <div className="review-modal__note">
            <p>
              承認後、勤怠実績 (attendance_records) に自動で反映されます。
            </p>
          </div>
        )}

        {/* ===== コメント入力 ===== */}
        <section className="review-modal__comment-section">
          <label className="review-modal__label">
            {isApprove ? '管理者コメント (任意)' : '却下理由 (任意)'}
          </label>
          <textarea
            value={adminComment}
            onChange={(e) => setAdminComment(e.target.value)}
            rows={3}
            placeholder={
              isApprove
                ? 'コメントがあれば入力してください'
                : '却下する理由を入力してください'
            }
            className="review-modal__textarea"
            disabled={saving}
          />
        </section>

        {/* ===== ボタン ===== */}
        <div className="review-modal__actions">
          <button
            type="button"
            className={`review-modal__btn ${
              isApprove
                ? 'review-modal__btn--approve'
                : 'review-modal__btn--reject'
            }`}
            onClick={() => onConfirm(adminComment)}
            disabled={saving}
          >
            {saving ? ctaSavingLabel : ctaLabel}
          </button>
          <button
            type="button"
            className="review-modal__btn review-modal__btn--cancel"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
