import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAppUser } from '../../lib/useAppUser';
import { LeaveRequestModal } from './LeaveRequestModal';
import { useCancelRequest } from './useCancelRequest';
import { useLeaveBalance } from './useLeaveBalance';
import { useMyRequests } from './useMyRequests';
import {
  LEAVE_TYPE_LABEL,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  fmtDateTime,
} from './requestUtils';
import { todayStr, compareDates } from './leaveUtils';
import type { LeaveType, RequestStatus } from './types';
import './RequestsPanel.css';

/**
 * 申請タブの本体 (Phase 3-6, 2026-05-20 grants 対応)
 * --------------------------------------------------------------
 * - 有休残日数カード (grants ベース / FIFO計算)
 * - 付与履歴 (期限付き、期限警告)
 * - 「新規休暇申請」ボタン (モーダルを開く)
 * - 自分の申請一覧 (休暇申請 + 修正申請を統合)
 * --------------------------------------------------------------
 */

const WORK_TYPE_LABEL: Record<string, string> = {
  remote: '在宅',
  office: '出社',
  business_trip: '出張',
  normal: '出社',
};

type UnifiedRow =
  | {
      kind: 'leave';
      id: string;
      created_at: string | null;
      status: RequestStatus;
      leave_type: LeaveType;
      start_date: string;
      end_date: string;
      days: number;
      reason: string | null;
    }
  | {
      kind: 'correction';
      id: string;
      created_at: string | null;
      status: RequestStatus;
      target_date: string;
      requested_work_type: string | null;
      requested_clock_in: string | null;
      requested_clock_out: string | null;
      requested_break_minutes: number | null;
      reason: string | null;
    };

/** 期限までの日数を計算 */
function daysUntil(expiresAt: string): number {
  const today = todayStr();
  const t = new Date(today).getTime();
  const e = new Date(expiresAt).getTime();
  return Math.floor((e - t) / (1000 * 60 * 60 * 24));
}

/** 期限警告レベル */
function expiryClass(expiresAt: string, isExpired: boolean): string {
  if (isExpired) return 'req-panel__grant-expiry--expired';
  const d = daysUntil(expiresAt);
  if (d <= 30) return 'req-panel__grant-expiry--danger';
  if (d <= 90) return 'req-panel__grant-expiry--warn';
  return '';
}

export function RequestsPanel() {
  const { user, loading: authLoading } = useAuth();
  const {
    appUser,
    error: profileError,
    reload: refetchAppUser,
    loading: appUserLoading,
  } = useAppUser();
  const configured = isSupabaseConfigured();
  const userId = appUser?.id ?? null;

  const {
    leaveRequests,
    correctionRequests,
    loading: listLoading,
    error: listError,
    reload,
  } = useMyRequests(userId);

  const {
    totalGranted,
    totalExpired,
    totalConsumed,
    totalPending,
    remainingDays,
    grants,
    loading: balLoading,
    error: balError,
    fiscalYear,
  } = useLeaveBalance(userId);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    cancellingId,
    lastError: cancelError,
    cancel,
    clearError: clearCancelError,
  } = useCancelRequest();

  // 統合・並び替え (created_at 降順)
  const unified: UnifiedRow[] = useMemo(() => {
    const rows: UnifiedRow[] = [];
    leaveRequests.forEach((r) => {
      rows.push({
        kind: 'leave',
        id: r.id,
        created_at: r.created_at ?? null,
        status: r.status,
        leave_type: r.leave_type,
        start_date: r.start_date,
        end_date: r.end_date,
        days: r.days,
        reason: r.reason,
      });
    });
    correctionRequests.forEach((r) => {
      rows.push({
        kind: 'correction',
        id: r.id,
        created_at: r.created_at ?? null,
        status: r.status,
        target_date: r.target_date,
        requested_work_type: r.requested_work_type,
        requested_clock_in: r.requested_clock_in,
        requested_clock_out: r.requested_clock_out,
        requested_break_minutes: r.requested_break_minutes,
        reason: r.reason,
      });
    });
    rows.sort((a, b) => {
      const ta = a.created_at ?? '';
      const tb = b.created_at ?? '';
      return tb.localeCompare(ta);
    });
    return rows;
  }, [leaveRequests, correctionRequests]);

  // 付与履歴の表示順 (期限早い順、ただし失効済みは下に)
  const sortedGrants = useMemo(() => {
    return [...grants].sort((a, b) => {
      if (a.isExpired !== b.isExpired) return a.isExpired ? 1 : -1;
      return compareDates(a.expiresAt, b.expiresAt);
    });
  }, [grants]);

  // ─── フォールバック ──────────────────────────────
  if (!configured) {
    return (
      <div className="req-panel">
        <div className="req-panel__empty">
          <div className="req-panel__empty-icon">⚙</div>
          <h3>Supabase 接続が未設定です</h3>
        </div>
      </div>
    );
  }
  if (authLoading) {
    return (
      <div className="req-panel">
        <div className="req-panel__empty">
          <p>セッションを確認中…</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="req-panel">
        <div className="req-panel__empty">
          <div className="req-panel__empty-icon">🔑</div>
          <h3>ログインが必要です</h3>
        </div>
      </div>
    );
  }
  if (appUserLoading && !appUser && !profileError) {
    return (
      <div className="req-panel">
        <div className="req-panel__empty">
          <p>プロフィールを確認中…</p>
        </div>
      </div>
    );
  }
  if (!appUser) {
    return (
      <div className="req-panel">
        <div className="req-panel__empty">
          <div className="req-panel__empty-icon">⚠</div>
          <h3>プロフィールを取得できません</h3>
          <p>
            {profileError ??
              'public.users に該当ユーザーが登録されていない可能性があります。'}
          </p>
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="req-panel__new-btn"
              onClick={() => refetchAppUser()}
            >
              プロフィールを再取得
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 取消ハンドラ
  const handleCancelClick = async (
    requestId: string,
    kind: 'leave' | 'correction'
  ) => {
    const label = kind === 'leave' ? '休暇申請' : '勤怠修正申請';
    // eslint-disable-next-line no-alert
    if (!window.confirm(`この${label}を取り消しますか？`)) return;
    clearCancelError();
    const r = await cancel({ requestId, kind, userId: appUser.id });
    if (r.ok) {
      setSuccessMsg(`${label}を取り消しました`);
      reload();
    }
  };

  const hasGrants = grants.length > 0;

  return (
    <div className="req-panel">
      {/* ===== 成功メッセージ ===== */}
      {successMsg && (
        <div className="req-panel__success">
          <span>✅ {successMsg}</span>
          <button
            type="button"
            className="req-panel__success-close"
            onClick={() => setSuccessMsg(null)}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}
      {/* ===== 取消エラー ===== */}
      {cancelError && (
        <div className="req-panel__error">
          <span className="badge badge--danger">エラー</span>
          <span>{cancelError}</span>
          <button
            type="button"
            className="req-panel__error-close"
            onClick={() => clearCancelError()}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* ===== 有休残日数カード (サマリ) ===== */}
      <section className="req-panel__balance">
        <div className="req-panel__balance-head">
          <h3 className="req-panel__balance-title">
            有給休暇 (年度: {fiscalYear})
          </h3>
          {balLoading && (
            <span className="req-panel__balance-loading">読み込み中…</span>
          )}
        </div>
        {balError ? (
          <p className="req-panel__balance-error">残日数取得失敗: {balError}</p>
        ) : !hasGrants && !balLoading ? (
          <p className="req-panel__balance-empty">
            有休の付与記録がありません。管理者に確認してください。
          </p>
        ) : hasGrants ? (
          <div className="req-panel__balance-grid">
            <div className="req-panel__balance-item">
              <div className="req-panel__balance-label">付与計</div>
              <div className="req-panel__balance-value">{totalGranted}</div>
              <div className="req-panel__balance-unit">日</div>
            </div>
            <div className="req-panel__balance-item req-panel__balance-item--accent">
              <div className="req-panel__balance-label">取得済み</div>
              <div className="req-panel__balance-value">{totalConsumed}</div>
              <div className="req-panel__balance-unit">日</div>
            </div>
            <div className="req-panel__balance-item req-panel__balance-item--accent">
              <div className="req-panel__balance-label">承認待ち</div>
              <div className="req-panel__balance-value">{totalPending}</div>
              <div className="req-panel__balance-unit">日</div>
            </div>
            <div className="req-panel__balance-item req-panel__balance-item--remain">
              <div className="req-panel__balance-label">残日数</div>
              <div className="req-panel__balance-value">{remainingDays}</div>
              <div className="req-panel__balance-unit">日</div>
            </div>
            {totalExpired > 0 && (
              <div className="req-panel__balance-item req-panel__balance-item--expired">
                <div className="req-panel__balance-label">失効済</div>
                <div className="req-panel__balance-value">{totalExpired}</div>
                <div className="req-panel__balance-unit">日</div>
              </div>
            )}
          </div>
        ) : null}
      </section>

      {/* ===== 付与履歴 (期限付き) ===== */}
      {hasGrants && (
        <section className="req-panel__grants">
          <h4 className="req-panel__grants-title">付与履歴</h4>
          <div className="req-panel__grants-table-wrap">
            <table className="req-panel__grants-table">
              <thead>
                <tr>
                  <th>付与日</th>
                  <th>付与</th>
                  <th>失効</th>
                  <th>消化</th>
                  <th>残</th>
                  <th>有効期限</th>
                </tr>
              </thead>
              <tbody>
                {sortedGrants.map((g) => {
                  const cls = expiryClass(g.expiresAt, g.isExpired);
                  return (
                    <tr
                      key={g.grantId}
                      className={
                        g.isExpired ? 'req-panel__grants-row--expired' : ''
                      }
                    >
                      <td>{g.grantDate}</td>
                      <td>{g.grantedDays}日</td>
                      <td>
                        {g.expiredDays > 0 ? (
                          <span className="req-panel__grant-expired-days">
                            {g.expiredDays}日
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{g.consumedDays > 0 ? `${g.consumedDays}日` : '—'}</td>
                      <td>
                        <strong>{g.remainingDays}日</strong>
                      </td>
                      <td className={`req-panel__grant-expiry ${cls}`}>
                        {g.expiresAt}
                        {!g.isExpired && daysUntil(g.expiresAt) <= 90 && (
                          <div className="req-panel__grant-expiry-hint">
                            あと{daysUntil(g.expiresAt)}日
                          </div>
                        )}
                        {g.isExpired && (
                          <div className="req-panel__grant-expiry-hint">
                            失効済
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ===== アクション ===== */}
      <section className="req-panel__actions">
        <button
          type="button"
          className="req-panel__new-btn"
          onClick={() => setShowLeaveModal(true)}
        >
          ＋ 新規休暇申請
        </button>
        <p className="req-panel__actions-hint">
          勤怠の修正申請は「勤怠カレンダー」タブから出せます
        </p>
      </section>

      {/* ===== 申請一覧 ===== */}
      <section className="req-panel__list">
        <header className="req-panel__list-head">
          <h3 className="req-panel__list-title">申請一覧</h3>
          {listLoading && (
            <span className="req-panel__list-loading">読み込み中…</span>
          )}
        </header>

        {listError && (
          <div className="req-panel__error">
            <span className="badge badge--danger">エラー</span>
            <span>{listError}</span>
          </div>
        )}

        {!listLoading && unified.length === 0 && !listError && (
          <div className="req-panel__list-empty">
            <p>まだ申請はありません</p>
          </div>
        )}

        {unified.length > 0 && (
          <ul className="req-panel__list-ul">
            {unified.map((row) => {
              const canCancel = row.status === 'pending';
              const isCancelling = cancellingId === row.id;
              return (
                <li key={`${row.kind}-${row.id}`} className="req-panel__row">
                  <div className="req-panel__row-head">
                    <span
                      className={`req-panel__row-kind ${
                        row.kind === 'leave'
                          ? 'req-panel__row-kind--leave'
                          : 'req-panel__row-kind--correction'
                      }`}
                    >
                      {row.kind === 'leave' ? '休暇申請' : '勤怠修正申請'}
                    </span>
                    <span className={`badge ${STATUS_BADGE_CLASS[row.status]}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                    <span className="req-panel__row-date">
                      {fmtDateTime(row.created_at)}
                    </span>
                  </div>

                  <div className="req-panel__row-body">
                    {row.kind === 'leave' ? (
                      <>
                        <div className="req-panel__row-main">
                          <strong>{LEAVE_TYPE_LABEL[row.leave_type]}</strong>
                          <span className="req-panel__row-sep">·</span>
                          <span>
                            {row.start_date === row.end_date
                              ? row.start_date
                              : `${row.start_date} 〜 ${row.end_date}`}
                          </span>
                          <span className="req-panel__row-sep">·</span>
                          <span>{row.days}日</span>
                        </div>
                        {row.reason && (
                          <div className="req-panel__row-reason">{row.reason}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="req-panel__row-main">
                          <strong>{row.target_date}</strong>
                          <span className="req-panel__row-sep">·</span>
                          <span>
                            {row.requested_work_type
                              ? WORK_TYPE_LABEL[row.requested_work_type] ??
                                row.requested_work_type
                              : '—'}
                          </span>
                          {(row.requested_clock_in || row.requested_clock_out) && (
                            <>
                              <span className="req-panel__row-sep">·</span>
                              <span>
                                {row.requested_clock_in ?? '—'} 〜{' '}
                                {row.requested_clock_out ?? '—'}
                              </span>
                            </>
                          )}
                          {row.requested_break_minutes != null &&
                            row.requested_break_minutes > 0 && (
                              <>
                                <span className="req-panel__row-sep">·</span>
                                <span>休憩 {row.requested_break_minutes}分</span>
                              </>
                            )}
                        </div>
                        {row.reason && (
                          <div className="req-panel__row-reason">{row.reason}</div>
                        )}
                      </>
                    )}
                  </div>

                  {canCancel && (
                    <div className="req-panel__row-actions">
                      <button
                        type="button"
                        className="req-panel__row-cancel-btn"
                        onClick={() => handleCancelClick(row.id, row.kind)}
                        disabled={isCancelling}
                      >
                        {isCancelling ? '取消中…' : '取り消し'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ===== 休暇申請モーダル ===== */}
      {showLeaveModal && (
        <LeaveRequestModal
          userId={appUser.id}
          isAdmin={appUser.role === 'admin'}
          availableDays={remainingDays + totalPending + totalConsumed}
          existingRequests={leaveRequests}
          onClose={() => setShowLeaveModal(false)}
          onSubmitted={() => reload()}
        />
      )}
    </div>
  );
}
