// メンバー勤怠状況一覧 (admin専用)
// - 全社員の当月勤怠サマリーを一覧表示
// - 出勤日数 / 標準労働時間 / 総労働時間 / 有休取得日数 / 申請件数
//
// Bug fix 2026-05-29:
//   標準比の計算に有休時間が加算されていなかった。
//   個人カレンダー画面 (実績+有休 - 標準) と一貫させるため、
//   diff = (totalWorkHours + leaveDays * 7h) - standardHours
//   に修正。
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';
import { isHoliday } from '../features/kintai/holidays';

const STANDARD_HOURS_PER_DAY = 7;

type MemberRow = {
  id: string;
  employee_code: string;
  name: string;
  workDays: number;
  totalWorkHours: number;
  leaveDays: number;
  requestCount: number;
};

function getCurrentMonthRange(targetYm: string): { from: string; to: string } {
  // targetYm = "2026-05"
  const [yStr, mStr] = targetYm.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const from = `${yStr}-${mStr.padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${yStr}-${mStr.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

/**
 * 当月の営業日数 × 7h を計算
 * - 土日と祝日を除く平日カウント
 */
function calcStandardHours(targetYm: string): { businessDays: number; standardHours: number } {
  const [yStr, mStr] = targetYm.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

  let businessDays = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${yStr}-${mStr.padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) continue;
    if (isHoliday(dateStr)) continue;
    businessDays += 1;
  }
  return { businessDays, standardHours: businessDays * STANDARD_HOURS_PER_DAY };
}

function currentYm(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function MemberAttendancePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ym, setYm] = useState<string>(currentYm());

  // 月選択肢: 直近12ヶ月
  const monthOptions = useMemo(() => {
    const now = new Date();
    const opts: { value: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      opts.push({ value: v, label: `${d.getFullYear()}年${d.getMonth() + 1}月` });
    }
    return opts;
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      const supabase = getSupabase();
      if (!supabase) {
        if (alive) {
          setError('Supabase未設定');
          setLoading(false);
        }
        return;
      }

      try {
        // 1. アクティブな社員一覧
        const usersRes = await withTimeout(
          supabase
            .from('users')
            .select('id, employee_code, name, status')
            .eq('status', 'active')
            .neq('employee_code', '999')
            .order('employee_code', { ascending: true }),
          10000,
          'fetch users'
        );
        if (usersRes.error) throw usersRes.error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const users = (usersRes.data || []) as any[];

        // 2. 当月の勤怠サマリー(daily_attendance_summaries)
        const { from, to } = getCurrentMonthRange(ym);
        const attRes = await withTimeout(
          supabase
            .from('daily_attendance_summaries')
            .select('user_id, date, actual_work_hours')
            .gte('date', from)
            .lte('date', to),
          15000,
          'fetch daily attendance'
        );
        if (attRes.error) throw attRes.error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attRows = (attRes.data || []) as any[];

        // user_id -> { workDays, totalWorkHours }
        const attendanceMap = new Map<string, { workDays: number; totalWorkHours: number }>();
        for (const r of attRows) {
          const cur = attendanceMap.get(r.user_id) || {
            workDays: 0,
            totalWorkHours: 0,
          };
          const h = Number(r.actual_work_hours || 0);
          if (h > 0) cur.workDays += 1;
          cur.totalWorkHours += h;
          attendanceMap.set(r.user_id, cur);
        }

        // 3. 当月の有休取得 (leave_requests で承認済み・期間が当月にかぶる)
        const leaveRes = await withTimeout(
          supabase
            .from('leave_requests')
            .select('user_id, start_date, end_date, days, status, leave_type')
            .eq('status', 'approved')
            .lte('start_date', to)
            .gte('end_date', from),
          15000,
          'fetch leave requests'
        );

        const leaveMap = new Map<string, number>();
        if (!leaveRes.error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lrs = (leaveRes.data || []) as any[];
          for (const lr of lrs) {
            // 有休だけ集計 (leave_type='paid' or 'annual' どちらでも一旦全件カウント)
            const d = Number(lr.days || 0);
            leaveMap.set(lr.user_id, (leaveMap.get(lr.user_id) || 0) + d);
          }
        }

        // 4. 当月作成された申請件数 (correction_requests + leave_requests)
        const reqCountMap = new Map<string, number>();

        const corrRes = await withTimeout(
          supabase
            .from('correction_requests')
            .select('user_id, created_at')
            .gte('created_at', from + 'T00:00:00')
            .lte('created_at', to + 'T23:59:59'),
          15000,
          'fetch correction requests count'
        );
        if (!corrRes.error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const r of (corrRes.data || []) as any[]) {
            reqCountMap.set(r.user_id, (reqCountMap.get(r.user_id) || 0) + 1);
          }
        }

        const leaveAllRes = await withTimeout(
          supabase
            .from('leave_requests')
            .select('user_id, created_at')
            .gte('created_at', from + 'T00:00:00')
            .lte('created_at', to + 'T23:59:59'),
          15000,
          'fetch leave requests count'
        );
        if (!leaveAllRes.error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const r of (leaveAllRes.data || []) as any[]) {
            reqCountMap.set(r.user_id, (reqCountMap.get(r.user_id) || 0) + 1);
          }
        }

        const rs: MemberRow[] = users.map((u) => ({
          id: u.id,
          employee_code: u.employee_code || '',
          name: u.name || '',
          workDays: attendanceMap.get(u.id)?.workDays ?? 0,
          totalWorkHours: attendanceMap.get(u.id)?.totalWorkHours ?? 0,
          leaveDays: leaveMap.get(u.id) ?? 0,
          requestCount: reqCountMap.get(u.id) ?? 0,
        }));

        if (alive) {
          setRows(rs);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [ym]);

  // 当月の標準労働時間
  const { businessDays, standardHours } = useMemo(() => calcStandardHours(ym), [ym]);

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--ink)' }}>
          メンバー勤怠状況
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '4px 0 0' }}>
          全社員の月次サマリー(出勤日数・労働時間・有休・申請件数)を確認できます。
        </p>
      </header>

      <div className="mem-att__controls">
        <label className="mem-att__label">
          対象月
          <select
            className="mem-att__select"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mem-att__standard">
          標準: <strong>{businessDays}日 / {standardHours}h</strong>
          <span className="mem-att__standard-note">(平日 × {STANDARD_HOURS_PER_DAY}h)</span>
        </div>
        <div className="mem-att__count">
          {loading ? '読込中…' : `${rows.length} 名`}
        </div>
      </div>

      {error && <div className="mem-att__error">エラー: {error}</div>}

      <div className="mem-att__table-wrap">
        <table className="mem-att__table">
          <thead>
            <tr>
              <th>社員番号</th>
              <th>名前</th>
              <th style={{ textAlign: 'right' }}>出勤日数</th>
              <th style={{ textAlign: 'right' }}>労働時間</th>
              <th style={{ textAlign: 'right' }}>標準比</th>
              <th style={{ textAlign: 'right' }}>有休取得</th>
              <th style={{ textAlign: 'right' }}>申請件数</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="mem-att__td-mute">読込中…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="mem-att__td-mute">対象の社員がいません</td>
              </tr>
            ) : (
              rows.map((r) => {
                // Bug fix 2026-05-29:
                //   標準比は「実働 + 有休時間」と「標準」の差で計算する。
                //   個人カレンダーの「実績+承認休暇」表示と一貫させる。
                const leaveHours = r.leaveDays * STANDARD_HOURS_PER_DAY;
                const actualPlusLeave = r.totalWorkHours + leaveHours;
                const diff = actualPlusLeave - standardHours;
                const isOver = diff > 0.05;
                const isUnder = diff < -0.05;
                return (
                  <tr key={r.id}>
                    <td className="mem-att__td-code">{r.employee_code}</td>
                    <td>{r.name}</td>
                    <td style={{ textAlign: 'right' }}>{r.workDays}日</td>
                    <td style={{ textAlign: 'right' }}>{r.totalWorkHours.toFixed(1)}h</td>
                    <td
                      style={{ textAlign: 'right' }}
                      className={
                        isOver
                          ? 'mem-att__td-over'
                          : isUnder
                          ? 'mem-att__td-under'
                          : ''
                      }
                    >
                      {actualPlusLeave === 0
                        ? '—'
                        : `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}h`}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {r.leaveDays > 0 ? `${r.leaveDays}日` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {r.requestCount > 0 ? `${r.requestCount}件` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="mem-att__btn"
                        onClick={() => navigate(`/org/employees/${r.id}`)}
                      >
                        詳細 →
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .mem-att__controls {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 12px;
        }
        .mem-att__label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--ink-mute);
        }
        .mem-att__select {
          padding: 6px 10px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font-size: 13px;
          background: #fff;
          color: var(--ink);
        }
        .mem-att__standard {
          font-size: 13px;
          color: var(--ink-mute);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .mem-att__standard strong {
          color: var(--ink);
          font-weight: 600;
        }
        .mem-att__standard-note {
          font-size: 11px;
          color: var(--ink-soft);
        }
        .mem-att__count {
          margin-left: auto;
          font-size: 12px;
          color: var(--ink-mute);
        }
        .mem-att__error {
          background: var(--danger-bg, #F4E1DA);
          color: var(--danger, #B5523C);
          padding: 10px 14px;
          border-radius: 6px;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .mem-att__table-wrap {
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
        }
        .mem-att__table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .mem-att__table thead th {
          background: #F4F4F4;
          color: var(--ink-mute);
          font-weight: 500;
          padding: 10px 12px;
          text-align: left;
          font-size: 12px;
          border-bottom: 1px solid var(--line);
        }
        .mem-att__table tbody td {
          padding: 10px 12px;
          border-bottom: 1px solid #F0F0F0;
          color: var(--ink);
        }
        .mem-att__table tbody tr:last-child td {
          border-bottom: none;
        }
        .mem-att__table tbody tr:hover {
          background: #FAFAFA;
        }
        .mem-att__td-code {
          font-family: var(--font-mono);
          color: var(--ink-mute);
          font-size: 12px;
        }
        .mem-att__td-over {
          color: var(--primary-dark);
          font-weight: 500;
        }
        .mem-att__td-under {
          color: var(--danger, #B5523C);
          font-weight: 500;
        }
        .mem-att__td-mute {
          padding: 32px !important;
          text-align: center !important;
          color: var(--ink-soft) !important;
        }
        .mem-att__btn {
          padding: 4px 10px;
          font-size: 11.5px;
          background: #fff;
          color: var(--primary-dark);
          border: 1px solid var(--line);
          border-radius: 4px;
          cursor: pointer;
        }
        .mem-att__btn:hover {
          background: var(--primary-pale);
          border-color: var(--primary);
        }
      `}</style>
    </div>
  );
}

export default MemberAttendancePage;
