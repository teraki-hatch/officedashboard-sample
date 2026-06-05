import type { PerformanceSummary } from './types';
import './PerformanceCard.css';

type PerformanceCardProps = {
  summary: PerformanceSummary;
  /** 社数実績 (指定時は「成約件数」を「社数」表示に置き換える) */
  clientCount?: number;
};

function formatYen(n: number): string {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

function formatRate(rate: number): string {
  if (!isFinite(rate) || rate <= 0) return '—';
  return Math.round(rate * 100) + '%';
}

function ProgressBar({ rate }: { rate: number }) {
  const pct = Math.max(0, Math.min(1, rate)) * 100;
  let barClass = 'perf-card__bar-fill';
  if (rate >= 1) barClass += ' perf-card__bar-fill--full';
  else if (rate >= 0.7) barClass += ' perf-card__bar-fill--high';
  else if (rate >= 0.4) barClass += ' perf-card__bar-fill--mid';
  else barClass += ' perf-card__bar-fill--low';
  return (
    <div className="perf-card__bar">
      <div className={barClass} style={{ width: pct + '%' }} />
    </div>
  );
}

export function PerformanceCard({ summary, clientCount }: PerformanceCardProps) {
  const showClientCount = typeof clientCount === 'number';

  const items = [
    {
      key: 'sales',
      label: '売上',
      icon: '💰',
      actual: formatYen(summary.sales_actual),
      target: summary.sales_target > 0 ? formatYen(summary.sales_target) : null,
      rate: summary.sales_rate,
      hideTarget: false,
    },
    showClientCount
      ? {
          key: 'client',
          label: '社数',
          icon: '🏢',
          actual: `${clientCount} 社`,
          target: null,
          rate: 0,
          hideTarget: true,
        }
      : {
          key: 'deal',
          label: '成約件数',
          icon: '🤝',
          actual: `${Math.round(summary.deal_actual)} 件`,
          target:
            summary.deal_target > 0 ? `${summary.deal_target} 件` : null,
          rate: summary.deal_rate,
          hideTarget: false,
        },
    {
      key: 'gross',
      label: '粗利',
      icon: '📈',
      actual: formatYen(summary.gross_profit_actual),
      target:
        summary.gross_profit_target > 0
          ? formatYen(summary.gross_profit_target)
          : null,
      rate: summary.gross_profit_rate,
      hideTarget: false,
    },
  ];

  return (
    <div className="perf-card-grid">
      {items.map((it) => (
        <div key={it.key} className="perf-card">
          <div className="perf-card__header">
            <span className="perf-card__icon">{it.icon}</span>
            <span className="perf-card__label">{it.label}</span>
          </div>
          <div className="perf-card__value">{it.actual}</div>
          {!it.hideTarget && (
            <div className="perf-card__meta">
              {it.target ? (
                <>
                  <span className="perf-card__target">目標 {it.target}</span>
                  <span className="perf-card__rate">{formatRate(it.rate)}</span>
                </>
              ) : (
                <span className="perf-card__no-target">目標未設定</span>
              )}
            </div>
          )}
          {!it.hideTarget && it.target && <ProgressBar rate={it.rate} />}
        </div>
      ))}
    </div>
  );
}

export default PerformanceCard;
