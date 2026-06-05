import type { AttendanceBreak, AttendanceRecord } from './types';
import {
  FULL_LEAVE_KEYS,
  HOURS_PER_DAY,
  LEAVE_LABEL,
  calcActualHours,
  calcBreakMin,
  isHoliday,
  isWeekend,
  workTypeLabel,
} from './calendarUtils';
import './AttendanceListView.css';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 時間(小数h) → "H:MM" */
function fmtHM(hours: number | null | undefined): string {
  if (hours == null) return '—';
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** 分(整数) → "H:MM" */
function fmtMinHM(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** ISO → "HH:MM" */
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export interface AttendanceListViewProps {
  monthDays: string[];
  getRec: (ds: string) => AttendanceRecord | null;
  getBreaksForDate: (ds: string) => AttendanceBreak[];
  getLeaveType: (ds: string) => string | null;
  expenseDates: Set<string>;
  todayStr: string;
  onSelectDate: (ds: string) => void;
}

/**
 * 勤怠リスト表示 (カレンダーと同じデータソースを再利用)
 * --------------------------------------------------------------
 * PDF台帳と同じ列構成。各行クリックで詳細モーダル(親と共通)が開く。
 *
 * 異常検知:
 * - 出退勤の記録があるのに attendance_breaks が0件 → 黄色行 + 備考に⚠
 *   (2026/06 の勤怠修正承認バグで休憩データが消える事象の再発を視覚的に検知)
 * --------------------------------------------------------------
 */
export function AttendanceListView({
  monthDays,
  getRec,
  getBreaksForDate,
  getLeaveType,
  expenseDates,
  todayStr,
  onSelectDate,
}: AttendanceListViewProps) {
  return (
    <section className="att-list-wrap" aria-label="勤怠リスト">
      <table className="att-list">
        <thead>
          <tr>
            <th className="att-list__th-day">日</th>
            <th className="att-list__th-dow">曜</th>
            <th className="att-list__th-div">区分</th>
            <th className="att-list__th-wt">勤務形態</th>
            <th className="att-list__th-time">出勤</th>
            <th className="att-list__th-time">退勤</th>
            <th className="att-list__th-h">実働h</th>
            <th className="att-list__th-h">休憩h</th>
            <th className="att-list__th-h">休暇h</th>
            <th className="att-list__th-note">備考</th>
          </tr>
        </thead>
        <tbody>
          {monthDays.map((ds) => {
            const day = Number(ds.split('-')[2]);
            const dow = new Date(ds + 'T00:00:00').getDay();
            const dowLabel = WEEKDAYS[dow];
            const rec = getRec(ds);
            const dayBreaks = getBreaksForDate(ds);
            const leaveType = getLeaveType(ds);
            const hol = isHoliday(ds);
            const wknd = isWeekend(ds);
            const actualH = calcActualHours(rec, dayBreaks);
            const breakMin = calcBreakMin(dayBreaks);
            const isFullLeave = !!(leaveType && FULL_LEAVE_KEYS.has(leaveType));
            const leaveH = isFullLeave ? HOURS_PER_DAY : leaveType ? HOURS_PER_DAY / 2 : 0;
            const isTodayRow = ds === todayStr;

            // 区分列
            let divLabel = '';
            if (hol) divLabel = '祝';
            else if (dow === 0) divLabel = '日';
            else if (dow === 6) divLabel = '土';

            // 異常検知
            const isAnomaly = !!(rec?.clock_in && rec?.clock_out && dayBreaks.length === 0);

            // 備考
            const notes: string[] = [];
            if (leaveType) notes.push(LEAVE_LABEL[leaveType] ?? leaveType);
            if (isAnomaly) notes.push('⚠ 休憩未登録');
            if (expenseDates.has(ds)) notes.push('経費登録あり');

            const rowClass = [
              'att-list__row',
              hol ? 'att-list__row--holiday' : '',
              wknd && !hol ? 'att-list__row--weekend' : '',
              leaveType ? 'att-list__row--leave' : '',
              isAnomaly ? 'att-list__row--anomaly' : '',
              isTodayRow ? 'att-list__row--today' : '',
            ].filter(Boolean).join(' ');

            return (
              <tr
                key={ds}
                className={rowClass}
                onClick={() => onSelectDate(ds)}
                tabIndex={0}
                role="button"
                aria-label={`${day}日の詳細を開く`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectDate(ds);
                  }
                }}
              >
                <td className="att-list__td-day">{day}</td>
                <td
                  className={`att-list__td-dow ${
                    dow === 0 ? 'att-list__td-dow--sun' : ''
                  } ${dow === 6 ? 'att-list__td-dow--sat' : ''}`}
                >
                  {dowLabel}
                </td>
                <td className="att-list__td-div">{divLabel}</td>
                <td className="att-list__td-wt">
                  {leaveType ? '休暇' : rec?.clock_in ? workTypeLabel(rec.work_type) : '—'}
                </td>
                <td className="att-list__td-time">{fmtTime(rec?.clock_in)}</td>
                <td className="att-list__td-time">{fmtTime(rec?.clock_out)}</td>
                <td className="att-list__td-h">{fmtHM(actualH)}</td>
                <td className="att-list__td-h">{fmtMinHM(breakMin)}</td>
                <td className="att-list__td-h">{leaveH > 0 ? fmtHM(leaveH) : '—'}</td>
                <td className="att-list__td-note">{notes.join(' / ') || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
