// Phase C-3 (cont.): business_trip → business リネーム & trip_type 撤去
// Bug fix 2026-05-27: userId を auth_user_id ではなく public.users.id に修正
//   (expense_requests.user_id は public.users.id を参照しているため、
//    auth_user_id で SELECT すると0件になっていた)
// 2026-06-01 追加: 月次経費締め機能 (ExpenseClosureSubmitButton)
//   - 月ヘッダー右上に「📤 この月を提出」ボタン
//   - 確定済 (locked) の月は新規追加・編集ともにロック
import { useEffect, useMemo, useState } from 'react';
import { useAppUser } from '../../lib/useAppUser';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import { useExpenseCategories } from './useExpenseCategories';
import { useExpenseMonthly } from './useExpenseMonthly';
import { useReceiptUpload } from './useReceiptUpload';
import { ExpenseModal } from './ExpenseModal';
import { ExpenseClosureSubmitButton } from './ExpenseClosureSubmitButton';
import { useMonthlyExpenseClosure } from './useMonthlyExpenseClosure';
import {
  formatAmount,
  formatDateShort,
  calcMonthlyTotal,
  calcCategoryTotals,
  transportLabel,
} from './expenseUtils';
import type { ExpenseRequest, ExpenseCategoryCode } from './types';
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_ICONS,
} from './types';

/**
 * Phase C-3: projects 廃止に伴い projects → clients に変更。
 *   - ProjectOption → ClientOption
 *   - DBアクセス: from('projects') → from('clients')
 *   - 表示: project_code を持たないため name のみ表示
 */
type ClientOption = {
  id: string;
  name: string;
  is_internal?: boolean;
};

const CATEGORY_ORDER: ExpenseCategoryCode[] = [
  'commute',
  'business',
  'reimbursement',
];

export function ExpensePanel() {
  const { appUser } = useAppUser();
  // ⚠ expense_requests.user_id は public.users.id を参照しているため、
  //    appUser.id (= public.users.id) を使う必要がある。
  //    auth_user_id を渡すと WHERE user_id = '...' でマッチせず0件になる。
  const userId = appUser?.id || null;

  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);

  // 月次経費締め状態 (確定済ならロック)
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const { lock: expenseLock } = useMonthlyExpenseClosure(userId, yearMonth);

  const { categories } = useExpenseCategories();
  const { expenses, loading, error, reload } = useExpenseMonthly({
    userId,
    year,
    month,
  });
  const { getSignedUrl } = useReceiptUpload();

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<ExpenseRequest | null>(null);

  // クライアント一覧を取得 (社内擬似クライアント含む)
  useEffect(() => {
    let cancelled = false;
    async function loadClients() {
      try {
        const supabase = getSupabase();
        if (!supabase) return;
        const { data, error: dbError } = await withTimeout(
          supabase
            .from('clients')
            .select('id, name, is_internal')
            .eq('is_active', true)
            .order('is_internal', { ascending: false })
            .order('name', { ascending: true }),
          10000,
          'clients fetch for expenses'
        );
        if (dbError) throw dbError;
        if (!cancelled) {
          setClients((data || []) as ClientOption[]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.log('loadClients error:', msg);
      }
    }
    loadClients();
    return () => {
      cancelled = true;
    };
  }, []);

  const monthlyTotal = useMemo(() => calcMonthlyTotal(expenses), [expenses]);
  const categoryTotals = useMemo(
    () => calcCategoryTotals(expenses),
    [expenses]
  );

  function handlePrevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  }

  function handleNextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  }

  function handleAddNew() {
    if (expenseLock.locked) return; // 確定済はロック
    setEditing(null);
    setModalOpen(true);
  }

  function handleEdit(expense: ExpenseRequest) {
    if (expenseLock.locked) return; // 確定済は編集不可
    setEditing(expense);
    setModalOpen(true);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleSaved() {
    reload();
  }

  async function handleViewReceipt(receiptUrl: string) {
    const signed = await getSignedUrl(receiptUrl);
    if (signed) {
      window.open(signed, '_blank', 'noopener,noreferrer');
    }
  }

  // クライアント名を取得するヘルパー
  function getClientName(clientId: string | null): string {
    if (!clientId) return '';
    const c = clients.find((cli) => cli.id === clientId);
    return c ? c.name : '';
  }

  return (
    <div className="expense-panel">
      <header className="expense-panel__header">
        <div className="expense-panel__title-row">
          <h1 className="expense-panel__title">経費申請</h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {userId && (
              <ExpenseClosureSubmitButton
                userId={userId}
                actorId={userId}
                yearMonth={yearMonth}
              />
            )}
            <button
              type="button"
              className="expense-panel__add-btn"
              onClick={handleAddNew}
              disabled={!userId || expenseLock.locked}
              title={
                expenseLock.locked
                  ? 'この月は確定済のため新規追加できません'
                  : undefined
              }
            >
              {expenseLock.locked ? '🔒 追加 (ロック中)' : '+ 経費を追加'}
            </button>
          </div>
        </div>

        <div className="expense-panel__month-nav">
          <button
            type="button"
            className="expense-panel__month-btn"
            onClick={handlePrevMonth}
          >
            ‹ 前月
          </button>
          <div className="expense-panel__month-label">
            {year}年 {month}月
          </div>
          <button
            type="button"
            className="expense-panel__month-btn"
            onClick={handleNextMonth}
          >
            翌月 ›
          </button>
        </div>
      </header>

      {/* サマリー */}
      <section className="expense-summary">
        <div className="expense-summary__total">
          <div className="expense-summary__total-label">今月の合計</div>
          <div className="expense-summary__total-value">
            {formatAmount(monthlyTotal)}
          </div>
        </div>
        <div className="expense-summary__breakdown">
          {CATEGORY_ORDER.map((code) => (
            <div key={code} className="expense-summary__category">
              <div className="expense-summary__category-icon">
                {EXPENSE_CATEGORY_ICONS[code]}
              </div>
              <div className="expense-summary__category-body">
                <div className="expense-summary__category-label">
                  {EXPENSE_CATEGORY_LABELS[code]}
                </div>
                <div className="expense-summary__category-value">
                  {formatAmount(categoryTotals[code] || 0)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* エラー */}
      {error && (
        <div className="expense-panel__error">
          データ取得エラー: {error}
        </div>
      )}

      {/* リスト */}
      <section className="expense-list">
        <div className="expense-list__header">
          <h2 className="expense-list__title">
            申請一覧({expenses.length}件)
            {expenseLock.locked && (
              <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
                🔒 確定済のため編集できません
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="expense-list__empty">読み込み中...</div>
        ) : expenses.length === 0 ? (
          <div className="expense-list__empty">
            この月の経費申請はありません
          </div>
        ) : (
          <div className="expense-list__items">
            {expenses.map((e) => (
              <div
                key={e.id}
                className="expense-item"
                onClick={() => handleEdit(e)}
                style={
                  expenseLock.locked
                    ? { cursor: 'not-allowed', opacity: 0.75 }
                    : undefined
                }
                title={
                  expenseLock.locked
                    ? 'この月は確定済のため編集できません'
                    : undefined
                }
              >
                <div className="expense-item__date">
                  {formatDateShort(e.date)}
                </div>
                <div className="expense-item__main">
                  <div className="expense-item__category">
                    <span className="expense-item__icon">
                      {EXPENSE_CATEGORY_ICONS[e.category_code]}
                    </span>
                    <span className="expense-item__category-label">
                      {EXPENSE_CATEGORY_LABELS[e.category_code]}
                    </span>
                  </div>
                  <div className="expense-item__meta">
                    {e.transport_type && (
                      <span className="expense-item__meta-tag">
                        {transportLabel(e.transport_type)}
                      </span>
                    )}
                    {e.client_id && (
                      <span className="expense-item__meta-tag">
                        {getClientName(e.client_id)}
                      </span>
                    )}
                  </div>
                  {e.memo && (
                    <div className="expense-item__memo">{e.memo}</div>
                  )}
                </div>
                <div className="expense-item__amount">
                  {formatAmount(e.amount)}
                </div>
                <div className="expense-item__actions">
                  {e.receipt_url && (
                    <button
                      type="button"
                      className="expense-item__receipt-btn"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleViewReceipt(e.receipt_url as string);
                      }}
                      title="領収書を見る"
                    >
                      📎
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* モーダル */}
      {userId && (
        <ExpenseModal
          open={modalOpen}
          userId={userId}
          categories={categories}
          clients={clients}
          editing={editing}
          onClose={handleCloseModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

export default ExpensePanel;
