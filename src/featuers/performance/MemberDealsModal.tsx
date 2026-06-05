import { DealList } from './DealList';
import type { PerformanceDeal } from './types';
import './MemberDealsModal.css';

type MemberDealsModalProps = {
  open: boolean;
  memberName: string;
  deals: PerformanceDeal[];
  loading: boolean;
  year: number;
  month: number;
  onClose: () => void;
};

export function MemberDealsModal(props: MemberDealsModalProps) {
  const { open, memberName, deals, loading, year, month, onClose } = props;

  if (!open) return null;

  return (
    <div className="member-modal__backdrop">
      <div className="member-modal" onClick={(e) => e.stopPropagation()}>
        <header className="member-modal__header">
          <div>
            <h2 className="member-modal__title">{memberName} さんの案件</h2>
            <p className="member-modal__subtitle">
              {year}年 {month}月
            </p>
          </div>
          <button
            type="button"
            className="member-modal__close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>

        <div className="member-modal__body">
          <DealList deals={deals} loading={loading} />
        </div>

        <footer className="member-modal__footer">
          <button
            type="button"
            className="member-modal__btn"
            onClick={onClose}
          >
            閉じる
          </button>
        </footer>
      </div>
    </div>
  );
}

export default MemberDealsModal;
