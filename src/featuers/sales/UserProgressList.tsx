import type { UserRevenue } from './useUserRevenues';

type Props = {
  userRevenues: Map<string, UserRevenue>;
  userFiscalTargets: Map<string, number>;
};

function formatYen(n: number): string {
  return `¥${Math.round(n).toLocaleString()}`;
}

/**
 * 個人別目標達成率カード
 * 対象: 目標が設定されている人 + 実績がある人 + display_order がセットされてる人
 * ソート: display_order 昇順 (未設定は末尾)
 */
export function UserProgressList({ userRevenues, userFiscalTargets }: Props) {
  // 対象ユーザー: 目標が設定されてる OR 実績がある人 OR display_order セット済みの人
  // (display_order セット済みは useUserRevenues 側で初期化済みなので userRevenues に乗ってる)
  const allUserIds = new Set<string>();
  for (const id of userFiscalTargets.keys()) allUserIds.add(id);
  for (const id of userRevenues.keys()) allUserIds.add(id);

  // 各ユーザーの行を作成
  type Row = {
    user_id: string;
    user_name: string;
    display_order: number | null;
    target: number;
    actual: number;
    progress: number;
  };
  const rows: Row[] = [];
  for (const id of allUserIds) {
    const rev = userRevenues.get(id);
    const target = userFiscalTargets.get(id) || 0;
    const actual = rev?.fiscal_revenue || 0;
    const name = rev?.user_name || '(名前不明)';
    const progress = target > 0 ? (actual / target) * 100 : 0;
    rows.push({
      user_id: id,
      user_name: name,
      display_order: rev?.display_order ?? null,
      target,
      actual,
      progress,
    });
  }

  // ソート: display_order 昇順 (null は末尾)
  rows.sort((a, b) => {
    if (a.display_order === null && b.display_order === null) return 0;
    if (a.display_order === null) return 1;
    if (b.display_order === null) return -1;
    return a.display_order - b.display_order;
  });

  if (rows.length === 0) {
    return (
      <p style={{ color: '#7a8895', fontSize: 13, padding: 16 }}>
        個人目標が設定されていないか、対象の売上実績がありません。
      </p>
    );
  }

  return (
    <div className="user-progress-list">
      {rows.map((r) => (
        <div key={r.user_id} className="user-progress-row">
          <div className="user-progress-row__name">{r.user_name}</div>
          <div className="user-progress-row__bar-wrap">
            <div className="user-progress-row__bar">
              <div
                className="user-progress-row__bar-fill"
                style={{
                  width: `${Math.min(100, r.progress)}%`,
                  background:
                    r.progress >= 100
                      ? '#2e7d32'
                      : r.progress >= 66
                      ? '#5e9b76'
                      : r.progress >= 33
                      ? '#f57c00'
                      : '#c62828',
                }}
              />
            </div>
            <div className="user-progress-row__nums">
              <span className="user-progress-row__actual">
                {formatYen(r.actual)}
              </span>
              <span className="user-progress-row__divider">/</span>
              <span className="user-progress-row__target">
                {r.target > 0 ? formatYen(r.target) : '目標未設定'}
              </span>
              {r.target > 0 && (
                <span
                  className={
                    'user-progress-row__pct ' +
                    (r.progress >= 100
                      ? 'user-progress-row__pct--ok'
                      : r.progress >= 66
                      ? 'user-progress-row__pct--mid'
                      : 'user-progress-row__pct--low')
                  }
                >
                  {r.progress.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
