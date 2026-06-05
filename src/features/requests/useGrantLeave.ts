import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import type { LeaveBalance } from './types';
import { logger } from '../../lib/logger';

/**
 * 自動付与フック (Phase 3-8)
 * --------------------------------------------------------------
 * 既存システム MasterManagementView.jsx の handleGrant を完全踏襲。
 *
 * ◆ STEP 1: leave_grants へ INSERT
 *   - 二重付与チェック (DB 側 unique 制約 + フロント側で事前検証)
 *   - payload: { user_id, grant_date, fiscal_year, granted_days,
 *                grant_type: 'annual', note, created_at, updated_at }
 *
 * ◆ STEP 2: leave_balances を UPSERT (granted_days に加算)
 *   - 既存レコードがあれば granted_days += grantDays
 *   - なければ新規作成
 *   - onConflict: 'user_id,fiscal_year'
 *
 * STEP 1 が失敗したら STEP 2 はスキップ。
 * STEP 1 成功・STEP 2 失敗の場合は警告のみ (STEP 1 は記録済み)。
 * --------------------------------------------------------------
 */

export type GrantParams = {
  userId: string;
  userName: string;
  /** "YYYY-MM-DD" */
  grantDate: string;
  grantDays: number;
  yearsOfService: number;
  fiscalYear: number;
  /** 同年度の既存 balance (なければ undefined) */
  existingBalance?: LeaveBalance;
};

export type GrantResult = {
  ok: boolean;
  error: string | null;
  /** STEP 1 (leave_grants insert) が成功したか */
  grantInserted: boolean;
  /** STEP 2 (leave_balances upsert) が成功したか */
  balanceUpdated: boolean;
};

export type UseGrantState = {
  /** 処理中のユーザー id */
  grantingUserId: string | null;
  lastError: string | null;
  lastSuccess: string | null;
  grant: (params: GrantParams) => Promise<GrantResult>;
  clearMessages: () => void;
};

export function useGrantLeave(): UseGrantState {
  const [grantingUserId, setGrantingUserId] = useState<string | null>(null);
  const grantingRef = useRef<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setLastError(null);
    setLastSuccess(null);
  }, []);

  const grant = useCallback(
    async (params: GrantParams): Promise<GrantResult> => {
      // 多重実行防止
      if (grantingRef.current) {
        return {
          ok: false,
          error: null,
          grantInserted: false,
          balanceUpdated: false,
        };
      }
      grantingRef.current = params.userId;
      setGrantingUserId(params.userId);
      setLastError(null);
      setLastSuccess(null);

      try {
        const supabase = getSupabase();
        if (!supabase) {
          const msg = 'Supabase が未設定です';
          setLastError(msg);
          return {
            ok: false,
            error: msg,
            grantInserted: false,
            balanceUpdated: false,
          };
        }

        const nowISO = new Date().toISOString();

        // ── STEP 1: leave_grants へ INSERT ─────────────
        const grantPayload = {
          user_id: params.userId,
          grant_date: params.grantDate,
          fiscal_year: params.fiscalYear,
          granted_days: params.grantDays,
          grant_type: 'annual' as const,
          note: `年次有給付与 勤続${params.yearsOfService}年`,
          created_at: nowISO,
          updated_at: nowISO,
        };
        logger.log('[OfficeHub:leave-admin:grant] STEP1 start', {
          userId: params.userId,
          grantDate: params.grantDate,
          grantDays: params.grantDays,
        });

        type InsRes = {
          error: { message: string; code?: string } | null;
        };
        const insResult = await withTimeout<InsRes>(
          supabase
            .from('leave_grants')
            .insert(grantPayload) as unknown as Promise<InsRes>,
          15000,
          'INSERT leave_grants'
        ).catch(
          (e): InsRes => ({
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );
        logger.log('[OfficeHub:leave-admin:grant] STEP1 done', {
          errorCode: insResult.error?.code ?? null,
          errorMessage: insResult.error?.message ?? null,
        });

        if (insResult.error) {
          const code = insResult.error.code;
          let msg: string;
          if (code === '23505') {
            msg = `${params.userName}: この付与日 (${params.grantDate}) は既に付与済みです`;
          } else if (code === '42501') {
            msg = `付与履歴の保存に失敗しました (RLSポリシーエラー)。Supabaseで leave_grants テーブルの INSERT ポリシーを確認してください。code: ${code}`;
          } else {
            msg = `付与履歴の保存に失敗しました: ${insResult.error.message} (code: ${code ?? '—'})`;
          }
          setLastError(msg);
          return {
            ok: false,
            error: msg,
            grantInserted: false,
            balanceUpdated: false,
          };
        }

        // ── STEP 2: leave_balances を UPSERT ────────────
        const bal = params.existingBalance;
        const newGranted = +((bal?.granted_days ?? 0) + params.grantDays).toFixed(1);
        const balancePayload = {
          user_id: params.userId,
          fiscal_year: params.fiscalYear,
          granted_days: newGranted,
          carryover_days: bal?.carryover_days ?? 0,
          adjusted_days: bal?.adjusted_days ?? 0,
          note: bal?.note ?? null,
          updated_at: nowISO,
        };
        logger.log('[OfficeHub:leave-admin:grant] STEP2 start', {
          userId: params.userId,
          fiscalYear: params.fiscalYear,
          newGranted,
        });

        type UpsRes = {
          error: { message: string; code?: string } | null;
        };
        const upsResult = await withTimeout<UpsRes>(
          supabase
            .from('leave_balances')
            .upsert(balancePayload, {
              onConflict: 'user_id,fiscal_year',
            }) as unknown as Promise<UpsRes>,
          15000,
          'UPSERT leave_balances'
        ).catch(
          (e): UpsRes => ({
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );
        logger.log('[OfficeHub:leave-admin:grant] STEP2 done', {
          errorCode: upsResult.error?.code ?? null,
          errorMessage: upsResult.error?.message ?? null,
        });

        if (upsResult.error) {
          const code = upsResult.error.code;
          let msg: string;
          if (code === '42501') {
            msg = `付与履歴は記録しましたが、残日数の更新に失敗しました (RLSエラー)。手動で leave_balances を更新してください。code: ${code}`;
          } else {
            msg = `残日数の更新に失敗しました: ${upsResult.error.message} (code: ${code ?? '—'})`;
          }
          setLastError(msg);
          return {
            ok: true, // STEP 1 は成功している
            error: msg,
            grantInserted: true,
            balanceUpdated: false,
          };
        }

        // ── 完了 ───────────────────────────────
        const successMsg = `✅ ${params.userName} に ${params.grantDays}日を付与しました (付与日: ${params.grantDate})`;
        setLastSuccess(successMsg);
        return {
          ok: true,
          error: null,
          grantInserted: true,
          balanceUpdated: true,
        };
      } finally {
        grantingRef.current = null;
        setGrantingUserId(null);
        logger.log('[OfficeHub:leave-admin:grant] finally -> grantingUserId=null');
      }
    },
    []
  );

  return { grantingUserId, lastError, lastSuccess, grant, clearMessages };
}
