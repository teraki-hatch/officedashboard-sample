import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNow, formatDateJa, formatTimeHMS, greetingByHour } from '../hooks/useNow';
import { useTodaysEvents } from '../features/calendar/types';
import { TodayCalendar } from '../features/calendar/TodayCalendar';
import { useAppUser } from '../lib/useAppUser';
import { useMyStatus } from '../features/home/useMyStatus';
import { useTodayAttendance } from '../features/home/useTodayAttendance';
import type { TodayMemberStatus } from '../features/home/useTodayAttendance';
import { useLeaveBalance } from '../features/requests/useLeaveBalance';
import { PortalLinks } from './PortalLinks';
import { getAnniversary, getSeasonalMessage } from '../data/anniversaries';
import './HomePage.css';

type StatusMeta = {
  label: string;
  badgeClass: string;
  dotColor: string;
};

const TODAY_STATUS_META: Record<TodayMemberStatus, StatusMeta> = {
  working: {
    label: '出勤中',
    badgeClass: 'badge--ok',
    dotColor: '#7b9e6e',
  },
  breaking: {
    label: '休憩中',
    badgeClass: 'badge--warn',
    dotColor: '#c4880a',
  },
  finished: {
    label: '退勤済',
    badgeClass: 'badge--mute',
    dotColor: '#4f6e9b',
  },
  'not-started': {
    label: '未出勤',
    badgeClass: 'badge--mute',
    dotColor: '#c8c2b0',
  },
};

export function HomePage() {
  const { user } = useAuth();
  const now = useNow();
  const { appUser } = useAppUser();
  const isAdmin = appUser?.role === 'admin';
  const isLeaveTarget = appUser?.has_leave_management !== false;

  const { data: myStatus } = useMyStatus(appUser?.id ?? null, isAdmin);
  const { remainingDays, grants, loading: leaveLoading } = useLeaveBalance(
    appUser?.id ?? null
  );
  const { members: todayMembers, loading: todayLoading } = useTodayAttendance(
    Boolean(appUser?.id)
  );

  // 90日以内に失効する直近の grant を取得 (失効予定の警告表示用)
  const nearestExpiry = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ninetyDaysLater = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    const upcoming = grants
      .filter((g) => !g.isExpired && g.remainingDays > 0)
      .filter((g) => {
        const exp = new Date(g.expiresAt);
        return exp >= today && exp <= ninetyDaysLater;
      })
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    return upcoming[0] ?? null;
  })();

  // 表示名は appUser.name (氏名) を優先。なければ auth のメタデータ、最後にメールアドレス
  const displayName =
    appUser?.name ??
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email ??
    'ゲスト';

  const { events, loading: calendarLoading } = useTodaysEvents();

  // 今日の記念日 + 季節メッセージ
  const anniversary = getAnniversary(now);
  const seasonalMessage = getSeasonalMessage(now);

  return (
    <main className="home">
      <section className="dashboard-grid">

        <div className="left-column">

          {/* 1番目: 時刻・日付・あいさつ */}
          <div className="card time-card">
            <div className="time-card__date">{formatDateJa(now)}</div>
            <div className="time-card__time" aria-live="polite">
              {formatTimeHMS(now)}
            </div>
            <h1 className="time-card__greet">
              {greetingByHour(now)}、<span className="time-card__name">{displayName}</span> さん
            </h1>
            <p className="time-card__lead">
              {anniversary && (
                <>
                  今日は『{anniversary.name}』{anniversary.emoji}{' '}
                </>
              )}
              {seasonalMessage}
            </p>
          </div>

          {/* 2番目: マイステータス */}
          <div className="card mystatus-card">
            <div className="card__head">
              <h2 className="card__title">マイステータス</h2>
            </div>

            <div className="mystatus-grid">
              <div className="mystatus-cell">
                <div className="mystatus-cell__label">今日の打刻</div>
                {myStatus.todayClockState === 'working' && (
                  <>
                    <div className="mystatus-cell__value mystatus-cell__value--working">
                      勤務中
                    </div>
                    <div className="mystatus-cell__hint">
                      出勤 {myStatus.clockInTime ?? '—'}
                    </div>
                  </>
                )}
                {myStatus.todayClockState === 'finished' && (
                  <>
                    <div className="mystatus-cell__value mystatus-cell__value--done">
                      退勤済
                    </div>
                    <div className="mystatus-cell__hint">
                      {myStatus.clockInTime ?? '—'}–{myStatus.clockOutTime ?? '—'}
                    </div>
                  </>
                )}
                {myStatus.todayClockState === 'not-started' && (
                  <>
                    <div className="mystatus-cell__value mystatus-cell__value--idle">
                      未出勤
                    </div>
                    <div className="mystatus-cell__hint">これから打刻</div>
                  </>
                )}
                {myStatus.todayClockState === 'unknown' && (
                  <>
                    <div className="mystatus-cell__value mystatus-cell__value--idle">—</div>
                    <div className="mystatus-cell__hint">情報なし</div>
                  </>
                )}
              </div>

              <div className="mystatus-cell">
                <div className="mystatus-cell__label">未処理の申請</div>
                <div
                  className={`mystatus-cell__value ${
                    myStatus.myPendingCount > 0 ? 'mystatus-cell__value--pending' : ''
                  }`}
                >
                  {myStatus.myPendingCount}
                  <span className="mystatus-cell__unit">件</span>
                </div>
                <div className="mystatus-cell__hint">承認待ち</div>
              </div>

             {isLeaveTarget && (
                <div className="mystatus-cell">
                  <div className="mystatus-cell__label">有休残日数</div>
                  <div className="mystatus-cell__value mystatus-cell__value--leave">
                    {leaveLoading ? '—' : remainingDays}
                    <span className="mystatus-cell__unit">日</span>
                  </div>
                  <div className="mystatus-cell__hint">使用可能日数</div>
                  {nearestExpiry && (
                    <div className="mystatus-cell__expiry-warn">
                      失効予定: {nearestExpiry.expiresAt.slice(2).replace(/-/g, '/')} {nearestExpiry.remainingDays}日
                    </div>
                  )}
                </div>
              )}

              {isAdmin && myStatus.adminPendingCount !== null && (
                <div className="mystatus-cell mystatus-cell--admin">
                  <div className="mystatus-cell__label">
                    <span className="badge badge--mute">管理者</span> 承認待ち
                  </div>
                  <div
                    className={`mystatus-cell__value ${
                      myStatus.adminPendingCount > 0 ? 'mystatus-cell__value--alert' : ''
                    }`}
                  >
                    {myStatus.adminPendingCount}
                    <span className="mystatus-cell__unit">件</span>
                  </div>
                  <div className="mystatus-cell__hint">全社の未処理申請</div>
                </div>
              )}
            </div>

            <div className="mystatus-actions">
              <Link to="/kintai" className="mystatus-link">
                勤怠管理を開く →
              </Link>
            </div>
          </div>

          {/* 3番目: 今日の社内出勤状況 */}
          <div className="card attendance-status-card">
            <div className="card__head">
              <h2 className="card__title">今日の社内出勤状況</h2>
              <span className="card__hint card__hint--soft">
                打刻管理対象の社員
              </span>
            </div>

            {todayLoading ? (
              <div className="calendar-empty">
                <p className="calendar-empty__msg">読み込み中...</p>
              </div>
            ) : todayMembers.length === 0 ? (
              <div className="calendar-empty">
                <p className="calendar-empty__msg">表示できる社員がいません</p>
              </div>
            ) : (
              <ul className="attendance-list">
                {todayMembers.map((m) => {
                  const meta = TODAY_STATUS_META[m.status];
                  return (
                    <li className="attendance-list__row" key={m.id}>
                      <span
                        className="attendance-list__dot"
                        style={{ background: meta.dotColor }}
                        aria-hidden
                      />
                      <span className="attendance-list__name">{m.name}</span>
                      <span className={`badge ${meta.badgeClass}`}>
                        {meta.label}
                      </span>
                      <span className="attendance-list__time">
                        {m.updatedAt ? m.updatedAt : '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 4番目: ポータル (外部リンクカード 2列x2行) */}
          <PortalLinks />

        </div>

        {/* ===== 右カラム: Googleカレンダー (縦長) ===== */}
        <div className="card calendar-card">
          <div className="card__head">
            <h2 className="card__title">今日の予定</h2>
            <span className="card__hint card__hint--soft">Googleカレンダー</span>
          </div>

          {calendarLoading ? (
            <div className="calendar-empty">
              <p className="calendar-empty__msg">読み込み中...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="calendar-empty">
              <div className="calendar-empty__icon">▢</div>
              <p className="calendar-empty__msg">本日の予定はありません</p>
            </div>
          ) : (
            <TodayCalendar events={events} />
          )}
        </div>

      </section>

    </main>
  );
}
