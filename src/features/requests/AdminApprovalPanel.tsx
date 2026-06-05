import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAppUser } from '../../lib/useAppUser';
import { useAllRequestsForAdmin } from './useAllRequestsForAdmin';
import {
  useReviewRequest,
  type ReviewAction,
  type ReviewableItem,
} from './useReviewRequest';
import { useBulkReview } from './useBulkReview';
import { ReviewModal } from './ReviewModal';
import {
  LEAVE_TYPE_LABEL,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  fmtDateTime,
} from './requestUtils';
import type { LeaveType, RequestStatus } from './types';
import './AdminApprovalPanel.css';

/**
 * 管理者パネル (Phase 3-7)
 * --------------------------------------------------------------
 * - admin role のみアクセス可能 (非 admin にはアクセス拒否表示)
 * - 全ユーザーの申請 (休暇 + 修正) を統合表示
 * - フィルター: ステータス・種別・ユーザー名
 * - サマリーカード: 承認待ち / 承認済み / 却下 / 取消 の件数
 * - 各申請に「承認」「却下」ボタン
 * - 承認時はモーダル → useReviewRequest で STEP 1 + STEP 2 実行
 * --------------------------------------------------------------
 */

const WORK_TYPE_LABEL: Record<string, string> = {
  remote: '在宅',
  office: '出社',
  business_trip: '出張',
  normal: '出社',
};

type UnifiedRow = ReviewableItem & {
  user_name: string;
  created_at_str: string | null;
};

type StatusFilter = 'all' | RequestStatus;
type KindFilter = 'all' | 'leave' | 'correction';

export function AdminApprovalPanel() {
  const { user, loading: authLoading } = useAuth();
  const {
    appUser,
    error: profileError,
    reload: refetchAppUser,
    loading: appUserLoading,
  } = useAppUser();
  const configured = isSupabaseConfigured();

  const isAdmin = appUser?.role === 'admin';
  const reviewerId = appUser?.id ?? '';

  const { leaveRequests, correctionRequests, users, loading, error, reload } =
    useAllRequestsForAdmin(isAdmin);

  const { processingId, lastError, review, clearError } = useReviewRequest();
  const {
    running: bulkRunning,
    progress: bulkProgress,
    lastResult: bulkLastResult,
    bulkReview,
    abort: bulkAbort,
    clearResult: bulkClearResult,
  } = useBulkReview();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [userFilter, setUserFilter] = useState<string>('');

  const [reviewTarget, setReviewTarget] = useState<{
    item: ReviewableItem;
    action: ReviewAction;
    userName: string;
  } | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 一括選択 (申請ID の Set)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmAction, setBulkConfirmAction] = useState<ReviewAction | null>(null);

  // ユーザー名取得ヘルパ
  const getUserName = (uid: string): string => {
    const u = users.find((x) => x.id === uid);
    return u?.name ?? u?.email ?? uid;
  };

  // 統合 + 並び替え + フィルター
  const unified: UnifiedRow[] = useMemo(() => {
    const rows: UnifiedRow[] = [];
    leaveRequests.forEach((r) => {
      rows.push({
        _kind: 'leave',
        ...r,
        user_name: getUserName(r.user_id),
        created_at_str: r.created_at ?? null,
      });
    });
    correctionRequests.forEach((r) => {
      rows.push({
        _kind: 'correction',
        ...r,
        user_name: getUserName(r.user_id),
        created_at_str: r.created_at ?? null,
      });
    });
    rows.sort((a, b) =>
      (b.created_at_str ?? '').localeCompare(a.created_at_str ?? '')
    );
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveRequests, correctionRequests, users]);

  // フィルター適用
  const filtered = useMemo(() => {
    return unified.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (kindFilter !== 'all' && r._kind !== kindFilter) return false;
      if (userFilter && !r.user_name.includes(userFilter)) return false;
      return true;
    });
  }, [unified, statusFilter, kindFilter, userFilter]);

  // サマリー
  const summary = useMemo(
    () => ({
      pending: unified.filter((r) => r.status === 'pending').length,
      approved: unified.filter((r) => r.status === 'approved').length,
      rejected: unified.filter((r) => r.status === 'rejected').length,
      cancelled: unified.filter((r) => r.status === 'cancelled').length,
    }),
    [unified]
  );

  // ─── フォールバック ──────────────────────
  if (!configured) {
    return (
      <div className="admin-panel">
        <div className="admin-panel__empty">
          <div className="admin-panel__empty-icon">⚙</div>
          <h3>Supabase 接続が未設定です</h3>
        </div>
      </div>
    );
  }
  if (authLoading) {
    return (
      <div className="admin-panel">
        <div className="admin-panel__empty">
          <p>セッションを確認中…</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="admin-panel">
        <div className="admin-panel__empty">
          <div className="admin-panel__empty-icon">🔑</div>
          <h3>ログインが必要です</h3>
        </div>
      </div>
    );
  }
  if (appUserLoading && !appUser && !profileError) {
    return (
      <div className="admin-panel">
        <div className="admin-panel__empty">
          <p>プロフィールを確認中…</p>
        </div>
      </div>
    );
  }
  if (!appUser) {
    return (
      <div className="admin-panel">
        <div className="admin-panel__empty">
          <div className="admin-panel__empty-icon">⚠</div>
          <h3>プロフィールを取得できません</h3>
          <p>
            {profileError ?? 'public.users にユーザー情報がありません。'}
          </p>
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="admin-panel__btn"
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
      <div className="admin-panel">
        <div className="admin-panel__empty">
          <div className="admin-panel__empty-icon">🔒</div>
          <h3>管理者権限が必要です</h3>
          <p>
            この機能は管理者ロールのユーザーのみ利用できます。
            <br />
            権限が必要な場合は、システム管理者にお問い合わせください。
          </p>
        </div>
      </div>
    );
  }

  // ─── 承認/却下処理 ──────────────────────
  const handleReviewConfirm = async (adminComment: string) => {
    if (!reviewTarget) return;
    clearError();
    const r = await review({
      item: reviewTarget.item,
      action: reviewTarget.action,
      reviewerId,
      adminComment,
    });
    if (r.ok) {
      const label = reviewTarget.action === 'approve' ? '承認しました' : '却下しました';
      const extra = r.attendanceUpdated ? ' (勤怠実績にも反映)' : '';
      const suffix = r.error ? ` ※ ${r.error}` : '';
      setSuccessMsg(`${label}${extra}${suffix}`);
      setReviewTarget(null);
      reload();
    }
    // 失敗時は lastError がフック側で立つので、モーダルに表示
  };

  // ─── 一括選択ヘルパ ──────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // ─── 一括承認/却下 ──────────────────────
  const handleBulkConfirm = async () => {
    if (!bulkConfirmAction) return;
    // 選択された pending 申請を抽出
    const targets: ReviewableItem[] = unified.filter(
      (row) => selectedIds.has(row.id) && row.status === 'pending'
    );
    if (targets.length === 0) {
      setBulkConfirmAction(null);
      return;
    }
    const action = bulkConfirmAction;
    setBulkConfirmAction(null);
    const r = await bulkReview({
      items: targets,
      action,
      reviewerId,
      adminComment: '',
    });
    const label = action === 'approve' ? '一括承認' : '一括却下';
    const aborted = r.aborted ? ' (中断)' : '';
    setSuccessMsg(
      `${label}完了${aborted}: 成功 ${r.ok} 件 / 失敗 ${r.ng} 件`
    );
    clearSelection();
    reload();
  };

  return (
    <div className="admin-panel">
      {/* ===== ヘッダ ===== */}
      <header className="admin-panel__header">
        <div>
          <h2 className="admin-panel__title">申請承認 (管理者)</h2>
          <p className="admin-panel__sub">
            全ユーザーの申請を確認し、承認または却下できます
          </p>
        </div>
        {loading && (
          <span className="admin-panel__loading">読み込み中…</span>
        )}
      </header>

      {/* ===== 成功メッセージ ===== */}
      {successMsg && (
        <div className="admin-panel__success">
          <span>✅ {successMsg}</span>
          <button
            type="button"
            className="admin-panel__success-close"
            onClick={() => setSuccessMsg(null)}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* ===== エラー ===== */}
      {error && (
        <div className="admin-panel__error">
          <span className="badge badge--danger">エラー</span>
          <span>{error}</span>
        </div>
      )}

      {/* ===== サマリー ===== */}
      <section className="admin-panel__summary">
        <button
          type="button"
          className={`admin-panel__summary-card admin-panel__summary-card--pending ${
            statusFilter === 'pending' ? 'admin-panel__summary-card--active' : ''
          }`}
          onClick={() => setStatusFilter('pending')}
        >
          <div className="admin-panel__summary-label">承認待ち</div>
          <div className="admin-panel__summary-value">{summary.pending}</div>
        </button>
        <button
          type="button"
          className={`admin-panel__summary-card admin-panel__summary-card--approved ${
            statusFilter === 'approved' ? 'admin-panel__summary-card--active' : ''
          }`}
          onClick={() => setStatusFilter('approved')}
        >
          <div className="admin-panel__summary-label">承認済み</div>
          <div className="admin-panel__summary-value">{summary.approved}</div>
        </button>
        <button
          type="button"
          className={`admin-panel__summary-card admin-panel__summary-card--rejected ${
            statusFilter === 'rejected' ? 'admin-panel__summary-card--active' : ''
          }`}
          onClick={() => setStatusFilter('rejected')}
        >
          <div className="admin-panel__summary-label">却下</div>
          <div className="admin-panel__summary-value">{summary.rejected}</div>
        </button>
        <button
          type="button"
          className={`admin-panel__summary-card admin-panel__summary-card--cancelled ${
            statusFilter === 'cancelled' ? 'admin-panel__summary-card--active' : ''
          }`}
          onClick={() => setStatusFilter('cancelled')}
        >
          <div className="admin-panel__summary-label">取消</div>
          <div className="admin-panel__summary-value">{summary.cancelled}</div>
        </button>
        <button
          type="button"
          className={`admin-panel__summary-card admin-panel__summary-card--all ${
            statusFilter === 'all' ? 'admin-panel__summary-card--active' : ''
          }`}
          onClick={() => setStatusFilter('all')}
        >
          <div className="admin-panel__summary-label">すべて</div>
          <div className="admin-panel__summary-value">{unified.length}</div>
        </button>
      </section>

      {/* ===== フィルター ===== */}
      <section className="admin-panel__filters">
        <div className="admin-panel__filter">
          <label className="admin-panel__filter-label">種別</label>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            className="admin-panel__filter-input"
          >
            <option value="all">すべて</option>
            <option value="leave">休暇申請</option>
            <option value="correction">勤怠修正申請</option>
          </select>
        </div>
        <div className="admin-panel__filter">
          <label className="admin-panel__filter-label">ユーザー名</label>
          <input
            type="text"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="部分一致"
            className="admin-panel__filter-input"
          />
        </div>
        <div className="admin-panel__filter-spacer" />
        <div className="admin-panel__filter-count">
          {filtered.length} / {unified.length} 件
        </div>
      </section>

      {/* ===== 一括操作ツールバー (pending フィルタ時のみ) ===== */}
      {statusFilter === 'pending' && filtered.length > 0 && (
        <section className="admin-panel__bulk">
          <div className="admin-panel__bulk-left">
            <button
              type="button"
              className="admin-panel__bulk-btn admin-panel__bulk-btn--mini"
              onClick={() => {
                const pendingIds = filtered
                  .filter((r) => r.status === 'pending')
                  .map((r) => r.id);
                setSelectedIds(new Set(pendingIds));
              }}
              disabled={bulkRunning}
            >
              フィルター結果を全選択
            </button>
            <button
              type="button"
              className="admin-panel__bulk-btn admin-panel__bulk-btn--mini"
              onClick={clearSelection}
              disabled={bulkRunning}
            >
              選択解除
            </button>
            <span className="admin-panel__bulk-count">
              選択: <strong>{selectedIds.size}</strong> 件
            </span>
          </div>
          <div className="admin-panel__bulk-right">
            <button
              type="button"
              className="admin-panel__bulk-btn admin-panel__bulk-btn--approve"
              onClick={() => setBulkConfirmAction('approve')}
              disabled={bulkRunning || selectedIds.size === 0}
            >
              選択した {selectedIds.size} 件を一括承認
            </button>
            <button
              type="button"
              className="admin-panel__bulk-btn admin-panel__bulk-btn--reject"
              onClick={() => setBulkConfirmAction('reject')}
              disabled={bulkRunning || selectedIds.size === 0}
            >
              一括却下
            </button>
          </div>
        </section>
      )}

      {/* ===== 一括処理の進捗 ===== */}
      {bulkRunning && bulkProgress && (
        <section className="admin-panel__bulk-progress">
          <div className="admin-panel__bulk-progress-bar">
            <div
              className="admin-panel__bulk-progress-fill"
              style={{
                width: `${(bulkProgress.done / Math.max(1, bulkProgress.total)) * 100}%`,
              }}
            />
          </div>
          <div className="admin-panel__bulk-progress-info">
            <span>
              処理中... <strong>{bulkProgress.done}</strong> / {bulkProgress.total}
            </span>
            <span className="admin-panel__bulk-progress-ok">成功 {bulkProgress.ok}</span>
            <span className="admin-panel__bulk-progress-ng">失敗 {bulkProgress.ng}</span>
            <button
              type="button"
              className="admin-panel__bulk-btn admin-panel__bulk-btn--mini admin-panel__bulk-btn--abort"
              onClick={bulkAbort}
            >
              中断
            </button>
          </div>
        </section>
      )}

      {/* ===== 一括処理の結果 ===== */}
      {!bulkRunning && bulkLastResult && (bulkLastResult.ok > 0 || bulkLastResult.ng > 0) && (
        <section className="admin-panel__bulk-result">
          <div className="admin-panel__bulk-result-head">
            <span>
              一括処理結果: 成功 <strong>{bulkLastResult.ok}</strong> 件 / 失敗{' '}
              <strong>{bulkLastResult.ng}</strong> 件
              {bulkLastResult.aborted && ' (中断あり)'}
            </span>
            <button
              type="button"
              className="admin-panel__bulk-btn admin-panel__bulk-btn--mini"
              onClick={bulkClearResult}
            >
              閉じる
            </button>
          </div>
          {bulkLastResult.errors.length > 0 && (
            <details className="admin-panel__bulk-errors">
              <summary>失敗 {bulkLastResult.errors.length} 件の詳細</summary>
              <ul>
                {bulkLastResult.errors.slice(0, 20).map((e) => (
                  <li key={e.id}>
                    <code>{e.id.slice(0, 8)}...</code>: {e.reason}
                  </li>
                ))}
                {bulkLastResult.errors.length > 20 && (
                  <li>...他 {bulkLastResult.errors.length - 20} 件</li>
                )}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* ===== 一覧 ===== */}
      <section className="admin-panel__list">
        {!loading && filtered.length === 0 && !error && (
          <div className="admin-panel__list-empty">
            <p>該当する申請はありません</p>
          </div>
        )}

        {filtered.length > 0 && (
          <ul className="admin-panel__list-ul">
            {filtered.map((row) => {
              const isProcessing = processingId === row.id;
              const canReview = row.status === 'pending';
              const isSelected = selectedIds.has(row.id);
              const isCurrentBulk = bulkProgress?.currentId === row.id;
              return (
                <li
                  key={`${row._kind}-${row.id}`}
                  className={`admin-panel__row ${
                    isSelected ? 'admin-panel__row--selected' : ''
                  } ${isCurrentBulk ? 'admin-panel__row--processing' : ''}`}
                >
                  <div className="admin-panel__row-head">
                    {canReview && (
                      <input
                        type="checkbox"
                        className="admin-panel__row-check"
                        checked={isSelected}
                        onChange={() => toggleSelect(row.id)}
                        disabled={bulkRunning}
                        aria-label="この申請を選択"
                      />
                    )}
                    <span
                      className={`admin-panel__row-kind ${
                        row._kind === 'leave'
                          ? 'admin-panel__row-kind--leave'
                          : 'admin-panel__row-kind--correction'
                      }`}
                    >
                      {row._kind === 'leave' ? '休暇申請' : '勤怠修正申請'}
                    </span>
                    <span className={`badge ${STATUS_BADGE_CLASS[row.status]}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                    <span className="admin-panel__row-user">
                      <strong>{row.user_name}</strong>
                    </span>
                    <span className="admin-panel__row-date">
                      {fmtDateTime(row.created_at_str)}
                    </span>
                  </div>

                  <div className="admin-panel__row-body">
                    {row._kind === 'leave' ? (
                      <div className="admin-panel__row-main">
                        <strong>{LEAVE_TYPE_LABEL[row.leave_type as LeaveType]}</strong>
                        <span className="admin-panel__row-sep">·</span>
                        <span>
                          {row.start_date === row.end_date
                            ? row.start_date
                            : `${row.start_date} 〜 ${row.end_date}`}
                        </span>
                        <span className="admin-panel__row-sep">·</span>
                        <span>{row.days}日</span>
                      </div>
                    ) : (
                      <div className="admin-panel__row-main">
                        <strong>{row.target_date}</strong>
                        <span className="admin-panel__row-sep">·</span>
                        <span>
                          {row.requested_work_type
                            ? WORK_TYPE_LABEL[row.requested_work_type] ??
                              row.requested_work_type
                            : '—'}
                        </span>
                        {(row.requested_clock_in || row.requested_clock_out) && (
                          <>
                            <span className="admin-panel__row-sep">·</span>
                            <span>
                              {row.requested_clock_in ?? '—'} 〜{' '}
                              {row.requested_clock_out ?? '—'}
                            </span>
                          </>
                        )}
                        {row.requested_break_minutes != null &&
                          row.requested_break_minutes > 0 && (
                            <>
                              <span className="admin-panel__row-sep">·</span>
                              <span>休憩 {row.requested_break_minutes}分</span>
                            </>
                          )}
                      </div>
                    )}

                    {row.reason && (
                      <div className="admin-panel__row-reason">{row.reason}</div>
                    )}

                    {row.admin_comment && (
                      <div className="admin-panel__row-comment">
                        <span className="admin-panel__row-comment-label">
                          管理者:
                        </span>
                        {row.admin_comment}
                      </div>
                    )}
                  </div>

                  {canReview && (
                    <div className="admin-panel__row-actions">
                      <button
                        type="button"
                        className="admin-panel__action admin-panel__action--approve"
                        onClick={() =>
                          setReviewTarget({
                            item: row,
                            action: 'approve',
                            userName: row.user_name,
                          })
                        }
                        disabled={isProcessing}
                      >
                        承認
                      </button>
                      <button
                        type="button"
                        className="admin-panel__action admin-panel__action--reject"
                        onClick={() =>
                          setReviewTarget({
                            item: row,
                            action: 'reject',
                            userName: row.user_name,
                          })
                        }
                        disabled={isProcessing}
                      >
                        却下
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ===== モーダル ===== */}
      {reviewTarget && (
        <ReviewModal
          item={reviewTarget.item}
          action={reviewTarget.action}
          userName={reviewTarget.userName}
          saving={processingId === reviewTarget.item.id}
          errorMessage={lastError}
          onConfirm={handleReviewConfirm}
          onClose={() => {
            setReviewTarget(null);
            clearError();
          }}
        />
      )}

      {/* ===== 一括処理確認モーダル ===== */}
      {bulkConfirmAction && (
        <div
          className="admin-panel__bulk-confirm-backdrop"
          onClick={() => setBulkConfirmAction(null)}
          role="presentation"
        >
          <div
            className="admin-panel__bulk-confirm"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="admin-panel__bulk-confirm-title">
              {bulkConfirmAction === 'approve' ? '一括承認' : '一括却下'}の確認
            </h3>
            <p className="admin-panel__bulk-confirm-msg">
              選択した <strong>{selectedIds.size}</strong> 件の申請を
              {bulkConfirmAction === 'approve' ? '承認' : '却下'}します。
              <br />
              よろしいですか？
            </p>
            {bulkConfirmAction === 'approve' && (
              <p className="admin-panel__bulk-confirm-hint">
                ※ 修正申請は勤怠実績にも自動反映されます。
              </p>
            )}
            <div className="admin-panel__bulk-confirm-actions">
              <button
                type="button"
                className={`admin-panel__bulk-btn ${
                  bulkConfirmAction === 'approve'
                    ? 'admin-panel__bulk-btn--approve'
                    : 'admin-panel__bulk-btn--reject'
                }`}
                onClick={handleBulkConfirm}
              >
                {bulkConfirmAction === 'approve' ? '一括承認する' : '一括却下する'}
              </button>
              <button
                type="button"
                className="admin-panel__bulk-btn admin-panel__bulk-btn--cancel"
                onClick={() => setBulkConfirmAction(null)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
