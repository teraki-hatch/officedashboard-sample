import { useEffect, useMemo, useState } from 'react';
import { useActiveUsers } from './useActiveUsers';
import { usePerformanceTargetsPeriod } from './usePerformanceTargetsYear';
import { useTargetMutations } from './useTargetMutations';
import type {
  DealCategory,
  TargetInput,
} from './types';
import {
  COMPANY_USER_CODE,
  COMPANY_USER_ID,
  COMPANY_CATEGORIES,
  DEAL_CATEGORY_ICONS,
  DEAL_CATEGORY_LABELS,
  DEAL_CATEGORY_ORDER,
} from './types';
import {
  FISCAL_MONTHS,
  fiscalToYearMonth,
  getFiscalMonthLabel,
  getFiscalPeriodLabel,
  getFiscalPeriodShortLabel,
} from './fiscalPeriod';
import './TargetModal.css';

type TargetModalProps = {
  open: boolean;
  initialPeriod: number; // 期番号 (例: 7)
  authUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
};

type CellValues = {
  sales_target: string;
  deal_target: string;
  gross_profit_target: string;
};

// 値マップ: user_id -> category -> fiscalMonthIndex(1-12) -> CellValues
type ValuesMap = Record<string, Record<string, Record<number, CellValues>>>;

const EMPTY_CELL: CellValues = {
  sales_target: '',
  deal_target: '',
  gross_profit_target: '',
};

const FISCAL_MONTH_INDICES = FISCAL_MONTHS.map((m) => m.fiscalMonthIndex);

type FieldTab = 'sales_target' | 'deal_target' | 'gross_profit_target';
const FIELD_TABS: { key: FieldTab; label: string; unit: string }[] = [
  { key: 'sales_target', label: '売上', unit: '円' },
  { key: 'deal_target', label: '成約', unit: '件' },
  { key: 'gross_profit_target', label: '粗利', unit: '円' },
];

export function TargetModal(props: TargetModalProps) {
  const { open, initialPeriod, authUserId, onClose, onSaved } = props;
  const { users: allUsers } = useActiveUsers();
  const { upsertTargets, saving, error: mutError } = useTargetMutations();

  // モーダル内で期を切り替えられる
  const [period, setPeriod] = useState<number>(initialPeriod);

  useEffect(() => {
    if (open) setPeriod(initialPeriod);
  }, [open, initialPeriod]);

  const { targets, loading, reload } = usePerformanceTargetsPeriod({ period });

  const personalUsers = useMemo(
    () => allUsers.filter((u) => u.employee_code !== COMPANY_USER_CODE),
    [allUsers]
  );

  const [values, setValues] = useState<ValuesMap>({});
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [fieldTabByUser, setFieldTabByUser] = useState<Record<string, FieldTab>>({});
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 期トグルの選択肢 (前期・今期・次期)
  const PERIOD_OPTIONS = [initialPeriod, initialPeriod + 1, initialPeriod + 2];

  // targets が変わったら state を初期化
  useEffect(() => {
    if (!open) return;
    const next: ValuesMap = {};
    const expanded = new Set<string>();

    // 個人社員 × 全カテゴリ × 12ヶ月 を空セルで初期化
    for (const u of personalUsers) {
      next[u.id] = {};
      for (const cat of DEAL_CATEGORY_ORDER) {
        next[u.id][cat] = {};
        for (const fmi of FISCAL_MONTH_INDICES) {
          next[u.id][cat][fmi] = { ...EMPTY_CELL };
        }
      }
    }
    // 会社ユーザー × 会社カテゴリ × 12ヶ月
    next[COMPANY_USER_ID] = {};
    for (const cat of COMPANY_CATEGORIES) {
      next[COMPANY_USER_ID][cat] = {};
      for (const fmi of FISCAL_MONTH_INDICES) {
        next[COMPANY_USER_ID][cat][fmi] = { ...EMPTY_CELL };
      }
    }

    // 既存 targets の値を反映
    // year_month -> 期内月インデックス への変換
    for (const t of targets) {
      // year_month = "YYYY-MM"
      // FISCAL_MONTHS のどれに該当するかを期から逆算
      for (const fm of FISCAL_MONTHS) {
        const ym = fiscalToYearMonth(period, fm.fiscalMonthIndex);
        if (ym === t.year_month) {
          if (!next[t.user_id]) next[t.user_id] = {};
          if (!next[t.user_id][t.category]) next[t.user_id][t.category] = {};
          next[t.user_id][t.category][fm.fiscalMonthIndex] = {
            sales_target: t.sales_target ? String(t.sales_target) : '',
            deal_target: t.deal_target ? String(t.deal_target) : '',
            gross_profit_target: t.gross_profit_target
              ? String(t.gross_profit_target)
              : '',
          };
          if (
            Number(t.sales_target) > 0 ||
            Number(t.deal_target) > 0 ||
            Number(t.gross_profit_target) > 0
          ) {
            expanded.add(t.user_id);
          }
          break;
        }
      }
    }

    setValues(next);
    setExpandedUsers(expanded);
    setErrMsg(null);
  }, [open, targets, personalUsers, period]);

  if (!open) return null;

  const toggleExpand = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const getFieldTab = (userId: string): FieldTab => {
    return fieldTabByUser[userId] || 'sales_target';
  };

  const setFieldTab = (userId: string, tab: FieldTab) => {
    setFieldTabByUser((prev) => ({ ...prev, [userId]: tab }));
  };

  const updateCell = (
    userId: string,
    category: DealCategory,
    fiscalMonthIndex: number,
    field: keyof CellValues,
    value: string
  ) => {
    setValues((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [category]: {
          ...(prev[userId]?.[category] || {}),
          [fiscalMonthIndex]: {
            ...(prev[userId]?.[category]?.[fiscalMonthIndex] || EMPTY_CELL),
            [field]: value,
          },
        },
      },
    }));
  };

  const getFilledCount = (userId: string): number => {
    const userValues = values[userId] || {};
    let count = 0;
    for (const cat of DEAL_CATEGORY_ORDER) {
      const cv = userValues[cat] || {};
      for (const fmi of FISCAL_MONTH_INDICES) {
        const v = cv[fmi];
        if (!v) continue;
        if (
          Number(v.sales_target) > 0 ||
          Number(v.deal_target) > 0 ||
          Number(v.gross_profit_target) > 0
        ) {
          count++;
        }
      }
    }
    return count;
  };

  /** N月の値をその社員の全月にコピー */
  const copyMonthToAll = (userId: string, sourceFiscalMonthIndex: number) => {
    const monthLabel = getFiscalMonthLabel(sourceFiscalMonthIndex);
    if (!window.confirm(`${monthLabel}の値を期内の全月にコピーします。よろしいですか?`)) return;
    setValues((prev) => {
      const next = { ...prev };
      const userCats = { ...(next[userId] || {}) };
      for (const cat of Object.keys(userCats)) {
        const catMap = { ...userCats[cat] };
        const src = catMap[sourceFiscalMonthIndex] || EMPTY_CELL;
        for (const fmi of FISCAL_MONTH_INDICES) {
          catMap[fmi] = { ...src };
        }
        userCats[cat] = catMap;
      }
      next[userId] = userCats;
      return next;
    });
  };

  /** 前期同月をコピー (DB から取得) */
  const copyFromPrevPeriod = async (userId: string) => {
    const prevPeriod = period - 1;
    if (!window.confirm(`${getFiscalPeriodShortLabel(prevPeriod)}の目標を${getFiscalPeriodShortLabel(period)}にコピーします。よろしいですか?`)) return;
    try {
      const { getSupabase } = await import('../../lib/supabase');
      const supabase = getSupabase();
      if (!supabase) return;
      const startYm = fiscalToYearMonth(prevPeriod, 1);
      const endYm = fiscalToYearMonth(prevPeriod, 12);
      const { data, error: dbError } = await supabase
        .from('performance_targets')
        .select('user_id, year_month, category, sales_target, deal_target, gross_profit_target')
        .eq('user_id', userId)
        .gte('year_month', startYm)
        .lte('year_month', endYm);
      if (dbError) {
        setErrMsg(`前期データ取得に失敗: ${dbError.message}`);
        return;
      }
      const rows = (data || []) as Array<{
        user_id: string;
        year_month: string;
        category: string;
        sales_target: number | null;
        deal_target: number | null;
        gross_profit_target: number | null;
      }>;
      if (rows.length === 0) {
        setErrMsg(`${getFiscalPeriodShortLabel(prevPeriod)}の${getUserDisplayName(userId)}の目標は登録されていません`);
        return;
      }
      setValues((prev) => {
        const next = { ...prev };
        const userCats = { ...(next[userId] || {}) };
        for (const r of rows) {
          // r.year_month が前期のどの fiscalMonthIndex に対応するかを判定
          for (const fm of FISCAL_MONTHS) {
            const prevYm = fiscalToYearMonth(prevPeriod, fm.fiscalMonthIndex);
            if (prevYm === r.year_month) {
              const catMap = { ...(userCats[r.category] || {}) };
              catMap[fm.fiscalMonthIndex] = {
                sales_target: r.sales_target ? String(r.sales_target) : '',
                deal_target: r.deal_target ? String(r.deal_target) : '',
                gross_profit_target: r.gross_profit_target ? String(r.gross_profit_target) : '',
              };
              userCats[r.category] = catMap;
              break;
            }
          }
        }
        next[userId] = userCats;
        return next;
      });
      setErrMsg(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrMsg(`前期コピー失敗: ${msg}`);
    }
  };

  /** その社員の期間目標を全クリア */
  const clearUser = (userId: string) => {
    if (!window.confirm(`${getUserDisplayName(userId)}の${getFiscalPeriodShortLabel(period)}の目標を全てクリアします。よろしいですか?`)) return;
    setValues((prev) => {
      const next = { ...prev };
      const userCats = { ...(next[userId] || {}) };
      for (const cat of Object.keys(userCats)) {
        const catMap: Record<number, CellValues> = {};
        for (const fmi of FISCAL_MONTH_INDICES) {
          catMap[fmi] = { ...EMPTY_CELL };
        }
        userCats[cat] = catMap;
      }
      next[userId] = userCats;
      return next;
    });
  };

  /** 全社員一括クリア */
  const clearAll = () => {
    if (!window.confirm(`${getFiscalPeriodShortLabel(period)}の全社員の目標を全てクリアします。本当によろしいですか?`)) return;
    setValues((prev) => {
      const next: ValuesMap = {};
      for (const uid of Object.keys(prev)) {
        next[uid] = {};
        for (const cat of Object.keys(prev[uid])) {
          next[uid][cat] = {};
          for (const fmi of FISCAL_MONTH_INDICES) {
            next[uid][cat][fmi] = { ...EMPTY_CELL };
          }
        }
      }
      return next;
    });
  };

  const getUserDisplayName = (userId: string): string => {
    if (userId === COMPANY_USER_ID) return '会社';
    const u = personalUsers.find((x) => x.id === userId);
    return u ? u.name : 'ユーザー';
  };

  const handleSubmit = async () => {
    setErrMsg(null);
    const inputs: TargetInput[] = [];

    for (const userId of Object.keys(values)) {
      for (const cat of Object.keys(values[userId])) {
        const monthMap = values[userId][cat];
        for (const fmi of FISCAL_MONTH_INDICES) {
          const v = monthMap[fmi];
          if (!v) continue;

          const sales = Number(v.sales_target || 0);
          const deal = Number(v.deal_target || 0);
          const gross = Number(v.gross_profit_target || 0);

          const monthLabel = getFiscalMonthLabel(fmi);
          if (Number.isNaN(sales) || sales < 0) {
            setErrMsg(`売上目標は0以上の数値で入力してください (${monthLabel})`);
            return;
          }
          if (Number.isNaN(deal) || deal < 0) {
            setErrMsg(`成約件数は0以上の数値で入力してください (${monthLabel})`);
            return;
          }
          if (Number.isNaN(gross)) {
            setErrMsg(`粗利目標は数値で入力してください (${monthLabel})`);
            return;
          }

          if (sales > 0 || deal > 0 || gross > 0) {
            inputs.push({
              user_id: userId,
              year_month: fiscalToYearMonth(period, fmi),
              category: cat as DealCategory,
              sales_target: sales,
              deal_target: deal,
              gross_profit_target: gross,
              meeting_target: 0,
            });
          }
        }
      }
    }

    if (inputs.length === 0) {
      if (!window.confirm('保存対象の目標が0件です。このまま保存しますか? (既存の目標値がクリアされる可能性があります)')) {
        return;
      }
    }

    const ok = await upsertTargets(inputs, authUserId);
    if (ok) {
      reload();
      onSaved();
      onClose();
    } else {
      setErrMsg(mutError || '保存に失敗しました');
    }
  };

  return (
    <div className="target-modal__backdrop">
      <div className="target-modal target-modal--wide" onClick={(e) => e.stopPropagation()}>
        <header className="target-modal__header">
          <h2 className="target-modal__title">
            目標設定 (KPI) — {getFiscalPeriodLabel(period)}
          </h2>
          <button
            type="button"
            className="target-modal__close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>

        {/* 期選択ナビ (前期→今期→次期 の順) */}
        <div className="target-modal__year-nav">
          <div className="target-modal__year-toggle">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                className={
                  'target-modal__year-btn' +
                  (period === p ? ' target-modal__year-btn--active' : '')
                }
                onClick={() => setPeriod(p)}
                disabled={saving}
                title={getFiscalPeriodLabel(p)}
              >
                {getFiscalPeriodShortLabel(p)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="target-modal__clear-all-btn"
            onClick={clearAll}
            disabled={saving}
          >
            🗑 全社員一括クリア
          </button>
        </div>

        <div className="target-modal__body">
          {loading ? (
            <div className="target-modal__loading">読み込み中…</div>
          ) : (
            <>
              <p className="target-modal__hint">
                社員ごとに業務領域(カテゴリ) × 月単位で目標を設定できます。
                期は8月始まりです。右上の操作ボタンで「N月の値を全月コピー」「前期コピー」「クリア」ができます。
              </p>

              {personalUsers.map((u) => {
                const expanded = expandedUsers.has(u.id);
                const filled = getFilledCount(u.id);
                const fieldTab = getFieldTab(u.id);
                return (
                  <UserBlock
                    key={u.id}
                    userId={u.id}
                    userCode={u.employee_code}
                    userName={u.name}
                    expanded={expanded}
                    filled={filled}
                    onToggle={() => toggleExpand(u.id)}
                    categories={DEAL_CATEGORY_ORDER.filter(
                      (c) => !COMPANY_CATEGORIES.includes(c)
                    )}
                    values={values[u.id] || {}}
                    fieldTab={fieldTab}
                    onFieldTab={(tab) => setFieldTab(u.id, tab)}
                    onUpdateCell={(cat, fmi, field, value) =>
                      updateCell(u.id, cat, fmi, field, value)
                    }
                    onCopyMonthToAll={(fmi) => copyMonthToAll(u.id, fmi)}
                    onCopyFromPrevPeriod={() => copyFromPrevPeriod(u.id)}
                    onClear={() => clearUser(u.id)}
                  />
                );
              })}

              {/* 会社ユーザー */}
              <UserBlock
                userId={COMPANY_USER_ID}
                userCode="🏢"
                userName="会社 (保守・その他)"
                isCompany
                expanded={expandedUsers.has(COMPANY_USER_ID)}
                filled={getFilledCount(COMPANY_USER_ID)}
                onToggle={() => toggleExpand(COMPANY_USER_ID)}
                categories={COMPANY_CATEGORIES}
                values={values[COMPANY_USER_ID] || {}}
                fieldTab={getFieldTab(COMPANY_USER_ID)}
                onFieldTab={(tab) => setFieldTab(COMPANY_USER_ID, tab)}
                onUpdateCell={(cat, fmi, field, value) =>
                  updateCell(COMPANY_USER_ID, cat, fmi, field, value)
                }
                onCopyMonthToAll={(fmi) => copyMonthToAll(COMPANY_USER_ID, fmi)}
                onCopyFromPrevPeriod={() => copyFromPrevPeriod(COMPANY_USER_ID)}
                onClear={() => clearUser(COMPANY_USER_ID)}
              />
            </>
          )}

          {errMsg && <div className="target-modal__error">{errMsg}</div>}
        </div>

        <footer className="target-modal__footer">
          <button
            type="button"
            className="target-modal__btn target-modal__btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="target-modal__btn target-modal__btn--primary"
            onClick={handleSubmit}
            disabled={saving || loading}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// =========================================
// 1社員のブロック
// =========================================
type UserBlockProps = {
  userId: string;
  userCode: string;
  userName: string;
  isCompany?: boolean;
  expanded: boolean;
  filled: number;
  onToggle: () => void;
  categories: DealCategory[];
  values: Record<string, Record<number, CellValues>>;
  fieldTab: FieldTab;
  onFieldTab: (tab: FieldTab) => void;
  onUpdateCell: (
    cat: DealCategory,
    fiscalMonthIndex: number,
    field: keyof CellValues,
    value: string
  ) => void;
  onCopyMonthToAll: (sourceFiscalMonthIndex: number) => void;
  onCopyFromPrevPeriod: () => void;
  onClear: () => void;
};

function UserBlock(props: UserBlockProps) {
  const {
    userCode,
    userName,
    isCompany,
    expanded,
    filled,
    onToggle,
    categories,
    values,
    fieldTab,
    onFieldTab,
    onUpdateCell,
    onCopyMonthToAll,
    onCopyFromPrevPeriod,
    onClear,
  } = props;

  const [copyFmi, setCopyFmi] = useState<number>(1);

  return (
    <div
      className={
        'target-modal__user' +
        (isCompany ? ' target-modal__user--company' : '') +
        (expanded ? ' target-modal__user--expanded' : '')
      }
    >
      <button
        type="button"
        className="target-modal__user-header"
        onClick={onToggle}
      >
        <span className="target-modal__user-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="target-modal__user-code">{userCode}</span>
        <span className="target-modal__user-name">{userName}</span>
        {filled > 0 && (
          <span className="target-modal__user-badge">{filled}セル設定済</span>
        )}
      </button>

      {expanded && (
        <div className="target-modal__user-body">
          {/* ツールバー: 項目タブ + 一括操作 */}
          <div className="target-modal__toolbar">
            <div className="target-modal__field-tabs">
              {FIELD_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={
                    'target-modal__field-tab' +
                    (fieldTab === t.key
                      ? ' target-modal__field-tab--active'
                      : '')
                  }
                  onClick={() => onFieldTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="target-modal__actions">
              <div className="target-modal__copy-group">
                <select
                  className="target-modal__copy-month"
                  value={copyFmi}
                  onChange={(e) => setCopyFmi(Number(e.target.value))}
                >
                  {FISCAL_MONTHS.map((fm) => (
                    <option key={fm.fiscalMonthIndex} value={fm.fiscalMonthIndex}>
                      {getFiscalMonthLabel(fm.fiscalMonthIndex)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="target-modal__action-btn"
                  onClick={() => onCopyMonthToAll(copyFmi)}
                >
                  →全月コピー
                </button>
              </div>
              <button
                type="button"
                className="target-modal__action-btn"
                onClick={onCopyFromPrevPeriod}
              >
                📋 前期コピー
              </button>
              <button
                type="button"
                className="target-modal__action-btn target-modal__action-btn--danger"
                onClick={onClear}
              >
                🗑 クリア
              </button>
            </div>
          </div>

          {/* 現在の項目タブのマトリクス */}
          <div className="target-modal__matrix-wrap">
            <table className="target-modal__matrix">
              <thead>
                <tr>
                  <th className="target-modal__matrix-th target-modal__matrix-th--cat">
                    カテゴリ
                  </th>
                  {FISCAL_MONTHS.map((fm) => (
                    <th key={fm.fiscalMonthIndex} className="target-modal__matrix-th">
                      {getFiscalMonthLabel(fm.fiscalMonthIndex)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat}>
                    <td className="target-modal__matrix-cat">
                      <span className="target-modal__cat-icon">
                        {DEAL_CATEGORY_ICONS[cat]}
                      </span>
                      {DEAL_CATEGORY_LABELS[cat]}
                    </td>
                    {FISCAL_MONTHS.map((fm) => {
                      const v =
                        values[cat]?.[fm.fiscalMonthIndex]?.[fieldTab] ?? '';
                      return (
                        <td key={fm.fiscalMonthIndex} className="target-modal__matrix-td">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="target-modal__matrix-input"
                            value={v}
                            onChange={(e) =>
                              onUpdateCell(cat, fm.fiscalMonthIndex, fieldTab, e.target.value)
                            }
                            placeholder="0"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default TargetModal;
