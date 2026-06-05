import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import type { AttendanceBreak, AttendanceRecord } from './types';
import { todayStr } from './utils';
import { logger } from '../../lib/logger';

/**
 * 今日の勤怠データを取得するフック (読み取り専用)
 * --------------------------------------------------------------
 * 既存システム timetrack-app-clean の AttendanceClock.jsx 内
 * fetchAttendance / fetchBreaks と同等のクエリを使う。
 *
 * - userId は public.users.id (auth_user_id ではない)
 * - INSERT / UPDATE / DELETE は一切行わない
 * - userId が未指定 (未ログイン等) の場合は loading=false で空状態
 * - 診断ログを Console に出して原因切り分け可能
 * --------------------------------------------------------------
 */

export type TodaysAttendanceState = {
  record: AttendanceRecord | null;
  breaks: AttendanceBreak[];
  loading: boolean;
  error: string | null;
  /** 接続未設定 (.env 未設定 or 非ログイン) */
  configured: boolean;
  /** 手動再取得 */
  reload: () => void;
};

export function useTodaysAttendance(userId: string | null | undefined): TodaysAttendanceState {
  // getSupabase() はモジュール内シングルトン。毎レンダリングで呼んでも同じインスタンス。
  const supabase = getSupabase();

  // userId は null/空文字も「未指定」とみなす
  const effectiveUserId = userId && userId.length > 0 ? userId : null;
  const configured = Boolean(supabase) && Boolean(effectiveUserId);

  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [breaks, setBreaks] = useState<AttendanceBreak[]>([]);
  // 初期値: 未設定/未ログインなら false (即「未出勤」状態として確定させる)
  //          設定済みなら true (取得完了まで読み込み中)
  const [loading, setLoading] = useState<boolean>(() => configured);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    // 未設定/未ログインのケース: 即座に loading=false にして抜ける
    if (!supabase || !effectiveUserId) {
      logger.log('[OfficeHub:kintai] fetch skipped', {
        reason: !supabase ? 'no-supabase' : 'no-userId',
        hasSupabase: Boolean(supabase),
        hasUserId: Boolean(effectiveUserId),
      });
      setRecord(null);
      setBreaks([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const today = todayStr();
    logger.log('[OfficeHub:kintai] fetch start', {
      userIdLength: effectiveUserId.length,
      date: today,
      reloadKey,
    });

    (async () => {
      const startedAt = Date.now();
      try {
        type RecRes = { data: AttendanceRecord | null; error: { message: string; code?: string } | null };
        type BrkRes = { data: AttendanceBreak[] | null; error: { message: string; code?: string } | null };
        const toErr = (e: unknown) => ({
          message: e instanceof Error ? e.message : String(e),
        });
        const recP = withTimeout<RecRes>(
          supabase
            .from('attendance_records')
            .select('*')
            .eq('user_id', effectiveUserId)
            .eq('date', today)
            .maybeSingle() as unknown as Promise<RecRes>,
          10000,
          'SELECT attendance_records (today)'
        ).catch((e): RecRes => ({ data: null, error: toErr(e) }));
        const brkP = withTimeout<BrkRes>(
          supabase
            .from('attendance_breaks')
            .select('*')
            .eq('user_id', effectiveUserId)
            .eq('date', today)
            .order('break_start', { ascending: true }) as unknown as Promise<BrkRes>,
          10000,
          'SELECT attendance_breaks (today)'
        ).catch((e): BrkRes => ({ data: null, error: toErr(e) }));

        const [recRes, brkRes] = await Promise.all([recP, brkP]);

        const elapsedMs = Date.now() - startedAt;

        if (!active) {
          logger.log('[OfficeHub:kintai] fetch result ignored (unmounted)', { elapsedMs });
          return;
        }

        // 診断ログ (件数のみ、データ本体は出さない)
        logger.log('[OfficeHub:kintai] fetch done', {
          elapsedMs,
          recordError: recRes.error?.message ?? null,
          recordErrorCode: recRes.error?.code ?? null,
          recordFound: Boolean(recRes.data),
          breaksError: brkRes.error?.message ?? null,
          breaksErrorCode: brkRes.error?.code ?? null,
          breaksCount: brkRes.data?.length ?? 0,
        });

        if (recRes.error) {
          setError(
            `勤怠取得失敗 (code: ${recRes.error.code ?? '—'}): ${recRes.error.message}`
          );
          setRecord(null);
          setBreaks([]);
        } else if (brkRes.error) {
          setError(
            `休憩取得失敗 (code: ${brkRes.error.code ?? '—'}): ${brkRes.error.message}`
          );
          setRecord((recRes.data as AttendanceRecord | null) ?? null);
          setBreaks([]);
        } else {
          setRecord((recRes.data as AttendanceRecord | null) ?? null);
          setBreaks((brkRes.data as AttendanceBreak[] | null) ?? []);
          setError(null);
        }
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('[OfficeHub:kintai] fetch threw', { errorMessage: msg });
        setError(`通信エラー: ${msg}`);
        setRecord(null);
        setBreaks([]);
      } finally {
        // ★ active チェックなしで必ず loading を false にする。
        //    React 18 では unmount 後の setState は no-op で安全。
        //    こうしないと reloadKey 変更 → クリーンアップ → 新規実行直前で何かあった
        //    場合に永遠に loading=true のままになる。
        setLoading(false);
        logger.log('[OfficeHub:kintai] fetch finally -> loading=false');
      }
    })();

    // ★ 安全網: 10秒経っても loading が下りなければ強制で false に。
    //    ネットワーク詰まり等での「読み込み中…のまま固まる」を防ぐ。
    const safetyTimer = window.setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          logger.warn('[OfficeHub:kintai] safety timeout fired — forcing loading=false');
        }
        return false;
      });
    }, 10000);

    return () => {
      active = false;
      window.clearTimeout(safetyTimer);
    };
    // supabase はモジュールシングルトンなので依存に含めない (毎レンダリング同一)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, reloadKey]);

  return { record, breaks, loading, error, configured, reload };
}
