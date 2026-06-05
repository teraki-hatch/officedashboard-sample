/**
 * 工数モーダル右側の Googleカレンダー連携パネル
 * --------------------------------------------------------------
 * - 指定日 (ds) の Google カレンダー予定を Edge Function から取得
 * - 各予定のカードに「入力欄へ」ボタンを表示
 * - 既に同日内で同じ event_id が登録済みなら「登録済」バッジを表示
 * --------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { TimeEntry } from './types';
import './GoogleCalendarPanel.css';

type EdgeEvent = {
  id?: string;
  summary?: string;
  start?: string | null;
  end?: string | null;
  allDay?: boolean;
  htmlLink?: string | null;
  location?: string | null;
  description?: string | null;
  colorId?: string | null;
};

type EdgeResponse = {
  connected: boolean;
  google_email?: string | null;
  events?: EdgeEvent[];
  error?: string;
};

export type GcalEvent = {
  id: string;
  title: string;
  startISO: string | null;
  endISO: string | null;
  /** 'HH:mm' (allDayなら空) */
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string | null;
  colorId: string | null;
  /** 所要時間 (h) */
  hours: number;
};

/** colorId 1-11 を背景色にマップ。未指定は As Partner グリーン */
const COLOR_MAP: Record<string, string> = {
  '1': '#a4bdfc', // ラベンダー
  '2': '#7ae7bf', // セージ
  '3': '#dbadff', // グレープ
  '4': '#ff887c', // フラミンゴ
  '5': '#fbd75b', // バナナ
  '6': '#ffb878', // ミカン
  '7': '#46d6db', // ピーコック
  '8': '#e1e1e1', // グラファイト
  '9': '#5484ed', // ブルーベリー
  '10': '#51b749', // バジル
  '11': '#dc2127', // トマト
};
const DEFAULT_COLOR = '#7b9e6e';

function formatHHmm(iso: string | null | undefined): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 所要時間 (h) を計算。allDayや時刻不明は0 */
function calcHours(startISO: string | null, endISO: string | null): number {
  if (!startISO || !endISO) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(startISO)) return 0;
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  const diffMs = e.getTime() - s.getTime();
  if (diffMs <= 0) return 0;
  // 0.25h単位で丸める (15分刻み)
  const hours = diffMs / (1000 * 60 * 60);
  return Math.round(hours * 4) / 4;
}

export type FillFromGcalArgs = {
  title: string;
  hours: number;
  eventId: string;
};

export type GoogleCalendarPanelProps = {
  /** "YYYY-MM-DD" */
  ds: string;
  /** その日の既存エントリ (登録済バッジ判定用) */
  dayEntries: TimeEntry[];
  /** 「入力欄へ」ボタン押下時に親に通知 */
  onFillForm: (args: FillFromGcalArgs) => void;
};

export function GoogleCalendarPanel({
  ds,
  dayEntries,
  onFillForm,
}: GoogleCalendarPanelProps) {
  const [events, setEvents] = useState<GcalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean>(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 既に登録済みの event_id を Set 化
  const registeredIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of dayEntries) {
      if (e.google_calendar_event_id) s.add(e.google_calendar_event_id);
    }
    return s;
  }, [dayEntries]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrMsg(null);

    (async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) {
          if (!cancelled) {
            setErrMsg('Supabase が未設定です');
            setLoading(false);
          }
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.access_token) {
          if (!cancelled) {
            setConnected(false);
            setEvents([]);
            setLoading(false);
          }
          return;
        }

        logger.log('[OfficeHub:kousu:gcal] fetch start', { ds });

        const { data, error } = await withTimeout(
          supabase.functions.invoke<EdgeResponse>('google-calendar-events', {
            body: { date: ds },
          }),
          15000,
          'google-calendar-events (modal)'
        );

        if (cancelled) return;

        if (error) {
          setErrMsg(`カレンダー取得失敗: ${error.message}`);
          setEvents([]);
          setLoading(false);
          return;
        }
        if (!data) {
          setEvents([]);
          setLoading(false);
          return;
        }
        if (!data.connected) {
          setConnected(false);
          setEvents([]);
          setLoading(false);
          return;
        }

        setConnected(true);
        const list = (data.events ?? []).map<GcalEvent>((e) => {
          const startISO = e.start ?? null;
          const endISO = e.end ?? null;
          return {
            id: e.id ?? '',
            title: e.summary ?? '(タイトルなし)',
            startISO,
            endISO,
            startTime: e.allDay ? '' : formatHHmm(startISO),
            endTime: e.allDay ? '' : formatHHmm(endISO),
            allDay: !!e.allDay,
            location: e.location ?? null,
            htmlLink: e.htmlLink ?? null,
            colorId: e.colorId ?? null,
            hours: e.allDay ? 0 : calcHours(startISO, endISO),
          };
        });
        logger.log('[OfficeHub:kousu:gcal] loaded', { count: list.length });
        setEvents(list);
        setLoading(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) {
          setErrMsg(msg);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ds]);

  return (
    <aside className="gcal-panel" aria-label="Googleカレンダー連携">
      <header className="gcal-panel__header">
        <h4 className="gcal-panel__title">
          <span className="gcal-panel__icon" aria-hidden>📅</span>
          Googleカレンダーの予定
        </h4>
      </header>

      <div className="gcal-panel__body">
        {loading ? (
          <div className="gcal-panel__loading">読み込み中…</div>
        ) : !connected ? (
          <div className="gcal-panel__empty">
            <p>Googleカレンダー未連携です。</p>
            <p className="gcal-panel__hint">設定画面から連携できます。</p>
          </div>
        ) : errMsg ? (
          <div className="gcal-panel__error">{errMsg}</div>
        ) : events.length === 0 ? (
          <div className="gcal-panel__empty">
            <p>この日の予定はありません。</p>
          </div>
        ) : (
          <ul className="gcal-panel__list">
            {events.map((ev) => {
              const bg = ev.colorId ? COLOR_MAP[ev.colorId] ?? DEFAULT_COLOR : DEFAULT_COLOR;
              const isRegistered = ev.id ? registeredIds.has(ev.id) : false;
              return (
                <li
                  key={ev.id}
                  className={`gcal-panel__item ${
                    isRegistered ? 'gcal-panel__item--registered' : ''
                  }`}
                >
                  <div
                    className="gcal-panel__item-bar"
                    style={{ background: bg }}
                    aria-hidden
                  />
                  <div className="gcal-panel__item-main">
                    <div className="gcal-panel__item-time">
                      {ev.allDay ? (
                        <span className="gcal-panel__allday">終日</span>
                      ) : (
                        <>
                          <span className="gcal-panel__time">{ev.startTime}</span>
                          <span className="gcal-panel__time-sep">〜</span>
                          <span className="gcal-panel__time">{ev.endTime}</span>
                          {ev.hours > 0 && (
                            <span className="gcal-panel__duration">
                              ({ev.hours}h)
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="gcal-panel__item-title">{ev.title}</div>
                    {ev.location && (
                      <div className="gcal-panel__item-location">
                        📍 {ev.location}
                      </div>
                    )}
                  </div>
                  <div className="gcal-panel__item-actions">
                    {isRegistered ? (
                      <span className="gcal-panel__badge gcal-panel__badge--registered">
                        ✓ 登録済
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="gcal-panel__btn"
                        onClick={() =>
                          onFillForm({
                            title: ev.title,
                            hours: ev.hours,
                            eventId: ev.id,
                          })
                        }
                        disabled={!ev.id}
                      >
                        入力欄へ →
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
