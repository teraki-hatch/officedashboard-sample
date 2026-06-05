import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Database Webhook → Slack 通知
 * --------------------------------------------------------------
 * Supabase の Database Webhook から POST を受けて、
 * Slack Incoming Webhook に整形済みメッセージを送る。
 *
 * 対応テーブル:
 *  - attendance_correction_requests (勤怠修正申請)
 *  - leave_requests (休暇申請)
 *  - expense_requests (経費精算申請)
 *
 * 必要な環境変数 (Vercel):
 *  - SLACK_WEBHOOK_URL          : Slack Incoming Webhook URL
 *  - SUPABASE_URL               : Supabase プロジェクト URL
 *  - SUPABASE_SERVICE_ROLE_KEY  : service_role キー (anon でなく)
 *  - SUPABASE_WEBHOOK_SECRET    : 任意の共有シークレット (Supabase Webhook の HTTP Header に同値を入れる)
 * --------------------------------------------------------------
 */

type SupabaseWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/* ============================================================
   ヘルパー
   ============================================================ */

function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** user_id → 表示名。失敗時は user_id 先頭8桁を返す */
async function lookupUserName(userId: unknown): Promise<string> {
  if (typeof userId !== 'string' || !userId) return '不明';
  const supabase = getSupabase();
  if (!supabase) return userId.slice(0, 8);

  try {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (!data) return userId.slice(0, 8);
    const d = data as Record<string, unknown>;
    const name =
      (d.display_name as string | undefined) ||
      (d.full_name as string | undefined) ||
      (d.name as string | undefined) ||
      `${(d.last_name as string) ?? ''} ${(d.first_name as string) ?? ''}`.trim() ||
      (d.nickname as string | undefined) ||
      (d.email as string | undefined) ||
      userId.slice(0, 8);
    return name || userId.slice(0, 8);
  } catch {
    return userId.slice(0, 8);
  }
}

function fmtDate(d: unknown): string {
  if (typeof d !== 'string' || !d) return '—';
  const dt = new Date(d.includes('T') ? d : `${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()} (${WEEKDAYS[dt.getDay()]})`;
}

function fmtTime(s: unknown): string {
  if (typeof s !== 'string' || !s) return '—';
  // 'HH:mm:ss' や 'HH:mm' を 'HH:mm' に
  return s.slice(0, 5);
}

function pickString(record: Record<string, unknown>, keys: string[], fallback = '—'): string {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === 'string' && v) return v;
  }
  return fallback;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === 'number') return v;
  }
  return null;
}

/* ============================================================
   フォーマッタ (テーブル別)
   ============================================================ */

function formatCorrectionRequest(record: Record<string, unknown>, userName: string) {
  const date = fmtDate(record.target_date ?? record.date);
  const clockIn = fmtTime(record.requested_clock_in);
  const clockOut = fmtTime(record.requested_clock_out);
  const breakMin = pickNumber(record, ['requested_break_minutes']) ?? 0;
  const workType = pickString(record, ['requested_work_type']);
  const reason = pickString(record, ['reason'], '(理由なし)');

  return {
    text: `🔧 勤怠修正申請: ${userName} さん (${date})`, // 通知バナー用フォールバック
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🔧 勤怠修正申請', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*申請者:*\n${userName}` },
          { type: 'mrkdwn', text: `*対象日:*\n${date}` },
          { type: 'mrkdwn', text: `*勤務形態:*\n${workType}` },
          { type: 'mrkdwn', text: `*出退勤:*\n${clockIn} 〜 ${clockOut}` },
          { type: 'mrkdwn', text: `*休憩:*\n${breakMin}分` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*理由:*\n${reason}` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: '申請承認ページから確認してください | OfficeHub' },
        ],
      },
    ],
  };
}

function formatLeaveRequest(record: Record<string, unknown>, userName: string) {
  const startDate = fmtDate(record.start_date ?? record.date ?? record.from_date);
  const endDate = fmtDate(record.end_date ?? record.to_date ?? record.date);
  const dateRange = startDate === endDate ? startDate : `${startDate} 〜 ${endDate}`;
  const leaveType = pickString(record, ['leave_type', 'type', 'kind']);
  const reason = pickString(record, ['reason', 'note', 'comment'], '(理由なし)');

  return {
    text: `🌴 休暇申請: ${userName} さん (${dateRange})`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🌴 休暇申請', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*申請者:*\n${userName}` },
          { type: 'mrkdwn', text: `*種類:*\n${leaveType}` },
          { type: 'mrkdwn', text: `*対象日:*\n${dateRange}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*理由:*\n${reason}` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: '申請承認ページから確認してください | OfficeHub' },
        ],
      },
    ],
  };
}

function formatExpenseRequest(record: Record<string, unknown>, userName: string) {
  const date = fmtDate(record.expense_date ?? record.date ?? record.requested_at);
  const amount = pickNumber(record, ['amount', 'total', 'total_amount']);
  const amountStr = amount !== null ? `¥${amount.toLocaleString('ja-JP')}` : '—';
  const category = pickString(record, ['category', 'expense_category', 'kind']);
  const description = pickString(
    record,
    ['description', 'purpose', 'note', 'detail', 'title', 'subject'],
    '(説明なし)'
  );

  return {
    text: `💰 経費精算申請: ${userName} さん ${amountStr}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '💰 経費精算申請', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*申請者:*\n${userName}` },
          { type: 'mrkdwn', text: `*金額:*\n${amountStr}` },
          { type: 'mrkdwn', text: `*カテゴリ:*\n${category}` },
          { type: 'mrkdwn', text: `*日付:*\n${date}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*内容:*\n${description}` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: '申請承認ページから確認してください | OfficeHub' },
        ],
      },
    ],
  };
}

/* ============================================================
   ハンドラ
   ============================================================ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 共有シークレット検証 (設定されている場合のみ)
  if (WEBHOOK_SECRET) {
    const provided = req.headers['x-webhook-secret'];
    if (provided !== WEBHOOK_SECRET) {
      console.log('[slack-notify] unauthorized', { provided });
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!SLACK_WEBHOOK_URL) {
    console.error('[slack-notify] SLACK_WEBHOOK_URL not configured');
    return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' });
  }

  const payload = req.body as SupabaseWebhookPayload | undefined;
  console.log('[slack-notify] received', {
    type: payload?.type,
    table: payload?.table,
    recordId: (payload?.record as { id?: unknown } | null)?.id,
  });

  if (!payload || payload.type !== 'INSERT' || !payload.record) {
    return res.status(200).json({ skipped: 'not INSERT' });
  }

  const userName = await lookupUserName(payload.record.user_id);

  let message;
  switch (payload.table) {
    case 'attendance_correction_requests':
      message = formatCorrectionRequest(payload.record, userName);
      break;
    case 'leave_requests':
      message = formatLeaveRequest(payload.record, userName);
      break;
    case 'expense_requests':
      message = formatExpenseRequest(payload.record, userName);
      break;
    default:
      return res.status(200).json({ skipped: `unknown table: ${payload.table}` });
  }

  try {
    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!slackRes.ok) {
      const text = await slackRes.text();
      console.error('[slack-notify] Slack returned error', {
        status: slackRes.status,
        body: text,
      });
      return res.status(500).json({ error: 'Slack send failed', detail: text });
    }

    console.log('[slack-notify] sent successfully', {
      table: payload.table,
      user: userName,
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[slack-notify] fetch threw', { error: msg });
    return res.status(500).json({ error: msg });
  }
}
