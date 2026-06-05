/**
 * 有休関連のユーティリティ (Phase 3-8 + 期限管理対応)
 * --------------------------------------------------------------
 * 既存システム MasterManagementView.jsx の関数群を完全踏襲。
 * - 法定付与日数テーブル (勤続年数 → 付与日数)
 * - 日付計算 (new Date を使わないピュア文字列計算)
 * - 入社日 + 既付与履歴 から「次に付与すべき日」を算出
 * - leave_grants ベースの FIFO 残数計算 (期限早い順に消化)
 * --------------------------------------------------------------
 */

import type { LeaveBalance } from './types';

// ─────────────────────────────────────────────
// 法定有休付与テーブル
// ─────────────────────────────────────────────
/** 勤続年数 → 法定付与日数 */
export function getAnnualLeaveGrantDays(years: number): number {
  if (years <= 0) return 10;
  if (years === 1) return 11;
  if (years === 2) return 12;
  if (years === 3) return 14;
  if (years === 4) return 16;
  if (years === 5) return 18;
  return 20;
}

// ─────────────────────────────────────────────
// 日付ユーティリティ (new Date を一切使わないピュア計算)
// ─────────────────────────────────────────────
export type YMD = { y: number; m: number; d: number };

export function parseDateStr(s: string): YMD {
  const parts = String(s).slice(0, 10).split('-');
  return { y: Number(parts[0]), m: Number(parts[1]), d: Number(parts[2]) };
}

export function toDateStr({ y, m, d }: YMD): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" の大小比較 */
export function compareDates(a: string, b: string): -1 | 0 | 1 {
  const as = String(a).slice(0, 10);
  const bs = String(b).slice(0, 10);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m === 2 && isLeapYear(y)) return 29;
  return days[m];
}

/** "YYYY-MM-DD" に n 年加算 (応当日 + 月末クランプ) */
export function addYears(dateStr: string, n: number): string {
  const { y, m, d } = parseDateStr(dateStr);
  const ny = y + n;
  const maxD = daysInMonth(ny, m);
  return toDateStr({ y: ny, m, d: d > maxD ? maxD : d });
}

/** ローカル日付の "YYYY-MM-DD" */
export function todayStr(): string {
  const now = new Date();
  return toDateStr({
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    d: now.getDate(),
  });
}

/**
 * 入社日から「現時点での実際の勤続年数」を計算 (満年齢方式)
 */
export function calcYearsOfService(hireDate: string | null | undefined): number | null {
  if (!hireDate) return null;
  const hire = String(hireDate).slice(0, 10);
  const today = todayStr();
  if (compareDates(today, hire) < 0) return null; // 入社前

  const { y: hy, m: hm, d: hd } = parseDateStr(hire);
  const { y: ty, m: tm, d: td } = parseDateStr(today);

  let years = ty - hy;
  if (tm < hm || (tm === hm && td < hd)) {
    years -= 1;
  }
  return Math.max(0, years);
}

// ─────────────────────────────────────────────
// 年度判定 (4月始まり)
// ─────────────────────────────────────────────
/** 現在の会計年度 (4月始まり) */
export function getCurrentFiscalYear(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

// ─────────────────────────────────────────────
// leave_grants 配列の最小型
// ─────────────────────────────────────────────
export type GrantBrief = {
  user_id: string;
  /** "YYYY-MM-DD" or timestamptz */
  grant_date: string;
  grant_type: string;
  granted_days: number;
};

/** 期限管理対応の grant 型 (FIFO計算用) */
export type GrantWithExpiry = {
  id: string;
  user_id: string;
  grant_date: string;
  granted_days: number;
  expired_days: number;
  expires_at: string;
  grant_type: string;
};

// ─────────────────────────────────────────────
// 次回付与計算
// ─────────────────────────────────────────────
export type NextGrantInfo = {
  yearsOfService: number;
  currentGrantDate: string;
  currentGrantDays: number;
  isDue: boolean;
};

export function calcNextGrant(
  hireDate: string | null | undefined,
  grants: GrantBrief[],
  userId: string
): NextGrantInfo | null {
  if (!hireDate) return null;

  const hire = String(hireDate).slice(0, 10);
  const today = todayStr();

  if (compareDates(today, hire) < 0) {
    return {
      yearsOfService: 0,
      currentGrantDate: hire,
      currentGrantDays: getAnnualLeaveGrantDays(0),
      isDue: false,
    };
  }

  const grantedDates = new Set(
    (grants ?? [])
      .filter((g) => g.user_id === userId && g.grant_type === 'annual')
      .map((g) => String(g.grant_date).slice(0, 10))
  );

  for (let n = 0; n <= 50; n++) {
    const grantDate = addYears(hire, n);
    const isDue = compareDates(today, grantDate) >= 0;

    if (!isDue) {
      return {
        yearsOfService: n,
        currentGrantDate: grantDate,
        currentGrantDays: getAnnualLeaveGrantDays(n),
        isDue: false,
      };
    }
    if (!grantedDates.has(grantDate)) {
      return {
        yearsOfService: n,
        currentGrantDate: grantDate,
        currentGrantDays: getAnnualLeaveGrantDays(n),
        isDue: true,
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// 有休消費計算 (admin 一覧用)
// ─────────────────────────────────────────────
/** 1件の leave_request から「消費日数」を計算 */
export function consumedDaysOf(leaveType: string, days: number | null): number {
  if (leaveType === 'morning_half' || leaveType === 'afternoon_half') return 0.5;
  return days ?? 1;
}

/** 有休として消費するか (paid 系のみ) */
export function isPaidLeaveType(leaveType: string): boolean {
  return (
    leaveType === 'paid' ||
    leaveType === 'morning_half' ||
    leaveType === 'afternoon_half'
  );
}

// ─────────────────────────────────────────────
// 旧式: balance + 消費 → 残日数 (後方互換のため残す)
// ─────────────────────────────────────────────
export function calcRemainingDays(
  balance: Pick<LeaveBalance, 'granted_days' | 'carryover_days' | 'adjusted_days'> | undefined,
  takenDays: number,
  pendingDays: number
): number {
  const granted = balance?.granted_days ?? 0;
  const carry = balance?.carryover_days ?? 0;
  const adjust = balance?.adjusted_days ?? 0;
  return +(granted + carry + adjust - takenDays - pendingDays).toFixed(1);
}

// ═════════════════════════════════════════════
// 【新規】leave_grants ベースの FIFO 残数計算
// ═════════════════════════════════════════════

/** grant ごとの残数情報 (UI表示用) */
export type GrantRemainState = {
  grantId: string;
  grantDate: string;
  expiresAt: string;
  grantedDays: number;
  expiredDays: number;
  /** この grant に割り当てられた消費日数 (approved + pending) */
  consumedDays: number;
  /** この grant の残数 = granted - expired - consumed */
  remainingDays: number;
  /** 期限切れか */
  isExpired: boolean;
};

/**
 * grants ベースの残数計算 (FIFO by expires_at)
 *
 * 仕組み:
 *  1. 期限切れ(expires_at < today) を除く grants を「期限早い順」に並べる
 *  2. 消費合計 (approved + pending) を計算
 *  3. 上から順に grant の残容量 (granted - expired) まで消費を割り当てる
 *  4. 各 grant の残数 = granted - expired - 割り当て消費
 *
 * @returns 各 grant の状態と、合計残数
 */
export function calcRemainingDaysFromGrants(
  grants: GrantWithExpiry[],
  totalConsumedDays: number
): {
  totalRemaining: number;
  states: GrantRemainState[];
} {
  const today = todayStr();

  // 全 grant の状態を初期化 (期限早い順)
  const sorted = [...grants].sort((a, b) => {
    // expires_at 昇順、同じなら grant_date 昇順
    const ex = compareDates(
      String(a.expires_at).slice(0, 10),
      String(b.expires_at).slice(0, 10)
    );
    if (ex !== 0) return ex;
    return compareDates(
      String(a.grant_date).slice(0, 10),
      String(b.grant_date).slice(0, 10)
    );
  });

  const states: GrantRemainState[] = sorted.map((g) => {
    const expiresAt = String(g.expires_at).slice(0, 10);
    const grantDate = String(g.grant_date).slice(0, 10);
    const isExpired = compareDates(expiresAt, today) < 0;
    return {
      grantId: g.id,
      grantDate,
      expiresAt,
      grantedDays: Number(g.granted_days) || 0,
      expiredDays: Number(g.expired_days) || 0,
      consumedDays: 0,
      remainingDays: 0,
      isExpired,
    };
  });

  // 消費を期限早い順 (期限切れ除く) に割り当てる
  let remainingToAssign = Math.max(0, totalConsumedDays);
  for (const s of states) {
    if (s.isExpired) {
      // 期限切れ grant にも"歴史的に消費があった"可能性はあるが、
      // expired_days に既に反映済みなのでスキップ
      continue;
    }
    const capacity = Math.max(0, s.grantedDays - s.expiredDays);
    const assign = Math.min(capacity, remainingToAssign);
    s.consumedDays = assign;
    s.remainingDays = +(capacity - assign).toFixed(1);
    remainingToAssign = +(remainingToAssign - assign).toFixed(1);
  }

  // 合計残数 (期限切れは含まない)
  const totalRemaining = states
    .filter((s) => !s.isExpired)
    .reduce((sum, s) => sum + s.remainingDays, 0);

  return {
    totalRemaining: +totalRemaining.toFixed(1),
    states,
  };
}

/**
 * 1ユーザーの消費日数を leave_requests から計算
 * - approved + pending を合算
 * - paid 系 (paid / morning_half / afternoon_half) のみ対象
 */
export function calcTotalConsumedFromRequests(
  requests: { leave_type: string; status: string; days: number | null }[]
): number {
  return requests
    .filter(
      (r) =>
        isPaidLeaveType(r.leave_type) &&
        (r.status === 'approved' || r.status === 'pending')
    )
    .reduce((sum, r) => sum + consumedDaysOf(r.leave_type, r.days), 0);
}
