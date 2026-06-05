import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import {
  useEmployeeSalaryHistory,
  deleteSalaryRecord,
} from '../features/employees/useEmployeeSalary';
import { EmployeeEditModal } from '../features/employees/EmployeeEditModal';
import { SalaryEditModal } from '../features/employees/SalaryEditModal';
import {
  EMPLOYEE_STATUS_LABELS,
  USER_ROLE_LABELS,
} from '../features/employees/types';
import type { SalaryRecord } from '../features/employees/types';
import './EmployeeDetailPage.css';

/**
 * Phase C-3: projects 廃止に伴う改修
 *   - fetchProjectsForEmployee 削除、EmployeeProject 型削除
 *   - 「プロジェクト」セクション完全削除
 *   - 「工数」セクション: 「プロジェクト別」→「クライアント別」(社内は (社内) 表示)
 *   - サマリーカード「プロジェクト N件」削除 (5枚→4枚)
 *   - PROJECT_STATUS_LABELS / PROJECT_ROLE_LABELS 削除
 */

type SalaryEditTarget = SalaryRecord | null | undefined;

const DEAL_CATEGORY_LABELS: Record<string, string> = {
  consulting: 'コンサル',
  media: '媒体',
  rpo: 'RPO',
  creative: 'クリエイティブ',
  maintenance: '保守',
  other: 'その他',
};
const DEAL_STATUS_LABELS: Record<string, string> = {
  prospect: '見込',
  in_progress: '商談中',
  won: '成約',
  in_support: '支援中',
  terminated: '終了',
  lost: '失注',
};
const EXPENSE_STATUS_LABELS: Record<string, string> = {
  draft: '下書き',
  submitted: '申請中',
  approved: '承認',
  rejected: '差戻し',
  paid: '精算済',
};

function formatYen(n: number | null | undefined): string {
  return '¥' + Math.round(Number(n || 0)).toLocaleString('ja-JP');
}
function formatHours(n: number): string {
  return n.toFixed(1) + 'h';
}
function formatDate(d: string | null): string {
  if (!d) return '—';
  return d.slice(0, 10);
}
function statusLabel(s: string): string {
  if (s === 'inactive') return EMPLOYEE_STATUS_LABELS.inactive;
  if (s === 'active') return EMPLOYEE_STATUS_LABELS.active;
  return s || '—';
}
function roleLabel(r: string): string {
  if (r === 'admin') return USER_ROLE_LABELS.admin;
  if (r === 'project_manager') return USER_ROLE_LABELS.project_manager;
  if (r === 'member') return USER_ROLE_LABELS.member;
  return r || '—';
}
function getClientName(
  c:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
    | undefined
): string {
  if (!c) return '—';
  if (Array.isArray(c)) return c[0]?.name || '—';
  return c.name || '—';
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { appUser } = useAppUser();
  const isAdmin = appUser?.role === 'admin';

  const { employee, loading, error, reload } = useEmployeeDetail(id || null);
  const {
    records: salaryRecords,
    loading: salaryLoading,
    reload: reloadSalary,
  } = useEmployeeSalaryHistory(employee?.auth_user_id || null);

  // 派生データ (Phase C-3: projects 削除に伴い5項目に)
  const [deals, setDeals] = useState<EmployeeDeal[]>([]);
  const [timeAgg, setTimeAgg] = useState<EmployeeTimeAggregate | null>(null);
  const [expenses, setExpenses] = useState<EmployeeExpense[]>([]);
  const [attendance, setAttendance] = useState<EmployeeAttendanceSummary[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<EmployeeLeaveBalance | null>(
    null
  );
  const [derivedLoading, setDerivedLoading] = useState<boolean>(true);

  const [editingBasic, setEditingBasic] = useState<boolean>(false);
  const [editingSalary, setEditingSalary] =
    useState<SalaryEditTarget>(undefined);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!employee?.id) return;
      setDerivedLoading(true);
      const [d, t, e, a, l] = await Promise.all([
        fetchDealsForEmployee(employee.id),
        fetchTimeAggregateForEmployee(employee.id),
        fetchExpensesForEmployee(employee.id),
        fetchAttendanceForEmployee(employee.id),
        fetchLeaveBalanceForEmployee(employee.id),
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
  }, [employee?.id]);

  function handleSavedBasic() {
    setEditingBasic(false);
    reload();
  }
  function handleSavedSalary() {
    setEditingSalary(undefined);
    reloadSalary();
  }

  async function handleDeleteSalary(record: SalaryRecord) {
    if (
      !window.confirm(
        `${record.effective_from}〜${
          record.effective_to || '現在'
        } の給与情報を削除しますか?`
      )
    ) {
      return;
    }
    const res = await deleteSalaryRecord(record.id);
    if ('error' in res) {
      alert('削除エラー: ' + res.error);
      return;
    }
    reloadSalary();
  }

  if (loading) {
    return <div className="emp-detail__loading">読み込み中...</div>;
  }
  if (error || !employee) {
    return (
      <div className="emp-detail__error">
        <p>社員が見つかりません</p>
        <button
          type="button"
          className="emp-detail__back-btn"
          onClick={() => navigate('/org/employees')}
        >
          ← 社員マスタ一覧に戻る
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="emp-detail__error">
        <p>このページはadminのみ閲覧可能です</p>
        <button
          type="button"
          className="emp-detail__back-btn"
          onClick={() => navigate('/')}
        >
          ← ホームへ
        </button>
      </div>
    );
  }

  const totalExpense = expenses.reduce(
    (acc, e) => acc + Number(e.amount || 0),
    0
  );
  const unpaidExpenses = expenses.filter(
    (e) => e.status !== 'paid' && e.status !== 'rejected'
  );

  return (
    <div className="emp-detail">
      <header className="emp-detail__header">
        <button
          type="button"
          className="emp-detail__back"
          onClick={() => navigate('/org/employees')}
        >
          ← 社員マスタ一覧
        </button>
        <div className="emp-detail__title-row">
          <div>
            <h1 className="emp-detail__title">
              {employee.name}
              <span className="emp-detail__code">
                ({employee.employee_code})
              </span>
            </h1>
            <p className="emp-detail__email">{employee.email}</p>
          </div>
          <div className="emp-detail__actions">
            {employee.status === 'inactive' && (
              <span className="emp-detail__badge emp-detail__badge--inactive">
                退職
              </span>
            )}
            {employee.role === 'admin' && (
              <span className="emp-detail__badge emp-detail__badge--admin">
                admin
              </span>
            )}
            {employee.role === 'project_manager' && (
              <span className="emp-detail__badge emp-detail__badge--pm">
                PM
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ===== サマリーカード (Phase C-3: 5枚→4枚、プロジェクトカード削除) ===== */}
      <div className="emp-detail__summary">
        <div className="emp-detail__summary-card">
          <div className="emp-detail__summary-label">担当案件</div>
          <div className="emp-detail__summary-value">{deals.length}件</div>
        </div>
        <div className="emp-detail__summary-card">
          <div className="emp-detail__summary-label">工数(直近12ヶ月)</div>
          <div className="emp-detail__summary-value">
            {formatHours(timeAgg?.totalHours || 0)}
          </div>
          <div className="emp-detail__summary-sub">
            クライアント {timeAgg?.byClient.length || 0}社
          </div>
        </div>
        <div className="emp-detail__summary-card">
          <div className="emp-detail__summary-label">経費(直近12ヶ月)</div>
          <div className="emp-detail__summary-value">
            {formatYen(totalExpense)}
          </div>
          <div className="emp-detail__summary-sub">
            未精算 {unpaidExpenses.length}件
          </div>
        </div>
        <div className="emp-detail__summary-card">
          <div className="emp-detail__summary-label">有休 (今期付与)</div>
          <div className="emp-detail__summary-value">
            {leaveBalance
              ? `${leaveBalance.totalAvailable.toFixed(1)}日`
              : '—'}
          </div>
          <div className="emp-detail__summary-sub">
            {leaveBalance
              ? `${leaveBalance.fiscalYear}年度`
              : '未登録'}
          </div>
        </div>
      </div>

      {/* ===== 基本情報 ===== */}
      <section className="emp-detail__card">
        <div className="emp-detail__section-header">
          <h2 className="emp-detail__section-title">基本情報</h2>
          <button
            type="button"
            className="emp-detail__btn emp-detail__btn--secondary"
            onClick={() => setEditingBasic(true)}
          >
            編集
          </button>
        </div>
        <dl className="emp-detail__dl">
          <dt>社員番号</dt>
          <dd>{employee.employee_code}</dd>

          <dt>氏名</dt>
          <dd>{employee.name}</dd>

          <dt>メール</dt>
          <dd>{employee.email}</dd>

          <dt>権限</dt>
          <dd>{roleLabel(employee.role)}</dd>

          <dt>雇用形態</dt>
          <dd>{employee.employment_type || '—'}</dd>

          <dt>所定労働時間</dt>
          <dd>
            {employee.standard_work_hours
              ? `${employee.standard_work_hours} 時間/日`
              : '—'}
          </dd>

          <dt>入社日</dt>
          <dd>{formatDate(employee.joined_at)}</dd>

          <dt>在籍ステータス</dt>
          <dd>{statusLabel(employee.status)}</dd>

          {employee.status === 'inactive' && (
            <>
              <dt>退職日</dt>
              <dd>{formatDate(employee.resigned_at)}</dd>
            </>
          )}

          <dt>勤怠管理</dt>
          <dd>
            {employee.has_attendance_management ? (
              <span className="emp-detail__check">✓ 有効</span>
            ) : (
              <span className="emp-detail__mute">無効</span>
            )}
          </dd>

          <dt>有休管理</dt>
          <dd>
            {employee.has_leave_management ? (
              <span className="emp-detail__check">✓ 有効</span>
            ) : (
              <span className="emp-detail__mute">無効</span>
            )}
          </dd>
        </dl>
      </section>

      {/* ===== 給与情報 (既存) ===== */}
      <section className="emp-detail__card">
        <div className="emp-detail__section-header">
          <h2 className="emp-detail__section-title">給与情報(履歴)</h2>
          <button
            type="button"
            className="emp-detail__btn emp-detail__btn--primary"
            onClick={() => setEditingSalary(null)}
          >
            ＋ 新規追加
          </button>
        </div>
        {salaryLoading ? (
          <p className="emp-detail__mute">読み込み中...</p>
        ) : salaryRecords.length === 0 ? (
          <p className="emp-detail__empty">
            給与情報がまだ登録されていません。「＋ 新規追加」から登録してください。
          </p>
        ) : (
          <div className="emp-detail__salary-list">
            {salaryRecords.map((r) => {
              const isCurrent = r.effective_to === null;
              return (
                <div
                  key={r.id}
                  className={
                    'emp-detail__salary-row' +
                    (isCurrent ? ' emp-detail__salary-row--current' : '')
                  }
                >
                  <div className="emp-detail__salary-period">
                    <div className="emp-detail__salary-period-text">
                      {r.effective_from} 〜 {r.effective_to || '現在'}
                    </div>
                    {isCurrent && (
                      <span className="emp-detail__salary-current-badge">
                        現行
                      </span>
                    )}
                  </div>
                  <div className="emp-detail__salary-amounts">
                    <div className="emp-detail__salary-amount">
                      <span className="emp-detail__salary-label">基本給</span>
                      <span className="emp-detail__salary-value">
                        {r.base_salary > 0 ? formatYen(r.base_salary) : '—'}
                      </span>
                    </div>
                    <div className="emp-detail__salary-amount">
                      <span className="emp-detail__salary-label">時給</span>
                      <span className="emp-detail__salary-value">
                        {r.hourly_wage > 0 ? formatYen(r.hourly_wage) : '—'}
                      </span>
                    </div>
                    <div className="emp-detail__salary-amount">
                      <span className="emp-detail__salary-label">残業割増</span>
                      <span className="emp-detail__salary-value">
                        {r.overtime_rate}x
                      </span>
                    </div>
                  </div>
                  {r.fixed_allowances.length > 0 && (
                    <div className="emp-detail__salary-allowances">
                      <span className="emp-detail__salary-label">手当</span>
                      <div className="emp-detail__salary-allowance-list">
                        {r.fixed_allowances.map((a, i) => (
                          <span
                            key={i}
                            className="emp-detail__salary-allowance-tag"
                          >
                            {a.name}: {formatYen(a.amount)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.memo && (
                    <div className="emp-detail__salary-memo">{r.memo}</div>
                  )}
                  <div className="emp-detail__salary-actions">
                    <button
                      type="button"
                      className="emp-detail__btn emp-detail__btn--small emp-detail__btn--secondary"
                      onClick={() => setEditingSalary(r)}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className="emp-detail__btn emp-detail__btn--small emp-detail__btn--danger"
                      onClick={() => handleDeleteSalary(r)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== 担当案件 ===== */}
      <section className="emp-detail__card">
        <h2 className="emp-detail__section-title">担当案件 ({deals.length}件)</h2>
        {derivedLoading ? (
          <p className="emp-detail__mute">読み込み中...</p>
        ) : deals.length === 0 ? (
          <p className="emp-detail__mute">担当案件はありません</p>
        ) : (
          <table className="emp-detail__table">
            <thead>
              <tr>
                <th>クライアント</th>
                <th>案件名</th>
                <th>領域</th>
                <th>役割</th>
                <th>状態</th>
                <th className="emp-detail__td-num">月額</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr
                  key={d.id}
                  className="emp-detail__row-link"
                  onClick={() =>
                    navigate(
                      `/sales/clients/${
                        Array.isArray(d.client)
                          ? d.client[0]?.id
                          : d.client?.id
                      }`
                    )
                  }
                >
                  <td>{getClientName(d.client)}</td>
                  <td>{d.deal_name}</td>
                  <td>{DEAL_CATEGORY_LABELS[d.category] || d.category}</td>
                  <td>{d.role || '—'}</td>
                  <td>{DEAL_STATUS_LABELS[d.status] || d.status}</td>
                  <td className="emp-detail__td-num">
                    {formatYen(d.monthly_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ===== 工数 (Phase C-3: プロジェクト別 → クライアント別) ===== */}
      <section className="emp-detail__card">
        <h2 className="emp-detail__section-title">工数 (直近12ヶ月)</h2>
        {derivedLoading ? (
          <p className="emp-detail__mute">読み込み中...</p>
        ) : !timeAgg || timeAgg.totalHours === 0 ? (
          <p className="emp-detail__mute">工数の入力はまだありません</p>
        ) : (
          <div className="emp-detail__time-grid">
            <div>
              <h3 className="emp-detail__subsection-title">クライアント別</h3>
              <table className="emp-detail__table">
                <thead>
                  <tr>
                    <th>クライアント</th>
                    <th className="emp-detail__td-num">工数</th>
                    <th className="emp-detail__td-num">割合</th>
                  </tr>
                </thead>
                <tbody>
                  {timeAgg.byClient.map((c) => {
                    const pct =
                      timeAgg.totalHours > 0
                        ? (c.hours / timeAgg.totalHours) * 100
                        : 0;
                    return (
                      <tr
                        key={c.clientId}
                        className={
                          c.isInternal ? '' : 'emp-detail__row-link'
                        }
                        onClick={() => {
                          if (!c.isInternal) {
                            navigate(`/sales/clients/${c.clientId}`);
                          }
                        }}
                      >
                        <td>
                          {c.clientName}
                          {c.isInternal && (
                            <span className="emp-detail__mute"> (社内)</span>
                          )}
                        </td>
                        <td className="emp-detail__td-num">
                          {formatHours(c.hours)}
                        </td>
                        <td className="emp-detail__td-num">
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="emp-detail__total-row">
                    <td>
                      <strong>合計</strong>
                    </td>
                    <td className="emp-detail__td-num">
                      <strong>{formatHours(timeAgg.totalHours)}</strong>
                    </td>
                    <td className="emp-detail__td-num">
                      <strong>100.0%</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="emp-detail__subsection-title">月別</h3>
              <table className="emp-detail__table">
                <thead>
                  <tr>
                    <th>月</th>
                    <th className="emp-detail__td-num">工数</th>
                  </tr>
                </thead>
                <tbody>
                  {timeAgg.byMonth.map((m) => (
                    <tr key={m.yearMonth}>
                      <td>{m.yearMonth}</td>
                      <td className="emp-detail__td-num">
                        {formatHours(m.hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ===== 勤怠サマリ ===== */}
      <section className="emp-detail__card">
        <h2 className="emp-detail__section-title">勤怠サマリ (直近3ヶ月)</h2>
        {derivedLoading ? (
          <p className="emp-detail__mute">読み込み中...</p>
        ) : attendance.length === 0 ? (
          <p className="emp-detail__mute">勤怠データはありません</p>
        ) : (
          <table className="emp-detail__table">
            <thead>
              <tr>
                <th>月</th>
                <th className="emp-detail__td-num">出勤日数</th>
                <th className="emp-detail__td-num">実働合計</th>
                <th className="emp-detail__td-num">平均/日</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((a) => (
                <tr key={a.yearMonth}>
                  <td>{a.yearMonth}</td>
                  <td className="emp-detail__td-num">{a.workDays}日</td>
                  <td className="emp-detail__td-num">
                    {formatHours(a.totalWorkHours)}
                  </td>
                  <td className="emp-detail__td-num">
                    {a.workDays > 0
                      ? formatHours(a.totalWorkHours / a.workDays)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ===== 経費申請 ===== */}
      <section className="emp-detail__card">
        <h2 className="emp-detail__section-title">
          経費申請 (直近12ヶ月, {expenses.length}件)
        </h2>
        {derivedLoading ? (
          <p className="emp-detail__mute">読み込み中...</p>
        ) : expenses.length === 0 ? (
          <p className="emp-detail__mute">経費申請はありません</p>
        ) : (
          <table className="emp-detail__table">
            <thead>
              <tr>
                <th>日付</th>
                <th>カテゴリ</th>
                <th>状態</th>
                <th>メモ</th>
                <th className="emp-detail__td-num">金額</th>
              </tr>
            </thead>
            <tbody>
              {expenses.slice(0, 20).map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.date)}</td>
                  <td>{e.category_code}</td>
                  <td>
                    {EXPENSE_STATUS_LABELS[e.status] || e.status}
                  </td>
                  <td className="emp-detail__td-memo">{e.memo || '—'}</td>
                  <td className="emp-detail__td-num">{formatYen(e.amount)}</td>
                </tr>
              ))}
              <tr className="emp-detail__total-row">
                <td colSpan={4}>
                  <strong>合計</strong>
                </td>
                <td className="emp-detail__td-num">
                  <strong>{formatYen(totalExpense)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {expenses.length > 20 && (
          <p className="emp-detail__mute" style={{ marginTop: 8 }}>
            ※ 直近20件を表示しています ({expenses.length}件中)
          </p>
        )}
      </section>

      {/* ===== 有休 ===== */}
      <section className="emp-detail__card">
        <h2 className="emp-detail__section-title">有給休暇</h2>
        {derivedLoading ? (
          <p className="emp-detail__mute">読み込み中...</p>
        ) : !leaveBalance ? (
          <p className="emp-detail__mute">有休データはありません</p>
        ) : (
          <dl className="emp-detail__dl">
            <dt>年度</dt>
            <dd>{leaveBalance.fiscalYear}年度</dd>
            <dt>付与日数</dt>
            <dd>{leaveBalance.grantedDays}日</dd>
            <dt>繰越日数</dt>
            <dd>{leaveBalance.carryoverDays}日</dd>
            <dt>調整日数</dt>
            <dd>{leaveBalance.adjustedDays}日</dd>
            <dt>合計</dt>
            <dd>
              <strong>{leaveBalance.totalAvailable.toFixed(1)}日</strong>
            </dd>
          </dl>
        )}
      </section>

      {editingBasic && (
        <EmployeeEditModal
          open={true}
          employee={employee}
          onClose={() => setEditingBasic(false)}
          onSaved={handleSavedBasic}
        />
      )}

      {editingSalary !== undefined && (
        <SalaryEditModal
          open={true}
          userId={employee.auth_user_id || ''}
          record={editingSalary}
          onClose={() => setEditingSalary(undefined)}
          onSaved={handleSavedSalary}
        />
      )}
    </div>
  );
}

export default EmployeeDetailPage;
