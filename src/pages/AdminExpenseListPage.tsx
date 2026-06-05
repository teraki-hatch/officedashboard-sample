// 管理者用 経費一覧ページ (/admin/expense-list)
// - 全社員の月次経費を 人別×カテゴリ別 で表示
// - 社員番号順、退職/無効社員は除外、経費0の人も表示
// - デフォルト折りたたみ
// - 領収書プレビュー (📎クリックで別タブ)
// - CSV出力 (明細レベル)
//
// 2026-06-01 追加:
//   月次経費締めステータス (未提出 / 提出済 / 確定済) を各社員行に表示。
//   月単位サマリー (確定済 N / 提出済 N / 未提出 N) も上部に追加。
import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';
import { logger } from '../lib/logger';
import { useAllExpenses } from '../features/expenses/useAllExpenses';
import { useReceiptUpload } from '../features/expenses/useReceiptUpload';
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategoryCode,
  type ExpenseRequest,
} from '../features/expenses/types';
import {
  formatAmount,
  formatDateShort,
  transportLabel,
} from '../features/expenses/expenseUtils';
import {
  buildExpenseCsv,
  downloadCsv,
} from '../features/expenses/expenseCsvExport';

type UserRow = {
  id: string;
  employee_code: string;
  name: string;
};

type ClientRow = {
  id: string;
  name: string;
};

type ClosureStatus = 'submitted' | 'confirmed';

const CATEGORY_ORDER: ExpenseCategoryCode[] = [
  'commute',
  'business',
  'reimbursement',
];

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function statusLabel(s: ClosureStatus | undefined): string {
  if (s === 'confirmed') return '🔒 確定済';
  if (s === 'submitted') return '📤 提出済';
  return '未提出';
}

function statusBadgeClass(s: ClosureStatus | undefined): string {
  if (s === 'confirmed') return 'adm-exp__user-status--confirmed';
  if (s === 'submitted') return 'adm-exp__user-status--submitted';
  return 'adm-exp__user-status--none';
}

export function AdminExpenseListPage() {
  const today = currentYearMonth();
  const [year, setYear] = useState<number>(today.year);
  const [month, setMonth] = useState<number>(today.month);

  // active な社員 (999 除外)
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState<boolean>(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  // クライアント名 (経費にぶら下がる client_id を解決するため)
  const [clients, setClients] = useState<ClientRow[]>([]);

  // 月次経費締めステータス (user_id -> status)
  const [closures, setClosures] = useState<Map<string, ClosureStatus>>(new Map());

  // 経費データ
  const { expenses, loading: expLoading, error: expError } = useAllExpenses({ year, month });
  const { getSignedUrl } = useReceiptUpload();

  // 折りたたみ状態 (user_id -> true=展開)
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  // 社員 + クライアントを取得 (1回だけ)
  useEffect(() => {
    let cancelled = false;
    async function loadUsersAndClients() {
      const supabase = getSupabase();
      if (!supabase) {
        if (!cancelled) {
          setUsersError('Supabase 未設定');
          setUsersLoading(false);
        }
        return;
      }
      try {
        const [uRes, cRes] = await Promise.all([
          withTimeout(
            supabase
              .from('users')
              .select('id, employee_code, name, status')
              .eq('status', 'active')
              .neq('employee_code', '999')
              .order('employee_code', { ascending: true }),
            10000,
            'admin expenses: fetch users'
          ),
          withTimeout(
            supabase
              .from('clients')
              .select('id, name, is_active')
              .eq('is_active', true),
            10000,
            'admin expenses: fetch clients'
          ),
        ]);

        if (uRes.error) throw uRes.error;
        if (cRes.error) throw cRes.error;
        if (cancelled) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setUsers(((uRes.data || []) as any[]).map((u) => ({
          id: u.id,
          employee_code: u.employee_code || '',
          name: u.name || '',
        })));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setClients(((cRes.data || []) as any[]).map((c) => ({
          id: c.id,
          name: c.name || '',
        })));
        setUsersLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('AdminExpenseListPage loadUsersAndClients error:', msg);
        setUsersError(msg);
        setUsersLoading(false);
      }
    }
    loadUsersAndClients();
    return () => {
      cancelled = true;
    };
  }, []);

  // 月次経費締めステータスを取得 (月切り替えごとにrefetch)
  useEffect(() => {
    let cancelled = false;
    async function loadClosures() {
      const supabase = getSupabase();
      if (!supabase) return;
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      try {
        const res = await withTimeout(
          supabase
            .from('monthly_expense_closures')
            .select('user_id, status')
            .eq('year_month', yearMonth),
          10000,
          'admin expenses: fetch closures'
        );
        if (cancelled) return;
        if (res.error) {
          logger.log('AdminExpenseListPage loadClosures error:', res.error.message);
          setClosures(new Map());
          return;
        }
        const map = new Map<string, ClosureStatus>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of ((res.data || []) as any[])) {
          if (r.status === 'submitted' || r.status === 'confirmed') {
            map.set(r.user_id, r.status);
          }
        }
        setClosures(map);
      } catch (e) {
        if (cancelled) return;
        logger.log('AdminExpenseListPage loadClosures threw:', e);
        setClosures(new Map());
      }
    }
    loadClosures();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  // 月選択肢: 直近12ヶ月
  const monthOptions = useMemo(() => {
    const now = new Date();
    const opts: { value: string; label: string; year: number; month: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      opts.push({
        value: `${y}-${String(m).padStart(2, '0')}`,
        label: `${y}年${m}月`,
        year: y,
        month: m,
      });
    }
    return opts;
  }, []);

  const currentYmValue = `${year}-${String(month).padStart(2, '0')}`;

  function handleYmChange(v: string) {
    const found = monthOptions.find((o) => o.value === v);
    if (found) {
      setYear(found.year);
      setMonth(found.month);
      // 月を切り替えたら折りたたみリセット
      setExpandedUsers({});
    }
  }

  // user_id -> ExpenseRequest[]
  const expensesByUser = useMemo(() => {
    const map = new Map<string, ExpenseRequest[]>();
    for (const e of expenses) {
      const list = map.get(e.user_id) || [];
      list.push(e);
      map.set(e.user_id, list);
    }
    return map;
  }, [expenses]);

  // 全社合計
  const grandTotal = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [expenses]);

  // 締めステータスサマリー (確定済 N / 提出済 N / 未提出 N)
  const closureCounts = useMemo(() => {
    let submitted = 0;
    let confirmed = 0;
    for (const u of users) {
      const s = closures.get(u.id);
      if (s === 'confirmed') confirmed++;
      else if (s === 'submitted') submitted++;
    }
    return {
      submitted,
      confirmed,
      unsubmitted: Math.max(users.length - submitted - confirmed, 0),
    };
  }, [users, closures]);

  // クライアント名取得ヘルパー
  function clientName(clientId: string | null): string {
    if (!clientId) return '';
    const c = clients.find((cli) => cli.id === clientId);
    return c?.name ?? '';
  }

  function toggleUser(userId: string) {
    setExpandedUsers((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  function expandAll() {
    const next: Record<string, boolean> = {};
    for (const u of users) next[u.id] = true;
    setExpandedUsers(next);
  }

  function collapseAll() {
    setExpandedUsers({});
  }

  async function handleViewReceipt(receiptUrl: string) {
    const signed = await getSignedUrl(receiptUrl);
    if (signed) {
      window.open(signed, '_blank', 'noopener,noreferrer');
    } else {
      alert('領収書を開けませんでした');
    }
  }

  function handleExportCsv() {
    if (expenses.length === 0) {
      alert('この月の経費はありません');
      return;
    }
    const csv = buildExpenseCsv(expenses, users, clients);
    const filename = `expenses_${year}-${String(month).padStart(2, '0')}.csv`;
    downloadCsv(filename, csv);
  }

  const isLoading = usersLoading || expLoading;
  const errorMsg = usersError || expError;

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--ink)' }}>
          経費一覧 (管理者)
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: '4px 0 0' }}>
          全社員の月次経費を確認・CSV出力できます。
        </p>
      </header>

      <div className="adm-exp__controls">
        <label className="adm-exp__label">
          対象月
          <select
            className="adm-exp__select"
            value={currentYmValue}
            onChange={(e) => handleYmChange(e.target.value)}
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="adm-exp__total">
          合計: <strong>{formatAmount(grandTotal)}</strong>
          <span className="adm-exp__total-note">
            ({expenses.length}件 / {users.length}名)
          </span>
        </div>

        <div className="adm-exp__closure-summary" title="月次経費締めの提出/確定状況">
          <span className="adm-exp__closure-summary-item adm-exp__closure-summary-item--confirmed">
            🔒 確定済 <strong>{closureCounts.confirmed}</strong>
          </span>
          <span className="adm-exp__closure-summary-item adm-exp__closure-summary-item--submitted">
            📤 提出済 <strong>{closureCounts.submitted}</strong>
          </span>
          <span className="adm-exp__closure-summary-item adm-exp__closure-summary-item--none">
            未提出 <strong>{closureCounts.unsubmitted}</strong>
          </span>
        </div>

        <div className="adm-exp__actions">
          <button
            type="button"
            className="adm-exp__btn adm-exp__btn--ghost"
            onClick={expandAll}
            disabled={isLoading}
          >
            全展開
          </button>
          <button
            type="button"
            className="adm-exp__btn adm-exp__btn--ghost"
            onClick={collapseAll}
            disabled={isLoading}
          >
            全折りたたみ
          </button>
          <button
            type="button"
            className="adm-exp__btn"
            onClick={handleExportCsv}
            disabled={isLoading || expenses.length === 0}
          >
            CSV出力
          </button>
        </div>
      </div>

      {errorMsg && <div className="adm-exp__error">エラー: {errorMsg}</div>}

      {isLoading ? (
        <div className="adm-exp__loading">読み込み中…</div>
      ) : (
        <div className="adm-exp__sections">
          {users.map((u) => {
            const list = expensesByUser.get(u.id) || [];
            const userTotal = list.reduce((s, e) => s + (e.amount || 0), 0);
            const expanded = !!expandedUsers[u.id];
            const status = closures.get(u.id);

            // カテゴリ別グルーピング
            const byCategory = new Map<ExpenseCategoryCode, ExpenseRequest[]>();
            for (const code of CATEGORY_ORDER) byCategory.set(code, []);
            for (const e of list) {
              const arr = byCategory.get(e.category_code) || [];
              arr.push(e);
              byCategory.set(e.category_code, arr);
            }

            return (
              <section key={u.id} className="adm-exp__user-section">
                <button
                  type="button"
                  className="adm-exp__user-header"
                  onClick={() => toggleUser(u.id)}
                  aria-expanded={expanded}
                >
                  <span className="adm-exp__user-toggle">{expanded ? '▼' : '▶'}</span>
                  <span className="adm-exp__user-code">{u.employee_code}</span>
                  <span className="adm-exp__user-name">{u.name}</span>
                  <span className={`adm-exp__user-status ${statusBadgeClass(status)}`}>
                    {statusLabel(status)}
                  </span>
                  <span className="adm-exp__user-total">
                    {list.length === 0 ? '—' : formatAmount(userTotal)}
                  </span>
                  <span className="adm-exp__user-count">
                    {list.length === 0 ? '' : `${list.length}件`}
                  </span>
                </button>

                {expanded && (
                  <div className="adm-exp__user-body">
                    {list.length === 0 ? (
                      <div className="adm-exp__empty">この月の経費なし</div>
                    ) : (
                      CATEGORY_ORDER.map((code) => {
                        const items = byCategory.get(code) || [];
                        if (items.length === 0) return null;
                        const subTotal = items.reduce(
                          (s, e) => s + (e.amount || 0),
                          0
                        );
                        return (
                          <div key={code} className="adm-exp__category-group">
                            <div className="adm-exp__category-header">
                              <span className="adm-exp__category-name">
                                {EXPENSE_CATEGORY_LABELS[code]}
                              </span>
                              <span className="adm-exp__category-count">
                                {items.length}件
                              </span>
                              <span className="adm-exp__category-total">
                                {formatAmount(subTotal)}
                              </span>
                            </div>
                            <table className="adm-exp__items-table">
                              <tbody>
                                {items.map((e) => (
                                  <tr key={e.id} className="adm-exp__item-row">
                                    <td className="adm-exp__item-date">
                                      {formatDateShort(e.date)}
                                    </td>
                                    <td className="adm-exp__item-meta">
                                      {e.transport_type && (
                                        <span className="adm-exp__tag">
                                          {transportLabel(e.transport_type)}
                                        </span>
                                      )}
                                      {e.client_id && (
                                        <span className="adm-exp__tag">
                                          {clientName(e.client_id)}
                                        </span>
                                      )}
                                    </td>
                                    <td className="adm-exp__item-memo">
                                      {e.memo || ''}
                                    </td>
                                    <td className="adm-exp__item-amount">
                                      {formatAmount(e.amount)}
                                    </td>
                                    <td className="adm-exp__item-receipt">
                                      {e.receipt_url ? (
                                        <button
                                          type="button"
                                          className="adm-exp__receipt-btn"
                                          onClick={() =>
                                            handleViewReceipt(e.receipt_url as string)
                                          }
                                          title="領収書を見る"
                                        >
                                          📎
                                        </button>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <style>{`
        .adm-exp__controls {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .adm-exp__label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--ink-mute);
        }
        .adm-exp__select {
          padding: 6px 10px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font-size: 13px;
          background: #fff;
          color: var(--ink);
        }
        .adm-exp__total {
          font-size: 13px;
          color: var(--ink-mute);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .adm-exp__total strong {
          color: var(--ink);
          font-weight: 600;
          font-size: 14px;
        }
        .adm-exp__total-note {
          font-size: 11px;
          color: var(--ink-soft);
        }
        .adm-exp__closure-summary {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .adm-exp__closure-summary-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11.5px;
          letter-spacing: 0.02em;
          white-space: nowrap;
          border: 1px solid transparent;
        }
        .adm-exp__closure-summary-item strong {
          font-weight: 700;
        }
        .adm-exp__closure-summary-item--confirmed {
          background: #E2EED1;
          color: #4E6B3A;
          border-color: #C2D6A5;
        }
        .adm-exp__closure-summary-item--submitted {
          background: #FAEFD0;
          color: #8B6914;
          border-color: #E8D9A0;
        }
        .adm-exp__closure-summary-item--none {
          background: #fafaf5;
          color: var(--ink-soft);
          border-color: var(--line);
          border-style: dashed;
        }
        .adm-exp__actions {
          margin-left: auto;
          display: flex;
          gap: 8px;
        }
        .adm-exp__btn {
          padding: 6px 14px;
          font-size: 12.5px;
          background: var(--primary, #2f7d4f);
          color: #fff;
          border: 1px solid var(--primary, #2f7d4f);
          border-radius: 6px;
          cursor: pointer;
        }
        .adm-exp__btn:hover:not(:disabled) {
          opacity: 0.9;
        }
        .adm-exp__btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .adm-exp__btn--ghost {
          background: #fff;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        .adm-exp__btn--ghost:hover:not(:disabled) {
          background: #f5f5ee;
        }
        .adm-exp__error {
          background: var(--danger-bg, #F4E1DA);
          color: var(--danger, #B5523C);
          padding: 10px 14px;
          border-radius: 6px;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .adm-exp__loading {
          padding: 32px;
          text-align: center;
          color: var(--ink-soft);
          font-size: 13px;
        }
        .adm-exp__sections {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .adm-exp__user-section {
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
        }
        .adm-exp__user-header {
          display: grid;
          grid-template-columns: 24px 60px 1fr auto auto 60px;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          width: 100%;
          background: #fafaf5;
          border: none;
          cursor: pointer;
          font-size: 13.5px;
          color: var(--ink);
          text-align: left;
        }
        .adm-exp__user-header:hover {
          background: #f4f4ec;
        }
        .adm-exp__user-toggle {
          color: var(--ink-mute);
          font-size: 11px;
        }
        .adm-exp__user-code {
          font-family: var(--font-mono);
          color: var(--ink-mute);
          font-size: 12px;
        }
        .adm-exp__user-name {
          font-weight: 500;
        }
        .adm-exp__user-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.02em;
          white-space: nowrap;
          border: 1px solid transparent;
          justify-self: start;
        }
        .adm-exp__user-status--none {
          background: #fafaf5;
          color: var(--ink-soft);
          border-color: var(--line);
          border-style: dashed;
        }
        .adm-exp__user-status--submitted {
          background: #FAEFD0;
          color: #8B6914;
          border-color: #E8D9A0;
        }
        .adm-exp__user-status--confirmed {
          background: #E2EED1;
          color: #4E6B3A;
          border-color: #C2D6A5;
        }
        .adm-exp__user-total {
          font-weight: 600;
          color: var(--ink);
          text-align: right;
        }
        .adm-exp__user-count {
          font-size: 11.5px;
          color: var(--ink-soft);
          text-align: right;
        }
        .adm-exp__user-body {
          padding: 12px 16px 16px;
          border-top: 1px solid var(--line);
        }
        .adm-exp__empty {
          padding: 16px;
          text-align: center;
          color: var(--ink-soft);
          font-size: 12.5px;
          background: #fafaf5;
          border-radius: 6px;
        }
        .adm-exp__category-group {
          margin-bottom: 12px;
        }
        .adm-exp__category-group:last-child {
          margin-bottom: 0;
        }
        .adm-exp__category-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 10px;
          background: #f8f5e9;
          border-radius: 4px;
          font-size: 12.5px;
        }
        .adm-exp__category-name {
          font-weight: 500;
          color: var(--ink);
        }
        .adm-exp__category-count {
          color: var(--ink-soft);
          font-size: 11px;
        }
        .adm-exp__category-total {
          margin-left: auto;
          font-weight: 600;
          color: var(--ink);
        }
        .adm-exp__items-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4px;
          font-size: 12.5px;
        }
        .adm-exp__item-row td {
          padding: 6px 10px;
          border-bottom: 1px solid #f0eee5;
          vertical-align: middle;
        }
        .adm-exp__item-row:last-child td {
          border-bottom: none;
        }
        .adm-exp__item-date {
          width: 110px;
          color: var(--ink-mute);
          white-space: nowrap;
        }
        .adm-exp__item-meta {
          width: 220px;
        }
        .adm-exp__tag {
          display: inline-block;
          padding: 1px 6px;
          background: #f4f4ec;
          color: var(--ink-mute);
          border-radius: 3px;
          font-size: 11px;
          margin-right: 4px;
        }
        .adm-exp__item-memo {
          color: var(--ink-mute);
          font-size: 12px;
        }
        .adm-exp__item-amount {
          width: 100px;
          text-align: right;
          font-weight: 500;
          white-space: nowrap;
        }
        .adm-exp__item-receipt {
          width: 36px;
          text-align: center;
        }
        .adm-exp__receipt-btn {
          background: none;
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 2px 6px;
          cursor: pointer;
          font-size: 14px;
        }
        .adm-exp__receipt-btn:hover {
          background: #f5f5ee;
        }
      `}</style>
    </div>
  );
}

export default AdminExpenseListPage;
