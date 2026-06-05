import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAppUser } from '../../lib/useAppUser';
import { useLeaveAdminData } from './useLeaveAdminData';
import { useGrantLeave } from './useGrantLeave';
import { useEditBalance } from './useEditBalance';
import { useDeleteGrant } from './useDeleteGrant';
import { BalanceEditModal } from './BalanceEditModal';
import {
  calcNextGrant,
  calcRemainingDaysFromGrants,
  calcYearsOfService,
  consumedDaysOf,
  getCurrentFiscalYear,
  isPaidLeaveType,
  todayStr,
  compareDates,
  type GrantBrief,
  type GrantWithExpiry,
} from './leaveUtils';
import type {
  LeaveBalance,
  UserForLeaveAdmin,
} from './types';
import './LeaveAdminPanel.css';

/**
 * 有休管理パネル (Phase 3-8 + 期限管理対応)
 * --------------------------------------------------------------
 * 2026-05-20 変更:
 *  - leave_balances ではなく leave_grants ベースで残数計算
 *  - FIFO (期限の早い grant から優先消化)
 *  - 期限切れ自動失効に対応
 *
 * ▼ テーブル列
 *   社員コード / 名前 / 入社日 / 勤続 / 付与計 / 失効済 / 最早期限 / 取得済 / 承認待ち / 残 / 操作
 * --------------------------------------------------------------
 */

const TODAY = todayStr();

/** "YYYY-MM-DD" → "YY/MM/DD" 短縮表示 */
function fmtDateShort(s: string): string {
  if (!s) return '—';
  const t = s.slice(0, 10);
  return t.slice(2).replace(/-/g, '/');
}

export function LeaveAdminPanel() {
  const { user, loading: authLoading } = useAuth();
  const {
    appUser,
    error: profileError,
    reload: refetchAppUser,
    loading: appUserLoading,
  } = useAppUser();
  const configured = isSupabaseConfigured();

  const isAdmin = appUser?.role === 'admin';
  const currentFY = getCurrentFiscalYear();
  const [fiscalYear, setFiscalYear] = useState<number>(currentFY);
  /** 切替可能な年度リスト */
  const fiscalYearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let i = currentFY + 1; i >= currentFY - 5; i--) arr.push(i);
    return arr;
  }, [currentFY]);

  const {
    users,
    balances,
    leaveRequests,
    grants,
    loading: dataLoading,
    error: dataError,
    reload,
  } = useLeaveAdminData(isAdmin, fiscalYear);

  const {
    grantingUserId,
    lastError: grantError,
    lastSuccess: grantSuccess,
    grant,
    clearMessages: clearGrantMessages,
  } = useGrantLeave();

  const {
    saving: editSaving,
    lastError: editError,
    save: saveEdit,
    clearError: clearEditError,
  } = useEditBalance();

  const {
    deletingId: deletingGrantId,
    lastError: deleteGrantError,
    deleteGrant,
    clearError: clearDeleteGrantError,
  } = useDeleteGrant();

  const [editTarget, setEditTarget] = useState<UserForLeaveAdmin | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>('');
  const [showExcluded, setShowExcluded] = useState(false);

  /** 表示対象ユーザー */
  const displayedUsers = useMemo(() => {
    if (showExcluded) return users;
    return users.filter((u) => u.has_leave_management !== false);
  }, [users, showExcluded]);

  /** calcNextGrant 用の minimal grants */
  const grantsBrief: GrantBrief[] = useMemo(
    () =>
      grants.map((g) => ({
        user_id: g.user_id,
        grant_date: g.grant_date,
        grant_type: g.grant_type,
        granted_days: g.granted_days,
      })),
    [grants]
  );

  /** 期限付き grants (FIFO 計算用) */
  const grantsWithExpiry: GrantWithExpiry[] = useMemo(
    () =>
      grants
        .filter((g) => g.id)
        .map((g) => ({
          id: g.id!,
          user_id: g.user_id,
          grant_date: g.grant_date,
          granted_days: g.granted_days,
          expired_days: g.expired_days ?? 0,
          expires_at: g.expires_at,
          grant_type: g.grant_type,
        })),
    [grants]
  );

  const summary = useMemo(() => {
    const totalUsers = displayedUsers.length;
    // 残数あり = 期限内 grants の合計が > 0 の人数
    const userIdsWithGrants = new Set(
      grantsWithExpiry
        .filter((g) => compareDates(g.expires_at, TODAY) >= 0)
        .map((g) => g.user_id)
    );
    const withBalance = displayedUsers.filter((u) =>
      userIdsWithGrants.has(u.id)
    ).length;
    const grantable = displayedUsers.filter((u) => {
      const info = calcNextGrant(u.hire_date, grantsBrief, u.id);
      return info?.isDue ?? false;
    }).length;
    return { totalUsers, withBalance, grantable };
  }, [displayedUsers, grantsBrief, grantsWithExpiry]);

  const filteredGrants = useMemo(() => {
    if (!historyFilter.trim()) return grants;
    const lower = historyFilter.trim().toLowerCase();
    return grants.filter((g) => {
      const u = users.find((x) => x.id === g.user_id);
      const name = u?.name ?? '';
      const code = u?.employee_code ?? '';
      return (
        name.toLowerCase().includes(lower) ||
        code.toLowerCase().includes(lower)
      );
    });
  }, [grants, historyFilter, users]);

  // ─── 通常の関数 ─────────────────────────
  const balanceOf = (uid: string): LeaveBalance | undefined =>
    balances.find((b) => b.user_id === uid && b.fiscal_year === fiscalYear);

  /** あるユーザーの消化日数 (paid系 のみ、指定ステータス合算) */
  const calcUsedFor = (uid: string, statuses: string[]): number => {
    let s = 0;
    leaveRequests.forEach((l) => {
      if (l.user_id !== uid) return;
      if (!statuses.includes(l.status)) return;
      if (!isPaidLeaveType(l.leave_type)) return;
      s += consumedDaysOf(l.leave_type, l.days);
    });
    return +s.toFixed(1);
  };

  /** 1ユーザーの残数情報を計算 (FIFO) */
  const remainStateOf = (uid: string) => {
    const userGrants = grantsWithExpiry.filter((g) => g.user_id === uid);
    const consumed = calcUsedFor(uid, ['approved', 'pending']);
    return calcRemainingDaysFromGrants(userGrants, consumed);
  };

  /** ユーザーの最早期限 (期限切れ除く) */
  const earliestExpiryOf = (uid: string): string | null => {
    const valid = grantsWithExpiry
      .filter((g) => g.user_id === uid && compareDates(g.expires_at, TODAY) >= 0)
      .sort((a, b) => compareDates(a.expires_at, b.expires_at));
    return valid[0]?.expires_at ?? null;
  };

  /** ユーザーの総付与日数 (期限切れ除く) */
  const totalGrantedOf = (uid: string): number => {
    return grantsWithExpiry
      .filter((g) => g.user_id === uid && compareDates(g.expires_at, TODAY) >= 0)
      .reduce((sum, g) => sum + (g.granted_days || 0), 0);
  };

  /** ユーザーの失効済日数の合計 */
  const totalExpiredOf = (uid: string): number => {
    return grantsWithExpiry
      .filter((g) => g.user_id === uid)
      .reduce((sum, g) => sum + (g.expired_days || 0), 0);
  };

  // ─── フォールバック ──────────────────────
  if (!configured) {
    return (
      <div className="leave-admin">
        <div className="leave-admin__empty">
          <div className="leave-admin__empty-icon">⚙</div>
          <h3>Supabase 接続が未設定です</h3>
        </div>
      </div>
    );
  }
  if (authLoading) {
    return (
      <div className="leave-admin">
        <div className="leave-admin__empty">
          <p>セッションを確認中…</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="leave-admin">
        <div className="leave-admin__empty">
          <div className="leave-admin__empty-icon">🔑</div>
          <h3>ログインが必要です</h3>
        </div>
      </div>
    );
  }
  if (appUserLoading && !appUser && !profileError) {
    return (
      <div className="leave-admin">
        <div className="leave-admin__empty">
          <p>プロフィールを確認中…</p>
        </div>
      </div>
    );
  }
  if (!appUser) {
    return (
      <div className="leave-admin">
        <div className="leave-admin__empty">
          <div className="leave-admin__empty-icon">⚠</div>
          <h3>プロフィールを取得できません</h3>
          <p>{profileError ?? 'public.users にユーザー情報がありません。'}</p>
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="leave-admin__btn"
              onClick={() => refetchAppUser()}
            >
              プロフィールを再取得
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="leave-admin">
        <div className="leave-admin__empty">
          <div className="leave-admin__empty-icon">🔒</div>
          <h3>管理者権限が必要です</h3>
          <p>この機能は管理者ロールのユーザーのみ利用できます。</p>
        </div>
      </div>
    );
  }

  // ─── ハンドラ ────────────────────────────
  const handleGrantClick = async (u: UserForLeaveAdmin) => {
    const info = calcNextGrant(u.hire_date, grantsBrief, u.id);
    if (!info || !info.isDue) return;
    clearGrantMessages();
    const r = await grant({
      userId: u.id,
      userName: u.name ?? u.email ?? u.id,
      grantDate: info.currentGrantDate,
      grantDays: info.currentGrantDays,
      yearsOfService: info.yearsOfService,
      fiscalYear,
      existingBalance: balanceOf(u.id),
    });
    if (r.ok) {
      reload();
    }
  };

  const handleEditConfirm = async (params: {
    newHireDate: string;
    grantedDays: number;
    carryoverDays: number;
    adjustedDays: number;
    note: string;
    newHasLeaveManagement: boolean;
  }) => {
    if (!editTarget) return;
    clearEditError();
    const r = await saveEdit({
      userId: editTarget.id,
      userName: editTarget.name ?? editTarget.email ?? editTarget.id,
      fiscalYear,
      originalHireDate: editTarget.hire_date,
      newHireDate: params.newHireDate,
      grantedDays: params.grantedDays,
      carryoverDays: params.carryoverDays,
      adjustedDays: params.adjustedDays,
      note: params.note,
      originalHasLeaveManagement: editTarget.has_leave_management !== false,
      newHasLeaveManagement: params.newHasLeaveManagement,
    });
    if (r.ok) {
      setEditTarget(null);
      reload();
    }
  };

  const handleDeleteGrantClick = async (
    grantId: string,
    userName: string,
    grantDate: string,
    grantedDays: number
  ) => {
    // eslint-disable-next-line no-alert
    if (
      !window.confirm(
        `${userName} の付与履歴 (${grantDate}, ${grantedDays}日) を削除しますか？`
      )
    )
      return;
    clearDeleteGrantError();
    const r = await deleteGrant({ grantId, userName });
    if (r.ok) {
      reload();
    }
  };

  return (
    <div className="leave-admin">
      {/* ===== ヘッダ ===== */}
      <header className="leave-admin__header">
        <div>
          <h2 className="leave-admin__title">有休管理 (管理者)</h2>
          <p className="leave-admin__sub">
            {fiscalYear} 年度
            {fiscalYear !== currentFY && (
              <span className="leave-admin__fy-warning">
                {' '}(現在: {currentFY} 年度)
              </span>
            )}
            {' '}・ 期限が早い grant から優先消化 (FIFO)
          </p>
        </div>
        <div className="leave-admin__header-tools">
          <label className="leave-admin__fy-select">
            <span>年度</span>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              disabled={dataLoading}
            >
              {fiscalYearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}{y === currentFY ? ' (現在)' : ''}
                </option>
              ))}
            </select>
          </label>
          {dataLoading && (
            <span className="leave-admin__loading">読み込み中…</span>
          )}
        </div>
      </header>

      {/* ===== メッセージ ===== */}
      {grantSuccess && (
        <div className="leave-admin__success">
          <span>{grantSuccess}</span>
          <button
            type="button"
            className="leave-admin__success-close"
            onClick={() => clearGrantMessages()}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}
      {grantError && (
        <div className="leave-admin__error">
          <span className="badge badge--danger">エラー</span>
          <span>{grantError}</span>
          <button
            type="button"
            className="leave-admin__error-close"
            onClick={() => clearGrantMessages()}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}
      {dataError && (
        <div className="leave-admin__error">
          <span className="badge badge--danger">エラー</span>
          <span>{dataError}</span>
        </div>
      )}
      {deleteGrantError && (
        <div className="leave-admin__error">
          <span className="badge badge--danger">エラー</span>
          <span>{deleteGrantError}</span>
          <button
            type="button"
            className="leave-admin__error-close"
            onClick={() => clearDeleteGrantError()}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* ===== サマリー ===== */}
      <section className="leave-admin__summary">
        <div className="leave-admin__summary-card">
          <div className="leave-admin__summary-label">全社員</div>
          <div className="leave-admin__summary-value">{summary.totalUsers}</div>
        </div>
        <div className="leave-admin__summary-card">
          <div className="leave-admin__summary-label">残日数あり</div>
          <div className="leave-admin__summary-value">{summary.withBalance}</div>
        </div>
        <div className="leave-admin__summary-card leave-admin__summary-card--grantable">
          <div className="leave-admin__summary-label">付与可能</div>
          <div className="leave-admin__summary-value">{summary.grantable}</div>
        </div>
      </section>

      {/* ===== ユーザー一覧 ===== */}
      <section className="leave-admin__table-section">
        <div className="leave-admin__table-toolbar">
          <label className="leave-admin__toolbar-toggle">
            <input
              type="checkbox"
              checked={showExcluded}
              onChange={(e) => setShowExcluded(e.target.checked)}
            />
            <span>有休管理対象外 (役員・パート等) も表示</span>
          </label>
          <span className="leave-admin__toolbar-count">
            {displayedUsers.length} / {users.length} 人
          </span>
        </div>

        {!dataLoading && displayedUsers.length === 0 && (
          <div className="leave-admin__list-empty">
            <p>表示対象のユーザーがいません</p>
          </div>
        )}

        {displayedUsers.length > 0 && (
          <div className="leave-admin__table-wrap">
            <table className="leave-admin__table">
              <thead>
                <tr>
                  <th>社員コード</th>
                  <th>名前</th>
                  <th>入社日</th>
                  <th>勤続</th>
                  <th className="num">付与計</th>
                  <th className="num">失効済</th>
                  <th>失効予定</th>
                  <th className="num">取得済</th>
                  <th className="num">承認待ち</th>
                  <th className="num">残</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {displayedUsers.map((u) => {
                  const info = calcNextGrant(u.hire_date, grantsBrief, u.id);
                  const yearsOfService = calcYearsOfService(u.hire_date);
                  const taken = calcUsedFor(u.id, ['approved']);
                  const pending = calcUsedFor(u.id, ['pending']);
                  const { totalRemaining, states } = remainStateOf(u.id);
                  const earliestExpiry = earliestExpiryOf(u.id);
                  const totalGranted = totalGrantedOf(u.id);
                  const totalExpired = totalExpiredOf(u.id);
                  const isGranting = grantingUserId === u.id;
                  const isExcluded = u.has_leave_management === false;

                  // 失効予定: 最早期限の grant の残数
                  const earliestState = earliestExpiry
                    ? states.find(
                        (s) => !s.isExpired && s.expiresAt === earliestExpiry
                      )
                    : null;
                  const expiringDays = earliestState?.remainingDays ?? 0;

                  // 期限警告: 90日以内
                  let expiryWarn = '';
                  if (earliestExpiry) {
                    const days = Math.floor(
                      (new Date(earliestExpiry).getTime() -
                        new Date(TODAY).getTime()) /
                        86400000
                    );
                    if (days <= 30) expiryWarn = 'leave-admin__expiry--alert';
                    else if (days <= 90) expiryWarn = 'leave-admin__expiry--warn';
                  }

                  return (
                    <tr
                      key={u.id}
                      className={isExcluded ? 'leave-admin__row--excluded' : ''}
                    >
                      <td>{u.employee_code ?? '—'}</td>
                      <td>
                        {u.name ?? u.email ?? '—'}
                        {isExcluded && (
                          <span className="leave-admin__excluded-tag">対象外</span>
                        )}
                      </td>
                      <td>{u.hire_date?.slice(0, 10) ?? '—'}</td>
                      <td>
                        {yearsOfService != null ? `${yearsOfService}年` : '—'}
                      </td>
                      <td className="num">{totalGranted}</td>
                      <td className="num">{totalExpired > 0 ? totalExpired : '—'}</td>
                      <td className={expiryWarn}>
                        {earliestExpiry ? (
                          <div className="leave-admin__expiry-cell">
                            <div className="leave-admin__expiry-days">
                              {expiringDays}日
                            </div>
                            <div className="leave-admin__expiry-date">
                              {fmtDateShort(earliestExpiry)}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num">{taken}</td>
                      <td className="num">{pending}</td>
                      <td
                        className={`num leave-admin__remaining ${
                          totalRemaining < 0 ? 'leave-admin__remaining--neg' : ''
                        }`}
                      >
                        {totalRemaining}
                      </td>
                      <td>
                        <div className="leave-admin__row-actions">
                          {info?.isDue ? (
                            <button
                              type="button"
                              className="leave-admin__row-btn leave-admin__row-btn--grant"
                              onClick={() => handleGrantClick(u)}
                              disabled={isGranting}
                              title={`${info.currentGrantDate} に ${info.currentGrantDays}日 付与`}
                            >
                              {isGranting
                                ? '付与中…'
                                : `付与 (${info.currentGrantDays}日)`}
                            </button>
                          ) : info ? (
                            <span
                              className="leave-admin__row-next"
                              title="次回付与予定"
                            >
                              次回: {info.currentGrantDate}
                            </span>
                          ) : (
                            <span className="leave-admin__row-no-hire">
                              入社日未設定
                            </span>
                          )}
                          <button
                            type="button"
                            className="leave-admin__row-btn leave-admin__row-btn--edit"
                            onClick={() => setEditTarget(u)}
                          >
                            編集
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== 付与履歴 ===== */}
      <section className="leave-admin__history">
        <header className="leave-admin__history-head">
          <button
            type="button"
            className="leave-admin__history-toggle"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
          >
            {showHistory ? '▼' : '▶'} 付与履歴 ({grants.length}件)
          </button>
          {showHistory && (
            <input
              type="text"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              placeholder="名前 or 社員コード"
              className="leave-admin__history-filter"
            />
          )}
        </header>

        {showHistory && (
          <div className="leave-admin__history-body">
            {filteredGrants.length === 0 ? (
              <div className="leave-admin__list-empty">
                <p>付与履歴がありません</p>
              </div>
            ) : (
              <table className="leave-admin__history-table">
                <thead>
                  <tr>
                    <th>付与日</th>
                    <th>社員コード</th>
                    <th>名前</th>
                    <th>種別</th>
                    <th className="num">付与日数</th>
                    <th>有効期限</th>
                    <th className="num">失効済</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrants.map((g, i) => {
                    const u = users.find((x) => x.id === g.user_id);
                    const isDeleting = deletingGrantId === g.id;
                    const isExpired = g.expires_at && compareDates(g.expires_at, TODAY) < 0;
                    return (
                      <tr
                        key={`${g.user_id}-${g.grant_date}-${i}`}
                        className={isExpired ? 'leave-admin__row--expired' : ''}
                      >
                        <td>{String(g.grant_date).slice(0, 10)}</td>
                        <td>{u?.employee_code ?? '—'}</td>
                        <td>{u?.name ?? g.user_id}</td>
                        <td>{g.grant_type}</td>
                        <td className="num">{g.granted_days}</td>
                        <td>
                          {g.expires_at ? String(g.expires_at).slice(0, 10) : '—'}
                          {isExpired && (
                            <span className="leave-admin__expired-tag">期限切れ</span>
                          )}
                        </td>
                        <td className="num">
                          {g.expired_days && g.expired_days > 0 ? g.expired_days : '—'}
                        </td>
                        <td>
                          {g.id ? (
                            <button
                              type="button"
                              className="leave-admin__grant-delete-btn"
                              onClick={() =>
                                handleDeleteGrantClick(
                                  g.id!,
                                  u?.name ?? g.user_id,
                                  String(g.grant_date).slice(0, 10),
                                  g.granted_days
                                )
                              }
                              disabled={isDeleting}
                              title="この付与履歴を削除"
                            >
                              {isDeleting ? '削除中…' : '削除'}
                            </button>
                          ) : (
                            <span className="leave-admin__grant-no-id">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* ===== 編集モーダル ===== */}
      {editTarget && (
        <BalanceEditModal
          user={editTarget}
          fiscalYear={fiscalYear}
          balance={balanceOf(editTarget.id)}
          grants={grantsBrief}
          saving={editSaving}
          errorMessage={editError}
          onConfirm={handleEditConfirm}
          onClose={() => {
            setEditTarget(null);
            clearEditError();
          }}
        />
      )}
    </div>
  );
}
