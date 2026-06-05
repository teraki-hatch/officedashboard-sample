import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAppUser } from '../../lib/useAppUser';
import { useTodaysAttendance } from './useTodaysAttendance';
import { usePunch } from './usePunch';
import type { ClockState, WorkType } from './types';
import { logger } from '../../lib/logger';
import { checkMonthLocked } from '../closure/checkLocked';
import {
  calcActualHours,
  calcBreakMin,
  fmtActualHours,
  fmtBreakDuration,
  fmtTime,
  getClockState,
  getOngoingBreak,
} from './utils';
import './ClockPanel.css';

/**
 * 打刻パネル (Phase 3-4: 書き込み有効化)
 * --------------------------------------------------------------
 * - 既存 Supabase の attendance_records / attendance_breaks から
 *   今日の自分の勤怠データを読み取って表示する。
 * - 出勤・休憩開始・休憩終了・退勤の各ボタンで INSERT / UPDATE / upsert
 *   を行う。既存システム timetrack-app-clean の punch 関数と同等のロジック。
 * - 操作後は再フェッチして表示を更新する。
 * - .env 未設定時、未ログイン時、プロフィール未取得時はそれぞれ
 *   適切なフォールバック表示を出してクラッシュさせない。
 *
 * Phase 2 追加 (2026-05-19):
 * - 当日の月が monthly_closures で confirmed (確定済) なら打刻ブロック
 *
 * ⚠ 移行期間中の運用ルール:
 *   ユーザーは「OfficeHub (新)」または「既存システム (旧)」の
 *   どちらか一方で打刻すること。両方で交互に打刻するのは避ける
 *   (UNIQUE 制約 (user_id, date) により後勝ちで上書きされるため)。
 * --------------------------------------------------------------
 */

const WORK_TYPE_OPTIONS: { value: WorkType; label: string; icon: string }[] = [
  { value: 'office', label: '出社', icon: '🏢' },
  { value: 'remote', label: '在宅', icon: '🏠' },
  { value: 'business_trip', label: '出張', icon: '✈' },
];

const STATE_META: Record<
  ClockState,
  { label: string; dotColor: string; badgeClass: string; hint: string }
> = {
  before: {
    label: '未出勤',
    dotColor: '#9A9686',
    badgeClass: 'badge--mute',
    hint: '本日まだ打刻されていません',
  },
  working: {
    label: '出勤中',
    dotColor: '#6C8F3D',
    badgeClass: 'badge--ok',
    hint: '出勤打刻済み',
  },
  breaking: {
    label: '休憩中',
    dotColor: '#B6852A',
    badgeClass: 'badge--warn',
    hint: '休憩中です',
  },
  done: {
    label: '退勤済み',
    dotColor: '#4F7A8C',
    badgeClass: 'badge--info',
    hint: '本日の勤怠は終了しています',
  },
};

const WORK_TYPE_LABEL: Record<WorkType | 'normal', string> = {
  office: '出社',
  remote: '在宅',
  business_trip: '出張',
  normal: '出社', // 旧値の後方互換
};

const pad = (n: number) => String(n).padStart(2, '0');
const formatDateJa = (d: Date) => {
  const w = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${w[d.getDay()]})`;
};
const formatHMS = (d: Date) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function ClockPanel() {
  const { user, loading: authLoading } = useAuth();
  const {
    appUser,
    error: profileError,
    reload: refetchAppUser,
    loading: appUserLoading,
  } = useAppUser();
  const configured = isSupabaseConfigured();

  // public.users.id (auth_user_id ではない) を userId として使う
  const userId = appUser?.id ?? null;

  const {
    record,
    breaks,
    loading: dataLoading,
    error: dataError,
    configured: dataConfigured,
    reload,
  } = useTodaysAttendance(userId);

  // 打刻保存フック
  const { saving, lastError: saveError, punch, clearError: clearSaveError } = usePunch();

  // 現在時刻 (1秒更新)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // 既存システムと同じ判定
  const clockState: ClockState = useMemo(() => getClockState(record, breaks), [record, breaks]);
  const stateMeta = STATE_META[clockState];

  // 勤務区分: 出勤後は record.work_type を尊重、未出勤時はラジオで選択
  const [workType, setWorkType] = useState<WorkType>('office');

  // 集計値
  const totalBreakMin = useMemo(() => calcBreakMin(breaks), [breaks]);
  const actualH = useMemo(() => calcActualHours(record, breaks), [record, breaks]);
  const ongoing = useMemo(() => getOngoingBreak(breaks), [breaks]);
  const completedBreaks = useMemo(() => breaks.filter((b) => b.break_end), [breaks]);

  // お知らせ (成功時のメッセージ)
  const [notice, setNotice] = useState<string | null>(null);

  // ロック警告 (確定済月への打刻防止)
  const [lockWarning, setLockWarning] = useState<string | null>(null);

  /**
   * 打刻ハンドラ (Phase 3-4 で本番有効化)
   * --------------------------------------------------------------
   * - userId が未確定 (プロフィール未取得) なら何もしない
   * - 当日の月が confirmed (確定済) なら警告だけ出して中止
   * - 成功時は再フェッチして表示を更新
   * - 失敗時は usePunch 側の lastError に格納される (画面で表示)
   * --------------------------------------------------------------
   */
  const handlePunch = async (
    type: 'in' | 'break_start' | 'break_end' | 'out',
    label: string
  ) => {
    if (!userId) return;
    clearSaveError();
    setLockWarning(null);
    const ts = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    logger.log('[OfficeHub:kintai:button] clicked', { type, label, ts, clockState });

    // ★ Phase 2: 月次締めロック判定 (確定済なら拒否)
    const lock = await checkMonthLocked(userId, todayYMD());
    if (lock.locked) {
      const msg = lock.message ?? '対象月は確定済のため打刻できません';
      logger.log('[OfficeHub:kintai:button] BLOCKED by closure lock', { msg });
      setLockWarning(msg);
      return;
    }

    const result = await punch(type, { userId, workType, record, breaks });
    if (result.ok) {
      setNotice(`[${ts}] ${label}を記録しました`);
      reload(); // 最新データを再フェッチ
    }
    // 失敗時は saveError に入っているので個別の setNotice はしない
  };

  // 診断ログ: どの状態でレンダリングされているか
  logger.log('[OfficeHub:kintai:ClockPanel] render', {
    configured,
    authLoading,
    hasUser: Boolean(user),
    hasAppUser: Boolean(appUser),
    profileErrorPresent: Boolean(profileError),
    userIdProvided: Boolean(userId),
    dataLoading,
    dataErrorPresent: Boolean(dataError),
    hasRecord: Boolean(record),
    breaksCount: breaks.length,
    clockState,
  });

  // ----- フォールバック表示 -----
  // 1. .env 未設定
  if (!configured) {
    return (
      <div className="clock-panel">
        <div className="clock-empty-state">
          <div className="clock-empty-state__icon">⚙</div>
          <h3 className="clock-empty-state__title">Supabase 接続が未設定です</h3>
          <p className="clock-empty-state__msg">
            <code>.env</code> に <code>VITE_SUPABASE_URL</code> と{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> を設定してください。
            <br />
            設定後、開発サーバーを再起動すると勤怠データが表示されます。
          </p>
          <p className="clock-empty-state__sub">
            未設定の間は、ページ上部の「既存の勤怠システムを開く」をご利用ください。
          </p>
        </div>
      </div>
    );
  }

  // 2. 認証読み込み中
  if (authLoading) {
    return (
      <div className="clock-panel">
        <div className="clock-empty-state">
          <p className="clock-empty-state__msg">セッションを確認中…</p>
        </div>
      </div>
    );
  }

  // 3. 未ログイン
  if (!user) {
    return (
      <div className="clock-panel">
        <div className="clock-empty-state">
          <div className="clock-empty-state__icon">🔑</div>
          <h3 className="clock-empty-state__title">ログインが必要です</h3>
          <p className="clock-empty-state__msg">
            勤怠データを表示するには、OfficeHub にログインしてください。
            <br />
            既存システムとは別セッションで管理されています。
          </p>
        </div>
      </div>
    );
  }

  // 3.5. プロフィール取得中
  if (appUserLoading && !appUser && !profileError) {
    return (
      <div className="clock-panel">
        <div className="clock-empty-state">
          <p className="clock-empty-state__msg">プロフィールを確認中…</p>
        </div>
      </div>
    );
  }

  // 4. プロフィール取得エラー (例: users テーブルに行がない / RLS で読めない)
  if (profileError || !appUser) {
    return (
      <div className="clock-panel">
        <div className="clock-empty-state">
          <div className="clock-empty-state__icon">⚠</div>
          <h3 className="clock-empty-state__title">プロフィールを取得できません</h3>
          <p className="clock-empty-state__msg">
            {profileError ??
              'public.users に該当ユーザーが登録されていない可能性があります。'}
          </p>
          <p className="clock-empty-state__sub">
            一時的な通信エラーの場合があります。下のボタンで再取得を試してください。
          </p>
          <div className="clock-empty-state__actions">
            <button
              type="button"
              className="clock-empty-state__btn"
              onClick={() => refetchAppUser()}
            >
              プロフィールを再取得
            </button>
          </div>
          <p className="clock-empty-state__sub">
            それでも解決しない場合は、管理者に <code>auth_user_id</code> の登録状況をご確認ください。
          </p>
        </div>
      </div>
    );
  }

  // ----- 通常表示 -----

  // ボタンの有効/無効 (既存システムのロジックに準拠)
  const canIn = clockState === 'before';
  const canBreakStart = clockState === 'working';
  const canBreakEnd = clockState === 'breaking';
  const canOut = clockState === 'working' || clockState === 'breaking';

  // 表示用: 勤務区分の出し分け
  const showWorkType = clockState === 'before';
  const fixedWorkTypeLabel =
    clockState !== 'before' && record?.work_type
      ? WORK_TYPE_LABEL[(record.work_type as WorkType | 'normal') ?? 'office']
      : null;

  return (
    <div className="clock-panel">
      {/* 成功通知 (打刻保存後) */}
      {notice && (
        <div className="clock-notice clock-notice--ok" role="status">
          <span className="badge badge--ok">完了</span>
          <span className="clock-notice__text">{notice}</span>
          <button
            type="button"
            className="clock-notice__close"
            onClick={() => setNotice(null)}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* ロック警告 (月次締め確定済) */}
      {lockWarning && (
        <div className="clock-error" role="alert">
          <span className="badge badge--danger">🔒 ロック中</span>
          <span>{lockWarning}</span>
          <button
            type="button"
            className="clock-notice__close"
            onClick={() => setLockWarning(null)}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* 保存エラー (打刻保存失敗) */}
      {saveError && (
        <div className="clock-error" role="alert">
          <span className="badge badge--danger">保存失敗</span>
          <span>{saveError}</span>
          <button
            type="button"
            className="clock-notice__close"
            onClick={clearSaveError}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* 通信エラー (読み取り) */}
      {dataError && (
        <div className="clock-error" role="alert">
          <span className="badge badge--danger">読み取りエラー</span>
          <span>{dataError}</span>
        </div>
      )}

      {/* ===== 上段: 状態 + 時刻 ===== */}
      <section className="clock-status">
        <div className="clock-status__main">
          <div className="clock-status__date">{formatDateJa(now)}</div>
          <div className="clock-status__time" aria-live="polite">
            {formatHMS(now)}
          </div>
          <div className="clock-status__state">
            <span
              className="clock-status__dot"
              style={{ background: stateMeta.dotColor }}
              aria-hidden
            />
            <span className={`badge ${stateMeta.badgeClass}`}>{stateMeta.label}</span>
            <span className="clock-status__hint">
              {dataLoading ? '勤怠データを読み込み中…' : stateMeta.hint}
            </span>
            {fixedWorkTypeLabel && (
              <span className="clock-status__worktype">{fixedWorkTypeLabel}</span>
            )}
          </div>
        </div>
      </section>

      {/* ===== 勤務区分 (未出勤時のみ) ===== */}
      {showWorkType && (
        <section className="clock-section">
          <h3 className="clock-section__title">勤務区分</h3>
          <p className="clock-section__hint">出勤前に選択してください</p>
          <div className="clock-worktype" role="radiogroup" aria-label="勤務区分">
            {WORK_TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`clock-worktype__opt ${workType === opt.value ? 'clock-worktype__opt--active' : ''}`}
              >
                <input
                  type="radio"
                  name="worktype"
                  value={opt.value}
                  checked={workType === opt.value}
                  onChange={() => setWorkType(opt.value)}
                  className="clock-worktype__radio"
                />
                <span className="clock-worktype__icon" aria-hidden>
                  {opt.icon}
                </span>
                <span className="clock-worktype__label">{opt.label}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ===== 打刻ボタン ===== */}
      <section className="clock-section">
        <h3 className="clock-section__title">打刻</h3>
        <div className="clock-buttons">
          <button
            type="button"
            className="clock-btn clock-btn--primary"
            onClick={() => handlePunch('in', `出勤打刻 (${WORK_TYPE_LABEL[workType]})`)}
            disabled={!canIn || saving}
          >
            <span className="clock-btn__icon" aria-hidden>
              ▶
            </span>
            <span className="clock-btn__label">{saving && canIn ? '保存中…' : '出勤'}</span>
          </button>

          <button
            type="button"
            className="clock-btn clock-btn--secondary"
            onClick={() => handlePunch('break_start', '休憩開始')}
            disabled={!canBreakStart || saving}
          >
            <span className="clock-btn__icon" aria-hidden>
              ◐
            </span>
            <span className="clock-btn__label">
              {saving && canBreakStart ? '保存中…' : '休憩開始'}
            </span>
          </button>

          <button
            type="button"
            className="clock-btn clock-btn--secondary"
            onClick={() => handlePunch('break_end', '休憩終了')}
            disabled={!canBreakEnd || saving}
          >
            <span className="clock-btn__icon" aria-hidden>
              ◑
            </span>
            <span className="clock-btn__label">
              {saving && canBreakEnd ? '保存中…' : '休憩終了'}
            </span>
          </button>

          <button
            type="button"
            className="clock-btn clock-btn--end"
            onClick={() => handlePunch('out', '退勤打刻')}
            disabled={!canOut || saving}
          >
            <span className="clock-btn__icon" aria-hidden>
              ■
            </span>
            <span className="clock-btn__label">{saving && canOut ? '保存中…' : '退勤'}</span>
          </button>
        </div>
      </section>

      {/* ===== 本日のサマリー ===== */}
      <section className="clock-section">
        <h3 className="clock-section__title">本日の打刻</h3>
        <dl className="clock-summary">
          <div className="clock-summary__item">
            <dt>出勤</dt>
            <dd>{fmtTime(record?.clock_in) ?? '—'}</dd>
          </div>
          <div className="clock-summary__item">
            <dt>退勤</dt>
            <dd>{fmtTime(record?.clock_out) ?? '—'}</dd>
          </div>
          <div className="clock-summary__item">
            <dt>休憩</dt>
            <dd>{fmtBreakDuration(totalBreakMin) ?? '—'}</dd>
          </div>
          <div className="clock-summary__item">
            <dt>実働</dt>
            <dd>
              {clockState === 'working' || clockState === 'breaking'
                ? '勤務中'
                : fmtActualHours(actualH)}
            </dd>
          </div>
        </dl>
      </section>

      {/* ===== 休憩履歴 ===== */}
      <section className="clock-section">
        <h3 className="clock-section__title">休憩履歴</h3>
        {breaks.length === 0 ? (
          <p className="clock-empty">本日の休憩はまだありません</p>
        ) : (
          <ul className="clock-breaks">
            {ongoing && (
              <li className="clock-breaks__item clock-breaks__item--ongoing">
                <span className="clock-breaks__time">
                  {fmtTime(ongoing.break_start)} — 進行中
                </span>
                <span className="badge badge--warn">休憩中</span>
              </li>
            )}
            {completedBreaks.map((b) => (
              <li key={b.id} className="clock-breaks__item">
                <span className="clock-breaks__time">
                  {fmtTime(b.break_start)} — {fmtTime(b.break_end)}
                </span>
                {b.memo && <span className="clock-breaks__memo">{b.memo}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* データ接続状況フッター */}
      <p className="clock-footer">
        {dataConfigured && !dataLoading && !dataError
          ? `${appUser.name} さんの本日の勤怠 (読み取り専用)`
          : ''}
      </p>
    </div>
  );
}
