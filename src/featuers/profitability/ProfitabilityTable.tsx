import { Link } from 'react-router-dom';
import type { ProfitabilityRow } from './types';

type Props = {
  rows: ProfitabilityRow[];
  loading: boolean;
  error: string | null;
};

/**
 * 粗利率アラートの閾値 (固定値)
 * - 70%以上: 優良 🟢
 * - 50〜70%: 標準 🟡
 * - 30〜50%: 注意 🟠
 * - 0〜30%: 危険 🔴 (行に薄い赤背景)
 * - 0%未満: 重度危険 🟥 (行に濃い赤背景)
 * - 売上未設定: ⚪ 判定不可
 */
type AlertLevel = 'good' | 'normal' | 'warn' | 'danger' | 'critical' | 'unpriced';

function getAlertLevel(
  rate: number | null,
  sales: number
): AlertLevel {
  if (sales === 0) return 'unpriced';
  if (rate === null) return 'unpriced';
  if (rate < 0) return 'critical';
  if (rate >= 70) return 'good';
  if (rate >= 50) return 'normal';
  if (rate >= 30) return 'warn';
  return 'danger';
}

function alertIcon(level: AlertLevel): string {
  switch (level) {
    case 'good':
      return '🟢';
    case 'normal':
      return '🟡';
    case 'warn':
      return '🟠';
    case 'danger':
      return '🔴';
    case 'critical':
      return '🟥';
    case 'unpriced':
      return '⚪';
  }
}

function fmtYen(n: number): string {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

function fmtHours(n: number): string {
  return n.toLocaleString('ja-JP', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + 'h';
}

function fmtRate(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(1) + '%';
}

export function ProfitabilityTable({ rows, loading, error }: Props) {
  if (loading) {
    return <div className="prof-table__loader">読み込み中...</div>;
  }
  if (error) {
    return <div className="prof-table__error">エラー: {error}</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="prof-table__empty">
        対象期間に該当するクライアントがありません
      </div>
    );
  }

  // 合計行
  const total = rows.reduce(
    (acc, r) => ({
      sales: acc.sales + r.sales,
      cost: acc.cost + r.cost,
      gross_profit: acc.gross_profit + r.gross_profit,
      total_hours: acc.total_hours + r.total_hours,
    }),
    { sales: 0, cost: 0, gross_profit: 0, total_hours: 0 }
  );
  const totalRate =
    total.sales > 0 ? (total.gross_profit / total.sales) * 100 : null;
  const totalLevel = getAlertLevel(totalRate, total.sales);

  return (
    <div className="prof-table__wrap">
      {/* アラート基準の凡例 (右上) */}
      <div className="prof-table__alert-legend">
        <span className="prof-table__alert-legend-title">粗利率の基準</span>
        <table className="prof-table__alert-legend-table">
          <thead>
            <tr>
              <th>閾値</th>
              <th>状態</th>
              <th>マーク</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>70%以上</td>
              <td>優良</td>
              <td>🟢</td>
            </tr>
            <tr>
              <td>50〜70%</td>
              <td>標準</td>
              <td>🟡</td>
            </tr>
            <tr>
              <td>30〜50%</td>
              <td>注意</td>
              <td>🟠</td>
            </tr>
            <tr>
              <td>30%未満</td>
              <td>危険</td>
              <td>🔴</td>
            </tr>
            <tr>
              <td>0%未満 (赤字)</td>
              <td>重度危険</td>
              <td>🟥</td>
            </tr>
          </tbody>
        </table>
      </div>

      <table className="prof-table">
        <thead>
          <tr>
            <th className="prof-table__col-name">クライアント</th>
            <th className="prof-table__col-num">案件数</th>
            <th className="prof-table__col-num">工数</th>
            <th className="prof-table__col-num">売上</th>
            <th className="prof-table__col-num">原価</th>
            <th className="prof-table__col-num">粗利</th>
            <th className="prof-table__col-num">粗利率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isUnpriced = r.sales === 0;
            const isNegative = r.gross_profit < 0;
            const hasNoWork = r.total_hours === 0;
            const level = getAlertLevel(r.gross_profit_rate, r.sales);
            return (
              <tr
                key={r.client_id}
                className={
                  'prof-table__row' +
                  (isUnpriced ? ' prof-table__row--unpriced' : '') +
                  (hasNoWork && isUnpriced ? ' prof-table__row--idle' : '') +
                  (level === 'danger' ? ' prof-table__row--danger' : '') +
                  (level === 'critical' ? ' prof-table__row--critical' : '')
                }
              >
                <td className="prof-table__col-name">
                  <Link
                    to={`/clients/${r.client_id}`}
                    className="prof-table__client-link"
                  >
                    {r.client_name}
                  </Link>
                </td>
                <td className="prof-table__col-num">
                  {r.deals_count > 0 ? `${r.deals_count}件` : '—'}
                </td>
                <td className="prof-table__col-num">
                  {hasNoWork ? '—' : fmtHours(r.total_hours)}
                </td>
                <td className="prof-table__col-num">
                  {isUnpriced ? (
                    <span className="prof-table__unpriced">未設定</span>
                  ) : (
                    fmtYen(r.sales)
                  )}
                </td>
                <td className="prof-table__col-num">{fmtYen(r.cost)}</td>
                <td
                  className={
                    'prof-table__col-num' +
                    (isNegative ? ' prof-table__neg' : '')
                  }
                >
                  {fmtYen(r.gross_profit)}
                </td>
                <td
                  className={
                    'prof-table__col-num' +
                    (isNegative ? ' prof-table__neg' : '')
                  }
                >
                  <span className="prof-table__rate-cell">
                    {fmtRate(r.gross_profit_rate)}
                    <span
                      className="prof-table__alert-icon"
                      aria-label={`粗利率アラート: ${level}`}
                    >
                      {alertIcon(level)}
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr
            className={
              'prof-table__total' +
              (totalLevel === 'danger' ? ' prof-table__row--danger' : '') +
              (totalLevel === 'critical' ? ' prof-table__row--critical' : '')
            }
          >
            <td colSpan={2}>合計</td>
            <td className="prof-table__col-num">
              {fmtHours(total.total_hours)}
            </td>
            <td className="prof-table__col-num">{fmtYen(total.sales)}</td>
            <td className="prof-table__col-num">{fmtYen(total.cost)}</td>
            <td
              className={
                'prof-table__col-num' +
                (total.gross_profit < 0 ? ' prof-table__neg' : '')
              }
            >
              {fmtYen(total.gross_profit)}
            </td>
            <td
              className={
                'prof-table__col-num' +
                (total.gross_profit < 0 ? ' prof-table__neg' : '')
              }
            >
              <span className="prof-table__rate-cell">
                {fmtRate(totalRate)}
                <span
                  className="prof-table__alert-icon"
                  aria-label={`粗利率アラート: ${totalLevel}`}
                >
                  {alertIcon(totalLevel)}
                </span>
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
