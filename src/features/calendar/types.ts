/**
 * Googleカレンダーの予定
 * --------------------------------------------------------------
 * Supabase Edge Function (google-calendar-events) を経由して
 * ログインユーザーの Google カレンダーから今日の予定を取得する。
 * 未連携の場合は connected:false が返り、空配列を表示する。
 * --------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

export type CalendarEvent = {
  id: string;
  title: string;
  /** 開始時刻 ISO8601 文字列 (例: "2026-05-18T09:00:00+09:00") */
  startISO: string | null;
  /** 終了時刻 ISO8601 文字列 */
  endISO: string | null;
  /** 表示用 'HH:mm' */
  startTime: string;
  /** 表示用 'HH:mm' */
  endTime: string;
  location?: string;
  allDay?: boolean;
  /** Google カレンダーの colorId (1〜11)。未設定なら null */
  colorId: string | null;
  /** Googleカレンダーで開くリンク */
  htmlLink?: string | null;
};

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
  google_email?: string;
  events?: EdgeEvent[];
  error?: string;
};

function formatHHmm(iso: string | null | undefined): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export async function loadTodaysEvents(): Promise<CalendarEvent[]> {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      logger.log('loadTodaysEvents: supabase not initialized');
      return [];
    }

    const { data: sessionData, error: sessionErr } =
      await supabase.auth.getSession();
    if (sessionErr) {
      logger.log('loadTodaysEvents: getSession error', sessionErr.message);
      return [];
    }
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      logger.log('loadTodaysEvents: no access token');
      return [];
    }

    const { data, error } = await withTimeout(
      supabase.functions.invoke<EdgeResponse>('google-calendar-events', {
        body: {},
      }),
      15000,
      'google-calendar-events invoke'
    );

    if (error) {
      logger.log('loadTodaysEvents: invoke error', error.message);
      return [];
    }
    if (!data) {
      return [];
    }
    if (!data.connected) {
      return [];
    }

    const events = (data.events ?? []).map<CalendarEvent>((e) => ({
      id: e.id ?? crypto.randomUUID(),
      title: e.summary ?? '(タイトルなし)',
      startISO: e.start ?? null,
      endISO: e.end ?? null,
      startTime: e.allDay ? '' : formatHHmm(e.start),
      endTime: e.allDay ? '' : formatHHmm(e.end),
      allDay: !!e.allDay,
      location: e.location ?? undefined,
      colorId: e.colorId ?? null,
      htmlLink: e.htmlLink ?? null,
    }));
    return events;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.log('loadTodaysEvents fatal:', msg);
    return [];
  }
}

export function useTodaysEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await loadTodaysEvents();
      if (!cancelled) {
        setEvents(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { events, loading };
}
