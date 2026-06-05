import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';

/**
 * 月次締めロック判定ヘルパー
 * --------------------------------------------------------------
 * 指定ユーザー・指定日 (YYYY-MM-DD) の月が
 * monthly_closures で confirmed (確定済) になっているかを返す。
 *
 * - 確定済 → ロック中 (打刻・修正申請・承認・休暇申請を拒否)
 * - submitted / なし → 書き込み可
 *
 * Supabase 未設定や通信エラー時は安全側で {locked:false} を返し、
 * 警告メッセージのみ logger に出す。
 * (ロックは「あれば書き込みを止める」設計なので、判定不能で
 *  ブロックすると業務停止するため)
 * --------------------------------------------------------------
 */

export type LockCheckResult = {
  /** 確定済でロックされている */
  locked: boolean;
  /** ロック中のときの表示用メッセージ */
  message: string | null;
};

const dateToYearMonth = (date: string): string => {
  // 'YYYY-MM-DD' → 'YYYY-MM'
  if (!date || date.length < 7) return '';
  return date.slice(0, 7);
};

/**
 * 指定ユーザー・指定日 (YYYY-MM-DD) の月がロック (confirmed) かを返す
 */
export async function checkMonthLocked(
  userId: string,
  date: string
): Promise<LockCheckResult> {
  const yearMonth = dateToYearMonth(date);
  if (!yearMonth || !userId) {
    return { locked: false, message: null };
  }

  const supabase = getSupabase();
  if (!supabase) {
    logger.log('[OfficeHub:closure:check] supabase not configured');
    return { locked: false, message: null };
  }

  try {
    type Res = {
      data: { status: string } | null;
      error: { message: string } | null;
    };
    const r = await withTimeout<Res>(
      supabase
        .from('monthly_closures')
        .select('status')
        .eq('user_id', userId)
        .eq('year_month', yearMonth)
        .maybeSingle() as unknown as Promise<Res>,
      8000,
      'SELECT monthly_closures (lock check)'
    );

    if (r.error) {
      logger.log('[OfficeHub:closure:check] error', r.error);
      return { locked: false, message: null };
    }

    if (r.data?.status === 'confirmed') {
      const [y, m] = yearMonth.split('-');
      const ym = `${Number(y)}年${Number(m)}月`;
      return {
        locked: true,
        message: `${ym} は確定済のため変更できません。ロック解除は管理者にご依頼ください。`,
      };
    }
    return { locked: false, message: null };
  } catch (e) {
    logger.log('[OfficeHub:closure:check] threw', {
      msg: e instanceof Error ? e.message : String(e),
    });
    return { locked: false, message: null };
  }
}

/**
 * 同期版: 既にフロント側で取得済みの closure 情報からロック判定する
 * (画面上のフックで使う用)
 */
export function isMonthLockedSync(
  status: string | null | undefined
): boolean {
  return status === 'confirmed';
}
