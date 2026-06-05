/**
 * As Partner 株式会社の会計期(8月始まり、翌7月締め)に関するユーティリティ
 *
 * 期番号 = 期の開始年 - FISCAL_YEAR_OFFSET
 * 例: 2025年8月始まりの期 = 第6期 (現在進行中)
 *     2026年8月始まりの期 = 第7期
 *     2024年8月始まりの期 = 第5期
 */

/** 期の開始月 (8月) */
export const FISCAL_START_MONTH = 8;

/** 期番号 = 期の開始年 - FISCAL_YEAR_OFFSET */
export const FISCAL_YEAR_OFFSET = 2019;

/** 期内の月の並び (8月→翌年7月) */
export const FISCAL_MONTHS: { fiscalMonthIndex: number; calendarMonth: number; yearOffset: 0 | 1 }[] = [
  { fiscalMonthIndex: 1, calendarMonth: 8, yearOffset: 0 },
  { fiscalMonthIndex: 2, calendarMonth: 9, yearOffset: 0 },
  { fiscalMonthIndex: 3, calendarMonth: 10, yearOffset: 0 },
  { fiscalMonthIndex: 4, calendarMonth: 11, yearOffset: 0 },
  { fiscalMonthIndex: 5, calendarMonth: 12, yearOffset: 0 },
  { fiscalMonthIndex: 6, calendarMonth: 1, yearOffset: 1 },
  { fiscalMonthIndex: 7, calendarMonth: 2, yearOffset: 1 },
  { fiscalMonthIndex: 8, calendarMonth: 3, yearOffset: 1 },
  { fiscalMonthIndex: 9, calendarMonth: 4, yearOffset: 1 },
  { fiscalMonthIndex: 10, calendarMonth: 5, yearOffset: 1 },
  { fiscalMonthIndex: 11, calendarMonth: 6, yearOffset: 1 },
  { fiscalMonthIndex: 12, calendarMonth: 7, yearOffset: 1 },
];

/** カレンダー日付から「その日が含まれる期の開始年」を返す */
export function getFiscalStartYear(year: number, month: number): number {
  return month >= FISCAL_START_MONTH ? year : year - 1;
}

/** カレンダー日付から「期番号」を返す */
export function getFiscalPeriodNumber(year: number, month: number): number {
  const startYear = getFiscalStartYear(year, month);
  return startYear - FISCAL_YEAR_OFFSET;
}

/** 期番号から期の開始年を返す */
export function fiscalPeriodToStartYear(period: number): number {
  return period + FISCAL_YEAR_OFFSET;
}

/** 期番号から期の表示ラベルを返す (例: "第6期 (2025年8月-2026年7月)") */
export function getFiscalPeriodLabel(period: number): string {
  const startYear = fiscalPeriodToStartYear(period);
  const endYear = startYear + 1;
  return `第${period}期 (${startYear}年8月-${endYear}年7月)`;
}

/** 期番号の短いラベル (例: "第6期") */
export function getFiscalPeriodShortLabel(period: number): string {
  return `第${period}期`;
}

/** 期番号と期内月(1-12)から、カレンダーの year_month "YYYY-MM" を返す */
export function fiscalToYearMonth(period: number, fiscalMonthIndex: number): string {
  const startYear = fiscalPeriodToStartYear(period);
  const idx = FISCAL_MONTHS.find((m) => m.fiscalMonthIndex === fiscalMonthIndex);
  if (!idx) throw new Error(`Invalid fiscalMonthIndex: ${fiscalMonthIndex}`);
  const calYear = startYear + idx.yearOffset;
  const calMonth = idx.calendarMonth;
  return `${calYear}-${String(calMonth).padStart(2, '0')}`;
}

/** "YYYY-MM" の文字列を期番号と期内月(1-12)に分解 */
export function yearMonthToFiscal(yearMonth: string): { period: number; fiscalMonthIndex: number } | null {
  const parts = yearMonth.split('-');
  if (parts.length !== 2) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!year || !month) return null;

  const startYear = getFiscalStartYear(year, month);
  const period = startYear - FISCAL_YEAR_OFFSET;
  const yearOffset = (year - startYear) as 0 | 1;
  const found = FISCAL_MONTHS.find(
    (m) => m.calendarMonth === month && m.yearOffset === yearOffset
  );
  if (!found) return null;
  return { period, fiscalMonthIndex: found.fiscalMonthIndex };
}

/** 期番号と期内月(1-12)から、カレンダー年と月を返す */
export function fiscalToCalendar(period: number, fiscalMonthIndex: number): { year: number; month: number } {
  const startYear = fiscalPeriodToStartYear(period);
  const idx = FISCAL_MONTHS.find((m) => m.fiscalMonthIndex === fiscalMonthIndex);
  if (!idx) throw new Error(`Invalid fiscalMonthIndex: ${fiscalMonthIndex}`);
  return {
    year: startYear + idx.yearOffset,
    month: idx.calendarMonth,
  };
}

/** 期内月の表示ラベル (例: 1 → "8月", 6 → "1月", 12 → "7月") */
export function getFiscalMonthLabel(fiscalMonthIndex: number): string {
  const idx = FISCAL_MONTHS.find((m) => m.fiscalMonthIndex === fiscalMonthIndex);
  if (!idx) return `${fiscalMonthIndex}`;
  return `${idx.calendarMonth}月`;
}
