import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useBoardData } from '../features/board/useBoardKPI';
import { useProfitability } from '../features/profitability/useProfitability';
import { getFiscalPeriodNumber } from '../features/performance/fiscalPeriod';
import './BoardPage.css';

const PIE_COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#6b7280',
];

function formatYen(n: number): string {
  return '¥' + Math.round(Number(n || 0)).toLocaleString('ja-JP');
}
function formatYenShort(n: number): string {
  const v = Math.round(Number(n || 0));
  if (Math.abs(v) >= 100_000_000) return (v / 100_000_000).toFixed(1) + '億';
  if (Math.abs(v) >= 10_000) return (v / 10_000).toFixed(0) + '万';
  return v.toLocaleString('ja-JP');
}
function formatPct(n: number, digits = 1): string {
  return n.toFixed(digits) + '%';
}

export function BoardPage() {
  const navigate = useNavigate();
  const board = useBoardData();

  // 案件採算 (上位/下位向け)
  const today = new Date();
  const fiscalPeriod = getFiscalPeriodNumber(
    today.getFullYear(),
    today.getMonth() + 1
  );
  const { rows: profRows, loading: profLoading } = useProfitability({
    type: 'fiscal',
    fiscalPeriod,
  });

  const [showAllClients, setShowAllClients] = useState<boolean>(false);

  if (board.error) {
    return (
      <div className="board__error">
        <p>データ取得エラー: {board.error}</p>
      </div>
    );
  }

  // 売上のあるクライアントのみ、粗利率でソート
  const sortedClients = profRows
    .filter((r) => r.sales > 0)
    .sort((a, b) => (a.gross_profit_rate ?? 0) - (b.gross_profit_rate ?? 0));

  const displayClients = showAllClients
    ? sortedClients
    : sortedClients.slice(0, 10);

  return (
    <div className="board">
      <header className="board__header">
        <div>
          <h1 className="board__title">経営ボード</h1>
          <p className="board__subtitle">
            第{fiscalPeriod}期 ({today.getFullYear() - (today.getMonth() + 1 >= 8 ? 0 : 1)}年8月〜) 累計
          </p>
        </div>
      </header>

      {/* ===== KPI カード 6枚 ===== */}
      <section className="board__kpi-grid">
        <KpiCard
          label="当期売上"
          value={formatYen(board.kpi.totalSales)}
          loading={board.loading}
          color="primary"
        />
        <KpiCard
          label="当期粗利"
          value={formatYen(board.kpi.totalGrossProfit)}
          sub={
            board.kpi.totalSales > 0
              ? `粗利率 ${formatPct(
                  (board.kpi.totalGrossProfit / board.kpi.totalSales) * 100
                )}`
              : '—'
          }
          loading={board.loading}
          color={board.kpi.totalGrossProfit >= 0 ? 'success' : 'danger'}
        />
        <KpiCard
          label="全社稼働率"
          value={formatPct(board.kpi.utilizationRate)}
          sub="工数÷所定 (経過月)"
          loading={board.loading}
        />
        <KpiCard
          label="未請求"
          value={formatYen(board.kpi.unbilledAmount)}
          sub="下書きの請求書"
          loading={board.loading}
          color={board.kpi.unbilledAmount > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="未入金"
          value={formatYen(board.kpi.unpaidAmount)}
          sub="入金待ち合計"
          loading={board.loading}
          color={board.kpi.unpaidAmount > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="進行中案件"
          value={`${board.kpi.activeDealCount}件`}
          sub="成約 / 支援中"
          loading={board.loading}
        />
      </section>

      {/* ===== チャート ===== */}
      <section className="board__chart-row">
        <div className="board__panel board__panel--wide">
          <h2 className="board__panel-title">月別 売上 / 原価</h2>
          {board.loading ? (
            <p className="board__mute">読み込み中...</p>
          ) : board.monthlySales.length === 0 ? (
            <p className="board__mute">データなし</p>
          ) : (
            <div className="board__chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={board.monthlySales}>
                  <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="yearMonth"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatYenShort(v)}
                  />
                  <Tooltip
                    formatter={(v: number) => formatYen(v)}
                    labelStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name="売上"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    name="原価"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="board__panel">
          <h2 className="board__panel-title">カテゴリ別 売上構成</h2>
          {board.loading ? (
            <p className="board__mute">読み込み中...</p>
          ) : board.categorySales.length === 0 ? (
            <p className="board__mute">データなし</p>
          ) : (
            <div className="board__chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={board.categorySales}
                    dataKey="sales"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    label={(entry: { category: string }) => entry.category}
                    labelLine={false}
                  >
                    {board.categorySales.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatYen(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* ===== クライアント別収支 ===== */}
      <section className="board__panel board__panel--full">
        <div className="board__panel-header">
          <h2 className="board__panel-title">
            クライアント別 収支 (粗利率の低い順)
          </h2>
          {sortedClients.length > 10 && (
            <button
              type="button"
              className="board__btn board__btn--small board__btn--secondary"
              onClick={() => setShowAllClients((v) => !v)}
            >
              {showAllClients ? '上位10件に戻す' : `全${sortedClients.length}件表示`}
            </button>
          )}
        </div>
        {profLoading ? (
          <p className="board__mute">読み込み中...</p>
        ) : displayClients.length === 0 ? (
          <p className="board__mute">データなし</p>
        ) : (
          <table className="board__table">
            <thead>
              <tr>
                <th>クライアント</th>
                <th className="board__td-num">売上</th>
                <th className="board__td-num">原価</th>
                <th className="board__td-num">粗利</th>
                <th className="board__td-num">粗利率</th>
                <th className="board__td-num">工数</th>
              </tr>
            </thead>
            <tbody>
              {displayClients.map((r) => {
                const danger =
                  r.gross_profit_rate !== null && r.gross_profit_rate < 0;
                const warn =
                  !danger &&
                  r.gross_profit_rate !== null &&
                  r.gross_profit_rate < 20;
                return (
                  <tr
                    key={r.client_id}
                    className={
                      'board__row-link' +
                      (danger ? ' board__row--danger' : '') +
                      (warn ? ' board__row--warn' : '')
                    }
                    onClick={() =>
                      navigate(`/sales/clients/${r.client_id}`)
                    }
                  >
                    <td>{r.client_name}</td>
                    <td className="board__td-num">{formatYen(r.sales)}</td>
                    <td className="board__td-num">{formatYen(r.cost)}</td>
                    <td className="board__td-num">
                      {formatYen(r.gross_profit)}
                    </td>
                    <td className="board__td-num">
                      {r.gross_profit_rate !== null
                        ? formatPct(r.gross_profit_rate)
                        : '—'}
                    </td>
                    <td className="board__td-num">
                      {Number(r.total_hours || 0).toFixed(1)}h
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="board__note">
        ※ 詳細な業績管理は{' '}
        <button
          type="button"
          className="board__inline-link"
          onClick={() => navigate('/performance')}
        >
          業績管理
        </button>{' '}
        、案件単位の採算は{' '}
        <button
          type="button"
          className="board__inline-link"
          onClick={() => navigate('/profitability')}
        >
          案件採算
        </button>{' '}
        からも確認できます。
      </p>
    </div>
  );
}

// ===== KPI カード =====
function KpiCard(props: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const colorClass = props.color ? ` board__kpi--${props.color}` : '';
  return (
    <div className={'board__kpi' + colorClass}>
      <div className="board__kpi-label">{props.label}</div>
      <div className="board__kpi-value">
        {props.loading ? '...' : props.value}
      </div>
      {props.sub && <div className="board__kpi-sub">{props.sub}</div>}
    </div>
  );
}

export default BoardPage;
