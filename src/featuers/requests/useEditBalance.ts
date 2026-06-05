import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

/**
 * 残日数編集フック (Phase 3-8)
 * --------------------------------------------------------------
 * 既存システム MasterManagementView.jsx の handleSaveEdit を完全踏襲。
 *
 * 編集対象:
 *   1) users.hire_date (変更があれば UPDATE)
 *   2) leave_balances (UPSERT, onConflict: user_id,fiscal_year)
 *      - granted_days, carryover_days, adjusted_days, note
 *
 * Phase 3-8 では users.hire_date の編集も含める (法定付与計算に必要)。
 * ただし users テーブルへの書き込みは hire_date のみに限定。
 * --------------------------------------------------------------
 */

export type EditBalanceParams = {
  userId: string;
  userName: string;
  fiscalYear: number;
  /** 元の入社日 (変更検出用) */
  originalHireDate: string | null;
  /** 新しい入社日 ('' で null として保存) */
  newHireDate: string;
  /** 新しい残日数 */
  grantedDays: number;
  carryoverDays: number;
  adjustedDays: number;
  note: string;
  /** 元の有休管理対象フラグ (変更検出用) */
  originalHasLeaveManagement: boolean;
  /** 新しい有休管理対象フラグ */
  newHasLeaveManagement: boolean;
};

export type EditBalanceResult = {
  ok: boolean;
  error: string | null;
};

export type UseEditBalanceState = {
  saving: boolean;
  lastError: string | null;
  save: (params: EditBalanceParams) => Promise<EditBalanceResult>;
  clearError: () => void;
};

export function useEditBalance(): UseEditBalanceState {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const clearError = useCallback(() => setLastError(null), []);

  const save = useCallback(
    async (params: EditBalanceParams): Promise<EditBalanceResult> => {
      if (savingRef.current) {
        return { ok: false, error: null };
      }
      savingRef.current = true;
      setSaving(true);
      setLastError(null);

      try {
        const supabase = getSupabase();
        if (!supabase) {
          const msg = 'Supabase が未設定です';
          setLastError(msg);
          return { ok: false, error: msg };
        }

        const nowISO = new Date().toISOString();
        const origHire = (params.originalHireDate ?? '').slice(0, 10);
        const newHire = (params.newHireDate ?? '').slice(0, 10);
        const hireChanged = newHire !== origHire;
        const hlmChanged =
          params.newHasLeaveManagement !== params.originalHasLeaveManagement;

        // ── ① users を更新 (hire_date / has_leave_management の変更があれば) ─────
        if (hireChanged || hlmChanged) {
          logger.log('[OfficeHub:leave-admin:edit] update users', {
            userId: params.userId,
            hireChanged,
            origHire: hireChanged ? origHire : undefined,
            newHire: hireChanged ? newHire : undefined,
            hlmChanged,
            newHasLeaveManagement: hlmChanged
              ? params.newHasLeaveManagement
              : undefined,
          });

          // payload は変更されたカラムだけ含める
          const userPayload: Record<string, unknown> = { updated_at: nowISO };
          if (hireChanged) {
            userPayload.hire_date = newHire || null;
          }
          if (hlmChanged) {
            userPayload.has_leave_management = params.newHasLeaveManagement;
          }

          type UserUpdRes = {
            error: { message: string; code?: string } | null;
          };
          const userResult = await withTimeout<UserUpdRes>(
            supabase
              .from('users')
              .update(userPayload)
              .eq('id', params.userId) as unknown as Promise<UserUpdRes>,
            15000,
            'UPDATE users (hire_date / has_leave_management)'
          ).catch(
            (e): UserUpdRes => ({
              error: { message: e instanceof Error ? e.message : String(e) },
            })
          );

          if (userResult.error) {
            const msg = `ユーザー情報の保存に失敗しました: ${userResult.error.message} (code: ${userResult.error.code ?? '—'})`;
            setLastError(msg);
            return { ok: false, error: msg };
          }
        }

        // ── ② leave_balances を UPSERT ────────────────
        const balancePayload = {
          user_id: params.userId,
          fiscal_year: params.fiscalYear,
          granted_days: params.grantedDays,
          carryover_days: params.carryoverDays,
          adjusted_days: params.adjustedDays,
          note: params.note.trim() || null,
          updated_at: nowISO,
        };
        logger.log('[OfficeHub:leave-admin:edit] upsert leave_balances', {
          userId: params.userId,
          fiscalYear: params.fiscalYear,
          granted_days: params.grantedDays,
          carryover_days: params.carryoverDays,
          adjusted_days: params.adjustedDays,
        });

        type UpsRes = {
          data: unknown[] | null;
          error: { message: string; code?: string } | null;
        };
        const upsResult = await withTimeout<UpsRes>(
          supabase
            .from('leave_balances')
            .upsert(balancePayload, {
              onConflict: 'user_id,fiscal_year',
            })
            .select() as unknown as Promise<UpsRes>,
          15000,
          'UPSERT leave_balances (edit)'
        ).catch(
          (e): UpsRes => ({
            data: null,
            error: { message: e instanceof Error ? e.message : String(e) },
          })
        );

        if (upsResult.error) {
          const msg = `保存失敗: ${upsResult.error.message} (code: ${upsResult.error.code ?? '—'})`;
          setLastError(msg);
          return { ok: false, error: msg };
        }
        if (!upsResult.data || upsResult.data.length === 0) {
          const msg = '保存失敗: RLSポリシーを確認してください';
          setLastError(msg);
          return { ok: false, error: msg };
        }

        return { ok: true, error: null };
      } finally {
        savingRef.current = false;
        setSaving(false);
        logger.log('[OfficeHub:leave-admin:edit] finally -> saving=false');
      }
    },
    []
  );

  return { saving, lastError, save, clearError };
}
