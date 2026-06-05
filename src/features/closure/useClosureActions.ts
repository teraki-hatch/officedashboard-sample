import { useCallback, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import type { ClosureAction } from './types';

/**
 * 月次勤怠締めのアクション (提出 / 確定 / 差戻し / ロック解除)
 * --------------------------------------------------------------
 * - 提出 (submit): 本人または管理者代行 → status='submitted'
 * - 確定 (confirm): 管理者のみ → status='confirmed'
 * - 差戻し (reject): 管理者のみ → 行を削除 (未提出に戻す)
 * - 解除 (unlock): 管理者のみ → 行を削除
 * 全アクションは monthly_closure_logs に履歴を残す
 * --------------------------------------------------------------
 */

export type ActionResult = {
  ok: boolean;
  error: string | null;
};

export type UseClosureActionsState = {
  processing: boolean;
  lastError: string | null;
  submit: (params: SubmitParams) => Promise<ActionResult>;
  confirm: (params: ConfirmParams) => Promise<ActionResult>;
  reject: (params: RejectParams) => Promise<ActionResult>;
  unlock: (params: UnlockParams) => Promise<ActionResult>;
  clearError: () => void;
};

type SubmitParams = {
  userId: string;
  yearMonth: string;
  actorId: string; // 操作者 (通常 userId と同じ。管理者代行なら違う)
  note?: string;
};
type ConfirmParams = {
  userId: string;
  yearMonth: string;
  actorId: string; // 管理者
  note?: string;
};
type RejectParams = {
  userId: string;
  yearMonth: string;
  actorId: string;
  comment?: string;
};
type UnlockParams = {
  userId: string;
  yearMonth: string;
  actorId: string;
  comment?: string;
};

type SbErr = { message: string; code?: string; details?: string; hint?: string } | null;

function fmtErr(err: SbErr, prefix: string): string {
  if (!err) return `${prefix}: 不明なエラー`;
  const parts: string[] = [err.message];
  if (err.code) parts.push(`code=${err.code}`);
  if (err.details) parts.push(`details=${err.details}`);
  if (err.hint) parts.push(`hint=${err.hint}`);
  return `${prefix}: ${parts.join(' | ')}`;
}

async function writeLog(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string,
  yearMonth: string,
  action: ClosureAction,
  actorId: string,
  comment?: string
): Promise<void> {
  // ログ書き込み失敗はメイン処理を止めない (警告のみ)
  try {
    const r = await withTimeout<{ error: SbErr }>(
      supabase.from('monthly_closure_logs').insert({
        user_id: userId,
        year_month: yearMonth,
        action,
        actor_id: actorId,
        comment: comment ?? null,
      }) as unknown as Promise<{ error: SbErr }>,
      8000,
      `INSERT monthly_closure_logs (${action})`
    );
    if (r.error) {
      logger.warn('[OfficeHub:closure:action] log write failed', r.error);
    }
  } catch (e) {
    logger.warn('[OfficeHub:closure:action] log write threw', e);
  }
}

export function useClosureActions(): UseClosureActionsState {
  const [processing, setProcessing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = useCallback(() => setLastError(null), []);

  // 提出: UPSERT で status='submitted'
  const submit = useCallback(async (p: SubmitParams): Promise<ActionResult> => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: 'Supabase が未設定です' };
    setProcessing(true);
    setLastError(null);

    const nowISO = new Date().toISOString();
    logger.log('[OfficeHub:closure:action] submit start', p);

    try {
      const r = await withTimeout<{ error: SbErr }>(
        supabase
          .from('monthly_closures')
          .upsert(
            {
              user_id: p.userId,
              year_month: p.yearMonth,
              status: 'submitted',
              submitted_at: nowISO,
              submitted_by: p.actorId,
              // 提出時に確定情報は明示的にクリア (差戻し→再提出シナリオ)
              confirmed_at: null,
              confirmed_by: null,
              note: p.note ?? null,
              updated_at: nowISO,
            },
            { onConflict: 'user_id,year_month' }
          ) as unknown as Promise<{ error: SbErr }>,
        15000,
        'UPSERT monthly_closures (submit)'
      );

      if (r.error) {
        const msg = fmtErr(r.error, '提出失敗');
        setLastError(msg);
        return { ok: false, error: msg };
      }

      await writeLog(supabase, p.userId, p.yearMonth, 'submitted', p.actorId, p.note);
      return { ok: true, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(`提出時に通信エラー: ${msg}`);
      return { ok: false, error: msg };
    } finally {
      setProcessing(false);
    }
  }, []);

  // 確定: 既存行を UPDATE で status='confirmed'
  const confirm = useCallback(async (p: ConfirmParams): Promise<ActionResult> => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: 'Supabase が未設定です' };
    setProcessing(true);
    setLastError(null);

    const nowISO = new Date().toISOString();
    logger.log('[OfficeHub:closure:action] confirm start', p);

    try {
      type Res = { data: unknown[] | null; error: SbErr };
      const r = await withTimeout<Res>(
        supabase
          .from('monthly_closures')
          .update({
            status: 'confirmed',
            confirmed_at: nowISO,
            confirmed_by: p.actorId,
            updated_at: nowISO,
          })
          .eq('user_id', p.userId)
          .eq('year_month', p.yearMonth)
          .select() as unknown as Promise<Res>,
        15000,
        'UPDATE monthly_closures (confirm)'
      );

      if (r.error) {
        const msg = fmtErr(r.error, '確定失敗');
        setLastError(msg);
        return { ok: false, error: msg };
      }
      if (!r.data || r.data.length === 0) {
        const msg = '確定失敗: 対象の行が見つかりません (提出されていない可能性があります)';
        setLastError(msg);
        return { ok: false, error: msg };
      }

      await writeLog(supabase, p.userId, p.yearMonth, 'confirmed', p.actorId, p.note);
      return { ok: true, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(`確定時に通信エラー: ${msg}`);
      return { ok: false, error: msg };
    } finally {
      setProcessing(false);
    }
  }, []);

  // 差戻し: 行を削除 + ログ
  const reject = useCallback(async (p: RejectParams): Promise<ActionResult> => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: 'Supabase が未設定です' };
    setProcessing(true);
    setLastError(null);

    logger.log('[OfficeHub:closure:action] reject start', p);

    try {
      const r = await withTimeout<{ error: SbErr }>(
        supabase
          .from('monthly_closures')
          .delete()
          .eq('user_id', p.userId)
          .eq('year_month', p.yearMonth) as unknown as Promise<{ error: SbErr }>,
        15000,
        'DELETE monthly_closures (reject)'
      );

      if (r.error) {
        const msg = fmtErr(r.error, '差戻し失敗');
        setLastError(msg);
        return { ok: false, error: msg };
      }

      await writeLog(supabase, p.userId, p.yearMonth, 'rejected', p.actorId, p.comment);
      return { ok: true, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(`差戻し時に通信エラー: ${msg}`);
      return { ok: false, error: msg };
    } finally {
      setProcessing(false);
    }
  }, []);

  // ロック解除: 行を削除 + ログ
  const unlock = useCallback(async (p: UnlockParams): Promise<ActionResult> => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: 'Supabase が未設定です' };
    setProcessing(true);
    setLastError(null);

    logger.log('[OfficeHub:closure:action] unlock start', p);

    try {
      const r = await withTimeout<{ error: SbErr }>(
        supabase
          .from('monthly_closures')
          .delete()
          .eq('user_id', p.userId)
          .eq('year_month', p.yearMonth) as unknown as Promise<{ error: SbErr }>,
        15000,
        'DELETE monthly_closures (unlock)'
      );

      if (r.error) {
        const msg = fmtErr(r.error, 'ロック解除失敗');
        setLastError(msg);
        return { ok: false, error: msg };
      }

      await writeLog(supabase, p.userId, p.yearMonth, 'unlocked', p.actorId, p.comment);
      return { ok: true, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(`ロック解除時に通信エラー: ${msg}`);
      return { ok: false, error: msg };
    } finally {
      setProcessing(false);
    }
  }, []);

  return { processing, lastError, submit, confirm, reject, unlock, clearError };
}
