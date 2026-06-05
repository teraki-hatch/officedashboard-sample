import { useMemo, useState } from 'react';
import { getSupabase } from '../../../lib/supabase';
import { withTimeout } from '../../../lib/withTimeout';
import {
  useCompanyExpenses,
  deleteExpense,
} from './useCompanyExpenses';
import type { CompanyExpense, ExpenseCategory } from './types';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  calcExclTax,
  toYearMonth,
} from './types';
import './MonthlyExpenseDetail.css';

function formatYen(n: number): string {
  return '¥' + Math.round(Number(n || 0)).toLocaleString('ja-JP');
}

function getCurrentYearMonth(): string {
  const today = new Date();
  return toYearMonth(today.getFullYear(), today.getMonth() + 1);
}

function getYearMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const today = new Date();
  for (let i = -3; i < 24; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    options.push({
      value: toYearMonth(y, m),
      label: `${y}年 ${String(m).padStart(2, '0')}月`,
    });
  }
  return options;
}

// 編集中の行データ
type EditRow = {
  id: string;
  isNew: boolean;
  category: ExpenseCategory;
  item_name: string;
  sub_type: string;
  amount_incl_tax: number;
  tax_rate: number;
  memo: string;
  is_completed: boolean;
  source?: string | null;
  source_id?: string | null;
  user_id?: string | null;
  _deleted?: boolean;
};

let newIdCounter = 0;
function genNewId(): string {
  newIdCounter++;
  return `new-${Date.now()}-${newIdCounter}`;
}

function getDefaultsForCategory(cat: ExpenseCategory): {
  tax_rate: number;
  sub_type: string;
} {
  switch (cat) {
    case 'jinkenhi':
      return { tax_rate: 0, sub_type: '給与賃金' };
    case 'hokenryo':
      return { tax_rate: 0, sub_type: '保険料' };
    case 'chintairyo':
      return { tax_rate: 0.1, sub_type: '賃貸料' };
    case 'ryohi_kotsu':
      return { tax_rate: 0.1, sub_type: '旅費交通費' };
    case 'tsushin':
      return { tax_rate: 0.1, sub_type: '通信費' };
    case 'subsc':
      return { tax_rate: 0.1, sub_type: 'サブスク費' };
    case 'kounetsu':
      return { tax_rate: 0.1, sub_type: '光熱費' };
    case 'settai':
      return { tax_rate: 0.1, sub_type: '接待交際費' };
    case 'komon':
      return { tax_rate: 0.1, sub_type: '顧問料' };
    case 'genka':
      return { tax_rate: 0, sub_type: '減価償却費' };
    case 'other':
    default:
      return { tax_rate: 0.1, sub_type: '' };
  }
}

export function MonthlyExpenseDetail() {
  const [yearMonth, setYearMonth] = useState<string>(getCurrentYearMonth());
  const { expenses, loading, error, reload } = useCompanyExpenses(yearMonth);

  const [editingCategory, setEditingCategory] =
    useState<ExpenseCategory | null>(null);
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const ymOptions = useMemo(() => getYearMonthOptions(), []);

  function handleYearMonthChange(ym: string) {
    if (editingCategory) {
      if (!window.confirm('編集中の内容が破棄されます。月を切り替えますか？')) {
        return;
      }
      setEditingCategory(null);
      setEditRows([]);
      setSaveError(null);
    }
    setYearMonth(ym);
  }

  // 前月の年月を計算
  function getPreviousYearMonth(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 2, 1); // m-1 が当月、m-2 が前月
    return toYearMonth(d.getFullYear(), d.getMonth() + 1);
  }

  // 前月コピー
  async function handleCopyFromPreviousMonth() {
    if (editingCategory) {
      alert('編集中は前月コピーできません。保存またはキャンセルしてください。');
      return;
    }

    const prevYm = getPreviousYearMonth(yearMonth);
    const prevYmLabel = prevYm.replace('-', '年') + '月';

    if (expenses.length > 0) {
      if (
        !window.confirm(
          `この月（${yearMonth.replace('-', '年')}月）には既に${expenses.length}件の経費があります。\n` +
            `前月（${prevYmLabel}）の経費をまるごとコピーして追加しますか？\n` +
            `※既存の項目は残ります（重複の可能性あり）`
        )
      ) {
        return;
      }
    } else {
      if (
        !window.confirm(
          `前月（${prevYmLabel}）の経費をまるごとコピーしますか？`
        )
      ) {
        return;
      }
    }

    setCopying(true);
    setCopyError(null);

    const supabase = getSupabase();
    if (!supabase) {
      setCopyError('Supabase未設定');
      setCopying(false);
      return;
    }

    try {
      // 前月の経費を取得
      const fetchRes = (await withTimeout(
        supabase
          .from('company_expenses')
          .select('*')
          .eq('year_month', prevYm),
        15000,
        'fetch previous month expenses'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      )) as any;
      if (fetchRes.error) throw fetchRes.error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevRows = (fetchRes.data || []) as any[];

      if (prevRows.length === 0) {
        alert(`前月（${prevYmLabel}）に経費がありません`);
        setCopying(false);
        return;
      }

      // manual と salary_master のみコピー対象 (個人精算は本人が再申請するので除外)
      const copyableRows = prevRows.filter(
        (r) => r.source !== 'expense_claim'
      );

      if (copyableRows.length === 0) {
        alert(
          `前月（${prevYmLabel}）には個人精算分しかないため、コピーをスキップしました`
        );
        setCopying(false);
        return;
      }

      // INSERT用に変換 (id, created_at, updated_at, source_id を除外、year_month を当月に変更)
      const insertPayload = copyableRows.map((r) => ({
        year_month: yearMonth,
        category: r.category,
        item_name: r.item_name,
        sub_type: r.sub_type,
        amount_incl_tax: r.amount_incl_tax,
        tax_rate: r.tax_rate,
        memo: r.memo,
        is_completed: false, // コピーした分は未完了で入れる(確認しやすいように)
        source: 'manual', // salary_master由来も manual として扱う
        user_id: r.user_id,
      }));

      const insertRes = (await withTimeout(
        supabase.from('company_expenses').insert(insertPayload),
        15000,
        'bulk copy expenses'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      )) as any;
      if (insertRes.error) throw insertRes.error;

      alert(`前月から ${insertPayload.length} 件コピーしました`);
      setCopying(false);
      reload();
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCopyError((e as any).message || 'コピーエラー');
      setCopying(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<ExpenseCategory, CompanyExpense[]>();
    for (const c of EXPENSE_CATEGORIES) map.set(c, []);
    for (const e of expenses) {
      const list = map.get(e.category) || [];
      list.push(e);
      map.set(e.category, list);
    }
    return map;
  }, [expenses]);

  const total = useMemo(() => {
    let incl = 0;
    let excl = 0;
    for (const e of expenses) {
      incl += e.amount_incl_tax;
      excl += calcExclTax(e.amount_incl_tax, e.tax_rate);
    }
    return { incl, excl };
  }, [expenses]);

  function enterEditMode(cat: ExpenseCategory) {
    if (editingCategory && editingCategory !== cat) {
      if (
        !window.confirm(
          '別カテゴリを編集中です。変更を破棄して切り替えますか？'
        )
      ) {
        return;
      }
    }
    const rows: EditRow[] = expenses
      .filter((e) => e.category === cat)
      .map((e) => ({
        id: e.id,
        isNew: false,
        category: e.category,
        item_name: e.item_name,
        sub_type: e.sub_type || '',
        amount_incl_tax: e.amount_incl_tax,
        tax_rate: e.tax_rate,
        memo: e.memo || '',
        is_completed: e.is_completed,
        source: e.source,
        source_id: e.source_id,
        user_id: e.user_id,
      }));
    setEditRows(rows);
    setSaveError(null);
    setEditingCategory(cat);
  }

  function cancelEdit() {
    if (window.confirm('編集内容を破棄してもよろしいですか？')) {
      setEditRows([]);
      setEditingCategory(null);
      setSaveError(null);
    }
  }

  function updateRow(id: string, patch: Partial<EditRow>) {
    setEditRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function markDelete(id: string) {
    const row = editRows.find((r) => r.id === id);
    if (!row) return;
    if (row.isNew) {
      setEditRows((prev) => prev.filter((r) => r.id !== id));
    } else {
      if (window.confirm(`「${row.item_name}」を削除しますか？`)) {
        updateRow(id, { _deleted: true });
      }
    }
  }

  function addRow(cat: ExpenseCategory) {
    const defaults = getDefaultsForCategory(cat);
    const newRow: EditRow = {
      id: genNewId(),
      isNew: true,
      category: cat,
      item_name: '',
      sub_type: defaults.sub_type,
      amount_incl_tax: 0,
      tax_rate: defaults.tax_rate,
      memo: '',
      is_completed: true,
    };
    setEditRows((prev) => [...prev, newRow]);
  }

  async function saveAll() {
    setSaving(true);
    setSaveError(null);

    const supabase = getSupabase();
    if (!supabase) {
      setSaveError('Supabase未設定');
      setSaving(false);
      return;
    }

    try {
      const toDelete = editRows.filter((r) => !r.isNew && r._deleted);
      for (const r of toDelete) {
        const res = await deleteExpense(r.id);
        if ('error' in res) {
          throw new Error(`削除エラー (${r.item_name}): ${res.error}`);
        }
      }

      const toInsert = editRows
        .filter((r) => r.isNew && !r._deleted)
        .filter((r) => r.item_name.trim().length > 0);

      if (toInsert.length > 0) {
        const insertPayload = toInsert.map((r) => ({
          year_month: yearMonth,
          category: r.category,
          item_name: r.item_name.trim(),
          sub_type: r.sub_type || null,
          amount_incl_tax: r.amount_incl_tax,
          tax_rate: r.tax_rate,
          memo: r.memo || null,
          is_completed: r.is_completed,
          source: 'manual',
        }));
        const res = (await withTimeout(
          supabase.from('company_expenses').insert(insertPayload),
          15000,
          'bulk insert expenses'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        )) as any;
        if (res.error) throw res.error;
      }

      const toUpdate = editRows.filter((r) => !r.isNew && !r._deleted);
      for (const r of toUpdate) {
        const isLocked =
          r.source === 'expense_claim' || r.source === 'salary_master';
        const updatePayload = isLocked
          ? {
              memo: r.memo || null,
              is_completed: r.is_completed,
              sub_type: r.sub_type || null,
            }
          : {
              category: r.category,
              item_name: r.item_name.trim(),
              sub_type: r.sub_type || null,
              amount_incl_tax: r.amount_incl_tax,
              tax_rate: r.tax_rate,
              memo: r.memo || null,
              is_completed: r.is_completed,
            };
        const res = (await withTimeout(
          supabase
            .from('company_expenses')
            .update(updatePayload)
            .eq('id', r.id),
          15000,
          'update expense'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        )) as any;
        if (res.error) throw res.error;
      }

      setEditRows([]);
      setEditingCategory(null);
      setSaving(false);
      reload();
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSaveError((e as any).message || '保存エラー');
      setSaving(false);
    }
  }

  // 未登録カテゴリ (まだ項目が1つもないもの)
  const unusedCategories = EXPENSE_CATEGORIES.filter(
    (cat) => (grouped.get(cat) || []).length === 0 && editingCategory !== cat
  );

  return (
    <div className="month-exp">
      <div className="month-exp__toolbar">
        <select
          className="month-exp__ym-select"
          value={yearMonth}
          onChange={(e) => handleYearMonthChange(e.target.value)}
        >
          {ymOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="month-exp__total">
          <span className="month-exp__total-label">合計</span>
          <span className="month-exp__total-incl">
            税込 {formatYen(total.incl)}
          </span>
          <span className="month-exp__total-excl">
            税抜 {formatYen(total.excl)}
          </span>
        </div>

        <button
          type="button"
          className="month-exp__copy-btn"
          onClick={handleCopyFromPreviousMonth}
          disabled={loading || copying || !!editingCategory}
          title="前月の経費をまるごとこの月にコピーします"
        >
          {copying ? 'コピー中...' : '前月の値をコピー'}
        </button>
      </div>

      {error && <div className="month-exp__error">エラー: {error}</div>}
      {saveError && (
        <div className="month-exp__error">エラー: {saveError}</div>
      )}
      {copyError && (
        <div className="month-exp__error">エラー: {copyError}</div>
      )}

      {loading ? (
        <div className="month-exp__loading">読み込み中...</div>
      ) : (
        <div className="month-exp__categories">
          {EXPENSE_CATEGORIES.map((cat) => {
            const isEditing = editingCategory === cat;
            const displayRows = grouped.get(cat) || [];
            const visibleEditRows = editRows.filter((r) => !r._deleted);

            // 編集中ではなく、項目が0件のカテゴリは非表示
            if (!isEditing && displayRows.length === 0) return null;

            const catIncl = isEditing
              ? visibleEditRows.reduce((acc, r) => acc + r.amount_incl_tax, 0)
              : displayRows.reduce((acc, r) => acc + r.amount_incl_tax, 0);
            const catExcl = isEditing
              ? visibleEditRows.reduce(
                  (acc, r) => acc + calcExclTax(r.amount_incl_tax, r.tax_rate),
                  0
                )
              : displayRows.reduce(
                  (acc, r) => acc + calcExclTax(r.amount_incl_tax, r.tax_rate),
                  0
                );
            const rowCount = isEditing
              ? visibleEditRows.length
              : displayRows.length;

            return (
              <section
                key={cat}
                className={
                  'month-exp__category' +
                  (isEditing ? ' month-exp__category--editing' : '')
                }
              >
                <div className="month-exp__category-header">
                  <div className="month-exp__category-title">
                    <span className="month-exp__category-name">
                      {EXPENSE_CATEGORY_LABELS[cat]}
                    </span>
                    <span className="month-exp__category-count">
                      {rowCount}件
                    </span>
                    {isEditing && (
                      <span className="month-exp__editing-badge">
                        編集中
                      </span>
                    )}
                  </div>
                  <div className="month-exp__category-totals">
                    <span className="month-exp__category-incl">
                      税込 {formatYen(catIncl)}
                    </span>
                    <span className="month-exp__category-excl">
                      税抜 {formatYen(catExcl)}
                    </span>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="month-exp__category-add"
                          onClick={() => addRow(cat)}
                          disabled={saving}
                        >
                          ＋ 項目追加
                        </button>
                        <button
                          type="button"
                          className="month-exp__cancel-btn month-exp__cancel-btn--small"
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          キャンセル
                        </button>
                        <button
                          type="button"
                          className="month-exp__save-btn month-exp__save-btn--small"
                          onClick={saveAll}
                          disabled={saving}
                        >
                          {saving ? '保存中...' : '保存'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="month-exp__edit-mode-btn month-exp__edit-mode-btn--small"
                        onClick={() => enterEditMode(cat)}
                      >
                        編集
                      </button>
                    )}
                  </div>
                </div>

                {rowCount > 0 && (
                  <table
                    className={
                      'month-exp__table' +
                      (isEditing ? ' month-exp__table--editing' : '')
                    }
                  >
                    <thead>
                      <tr>
                        <th className="month-exp__th month-exp__th--check">
                          完了
                        </th>
                        <th className="month-exp__th">計上項目</th>
                        <th className="month-exp__th">種別</th>
                        <th className="month-exp__th month-exp__th--num">
                          税込
                        </th>
                        {isEditing ? (
                          <th className="month-exp__th month-exp__th--rate">
                            税率
                          </th>
                        ) : (
                          <th className="month-exp__th month-exp__th--num">
                            税抜
                          </th>
                        )}
                        <th className="month-exp__th">備考</th>
                        {isEditing && (
                          <th className="month-exp__th month-exp__th--actions">
                            
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {isEditing
                        ? visibleEditRows.map((r) => {
                            const isLocked =
                              r.source === 'expense_claim' ||
                              r.source === 'salary_master';
                            return (
                              <tr
                                key={r.id}
                                className={
                                  'month-exp__row' +
                                  (isLocked ? ' month-exp__row--locked' : '')
                                }
                              >
                                <td className="month-exp__td month-exp__td--check">
                                  <input
                                    type="checkbox"
                                    checked={r.is_completed}
                                    onChange={(e) =>
                                      updateRow(r.id, {
                                        is_completed: e.target.checked,
                                      })
                                    }
                                  />
                                </td>
                                <td className="month-exp__td">
                                  <input
                                    type="text"
                                    className="month-exp__inline-input"
                                    value={r.item_name}
                                    placeholder="項目名"
                                    disabled={isLocked}
                                    onChange={(e) =>
                                      updateRow(r.id, {
                                        item_name: e.target.value,
                                      })
                                    }
                                  />
                                  {isLocked && (
                                    <span className="month-exp__source-badge">
                                      {r.source === 'expense_claim'
                                        ? '個人精算'
                                        : '給与マスタ'}
                                    </span>
                                  )}
                                </td>
                                <td className="month-exp__td">
                                  <input
                                    type="text"
                                    className="month-exp__inline-input month-exp__inline-input--small"
                                    value={r.sub_type}
                                    placeholder="—"
                                    onChange={(e) =>
                                      updateRow(r.id, {
                                        sub_type: e.target.value,
                                      })
                                    }
                                  />
                                </td>
                                <td className="month-exp__td month-exp__td--num">
                                  <input
                                    type="number"
                                    className="month-exp__inline-input month-exp__inline-input--num"
                                    value={r.amount_incl_tax || ''}
                                    placeholder="0"
                                    disabled={isLocked}
                                    onChange={(e) =>
                                      updateRow(r.id, {
                                        amount_incl_tax:
                                          Number(e.target.value) || 0,
                                      })
                                    }
                                  />
                                </td>
                                <td className="month-exp__td">
                                  <select
                                    className="month-exp__inline-input month-exp__inline-input--small"
                                    value={r.tax_rate}
                                    disabled={isLocked}
                                    onChange={(e) =>
                                      updateRow(r.id, {
                                        tax_rate: Number(e.target.value),
                                      })
                                    }
                                  >
                                    <option value={0.1}>10%</option>
                                    <option value={0.08}>8%</option>
                                    <option value={0}>0%</option>
                                  </select>
                                </td>
                                <td className="month-exp__td">
                                  <input
                                    type="text"
                                    className="month-exp__inline-input"
                                    value={r.memo}
                                    placeholder="—"
                                    onChange={(e) =>
                                      updateRow(r.id, {
                                        memo: e.target.value,
                                      })
                                    }
                                  />
                                </td>
                                <td className="month-exp__td month-exp__td--actions">
                                  <button
                                    type="button"
                                    className="month-exp__action-btn month-exp__action-btn--danger"
                                    onClick={() => markDelete(r.id)}
                                    disabled={saving}
                                  >
                                    削除
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        : displayRows.map((r) => {
                            const excl = calcExclTax(
                              r.amount_incl_tax,
                              r.tax_rate
                            );
                            return (
                              <tr
                                key={r.id}
                                className={
                                  'month-exp__row' +
                                  (r.is_completed
                                    ? ' month-exp__row--completed'
                                    : '')
                                }
                              >
                                <td className="month-exp__td month-exp__td--check">
                                  <input
                                    type="checkbox"
                                    checked={r.is_completed}
                                    disabled
                                  />
                                </td>
                                <td className="month-exp__td month-exp__td--name">
                                  {r.item_name}
                                  {r.source !== 'manual' && r.source && (
                                    <span className="month-exp__source-badge">
                                      {r.source === 'expense_claim'
                                        ? '個人精算'
                                        : '給与マスタ'}
                                    </span>
                                  )}
                                </td>
                                <td className="month-exp__td">
                                  {r.sub_type || (
                                    <span className="month-exp__mute">—</span>
                                  )}
                                </td>
                                <td className="month-exp__td month-exp__td--num">
                                  {formatYen(r.amount_incl_tax)}
                                </td>
                                <td className="month-exp__td month-exp__td--num month-exp__td--mute">
                                  {formatYen(excl)}
                                </td>
                                <td className="month-exp__td month-exp__td--memo">
                                  {r.memo || (
                                    <span className="month-exp__mute">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                    </tbody>
                  </table>
                )}

                {rowCount === 0 && isEditing && (
                  <div className="month-exp__empty-inline">
                    「＋ 項目追加」から項目を追加してください
                  </div>
                )}
              </section>
            );
          })}

          {expenses.length === 0 && !editingCategory && (
            <div className="month-exp__empty">
              この月の経費はまだ登録されていません。下の「＋カテゴリ」ボタンから登録してください。
            </div>
          )}

          {/* 未登録カテゴリの「+カテゴリ」追加セクション */}
          {!editingCategory && unusedCategories.length > 0 && (
            <div className="month-exp__add-category-section">
              <div className="month-exp__add-category-label">
                他のカテゴリに項目を追加:
              </div>
              <div className="month-exp__add-category-buttons">
                {unusedCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className="month-exp__add-category-btn"
                    onClick={() => enterEditMode(cat)}
                  >
                    ＋ {EXPENSE_CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MonthlyExpenseDetail;
