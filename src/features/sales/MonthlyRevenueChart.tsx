type Props = {
  monthlyRevenue: Record<number, number>; // 月別実績 (1-12)
  monthlyTargets: Record<number, number>; // 月別目標
  currentMonth: number;
};

// 期は8月〜7月
const MONTH_ORDER = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];

function formatYenShort(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}億`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}万`;
  return `${n.toLocaleString()}`;
}

/**
 * 月別売上推移グラフ (実績棒 + 目標棒の並列)
 */
export function MonthlyRevenueChart({
  monthlyRevenue,
  monthlyTargets,
  currentMonth,
}: Props) {
  // 最大値計算
  const allValues: number[] = [];
  for (const m of MONTH_ORDER) {
    allValues.push(monthlyRevenue[m] || 0, monthlyTargets[m] || 0);
  }
  const maxValue = Math.max(1, ...allValues);

  // SVG 寸法
  const width = 600;
  const height = 240;
  const padLeft = 50;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const groupWidth = innerWidth / MONTH_ORDER.length;
  const barWidth = groupWidth * 0.35;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ minWidth: 480, display: 'block' }}
      >
        {/* グリッド */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const y = padTop + innerHeight * (1 - p);
          return (
            <g key={p}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#ecedef"
                strokeWidth="1"
              />
              <text
                x={padLeft - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#7a8895"
              >
                {formatYenShort(maxValue * p)}
              </text>
            </g>
          );
        })}

        {/* バー */}
        {MONTH_ORDER.map((m, i) => {
          const target = monthlyTargets[m] || 0;
          const actual = monthlyRevenue[m] || 0;
          const targetH = (target / maxValue) * innerHeight;
          const actualH = (actual / maxValue) * innerHeight;
          const groupX = padLeft + i * groupWidth + groupWidth / 2;
          const targetX = groupX - barWidth - 2;
          const actualX = groupX + 2;
          const isCurrent = m === currentMonth;

          return (
            <g key={m}>
              {/* 目標バー (薄い灰) */}
              <rect
                x={targetX}
                y={padTop + innerHeight - targetH}
                width={barWidth}
                height={targetH}
                fill="#c4c8cd"
                rx="2"
              />
              {/* 実績バー (色付き、当月強調) */}
              <rect
                x={actualX}
                y={padTop + innerHeight - actualH}
                width={barWidth}
                height={actualH}
                fill={isCurrent ? '#5e9b76' : '#7eb393'}
                rx="2"
              />
              {/* 月ラベル */}
              <text
                x={groupX}
                y={height - padBottom + 16}
                textAnchor="middle"
                fontSize="11"
                fill={isCurrent ? '#2e7d32' : '#7a8895'}
                fontWeight={isCurrent ? '600' : '400'}
              >
                {m}月
              </text>
            </g>
          );
        })}
      </svg>

      {/* 凡例 */}
      <div
        style={{
          display: 'flex',
          gap: 18,
          justifyContent: 'center',
          marginTop: 4,
          fontSize: 11.5,
          color: '#7a8895',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 12,
              height: 12,
              background: '#c4c8cd',
              display: 'inline-block',
              borderRadius: 2,
            }}
          />
          月別目標
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 12,
              height: 12,
              background: '#7eb393',
              display: 'inline-block',
              borderRadius: 2,
            }}
          />
          月別実績
        </span>
      </div>
    </div>
  );
}
