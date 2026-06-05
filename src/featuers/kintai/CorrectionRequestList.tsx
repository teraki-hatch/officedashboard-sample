import { useMemo, useState } from 'react';
import { useAppUser } from '../../lib/useAppUser';
import {
  useMyCorrectionRequests,
  useCancelCorrectionRequest,
  type CorrectionRequest,
  type CorrectionRequestStatus,
  type StatusFilter,
} from './useMyCorrectionRequests';
import './CorrectionRequestList.css';

/**
 * 自分の勤怠修正申請一覧
 * --------------------------------------------------------------
 * 「勤怠管理」内の新タブ「申請一覧」で使う想定。
 * - 月フィルタ(デフォルト今月)、ステータスフィルタ
 * - pending な申請は本人が取下げ可能
 * --------------------------------------------------------------
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const STATUS_LABEL: Record<CorrectionRequestStatus, string> = {
  pending: '承認待ち',
  approved: '承認済',
  rejected: '却下',
  cancelled: '取下げ',
};

const STATUS_BADGE_CLASS: Record<CorrectionRequestStatus, string> = {
  pending: 'corr-list__badge--pending',
  approved: 'corr-list__badge--approved',
  rejected: 'corr-list__badge--rejected',
  cancelled: 'corr-list__badge--cancelled',
};

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'pending', label: '承認待ち' },
  { value: 'approved', label: '承認済' },
  { value: 'rejected', label: '却下' },
  { value: 'cancelled', label: '取下げ' },
];

/** ISO → "M/D HH:mm" */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ISO timestamptz → "HH:mm" (JST) */
function fmtTimeJST(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  });
}

/** "HH:mm:ss" → "HH:mm" (requested_clock_in 用) */
function fmtTimeShort(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 5);
}

/** "YYYY-MM-DD" + 曜日 */
function fmtTargetDate(ds: string | null): string {
  if (!ds) return '—';
  const d = new Date(ds + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return ds;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

/** 休憩JSON配列 → "12:00-13:00, 13:30-14:00" 形式 */
function fmtBreaks(breaks: unknown): string {
  if (!Array.isArray(breaks) || breaks.length === 0) return '—';
  return (breaks as Array<{ break_start?: string; break_end?: string }>)
    .map((b) => {
      const s = (b.break_start ?? '').slice(0, 5);
      const e = (b.break_end ?? '').slice(0, 5);
      return s && e ? `${s}-${e}` : '';
    })
    .filter(Boolean)
    .join(', ') || '—';
}

export function CorrectionRequestList() {
  const { appUser } = useAppUser();
  const userId = appUser?.id ?? null;

  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { requests, loading, error, reload } = useMyCorrectionRequests(
    userId,
    year,
    month,
    statusFilter
  );

  const { cancel, cancelling, lastError, clearError } = useCancelCorrectionRequest();

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  const counts = useMemo(() => {
    const c: Record<CorrectionRequestStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const r of requests) c[r.status]++;
    return c;
  }, [requests]);

  const handleCancel = async (r: CorrectionRequest) => {
    if (!userId) return;
    const ok = window.confirm(
      `${fmtTargetDate(r.target_date)} の修正申請を取下げますか?\n\n取下げ後は元に戻せません。`
    );
    if (!ok) return;
    const res = await cancel({ requestId: r.id, userId });
    if (res.ok) reload();
  };

  return (
    <div className="corr-list">
      {/* ===== ヘッダー: 月ナビ + フィルタ ===== */}
      <header className="corr-list__header">
        <div className="corr-list__nav">
          <button type="button" className="corr-list__nav-btn" onClick={prevMonth}>
            ◀ 前月
          </button>
          <h2 className="corr-list__nav-title">
            {year}年 {month}月の申請
            {loading && (
              <span className="corr-list__loading"> · 読み込み中…</span>
            )}
          </h2>
          <div className="corr-list__nav-right">
            <button type="button" className="corr-list__nav-btn" onClick={goToday}>
              今月
            </button>
            <button type="button" className="corr-list__nav-btn" onClick={nextMonth}>
              次月 ▶
            </button>
          </div>
        </div>

        <div className="corr-list__filters">
          <span className="corr-list__filter-label">ステータス:</span>
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`corr-list__filter-btn ${
                statusFilter === opt.value ? 'is-active' : ''
              }`}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          <span className="corr-list__filter-sep" />
          <span className="corr-list__filter-summary">
            承認待ち {counts.pending} / 承認済 {counts.approved} / 却下 {counts.rejected} / 取下げ{' '}
            {counts.cancelled}
          </span>
        </div>
      </header>

      {/* ===== エラー ===== */}
      {error && (
        <div className="corr-list__error" role="alert">
          <span className="badge badge--danger">エラー</span>
          <span>{error}</span>
        </div>
      )}

      {lastError && (
        <div className="corr-list__error" role="alert">
          <span className="badge badge--danger">取下げエラー</span>
          <span>{lastError}</span>
          <button
            type="button"
            className="corr-list__error-close"
            onClick={clearError}
          >
            ✕
          </button>
        </div>
      )}

      {/* ===== リスト ===== */}
      {!loading && requests.length === 0 ? (
        <div className="corr-list__empty">
          {year}年{month}月 の{statusFilter !== 'all' ? `「${STATUS_LABEL[statusFilter as CorrectionRequestStatus]}」` : ''}申請はありません
        </div>
      ) : (
        <ul className="corr-list__items">
          {requests.map((r) => {
            const isPending = r.status === 'pending';
            const isApproved = r.status === 'approved';
            const isRejected = r.status === 'rejected';

            // 申請内容: requested_* を優先、なければ after_* から
            const reqIn = fmtTimeShort(r.requested_clock_in) !== '—'
              ? fmtTimeShort(r.requested_clock_in)
              : fmtTimeJST(r.after_clock_in);
            const reqOut = fmtTimeShort(r.requested_clock_out) !== '—'
              ? fmtTimeShort(r.requested_clock_out)
              : fmtTimeJST(r.after_clock_out);
            const breakMin = r.requested_break_minutes ?? 0;
            const breaksStr = fmtBreaks(r.after_breaks);

            return (
              <li key={r.id} className={`corr-list__item corr-list__item--${r.status}`}>
                <div className="corr-list__row">
                  <div className="corr-list__date">
                    {fmtTargetDate(r.target_date ?? r.date)}
                  </div>
                  <span
                    className={`corr-list__badge ${STATUS_BADGE_CLASS[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  <div className="corr-list__spacer" />
                  {isPending && (
                    <button
                      type="button"
                      className="corr-list__cancel-btn"
                      onClick={() => handleCancel(r)}
                      disabled={cancelling}
                    >
                      {cancelling ? '処理中…' : '取下げ'}
                    </button>
                  )}
                </div>

                <div className="corr-list__details">
                  <div className="corr-list__detail-row">
                    <span className="corr-list__detail-label">勤務形態</span>
                    <span>{r.requested_work_type ?? '—'}</span>
                  </div>
                  <div className="corr-list__detail-row">
                    <span className="corr-list__detail-label">出退勤</span>
                    <span className="corr-list__detail-time">
                      {reqIn} 〜 {reqOut}
                    </span>
                  </div>
                  <div className="corr-list__detail-row">
                    <span className="corr-list__detail-label">休憩</span>
                    <span>
                      {breakMin > 0 ? `${breakMin}分` : '—'}
                      {breaksStr !== '—' && (
                        <span className="corr-list__detail-sub"> ({breaksStr})</span>
                      )}
                    </span>
                  </div>
                  <div className="corr-list__detail-row">
                    <span className="corr-list__detail-label">理由</span>
                    <span>{r.reason || '—'}</span>
                  </div>

                  <div className="corr-list__meta">
                    <span>申請: {fmtDateTime(r.requested_at)}</span>
                    {isApproved && r.approved_at && (
                      <span>· 承認: {fmtDateTime(r.approved_at)}</span>
                    )}
                    {isRejected && r.rejected_at && (
                      <span>· 却下: {fmtDateTime(r.rejected_at)}</span>
                    )}
                  </div>

                  {r.admin_comment && (
                    <div className="corr-list__admin-comment">
                      <span className="corr-list__detail-label">管理者コメント</span>
                      <span>{r.admin_comment}</span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
