import { useMemo, useState } from 'react';
import type { DealStatus, PerformanceDeal } from './types';
import { DEAL_STATUS_LABELS, DEAL_STATUS_COLORS } from './types';
import './DealList.css';

type DealListProps = {
  deals: PerformanceDeal[];
  loading: boolean;
  showOwner?: boolean;
  ownerNameMap?: Record<string, string>;
  onEdit?: (deal: PerformanceDeal) => void;
};

const FILTER_OPTIONS: { value: DealStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'prospect', label: '見込' },
  { value: 'in_progress', label: '商談中' },
  { value: 'won', label: '成約' },
  { value: 'in_support', label: '支援中' },
  { value: 'terminated', label: '終了' },
  { value: 'lost', label: '失注' },
];

function formatYen(n: number): string {
  return '¥' + Math.round(Number(n || 0)).toLocaleString('ja-JP');
}

function formatDate(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

export function DealList(props: DealListProps) {
  const { deals, loading, showOwner = false, ownerNameMap = {}, onEdit } = props;
  const [filter, setFilter] = useState<DealStatus | 'all'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return deals;
    return deals.filter((d) => d.status === filter);
  }, [deals, filter]);

  return (
    <section className="deal-list">
      <div className="deal-list__header">
        <h2 className="deal-list__title">案件一覧({filtered.length}件)</h2>
        <div className="deal-list__filter">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={
                'deal-list__filter-btn' +
                (filter === opt.value ? ' deal-list__filter-btn--active' : '')
              }
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="deal-list__empty">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="deal-list__empty">
          {filter === 'all'
            ? 'まだ案件が登録されていません'
            : '該当する案件がありません'}
        </div>
      ) : (
        <div className="deal-list__items">
          {filtered.map((d) => {
            const colors = DEAL_STATUS_COLORS[d.status];
            let dateLabel = '';
            if (d.status === 'terminated' && d.terminated_date) {
              dateLabel = `${formatDate(d.terminated_date)} 終了`;
            } else if (d.closed_date) {
              dateLabel = `${formatDate(d.closed_date)} 確定`;
            } else if (d.expected_close_date) {
              dateLabel = `${formatDate(d.expected_close_date)} 予定`;
            }
            const ownerName = showOwner ? ownerNameMap[d.user_id] || '' : '';
            return (
              <div
                key={d.id}
                className={
                  'deal-item' + (onEdit ? ' deal-item--clickable' : '')
                }
                onClick={() => onEdit && onEdit(d)}
              >
                <div className="deal-item__status-col">
                  <span
                    className="deal-item__status-badge"
                    style={{ background: colors.bg, color: colors.fg }}
                  >
                    {DEAL_STATUS_LABELS[d.status]}
                  </span>
                  {dateLabel && (
                    <span className="deal-item__date">{dateLabel}</span>
                  )}
                </div>
                <div className="deal-item__main">
                  <div className="deal-item__name">{d.deal_name}</div>
                  <div className="deal-item__meta">
                    {showOwner && ownerName && (
                      <span className="deal-item__meta-tag">
                        担当: {ownerName}
                      </span>
                    )}
                    {Number(d.meeting_count) > 0 && (
                      <span className="deal-item__meta-tag">
                        面談 {d.meeting_count}件
                      </span>
                    )}
                  </div>
                  {d.notes && <div className="deal-item__notes">{d.notes}</div>}
                </div>
                <div className="deal-item__amount-col">
                  {Number(d.monthly_amount) > 0 && (
                    <div className="deal-item__monthly">
                      {formatYen(d.monthly_amount)} / 月
                    </div>
                  )}
                  {Number(d.sales_amount) > 0 && (
                    <div className="deal-item__sales">
                      {formatYen(d.sales_amount)}
                      <span className="deal-item__sales-suffix"> 一時金</span>
                    </div>
                  )}
                  {Number(d.gross_profit) !== 0 && (
                    <div className="deal-item__profit">
                      粗利 {formatYen(d.gross_profit)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default DealList;
