type Props = {
  value: number; // 達成率 0-100+
  size?: number;
  label?: string;
};

/**
 * 半円ゲージ (SVGで描画)
 * value: 達成率 (0-100+)
 */
export function HalfGauge({ value, size = 220, label }: Props) {
  const width = size;
  const height = size / 2 + 40;
  const cx = width / 2;
  const cy = size / 2 + 10;
  const r = size / 2 - 20;
  const strokeWidth = 18;

  // 半円: 180度 (左 180, 右 0)
  // 値に応じた角度を計算 (0% = 180, 100% = 0)
  const clampedValue = Math.max(0, Math.min(100, value));
  const angleEnd = 180 - (clampedValue * 180) / 100;

  // 角度→座標
  const polar = (angleDeg: number, radius: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy - radius * Math.sin(rad),
    };
  };

  // ベース半円パス (180度→0度、上を通る = 時計回り)
  const baseStart = polar(180, r);
  const baseEnd = polar(0, r);
  const basePath = `M ${baseStart.x} ${baseStart.y} A ${r} ${r} 0 0 1 ${baseEnd.x} ${baseEnd.y}`;

  // 進捗パス
  const progStart = polar(180, r);
  const progEnd = polar(angleEnd, r);
  // 半円ゲージなので大弧は使わない (0-180度の範囲は常に短弧)
  const progPath = `M ${progStart.x} ${progStart.y} A ${r} ${r} 0 0 1 ${progEnd.x} ${progEnd.y}`;

  // 色: 0-33%=赤, 33-66%=黄, 66-100%=緑
  let color = '#c62828';
  if (clampedValue >= 66) color = '#2e7d32';
  else if (clampedValue >= 33) color = '#f57c00';

  return (
    <div style={{ display: 'inline-block', textAlign: 'center' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* ベース半円 (グレー) */}
        <path
          d={basePath}
          fill="none"
          stroke="#ecedef"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* 進捗パス */}
        {clampedValue > 0 && (
          <path
            d={progPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ transition: 'all 0.6s ease' }}
          />
        )}
        {/* 中央テキスト */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize="28"
          fontWeight="700"
          fill="#2c3e50"
        >
          {value.toFixed(1)}%
        </text>
        {label && (
          <text
            x={cx}
            y={cy + 18}
            textAnchor="middle"
            fontSize="11"
            fill="#7a8895"
          >
            {label}
          </text>
        )}
      </svg>
    </div>
  );
}
