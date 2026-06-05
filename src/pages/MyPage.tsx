import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppUser } from '../lib/useAppUser';
import { useEmployeeDetail } from '../features/employees/useEmployeeDetail';
import {
  fetchDealsForEmployee,
  fetchTimeAggregateForEmployee,
  fetchExpensesForEmployee,
  fetchAttendanceForEmployee,
  fetchLeaveBalanceForEmployee,
} from '../features/employees/useEmployeeDetail';
import type {
  EmployeeDeal,
  EmployeeTimeAggregate,
  EmployeeExpense,
  EmployeeAttendanceSummary,
  EmployeeLeaveBalance,
} from '../features/employees/useEmployeeDetail';
import { GoogleConnectionCard } from '../features/calendar/GoogleConnectionCard';
import './MyPage.css';

// ======== カード ID 定義 ========
type CardId =
  | 'profile'
  | 'attendance'
  | 'time'
  | 'leave'
  | 'requests'
  | 'expenses'
  | 'deals'
  | 'tasks'
  | 'gcal';

type CardDef = {
  id: CardId;
  label: string;
  defaultVisible: boolean;
};

const ALL_CARDS: CardDef[] = [
  { id: 'profile', label: 'プロフィール', defaultVisible: true },
  { id: 'attendance', label: '勤怠サマリー', defaultVisible: true },
  { id: 'time', label: '工数サマリー', defaultVisible: true },
  { id: 'leave', label: '有休情報', defaultVisible: true },
  { id: 'requests', label: '申請履歴', defaultVisible: true },
  { id: 'expenses', label: '経費履歴', defaultVisible: true },
  { id: 'deals', label: '担当案件', defaultVisible: true },
  { id: 'tasks', label: '自分のタスク', defaultVisible: false },
  { id: 'gcal', label: 'Googleカレンダー連携', defaultVisible: true },
];

const ORDER_KEY = 'officehub:mypage:order';
const HIDDEN_KEY = 'officehub:mypage:hidden';

function loadOrder(): CardId[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return ALL_CARDS.map((c) => c.id);
    const parsed = JSON.parse(raw) as CardId[];
    // 整合性チェック: ALL_CARDS にあるカードが全部含まれてるように
    const known = new Set(ALL_CARDS.map((c) => c.id));
    const filtered = parsed.filter((id) => known.has(id));
    const missing = ALL_CARDS.map((c) => c.id).filter(
      (id) => !filtered.includes(id)
    );
    return [...filtered, ...missing];
  } catch {
    return ALL_CARDS.map((c) => c.id);
  }
}

function saveOrder(order: CardId[]) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    // ignore
  }
}

function loadHidden(): Set<CardId> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) {
      return new Set(
        ALL_CARDS.filter((c) => !c.defaultVisible).map((c) => c.id)
      );
    }
    return new Set(JSON.parse(raw) as CardId[]);
  } catch {
    return new Set();
  }
}

function saveHidden(hidden: Set<CardId>) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(hidden)));
  } catch {
    // ignore
  }
}

// ======== フォーマッタ ========
function formatYen(n: number | null | undefined): string {
  return '¥' + Math.round(Number(n || 0)).toLocaleString('ja-JP');
}
function formatHours(n: number): string {
  return n.toFixed(1) + 'h';
}
function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  draft: '下書き',
  submitted: '申請中',
  approved: '承認',
  rejected: '差戻し',
  paid: '精算済',
};
const DEAL_STATUS_LABELS: Record<string, string> = {
  prospect: '見込',
  in_progress: '商談中',
  won: '成約',
  in_support: '支援中',
  terminated: '終了',
  lost: '失注',
};

// ======== メインコンポーネント ========
export function MyPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const navigate = useNavigate();

  const { employee } = useEmployeeDetail(appUser?.id || null);

  const [order, setOrder] = useState<CardId[]>(() => loadOrder());
  const [hidden, setHidden] = useState<Set<CardId>>(() => loadHidden());
  const [customizing, setCustomizing] = useState<boolean>(false);

  // 派生データ
  const [deals, setDeals] = useState<EmployeeDeal[]>([]);
  const [timeAgg, setTimeAgg] = useState<EmployeeTimeAggregate | null>(null);
  const [expenses, setExpenses] = useState<EmployeeExpense[]>([]);
  const [attendance, setAttendance] = useState<EmployeeAttendanceSummary[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<EmployeeLeaveBalance | null>(
    null
  );
  const [derivedLoading, setDerivedLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!appUser?.id) return;
      setDerivedLoading(true);
      const [d, t, e, a, l] = await Promise.all([
        fetchDealsForEmployee(appUser.id),
        fetchTimeAggregateForEmployee(appUser.id),
        fetchExpensesForEmployee(appUser.id),
        fetchAttendanceForEmployee(appUser.id),
        fetchLeaveBalanceForEmployee(appUser.id),
      ]);
      if (!alive) return;
      setDeals(d);
      setTimeAgg(t);
      setExpenses(e);
      setAttendance(a);
      setLeaveBalance(l);
      setDerivedLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [appUser?.id]);

  const visibleOrder = useMemo(
    () => order.filter((id) => !hidden.has(id)),
    [order, hidden]
  );

  // === ドラッグ&ドロップ ===
  const [dragId, setDragId] = useState<CardId | null>(null);
  const onDragStart = (id: CardId) => setDragId(id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (targetId: CardId) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const next = [...order];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setOrder(next);
    saveOrder(next);
    setDragId(null);
  };

  const toggleHidden = (id: CardId) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
    saveHidden(next);
  };

  const resetLayout = () => {
    if (!window.confirm('カードの並びと表示設定を初期状態に戻しますか?')) return;
    const defaultOrder = ALL_CARDS.map((c) => c.id);
    const defaultHidden = new Set(
      ALL_CARDS.filter((c) => !c.defaultVisible).map((c) => c.id)
    );
    setOrder(defaultOrder);
    setHidden(defaultHidden);
    saveOrder(defaultOrder);
    saveHidden(defaultHidden);
  };

  if (userLoading) {
    return <div className="mypage__loading">読み込み中...</div>;
  }
  if (!appUser) {
    return (
      <div className="mypage__error">
        <p>ユーザー情報が取得できませんでした。</p>
      </div>
    );
  }

  return (
    <div className="mypage">
      <header className="mypage__header">
        <div>
          <h1 className="mypage__title">マイページ</h1>
          <p className="mypage__subtitle">
            {appUser.name}（{appUser.employee_code}）
          </p>
        </div>
        <div className="mypage__header-actions">
          <button
            type="button"
            className={
              'mypage__btn' +
              (customizing ? ' mypage__btn--primary' : ' mypage__btn--secondary')
            }
            onClick={() => setCustomizing((v) => !v)}
          >
            {customizing ? 'カスタマイズ完了' : 'カスタマイズ'}
          </button>
        </div>
      </header>

      {customizing && (
        <div className="mypage__customize-panel">
          <div className="mypage__customize-row">
            <strong>表示するカード:</strong>
            <button
              type="button"
              className="mypage__btn mypage__btn--small mypage__btn--secondary"
              onClick={resetLayout}
              style={{ marginLeft: 'auto' }}
            >
              初期配置に戻す
            </button>
          </div>
          <div className="mypage__customize-cards">
            {ALL_CARDS.map((c) => (
              <label key={c.id} className="mypage__customize-card">
                <input
                  type="checkbox"
                  checked={!hidden.has(c.id)}
                  onChange={() => toggleHidden(c.id)}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
          <p className="mypage__customize-hint">
            ※ カードはドラッグで並び替えできます
          </p>
        </div>
      )}

      <div className="mypage__grid">
        {visibleOrder.map((id) => {
          const def = ALL_CARDS.find((c) => c.id === id);
          if (!def) return null;
          return (
            <div
              key={id}
              className={
                'mypage__card' +
                (dragId === id ? ' mypage__card--dragging' : '')
              }
              draggable
              onDragStart={() => onDragStart(id)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(id)}
              onDragEnd={() => setDragId(null)}
            >
              <div className="mypage__card-header">
                <h2 className="mypage__card-title">{def.label}</h2>
                {customizing && (
                  <span
                    className="mypage__drag-handle"
                    title="ドラッグで並び替え"
                    aria-hidden
                  >
                    ⋮⋮
                  </span>
                )}
              </div>
              <div className="mypage__card-body">
                {renderCardBody(id, {
                  appUser,
                  employee,
                  deals,
                  timeAgg,
                  expenses,
                  attendance,
                  leaveBalance,
                  derivedLoading,
                  navigate,
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ======== カード本体レンダリング ========
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderCardBody(id: CardId, ctx: any) {
  switch (id) {
    case 'profile':
      return <ProfileCard ctx={ctx} />;
    case 'attendance':
      return <AttendanceCard ctx={ctx} />;
    case 'time':
      return <TimeCard ctx={ctx} />;
    case 'leave':
      return <LeaveCard ctx={ctx} />;
    case 'requests':
      return <RequestsCard ctx={ctx} />;
    case 'expenses':
      return <ExpensesCard ctx={ctx} />;
    case 'deals':
      return <DealsCard ctx={ctx} />;
    case 'tasks':
      return <TasksCard ctx={ctx} />;
    case 'gcal':
      return <GcalCard />;
    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProfileCard({ ctx }: { ctx: any }) {
  const { appUser, employee } = ctx;
  return (
    <dl className="mypage__dl">
      <dt>氏名</dt>
      <dd>{appUser.name}</dd>
      <dt>社員番号</dt>
      <dd>{appUser.employee_code}</dd>
      <dt>メール</dt>
      <dd>{employee?.email || '—'}</dd>
      <dt>雇用形態</dt>
      <dd>{employee?.employment_type || '—'}</dd>
      <dt>入社日</dt>
      <dd>{formatDate(employee?.joined_at)}</dd>
    </dl>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AttendanceCard({ ctx }: { ctx: any }) {
  const { attendance, derivedLoading, navigate } = ctx;
  if (derivedLoading) return <p className="mypage__mute">読み込み中...</p>;
  if (attendance.length === 0)
    return <p className="mypage__mute">勤怠データはありません</p>;
  const latest = attendance[attendance.length - 1];
  return (
    <>
      <div className="mypage__stat">
        <span className="mypage__stat-label">直近月 ({latest.yearMonth})</span>
        <span className="mypage__stat-value">
          {latest.workDays}日 / {formatHours(latest.totalWorkHours)}
        </span>
      </div>
      <table className="mypage__mini-table">
        <thead>
          <tr>
            <th>月</th>
            <th>出勤日</th>
            <th>実働</th>
          </tr>
        </thead>
        <tbody>
          {attendance.map((a: EmployeeAttendanceSummary) => (
            <tr key={a.yearMonth}>
              <td>{a.yearMonth}</td>
              <td>{a.workDays}日</td>
              <td>{formatHours(a.totalWorkHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="mypage__btn mypage__btn--link"
        onClick={() => navigate('/work/kintai')}
      >
        勤怠管理を開く →
      </button>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TimeCard({ ctx }: { ctx: any }) {
  const { timeAgg, derivedLoading, navigate } = ctx;
  if (derivedLoading) return <p className="mypage__mute">読み込み中...</p>;
  if (!timeAgg || timeAgg.totalHours === 0)
    return <p className="mypage__mute">工数の入力はまだありません</p>;
  const recentMonths = timeAgg.byMonth.slice(-3);
  return (
    <>
      <div className="mypage__stat">
        <span className="mypage__stat-label">直近12ヶ月合計</span>
        <span className="mypage__stat-value">
          {formatHours(timeAgg.totalHours)}
        </span>
      </div>
      <table className="mypage__mini-table">
        <thead>
          <tr>
            <th>月</th>
            <th>工数</th>
          </tr>
        </thead>
        <tbody>
          {recentMonths.map((m: { yearMonth: string; hours: number }) => (
            <tr key={m.yearMonth}>
              <td>{m.yearMonth}</td>
              <td>{formatHours(m.hours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="mypage__btn mypage__btn--link"
        onClick={() => navigate('/work/kousu')}
      >
        工数管理を開く →
      </button>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LeaveCard({ ctx }: { ctx: any }) {
  const { leaveBalance, derivedLoading } = ctx;
  if (derivedLoading) return <p className="mypage__mute">読み込み中...</p>;
  if (!leaveBalance) return <p className="mypage__mute">有休データはありません</p>;
  return (
    <>
      <div className="mypage__stat">
        <span className="mypage__stat-label">
          {leaveBalance.fiscalYear}年度 合計
        </span>
        <span className="mypage__stat-value">
          {leaveBalance.totalAvailable.toFixed(1)}日
        </span>
      </div>
      <dl className="mypage__dl">
        <dt>付与</dt>
        <dd>{leaveBalance.grantedDays}日</dd>
        <dt>繰越</dt>
        <dd>{leaveBalance.carryoverDays}日</dd>
        <dt>調整</dt>
        <dd>{leaveBalance.adjustedDays}日</dd>
      </dl>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RequestsCard({ ctx }: { ctx: any }) {
  const { navigate } = ctx;
  return (
    <>
      <p className="mypage__mute">
        申請履歴はまもなく実装予定です。
      </p>
      <button
        type="button"
        className="mypage__btn mypage__btn--link"
        onClick={() => navigate('/requests')}
      >
        申請・承認を開く →
      </button>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExpensesCard({ ctx }: { ctx: any }) {
  const { expenses, derivedLoading, navigate } = ctx;
  if (derivedLoading) return <p className="mypage__mute">読み込み中...</p>;
  if (expenses.length === 0)
    return (
      <>
        <p className="mypage__mute">経費申請はありません</p>
        <button
          type="button"
          className="mypage__btn mypage__btn--link"
          onClick={() => navigate('/billing/expenses')}
        >
          経費精算を開く →
        </button>
      </>
    );
  const total = expenses.reduce(
    (a: number, e: EmployeeExpense) => a + Number(e.amount || 0),
    0
  );
  const recent = expenses.slice(0, 5);
  return (
    <>
      <div className="mypage__stat">
        <span className="mypage__stat-label">直近12ヶ月合計</span>
        <span className="mypage__stat-value">{formatYen(total)}</span>
      </div>
      <table className="mypage__mini-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>状態</th>
            <th>金額</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((e: EmployeeExpense) => (
            <tr key={e.id}>
              <td>{formatDate(e.date)}</td>
              <td>{EXPENSE_STATUS_LABELS[e.status] || e.status}</td>
              <td>{formatYen(e.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="mypage__btn mypage__btn--link"
        onClick={() => navigate('/billing/expenses')}
      >
        経費精算を開く →
      </button>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DealsCard({ ctx }: { ctx: any }) {
  const { deals, derivedLoading, navigate } = ctx;
  if (derivedLoading) return <p className="mypage__mute">読み込み中...</p>;
  // 実績まとめ系を除外して表示 (Phase C で対応する設計問題のワークアラウンド)
  const filteredDeals = deals.filter(
    (d: EmployeeDeal) =>
      d.client &&
      !(d.deal_name || '').includes('実績まとめ')
  );
  if (filteredDeals.length === 0)
    return <p className="mypage__mute">担当案件はありません</p>;
  const recent = filteredDeals.slice(0, 5);
  return (
    <>
      <div className="mypage__stat">
        <span className="mypage__stat-label">担当中</span>
        <span className="mypage__stat-value">{filteredDeals.length}件</span>
      </div>
      <table className="mypage__mini-table">
        <thead>
          <tr>
            <th>クライアント / 案件</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((d: EmployeeDeal) => {
            const clientObj = Array.isArray(d.client) ? d.client[0] : d.client;
            const clientName = clientObj?.name || '(クライアント不明)';
            const clientId = clientObj?.id;
            return (
              <tr
                key={d.id}
                className="mypage__row-link"
                onClick={() => {
                  if (clientId) navigate(`/sales/clients/${clientId}`);
                }}
              >
                <td>
                  <div className="mypage__deal-cell">
                    <span className="mypage__deal-client">{clientName}</span>
                    <span className="mypage__deal-name">{d.deal_name}</span>
                  </div>
                </td>
                <td>{DEAL_STATUS_LABELS[d.status] || d.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        className="mypage__btn mypage__btn--link"
        onClick={() => navigate('/sales/deals')}
      >
        案件一覧を開く →
      </button>
      <style>{`
        .mypage__deal-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .mypage__deal-client {
          font-size: 13px;
          font-weight: 500;
          color: var(--ink);
          line-height: 1.3;
        }
        .mypage__deal-name {
          font-size: 11.5px;
          color: var(--ink-mute);
          line-height: 1.3;
        }
      `}</style>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TasksCard({ ctx }: { ctx: any }) {
  const { navigate } = ctx;
  return (
    <>
      <p className="mypage__mute">
        自分のタスク表示はまもなく実装予定です。
      </p>
      <button
        type="button"
        className="mypage__btn mypage__btn--link"
        onClick={() => navigate('/sales/tasks')}
      >
        タスク管理を開く →
      </button>
    </>
  );
}

function GcalCard() {
  return <GoogleConnectionCard />;
}

export default MyPage;
