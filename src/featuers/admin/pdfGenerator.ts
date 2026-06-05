import type {
  AttendanceRecord,
  AttendanceBreak,
  LeaveRequest,
  UserRow,
} from './types';

/**
 * 月次勤怠台帳 PDF生成
 * --------------------------------------------------------------
 * 旧 timetrack-app-clean からの移植版 (TypeScript化)
 *
 * 方式: 新ウィンドウに HTML を書き出して window.print() を呼ぶ。
 *       ユーザーが印刷ダイアログから「PDFとして保存」を選ぶ。
 *       → ライブラリ不要、日本語フォント完全対応。
 * --------------------------------------------------------------
 */

// ─── ユーティリティ ─────────────────────────────────────
const pad = (n: number): string => String(n).padStart(2, '0');

const isSunday = (ds: string): boolean =>
  new Date(ds + 'T00:00:00').getDay() === 0;
const isSaturday = (ds: string): boolean =>
  new Date(ds + 'T00:00:00').getDay() === 6;
const isWeekend = (ds: string): boolean => isSunday(ds) || isSaturday(ds);

const fmtTime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const diffMin = (
  a: string | null | undefined,
  b: string | null | undefined
): number => {
  if (!a || !b) return 0;
  return Math.max(
    0,
    Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 60000)
  );
};

const sumBrkMin = (brks: AttendanceBreak[]): number =>
  brks.reduce(
    (s, b) =>
      s + (!b.break_start || !b.break_end ? 0 : diffMin(b.break_end, b.break_start)),
    0
  );

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** 小数時間 → "H:MM" 形式 */
const hToHMM = (h: number | string | null | undefined): string => {
  if (h === '' || h === null || h === undefined) return '';
  const num = typeof h === 'string' ? parseFloat(h) : h;
  if (isNaN(num)) return '';
  const neg = num < 0;
  const abs = Math.abs(num);
  const totalMin = Math.round(abs * 60);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return (neg ? '-' : '') + hours + ':' + String(mins).padStart(2, '0');
};

const LEAVE_LABEL: Record<string, string> = {
  morning_half: '午前休',
  afternoon_half: '午後休',
  paid: '有休',
  bereavement: '慶弔休暇',
  caregiving: '介護休暇',
  menstrual: '生理休暇',
  childcare_nursing: '看護休暇',
};
const LEAVE_H: Record<string, number> = {
  morning_half: 3,
  afternoon_half: 4,
  paid: 7,
  bereavement: 7,
  caregiving: 7,
  menstrual: 7,
  childcare_nursing: 7,
};
const FULL_LEAVE = new Set([
  'paid',
  'bereavement',
  'caregiving',
  'menstrual',
  'childcare_nursing',
]);
const WORK_LABEL: Record<string, string> = {
  office: '出社',
  remote: '在宅',
  business_trip: '出張',
  normal: '出社',
};
const DOW = ['日', '月', '火', '水', '木', '金', '土'];

// ─── 1社員分のHTML生成 ──────────────────────────────────
type BuildUserHtmlArgs = {
  user: UserRow;
  year: number;
  month: number;
  attRecs: AttendanceRecord[];
  attBreaks: AttendanceBreak[];
  leaveApproved: LeaveRequest[];
  holidays: Set<string>;
};

const buildUserHtml = ({
  user,
  year,
  month,
  attRecs,
  attBreaks,
  leaveApproved,
  holidays,
}: BuildUserHtmlArgs): string => {
  const isHoliday = (ds: string): boolean => holidays.has(ds);
  const isNonWork = (ds: string): boolean => isWeekend(ds) || isHoliday(ds);

  const uid = user.id ?? '';
  const ym = `${year}-${pad(month)}`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthDays = Array.from(
    { length: lastDay },
    (_, i) => `${ym}-${pad(i + 1)}`
  );

  const recs = (attRecs ?? []).filter((r) => r.user_id === uid);
  const brks = (attBreaks ?? []).filter((b) => b.user_id === uid);
  const leaves = (leaveApproved ?? []).filter((l) => l.user_id === uid);

  const days = monthDays.map((ds) => {
    const rec = recs.find((r) => r.date === ds) ?? null;
    const dBrk = brks.filter((b) => b.date === ds);
    const lv =
      leaves.find((l) => l.start_date <= ds && ds <= l.end_date) ?? null;
    const bMin = sumBrkMin(dBrk);
    const act =
      rec?.clock_in && rec?.clock_out
        ? r2((diffMin(rec.clock_out, rec.clock_in) - bMin) / 60)
        : 0;
    const lvH = lv ? LEAVE_H[lv.leave_type] ?? 0 : 0;
    const full = !!(lv && FULL_LEAVE.has(lv.leave_type));
    let dType = '';
    if (isSunday(ds)) dType = '日';
    else if (isSaturday(ds)) dType = '土';
    else if (isHoliday(ds)) dType = '祝';
    return { ds, rec, lv, lvH, bMin, act, full, dType };
  });

  const workD = days.filter(
    (d) => !isNonWork(d.ds) && !d.full && d.rec?.clock_in
  ).length;
  const lvD = days.filter((d) => d.full).length;
  const halfD = days.filter((d) => d.lv && !d.full).length;
  const totAct = r2(days.reduce((s, d) => s + d.act, 0));
  const totLvH = r2(days.reduce((s, d) => s + d.lvH, 0));
  const totBrk = r2(days.reduce((s, d) => s + d.bMin, 0) / 60);
  const stdH = monthDays.filter((ds) => !isNonWork(ds)).length * 7;
  const diff = r2(totAct + totLvH - stdH);

  const today = new Date();
  const todayStr = `${today.getFullYear()}/${pad(today.getMonth() + 1)}/${pad(today.getDate())}`;

  // 日別行 HTML
  const rowsHtml = days
    .map(({ ds, rec, lv, lvH, bMin, act, full, dType }) => {
      const d = new Date(ds + 'T00:00:00');
      const dn = d.getDate();
      const dow = DOW[d.getDay()] ?? '';
      const wt = rec?.work_type
        ? WORK_LABEL[rec.work_type] ?? ''
        : full
        ? '休暇'
        : '';
      const ci = rec?.clock_in ? fmtTime(rec.clock_in) : full ? '—' : '';
      const co = rec?.clock_out
        ? fmtTime(rec.clock_out)
        : full
        ? '—'
        : rec?.clock_in
        ? '未退勤'
        : '';
      const mm = lv ? LEAVE_LABEL[lv.leave_type] ?? '休暇' : rec?.memo ?? '';

      const isSun = isSunday(ds);
      const isSat = isSaturday(ds);
      const isHol = isHoliday(ds);
      const rowCls =
        isSun || isHol
          ? 'row-sun'
          : isSat
          ? 'row-sat'
          : full
          ? 'row-leave'
          : '';

      const isNoOut = rec?.clock_in && !rec?.clock_out && !full;
      const actHMM = act > 0 ? hToHMM(act) : full ? '7:00' : '';
      const brkHMM = bMin > 0 ? hToHMM(r2(bMin / 60)) : '';
      const lvHMM = lvH > 0 ? hToHMM(lvH) : '';

      return `<tr class="${rowCls}">
      <td class="center">${dn}</td>
      <td class="center">${dow}</td>
      <td class="center">${dType}</td>
      <td class="center">${wt}</td>
      <td class="center">${ci}</td>
      <td class="center${isNoOut ? ' no-out' : ''}">${co}</td>
      <td class="right">${actHMM}</td>
      <td class="right">${brkHMM}</td>
      <td class="right">${lvHMM}</td>
      <td>${mm}</td>
    </tr>`;
    })
    .join('');

  return `
<div class="page">
  <h1>${year}年${month}月度　勤怠管理台帳</h1>

  <table class="info-table">
    <tr>
      <th>スタッフ名</th><td>${user.name ?? ''}</td>
      <th>社員ID</th><td>${user.employee_code ?? ''}</td>
    </tr>
    <tr>
      <th>基準労働時間</th><td>${hToHMM(stdH)}</td>
      <th>出勤日数</th><td>${workD}日</td>
    </tr>
    <tr>
      <th>有休取得日数</th><td>${lvD}日</td>
      <th>半休</th><td>${halfD}日</td>
    </tr>
  </table>

  <table class="summary-table">
    <tr>
      <th>総実働時間</th><td>${hToHMM(totAct)}</td>
      <th>休暇時間</th><td>${hToHMM(totLvH)}</td>
      <th>休憩時間</th><td>${hToHMM(totBrk)}</td>
    </tr>
    <tr>
      <th>基準労働時間</th><td>${hToHMM(stdH)}</td>
      <th>差分</th><td class="${diff >= 0 ? 'pos' : 'neg'}">${diff >= 0 ? '+' : ''}${hToHMM(diff)}</td>
      <th>出勤日数</th><td>${workD}日</td>
    </tr>
  </table>

  <table class="detail-table">
    <thead>
      <tr>
        <th style="width:28px">日</th>
        <th style="width:22px">曜</th>
        <th style="width:24px">区分</th>
        <th style="width:48px">勤務形態</th>
        <th style="width:44px">出勤</th>
        <th style="width:44px">退勤</th>
        <th style="width:38px">実働h</th>
        <th style="width:34px">休憩h</th>
        <th style="width:34px">休暇h</th>
        <th>備考</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="6" class="center">合　計</td>
        <td class="right">${hToHMM(totAct)}</td>
        <td class="right">${hToHMM(totBrk)}</td>
        <td class="right">${hToHMM(totLvH)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <p class="footer">出力日：${todayStr}</p>
</div>`;
};

// ─── 印刷用 CSS ────────────────────────────────────────
const PRINT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Meiryo', 'Yu Gothic', sans-serif;
  font-size: 9pt;
  color: #111;
  background: white;
}

.page {
  page-break-after: always;
  padding: 12mm 10mm 10mm;
  width: 210mm;
  min-height: 297mm;
}
.page:last-child { page-break-after: auto; }

h1 {
  font-size: 13pt;
  font-weight: 700;
  margin-bottom: 8px;
  color: #1a1a2e;
  border-bottom: 2px solid #4a5fc1;
  padding-bottom: 4px;
}

.info-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 6px;
  font-size: 8.5pt;
}
.info-table th {
  background: #e8ecff;
  font-weight: 700;
  padding: 4px 6px;
  border: 0.5pt solid #b0bcd0;
  width: 80px;
  white-space: nowrap;
}
.info-table td {
  padding: 4px 8px;
  border: 0.5pt solid #b0bcd0;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 8px;
  font-size: 8.5pt;
}
.summary-table th {
  background: #4a5fc1;
  color: white;
  font-weight: 700;
  padding: 3px 6px;
  border: 0.5pt solid #3a4fa1;
  white-space: nowrap;
}
.summary-table td {
  padding: 3px 8px;
  border: 0.5pt solid #b0bcd0;
  font-weight: 600;
}
.pos { color: #166534; }
.neg { color: #991b1b; }

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8pt;
  table-layout: fixed;
}
.detail-table thead tr {
  background: #4a5fc1;
  color: white;
}
.detail-table th {
  padding: 4px 3px;
  border: 0.5pt solid #3a4fa1;
  text-align: center;
  font-weight: 700;
  font-size: 7.5pt;
}
.detail-table td {
  padding: 3px 3px;
  border: 0.5pt solid #c8d0e0;
  vertical-align: middle;
  font-size: 8pt;
  white-space: nowrap;
  overflow: hidden;
}
.detail-table tbody tr:nth-child(even) { background: #f5f7ff; }

.row-sun td { color: #c0392b !important; }
.row-sat td { color: #1a56b0 !important; }
.row-leave { background: #f0f4ff !important; }

.total-row td {
  background: #dde3f8;
  font-weight: 700;
  border-top: 1.5pt solid #4a5fc1;
}

.center { text-align: center; }
.right  { text-align: right; }
.no-out { color: #c0392b !important; font-weight: 700; }

.footer {
  margin-top: 8px;
  font-size: 7pt;
  color: #888;
  text-align: right;
}

@media print {
  @page { size: A4 portrait; margin: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { padding: 12mm 10mm 10mm; }
}
`;

// ─── 印刷ウィンドウを開いて印刷→PDF保存 ─────────────────
type PrintToPdfArgs = {
  year: number;
  month: number;
  users: UserRow[];
  attRecs: AttendanceRecord[];
  attBreaks: AttendanceBreak[];
  leaveApproved: LeaveRequest[];
  holidays: Set<string>;
  onProgress: (msg: string) => void;
};

export const printToPdf = ({
  year,
  month,
  users,
  attRecs,
  attBreaks,
  leaveApproved,
  holidays,
  onProgress,
}: PrintToPdfArgs): void => {
  onProgress('HTMLを生成中...');
  const pagesHtml = users
    .map((user, i) => {
      onProgress(`${user.name ?? '?'} を処理中 (${i + 1}/${users.length})...`);
      return buildUserHtml({
        user,
        year,
        month,
        attRecs,
        attBreaks,
        leaveApproved,
        holidays,
      });
    })
    .join('');

  const fullHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${year}年${month}月度 勤怠管理台帳</title>
  <style>${PRINT_CSS}</style>
</head>
<body>${pagesHtml}</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    throw new Error(
      'ポップアップがブロックされました。ブラウザのポップアップ許可を確認してください'
    );
  }
  win.document.write(fullHtml);
  win.document.close();

  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 800);
  };
  onProgress('');
};
