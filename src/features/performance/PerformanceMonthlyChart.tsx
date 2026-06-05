import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyDataPoint } from './types';
import './PerformanceMonthlyChart.css';

type MetricKey = 'sales' | 'client' | 'gross_profit';

type PerformanceMonthlyChartProps = {
  data: MonthlyDataPoint[];
  metric: MetricKey;
};

const METRIC_LABELS: Record<MetricKey, string> = {
  sales: '売上',
  client: '社数',
  gross_profit: '粗利',
};

function formatYen(n: number): string {
  if (n >= 100000000) {
    return `¥${(n / 100000000).toFixed(1)}億`;
  }
  if (n >= 10000) {
    return `¥${(n / 10000).toFixed(0)}万`;
  }
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

function formatYenSigned(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  return sign + formatYen(Math.abs(n));
}

function formatNum(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.05) {
    return String(Math.round(n));
  }
  return n.toFixed(1);
}

function formatRate(rate: number): string {
  if (!isFinite(rate) || rate <= 0) return '—';
  return Math.round(rate * 100) + '%';
}

// recharts Tooltip の payload 型
type TooltipPayloadItem = {
  dataKey: string;
  value: number;
  payload?: { monthLabel: string; 実績: number; 目標: number };
};

type CustomTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  metric: MetricKey;
};

function CustomTooltip({ active, payload, label, metric }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const actual = data.実績 ?? 0;
  const target = data.目標 ?? 0;
  const diff = actual - target;
  const rate = target > 0 ? actual / target : 0;

  const fmt = metric === 'client'
    ? (n: number) => `${formatNum(n)}社`
    : (n: number) => formatYen(n);

  const fmtSigned = metric === 'client'
    ? (n: number) => (n >= 0 ? '+' : '-') + `${formatNum(Math.abs(n))}社`
    : (n: number) => formatYenSigned(n);

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        minWidth: 140,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#111827' }}>
        {label}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#7b9e6e' }}>● 実績</span>
        <span style={{ marginLeft: 12 }}>{fmt(actual)}</span>
      </div>
      {metric !== 'client' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: metric === 'sales' ? '#9aa3ad' : '#f59e0b' }}>
              {metric === 'sales' ? '●' : '─'} 目標
            </span>
            <span style={{ marginLeft: 12 }}>{fmt(target)}</span>
          </div>
          <div
            style={{
              borderTop: '1px solid #f1f5f9',
              marginTop: 4,
              paddingTop: 4,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ color: '#6b7280' }}>差分</span>
            <span
              style={{
                marginLeft: 12,
                color: diff >= 0 ? '#2e7d32' : '#c44',
                fontWeight: 600,
              }}
            >
              {fmtSigned(diff)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>達成率</span>
            <span
              style={{
                marginLeft: 12,
                color: rate >= 1 ? '#2e7d32' : rate >= 0.7 ? '#ef6c00' : '#c44',
                fontWeight: 600,
              }}
            >
              {formatRate(rate)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function PerformanceMonthlyChart(props: PerformanceMonthlyChartProps) {
  const { data, metric } = props;

  // recharts 用にデータを整形
  const chartData = data.map((d) => {
    let actual = 0;
    let target = 0;
    if (metric === 'sales') {
      actual = d.sales_actual;
      target = d.sales_target;
    } else if (metric === 'client') {
      actual = d.client_count_actual;
      target = 0;
    } else if (metric === 'gross_profit') {
      actual = d.gross_profit_actual;
      target = d.gross_profit_target;
    }
    return {
      monthLabel: d.monthLabel,
      実績: actual,
      目標: target,
    };
  });

  const formatter = (value: number): string => {
    if (metric === 'client') return `${formatNum(value)}社`;
    return formatYen(value);
  };

  return (
    <div className="perf-chart">
      <div className="perf-chart__title">{METRIC_LABELS[metric]}の月別推移</div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="monthLabel"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            stroke="#d1d5db"
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            stroke="#d1d5db"
            tickFormatter={formatter}
          />
          <Tooltip content={<CustomTooltip metric={metric} />} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="circle"
          />

          {/* 売上: 目標バー(左、グレー) + 実績バー(右、緑) */}
          {metric === 'sales' && (
            <Bar dataKey="目標" fill="#d8dde3" radius={[4, 4, 0, 0]} />
          )}

          {/* 実績: 緑のバー (全メトリクス共通) */}
          <Bar dataKey="実績" fill="#7b9e6e" radius={[4, 4, 0, 0]} />

          {/* 粗利: 目標は折れ線 (オレンジ) */}
          {metric === 'gross_profit' && (
            <Line
              type="monotone"
              dataKey="目標"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 4, fill: '#f59e0b' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PerformanceMonthlyChart;
