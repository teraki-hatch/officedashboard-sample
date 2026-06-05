import { useMemo, useState } from 'react';
import { useAppUser } from '../../lib/useAppUser';
import { isHoliday } from '../kintai/calendarUtils';
import { useKousuMasters } from './useKousuMasters';
import { useKousuMonthly } from './useKousuMonthly';
import { useKousuMonthlyAttendance } from './useKousuMonthlyAttendance';
import { EntryModal } from './EntryModal';
import {
  calcDailyActualHours,
  daysInMonth,
  decideCellStatus,
  entriesOnDate,
  firstDayOfWeek,
  isWeekend,
  pad,
  parseDateStr,
  r2,
  sumHours,
  todayStr,
  WEEKDAYS,
  type CellStatus,
} from './kousuUtils';
import './KousuCalendar.css';

/**
 * 月次工数カレンダー (Phase 4-1)
 * --------------------------------------------------------------
 * Phase C-3: projects 廃止により useKousuMasters の返り値が
 *  projects → clients に変更されたため、EntryModal への受け渡しも変更。
 *
 * カレンダー上部に「勤怠実働 / 工数合計 / 差分」3枚のサマリーカードを表示
 * セル内表示は従来通り (日付 + 工数合計 + 未打刻バッジ)
 * --------------------------------------------------------------
 */

/** 時間(小数) → "H:MM" 形式 (勤怠カレンダーと同じ) */
function fmtHM(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function KousuCalendar() {
  const { appUser, loading: userLoading } = useAppUser();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const userId = appUser?.id ?? null;

  const {
    clients,
    deals,
    categories,
    loading: mastersLoading,
    error: mastersError,
  } = useKousuMasters();

  const {
    entries,
    loading: entriesLoading,
    error: entriesError,
    reload,
  } = useKousuMonthly({ userId, year: viewYear, month0: viewMonth });

  const {
    daily: monthlyAttendance,
    loading: attendanceLoading,
    error: attendanceError,
  } = useKousuMonthlyAttendance(userId, viewYear, viewMonth);

  const today = todayStr();

  const cells = useMemo(() => {
    const dayCount = daysInMonth(viewYear, viewMonth);
    const firstDay = firstDayOfWeek(viewYear, viewMonth);
    const arr: Array<{ ds: string | null; day: number | null }> = [];
    for (let i = 0; i < firstDay; i++) arr.push({ ds: null, day: null });
    for (let d = 1; d <= dayCount; d++) {
      arr.push({
        ds: `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`,
        day: d,
      });
    }
    while (arr.length % 7 !== 0) arr.push({ ds: null, day: null });
    return arr;
  }, [viewYear, viewMonth]);

  // 月の工数合計
  const totalKousuH = useMemo(() => sumHours(entries), [entries]);

  // 月の勤怠実働合計 (計算可能な日だけ加算)
  const totalAttendanceH = useMemo(() => {
    let sum = 0;
    Object.values(monthlyAttendance).forEach((raw) => {
      const { hours } = calcDailyActualHours(raw);
      if (hours != null) sum += hours;
    });
    return r2(sum);
  }, [monthlyAttendance]);

  // 差分 (勤怠 - 工数)
  const diffH = r2(totalAttendanceH - totalKousuH);

  // ─── 月ナビ ───
  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };
  const goThisMonth = () => {
    const n = new Date();
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth());
  };

  if (userLoading) {
    return <div className="kousu-cal__loading">読み込み中…</div>;
  }
  if (!userId) {
    return (
      <div className="kousu-cal__error">
        <p>ユーザー情報を取得できませんでした。再ログインしてください。</p>
      </div>
    );
  }

  return (
    <div className="kousu-cal">
      {/* ===== 月間サマリー (3枚カード) ===== */}
      <section className="kousu-cal__summary-cards">
        <div className="kousu-cal__summary-card">
          <div className="kousu-cal__summary-card-label">勤怠実働</div>
          <div className="kousu-cal__summary-card-value">
            {totalAttendanceH}
            <span className="kousu-cal__summary-card-unit">h</span>
          </div>
          <div className="kousu-cal__summary-card-sub">
            打刻完了済の合計
          </div>
        </div>

        <div className="kousu-cal__summary-card">
          <div className="kousu-cal__summary-card-label">工数合計</div>
          <div className="kousu-cal__summary-card-value kousu-cal__summary-card-value--accent">
            {totalKousuH}
            <span className="kousu-cal__summary-card-unit">h</span>
          </div>
          <div className="kousu-cal__summary-card-sub">
            登録された工数の合計
          </div>
        </div>

        <div className="kousu-cal__summary-card">
          <div className="kousu-cal__summary-card-label">差分</div>
          <div
            className={`kousu-cal__summary-card-value ${
              Math.abs(diffH) < 0.01
                ? 'kousu-cal__summary-card-value--ok'
                : diffH > 0
                ? 'kousu-cal__summary-card-value--short'
                : 'kousu-cal__summary-card-value--over'
            }`}
          >
            {Math.abs(diffH) < 0.01 ? '±' : diffH > 0 ? '−' : '+'}
            {fmtHM(Math.abs(diffH))}
          </div>
          <div className="kousu-cal__summary-card-sub">
            勤怠 − 工数
          </div>
        </div>
      </section>

      {/* ===== ヘッダー ===== */}
      <header className="kousu-cal__header">
        <div className="kousu-cal__nav">
          <button
            type="button"
            className="kousu-cal__nav-btn"
            onClick={goPrev}
            aria-label="前月"
          >
            ◀
          </button>
          <div className="kousu-cal__month">
            {viewYear} 年 {viewMonth + 1} 月
          </div>
          <button
            type="button"
            className="kousu-cal__nav-btn"
            onClick={goNext}
            aria-label="翌月"
          >
            ▶
          </button>
          <button
            type="button"
            className="kousu-cal__today-btn"
            onClick={goThisMonth}
          >
            今月へ
          </button>
        </div>
        {(entriesLoading || mastersLoading || attendanceLoading) && (
          <div className="kousu-cal__loading-inline">読み込み中…</div>
        )}
      </header>

      {(mastersError || entriesError || attendanceError) && (
        <div className="kousu-cal__error">
          {mastersError && <p>{mastersError}</p>}
          {entriesError && <p>{entriesError}</p>}
          {attendanceError && <p>{attendanceError}</p>}
        </div>
      )}

      {/* ===== 曜日ヘッダ ===== */}
      <div className="kousu-cal__weekdays">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`kousu-cal__weekday ${
              i === 0 ? 'kousu-cal__weekday--sun' : ''
            } ${i === 6 ? 'kousu-cal__weekday--sat' : ''}`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* ===== 日付グリッド ===== */}
      <div className="kousu-cal__grid">
        {cells.map((cell, idx) => {
          if (!cell.ds || !cell.day) {
            return <div key={`empty-${idx}`} className="kousu-cal__cell kousu-cal__cell--empty" />;
          }
          const dayEntries = entriesOnDate(entries, cell.ds);
          const dayTotal = sumHours(dayEntries);
          const isToday = cell.ds === today;
          const weekend = isWeekend(cell.ds);
          const holiday = isHoliday(cell.ds);
          const dow = parseDateStr(cell.ds).getDay();

          const { status, diff } = decideCellStatus({
            ds: cell.ds,
            today,
            kousuHours: dayTotal,
            attendance: monthlyAttendance[cell.ds],
          });

          const statusInfo = formatStatus(status, diff);

          return (
            <button
              type="button"
              key={cell.ds}
              className={`kousu-cal__cell kousu-cal__cell--${status} ${
                weekend ? 'kousu-cal__cell--weekend' : ''
              } ${holiday ? 'kousu-cal__cell--holiday' : ''} ${
                isToday ? 'kousu-cal__cell--today' : ''
              } ${dayEntries.length > 0 ? 'kousu-cal__cell--has' : ''}`}
              onClick={() => setSelectedDate(cell.ds)}
              aria-label={`${cell.day}日 ${statusInfo.label}`}
            >
              <div className="kousu-cal__cell-head">
                <span
                  className={`kousu-cal__cell-day ${
                    dow === 0 || holiday ? 'kousu-cal__cell-day--sun' : ''
                  } ${dow === 6 ? 'kousu-cal__cell-day--sat' : ''}`}
                >
                  {cell.day}
                </span>
                {dayTotal > 0 && (
                  <span className="kousu-cal__cell-hours">{dayTotal}h</span>
                )}
              </div>
              {statusInfo.label && (
                <span className={`kousu-cal__status kousu-cal__status--${status}`}>
                  {statusInfo.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===== モーダル ===== */}
      {selectedDate && (
        <EntryModal
          ds={selectedDate}
          userId={userId}
          clients={clients}
          deals={deals}
          categories={categories}
          monthEntries={entries}
          onClose={() => setSelectedDate(null)}
          onSaved={() => reload()}
        />
      )}
    </div>
  );
}

/**
 * ステータスからセル内の表示テキストを生成 (元のロジックに戻す)
 */
function formatStatus(
  status: CellStatus,
  diff: number | null
): { label: string } {
  switch (status) {
    case 'future':
      return { label: '' };
    case 'weekend':
      return { label: '' };
    case 'no-clock':
      return { label: '未打刻' };
    case 'leave':
      return { label: '休暇' };
    case 'pending':
      return { label: '勤怠未確定' };
    case 'no-entry':
      return { label: '未入力' };
    case 'match':
      return { label: '✓ 一致' };
    case 'short':
      return {
        label: diff != null ? `−${diff.toFixed(1)}h` : '不足',
      };
    case 'over':
      return {
        label: diff != null ? `+${Math.abs(diff).toFixed(1)}h` : '超過',
      };
    default:
      return { label: '' };
  }
}
