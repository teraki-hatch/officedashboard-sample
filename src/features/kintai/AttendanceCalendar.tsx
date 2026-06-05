import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAppUser } from '../../lib/useAppUser';
import { useMonthlyAttendance, type ApprovedLeave } from './useMonthlyAttendance';
import type { AttendanceBreak, AttendanceRecord } from './types';
import { CorrectionModal } from './CorrectionModal';
import { AttendanceListView } from './AttendanceListView';
import { useExpenseDatesInMonth } from '../expenses/useExpenseDatesInMonth';
import { ClosureSubmitButton } from '../closure/ClosureSubmitButton';
import { useMonthlyClosure } from '../closure/useMonthlyClosure';
import { toYearMonth } from '../closure/closureUtils';
import {
  FULL_LEAVE_KEYS,
  HOURS_PER_DAY,
  LEAVE_LABEL,
  calcActualHours,
  calcBreakMin,
  calcLeaveHours,
  calcMonthTotalWork,
  getDaysInMonth,
  getFirstDayOfMonth,
  getMonthDays,
  isHoliday,
  isNonWorkday,
  isWeekend,
  r2,
  todayStr,
  toDateStr,
  workTypeLabel,
} from './calendarUtils';
import './AttendanceCalendar.css';

/**
 * 勤怠カレンダー (Phase 3-5b: 修正申請モーダル追加)
 * --------------------------------------------------------------
 * 2026-05-19 追加:
 * - 月ナビ右側に「📤 この月を提出」ボタン (ClosureSubmitButton)
 * - 提出済/確定済時はバッジ表示に切替
 * - ロック中 (confirmed) は「修正申請を作成」ボタンが無効化
 * 2026-05-20 追加:
 * - 実働時間を "H:MM" 形式で表示 (旧: 2.77h → 新: 2:46)
 * 2026-06-01 追加:
 * - 表示モードトグル (カレンダー / リスト) を追加
 * - リスト表示: AttendanceListView (PDF台帳と同等の列構成)
 * - 表示モードは localStorage に永続化
 * 2026-06-01 修正:
 * - 「修正申請を作成」押下時に詳細モーダルを閉じてからCorrectionModalを開く
 *   (モーダル重なり表示を解消)
 * --------------------------------------------------------------
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const today = new Date();
const TODAY_STR = todayStr();

/** 時間(小数) → "H:MM" 形式 */
function fmtHM(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function cellAccentClass(
  ds: string,
  rec: AttendanceRecord | null,
  leaveType: string | null
): string {
  if (leaveType && FULL_LEAVE_KEYS.has(leaveType)) return 'cell--leave-full';
  if (leaveType) return 'cell--leave-half';
  if (rec?.clock_out) return 'cell--completed';
  if (rec?.clock_in) return 'cell--working';
  if (isHoliday(ds)) return 'cell--holiday';
  if (isWeekend(ds)) return 'cell--weekend';
  return '';
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function AttendanceCalendar() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const {
    appUser,
    error: profileError,
    reload: refetchAppUser,
    loading: appUserLoading,
  } = useAppUser();
  const configured = isSupabaseConfigured();
  const userId = appUser?.id ?? null;
  const authUserId = appUser?.auth_user_id ?? null;

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 表示モード (カレンダー / リスト) — localStorage に永続化
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>(() => {
    try {
      const v = localStorage.getItem('officehub:kintai:view');
      return v === 'list' ? 'list' : 'calendar';
    } catch {
      return 'calendar';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('officehub:kintai:view', viewMode);
    } catch {
      // localStorage 不可環境は無視
    }
  }, [viewMode]);

  const { records, breaks, leaveRequests, loading, error, reload } = useMonthlyAttendance(
    userId,
    viewYear,
    viewMonth
  );

  // 締め状態 (ロック判定用)
  const yearMonth = toYearMonth(viewYear, viewMonth + 1);
  const { lock: closureLock } = useMonthlyClosure(userId, yearMonth);

  const { expenseDates } = useExpenseDatesInMonth({
    userId: authUserId,
    year: viewYear,
    month: viewMonth + 1,
  });

  const [correctionOpenDate, setCorrectionOpenDate] = useState<string | null>(null);

  /**
   * 「修正申請を作成」ボタン押下ハンドラ
   * 詳細モーダル → 修正申請モーダル に置き換えるため、
   * selectedDate を一旦クリアしてから correctionOpenDate を立てる。
   */
  const openCorrectionModal = (ds: string) => {
    setSelectedDate(null);
    setCorrectionOpenDate(ds);
  };

  const getRec = (ds: string): AttendanceRecord | null =>
    records.find((r) => r.date === ds) ?? null;
  const getBreaksForDate = (ds: string): AttendanceBreak[] =>
    breaks.filter((b) => b.date === ds);
  const getLeaveType = (ds: string): string | null => {
    const lv = leaveRequests.find(
      (r: ApprovedLeave) => r.start_date <= ds && ds <= r.end_date
    );
    return lv?.leave_type ?? null;
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
    setSelectedDate(null);
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(null);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const monthDays = useMemo(
    () => getMonthDays(viewYear, viewMonth),
    [viewYear, viewMonth]
  );
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const monthWorkdays = useMemo(
    () => monthDays.filter((ds) => !isNonWorkday(ds)),
    [monthDays]
  );

  const standardH = monthWorkdays.length * HOURS_PER_DAY;

  const monthTotalWork = useMemo(
    () => calcMonthTotalWork(monthDays, getRec, getBreaksForDate, TODAY_STR),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthDays, records, breaks]
  );

  const leaveH = useMemo(
    () => calcLeaveHours(leaveRequests, monthWorkdays),
    [leaveRequests, monthWorkdays]
  );

  const totalH = r2(r2(monthTotalWork) + leaveH);
  const diffH = r2(totalH - standardH);

  const workDaysCount = useMemo(
    () =>
      monthDays.filter((ds) => !isNonWorkday(ds) && getRec(ds)?.clock_in).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthDays, records]
  );

  const officeDays = useMemo(
    () =>
      monthDays.filter((ds) => {
        const r = getRec(ds);
        const wt = r?.work_type;
        return r?.clock_in && (wt === 'office' || wt === 'normal' || !wt);
      }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthDays, records]
  );
  const remoteDays = useMemo(
    () =>
      monthDays.filter((ds) => getRec(ds)?.clock_in && getRec(ds)?.work_type === 'remote')
        .length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthDays, records]
  );
  const bizTripDays = useMemo(
    () =>
      monthDays.filter(
        (ds) => getRec(ds)?.clock_in && getRec(ds)?.work_type === 'business_trip'
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthDays, records]
  );

  const leaveDaysFull = useMemo(
    () =>
      monthDays.filter((ds) => {
        const lt = getLeaveType(ds);
        return lt && FULL_LEAVE_KEYS.has(lt);
      }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthDays, leaveRequests]
  );
  const leaveDaysHalf = useMemo(
    () =>
      monthDays.filter((ds) => {
        const lt = getLeaveType(ds);
        return lt && !FULL_LEAVE_KEYS.has(lt);
      }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthDays, leaveRequests]
  );

  // ----- フォールバック -----
  if (!configured) {
    return (
      <div className="att-cal">
        <div className="att-cal__empty">
          <div className="att-cal__empty-icon">⚙</div>
          <h3>Supabase 接続が未設定です</h3>
          <p>
            <code>.env</code> に <code>VITE_SUPABASE_URL</code> と{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> を設定してください。
          </p>
        </div>
      </div>
    );
  }
  if (authLoading) {
    return (
      <div className="att-cal">
        <div className="att-cal__empty">
          <p>セッションを確認中…</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="att-cal">
        <div className="att-cal__empty">
          <div className="att-cal__empty-icon">🔑</div>
          <h3>ログインが必要です</h3>
        </div>
      </div>
    );
  }
  if (appUserLoading && !appUser && !profileError) {
    return (
      <div className="att-cal">
        <div className="att-cal__empty">
          <p>プロフィールを確認中…</p>
        </div>
      </div>
    );
  }
  if (!appUser) {
    return (
      <div className="att-cal">
        <div className="att-cal__empty">
          <div className="att-cal__empty-icon">⚠</div>
          <h3>プロフィールを取得できません</h3>
          <p>
            {profileError ??
              'public.users に該当ユーザーが登録されていない可能性があります。'}
          </p>
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="att-cal__nav-btn"
              onClick={() => refetchAppUser()}
              style={{
                background: 'var(--primary)',
                color: 'white',
                borderColor: 'var(--primary)',
                fontWeight: 600,
              }}
            >
              プロフィールを再取得
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selRec = selectedDate ? getRec(selectedDate) : null;
  const selBreaks = selectedDate ? getBreaksForDate(selectedDate) : [];
  const selLeaveType = selectedDate ? getLeaveType(selectedDate) : null;
  const selActualH =
    selRec && selectedDate ? calcActualHours(selRec, selBreaks) : null;
  const selBreakMin = calcBreakMin(selBreaks);
  const selHasExpense = selectedDate ? expenseDates.has(selectedDate) : false;

  return (
    <div className="att-cal">
      {/* エラー */}
      {error && (
        <div className="att-cal__error" role="alert">
          <span className="badge badge--danger">エラー</span>
          <span>{error}</span>
        </div>
      )}

      {/* ===== 月間サマリー ===== */}
      <section className="att-cal__summary">
        <div className="att-cal__summary-card">
          <div className="att-cal__summary-label">標準稼働時間</div>
          <div className="att-cal__summary-value">
            {standardH}
            <span className="att-cal__summary-unit">h</span>
          </div>
          <div className="att-cal__summary-sub">
            7h × {monthWorkdays.length}日 (平日)
          </div>
        </div>

        <div className="att-cal__summary-card">
          <div className="att-cal__summary-label">実働時間合計</div>
          <div className="att-cal__summary-value att-cal__summary-value--accent">
            {r2(monthTotalWork)}
            <span className="att-cal__summary-unit">h</span>
          </div>
          <div className="att-cal__summary-sub">
            打刻済み {workDaysCount}日
          </div>
        </div>

        <div className="att-cal__summary-card">
          <div className="att-cal__summary-label">休暇時間</div>
          <div className="att-cal__summary-value att-cal__summary-value--leave">
            {leaveH}
            <span className="att-cal__summary-unit">h</span>
          </div>
          <div className="att-cal__summary-sub">
            全休 {leaveDaysFull}日 / 半休 {leaveDaysHalf}日
          </div>
        </div>

        <div className="att-cal__summary-card">
          <div className="att-cal__summary-label">実績+休暇</div>
          <div className="att-cal__summary-value">
            {totalH}
            <span className="att-cal__summary-unit">h</span>
          </div>
          <div className="att-cal__summary-sub">実働 + 承認休暇</div>
        </div>

        <div className="att-cal__summary-card">
          <div className="att-cal__summary-label">差分</div>
          <div
            className={`att-cal__summary-value ${
              diffH >= 0 ? 'att-cal__summary-value--ok' : 'att-cal__summary-value--neg'
            }`}
          >
            {diffH >= 0 ? '+' : ''}
            {diffH}
            <span className="att-cal__summary-unit">h</span>
          </div>
          <div className="att-cal__summary-sub">
            実績+休暇 − 標準
          </div>
        </div>
      </section>

      {/* ===== 勤務区分内訳 ===== */}
      <section className="att-cal__breakdown">
        <span className="att-cal__breakdown-item">
          <span className="att-cal__breakdown-dot" style={{ background: '#6F88A8' }} />
          出社 {officeDays}日
        </span>
        <span className="att-cal__breakdown-item">
          <span className="att-cal__breakdown-dot" style={{ background: '#9DAA76' }} />
          在宅 {remoteDays}日
        </span>
        <span className="att-cal__breakdown-item">
          <span className="att-cal__breakdown-dot" style={{ background: '#B68C3F' }} />
          出張 {bizTripDays}日
        </span>
      </section>

      {/* ===== 月ナビ ===== */}
      <header className="att-cal__nav">
        <button type="button" className="att-cal__nav-btn" onClick={prevMonth}>
          ◀ 前月
        </button>
        <h2 className="att-cal__nav-title">
          {viewYear}年 {viewMonth + 1}月
          {loading && <span className="att-cal__loading"> · 読み込み中…</span>}
        </h2>
        <div className="att-cal__nav-right">
          {/* 表示モードトグル */}
          <div className="att-cal__view-toggle" role="tablist" aria-label="表示切替">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'calendar'}
              className={`att-cal__view-btn ${viewMode === 'calendar' ? 'is-active' : ''}`}
              onClick={() => setViewMode('calendar')}
            >
              📅 カレンダー
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'list'}
              className={`att-cal__view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              📋 リスト
            </button>
          </div>
          {/* 締めボタン / バッジ */}
          <ClosureSubmitButton
            userId={appUser.id}
            actorId={appUser.id}
            yearMonth={yearMonth}
          />
          <button type="button" className="att-cal__nav-btn" onClick={goToday}>
            今月
          </button>
          <button type="button" className="att-cal__nav-btn" onClick={nextMonth}>
            次月 ▶
          </button>
        </div>
      </header>

      {/* ===== カレンダーグリッド / リスト ===== */}
      {viewMode === 'calendar' ? (
        <section className="att-cal__grid" role="grid">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`att-cal__weekday ${
                i === 0 ? 'att-cal__weekday--sun' : ''
              } ${i === 6 ? 'att-cal__weekday--sat' : ''}`}
            >
              {w}
            </div>
          ))}

          {Array.from({ length: firstDay }, (_, i) => (
            <div key={`pad-${i}`} className="att-cal__pad" />
          ))}

          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const ds = toDateStr(viewYear, viewMonth, day);
            const rec = getRec(ds);
            const dayBreaks = getBreaksForDate(ds);
            const leaveType = getLeaveType(ds);
            const accent = cellAccentClass(ds, rec, leaveType);
            const isTodayCell = ds === TODAY_STR;
            const isSelected = ds === selectedDate;
            const actualH = calcActualHours(rec, dayBreaks);
            const dow = new Date(ds + 'T00:00:00').getDay();
            const hasExpense = expenseDates.has(ds);

            return (
              <button
                type="button"
                key={ds}
                className={`att-cal__cell ${accent} ${
                  isTodayCell ? 'att-cal__cell--today' : ''
                } ${isSelected ? 'att-cal__cell--selected' : ''}`}
                onClick={() => setSelectedDate(ds)}
                aria-label={`${day}日`}
              >
                <div
                  className={`att-cal__cell-day ${
                    dow === 0 ? 'att-cal__cell-day--sun' : ''
                  } ${dow === 6 ? 'att-cal__cell-day--sat' : ''} ${
                    isHoliday(ds) ? 'att-cal__cell-day--hol' : ''
                  }`}
                >
                  {day}
                </div>

                {hasExpense && (
                  <span
                    className="att-cal__cell-expense"
                    title="経費登録あり (クリックで経費画面へ)"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      navigate('/expenses');
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    申請済
                  </span>
                )}

                {leaveType && (
                  <div className="att-cal__cell-leave">
                    {LEAVE_LABEL[leaveType] ?? leaveType}
                  </div>
                )}

                {rec?.clock_in && (
                  <div className="att-cal__cell-times">
                    <span>{fmtTime(rec.clock_in)}</span>
                    <span className="att-cal__cell-times-sep">–</span>
                    <span>{rec.clock_out ? fmtTime(rec.clock_out) : '…'}</span>
                  </div>
                )}

                {rec?.clock_in && (
                  <div className="att-cal__cell-wt">
                    {workTypeLabel(rec.work_type)}
                  </div>
                )}

                {actualH != null && (
                  <div className="att-cal__cell-hours">{fmtHM(actualH)}</div>
                )}
              </button>
            );
          })}
        </section>
      ) : (
        <AttendanceListView
          monthDays={monthDays}
          getRec={getRec}
          getBreaksForDate={getBreaksForDate}
          getLeaveType={getLeaveType}
          expenseDates={expenseDates}
          todayStr={TODAY_STR}
          onSelectDate={(ds) => setSelectedDate(ds)}
        />
      )}

      {/* ===== 凡例 ===== */}
      <section className="att-cal__legend">
        <span className="att-cal__legend-item">
          <span className="att-cal__legend-swatch cell--completed" />
          退勤済
        </span>
        <span className="att-cal__legend-item">
          <span className="att-cal__legend-swatch cell--working" />
          出勤中
        </span>
        <span className="att-cal__legend-item">
          <span className="att-cal__legend-swatch cell--leave-full" />
          全休
        </span>
        <span className="att-cal__legend-item">
          <span className="att-cal__legend-swatch cell--leave-half" />
          半休
        </span>
        <span className="att-cal__legend-item">
          <span className="att-cal__legend-swatch cell--holiday" />
          祝日
        </span>
        <span className="att-cal__legend-item">
          <span className="att-cal__legend-expense-icon">申請済</span>
          経費登録あり
        </span>
      </section>

      {/* ===== 選択日詳細 (モーダル) ===== */}
      {selectedDate && (
        <div
          className="att-cal__modal-overlay"
          onClick={() => setSelectedDate(null)}
          role="presentation"
        >
          <section
            className="att-cal__detail att-cal__detail--modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="att-cal-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="att-cal__detail-header">
              <h3 id="att-cal-detail-title">{selectedDate} の詳細</h3>
              <button
                type="button"
                className="att-cal__detail-close"
                onClick={() => setSelectedDate(null)}
                aria-label="閉じる"
              >
                ✕
              </button>
            </header>
            <div className="att-cal__detail-body">
              {selLeaveType && (
                <div className="att-cal__detail-row">
                  <span className="att-cal__detail-label">休暇</span>
                  <span>{LEAVE_LABEL[selLeaveType] ?? selLeaveType}</span>
                </div>
              )}
              <div className="att-cal__detail-row">
                <span className="att-cal__detail-label">勤務区分</span>
                <span>{selRec ? workTypeLabel(selRec.work_type) : '—'}</span>
              </div>
              <div className="att-cal__detail-row">
                <span className="att-cal__detail-label">出勤</span>
                <span>{fmtTime(selRec?.clock_in)}</span>
              </div>
              <div className="att-cal__detail-row">
                <span className="att-cal__detail-label">退勤</span>
                <span>{fmtTime(selRec?.clock_out)}</span>
              </div>
              <div className="att-cal__detail-row">
                <span className="att-cal__detail-label">休憩</span>
                <span>{selBreakMin > 0 ? `${selBreakMin}分` : '—'}</span>
              </div>
              <div className="att-cal__detail-row">
                <span className="att-cal__detail-label">実働</span>
                <span>{selActualH != null ? fmtHM(selActualH) : '—'}</span>
              </div>
              {selHasExpense && (
                <div className="att-cal__detail-row">
                  <span className="att-cal__detail-label">経費</span>
                  <span>申請済</span>
                </div>
              )}

              {selBreaks.length > 0 && (
                <div className="att-cal__detail-breaks">
                  <div className="att-cal__detail-label">休憩履歴</div>
                  <ul>
                    {selBreaks.map((b) => (
                      <li key={b.id}>
                        {fmtTime(b.break_start)} – {fmtTime(b.break_end) ?? '進行中'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* アクションボタン */}
              <div className="att-cal__detail-actions">
                <button
                  type="button"
                  className="att-cal__detail-btn"
                  onClick={() => selectedDate && openCorrectionModal(selectedDate)}
                  disabled={closureLock.locked}
                  title={closureLock.locked ? 'この月は確定済のため修正申請を作成できません' : ''}
                >
                  {closureLock.locked ? '🔒 修正申請 (ロック中)' : '修正申請を作成'}
                </button>
                <button
                  type="button"
                  className="att-cal__detail-btn"
                  onClick={() => navigate('/billing/expenses')}
                >
                  経費を確認
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ===== 修正申請モーダル ===== */}
      {correctionOpenDate && appUser && !closureLock.locked && (
        <CorrectionModal
          targetDate={correctionOpenDate}
          record={getRec(correctionOpenDate)}
          breaks={getBreaksForDate(correctionOpenDate)}
          leaveType={getLeaveType(correctionOpenDate)}
          userId={appUser.id}
          onClose={() => setCorrectionOpenDate(null)}
          onSubmitted={() => {
            reload();
          }}
        />
      )}
    </div>
  );
}
