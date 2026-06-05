import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import './SalesTargetEditModal.css';

type UserOption = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  fiscalYear: number;
  fiscalYearLabel: string;
  initialFiscalTarget: number;
  initialMonthlyTargets: Record<number, number>;
  userFiscalTargets: Map<string, number>;
  userMonthlyTargets: Map<string, Record<number, number>>;
  isAdmin: boolean;
  onClose: () => void;
  onSave: (params: {
    fiscalYear: number;
    userId: string | null;
    fiscalTarget: number;
    monthlyTargets: Record<number, number>;
  }) => Promise<void>;
};

// 期は8月〜7月なので、表示順も 8,9,10,11,12,1,2,3,4,5,6,7
const MONTH_ORDER = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];

function parseAmount(s: string): number {
  const n = Number(s.replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : Math.max(0, Math.floor(n));
}

function normalizeInput(s: string): string {
  return s.replace(/,/g, '').replace(/[^\d]/g, '');
}

function formatDisplay(s: string): string {
  if (!s) return '';
  const n = Number(s);
  if (isNaN(n)) return '';
  return n.toLocaleString();
}

export function SalesTargetEditModal({
  open,
  fiscalYear,
  fiscalYearLabel,
  initialFiscalTarget,
  initialMonthlyTargets,
  userFiscalTargets,
  userMonthlyTargets,
  isAdmin,
  onClose,
  onSave,
}: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string>(''); // '' = 会社全体
  const [users, setUsers] = useState<UserOption[]>([]);
  const [fiscalTarget, setFiscalTarget] = useState<string>('');
  const [monthlyTargets, setMonthlyTargets] = useState<Record<number, string>>(
    {}
  );
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ユーザー一覧取得 (active のみ)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      if (!supabase) return;
      const { data } = await supabase
        .from('users')
        .select('id, name, status')
        .eq('status', 'active')
        .order('name');
      if (cancelled) return;
      setUsers(
        ((data || []) as Array<{ id: string; name: string }>).map((r) => ({
          id: r.id,
          name: r.name || '(名前未設定)',
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // selectedUserId が変わったときに対応する値をセット
  useEffect(() => {
    if (!open) return;
    if (selectedUserId === '') {
      // 会社全体
      setFiscalTarget(String(initialFiscalTarget || 0));
      const init: Record<number, string> = {};
      for (const m of MONTH_ORDER) {
        init[m] = String(initialMonthlyTargets[m] || 0);
      }
      setMonthlyTargets(init);
    } else {
      // 個人
      const ft = userFiscalTargets.get(selectedUserId) || 0;
      const mt = userMonthlyTargets.get(selectedUserId) || {};
      setFiscalTarget(String(ft));
      const init: Record<number, string> = {};
      for (const m of MONTH_ORDER) {
        init[m] = String(mt[m] || 0);
      }
      setMonthlyTargets(init);
    }
    setErrorMsg(null);
  }, [
    open,
    selectedUserId,
    initialFiscalTarget,
    initialMonthlyTargets,
    userFiscalTargets,
    userMonthlyTargets,
  ]);

  if (!open) return null;

  const monthlySum = MONTH_ORDER.reduce(
    (sum, m) => sum + parseAmount(monthlyTargets[m] || '0'),
    0
  );
  const fiscalAmount = parseAmount(fiscalTarget);

  function handleAutoFill() {
    const per = Math.floor(fiscalAmount / 12);
    const next: Record<number, string> = {};
    for (const m of MONTH_ORDER) {
      next[m] = String(per);
    }
    setMonthlyTargets(next);
  }

  async function handleSave() {
    if (!isAdmin) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const monthlyNums: Record<number, number> = {};
      for (const m of MONTH_ORDER) {
        monthlyNums[m] = parseAmount(monthlyTargets[m] || '0');
      }
      await onSave({
        fiscalYear,
        userId: selectedUserId === '' ? null : selectedUserId,
        fiscalTarget: fiscalAmount,
        monthlyTargets: monthlyNums,
      });
      onClose();
    } catch (e) {
      let msg = '';
      if (e instanceof Error) {
        msg = e.message;
      } else if (e && typeof e === 'object') {
        const err = e as Record<string, unknown>;
        msg = (err.message as string) || (err.error_description as string) || JSON.stringify(e);
      } else {
        msg = String(e);
      }
      console.error('[SalesTargetEditModal] save error', e);
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  }

  const targetLabel =
    selectedUserId === ''
      ? '会社全体'
      : users.find((u) => u.id === selectedUserId)?.name || '個人';

  return (
    <div className="sales-target-modal__overlay">
      <div className="sales-target-modal">
        <div className="sales-target-modal__header">
          <h2 className="sales-target-modal__title">
            売上目標の編集 ({fiscalYearLabel})
          </h2>
          <button
            type="button"
            className="sales-target-modal__close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {!isAdmin && (
          <div className="sales-target-modal__readonly">
            ℹ️ 閲覧のみ可能です。編集は admin 権限が必要です。
          </div>
        )}

        <div className="sales-target-modal__body">
          {/* 対象選択 */}
          <div className="sales-target-modal__field">
            <label className="sales-target-modal__label">対象</label>
            <select
              className="sales-target-modal__select"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={saving}
            >
              <option value="">会社全体</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <div className="sales-target-modal__hint">
              現在編集中: <strong>{targetLabel}</strong>
            </div>
          </div>

          {/* 年間目標 */}
          <div className="sales-target-modal__field">
            <label className="sales-target-modal__label">
              今期売上目標 (年間)
            </label>
            <div className="sales-target-modal__input-wrap">
              <span className="sales-target-modal__yen">¥</span>
              <input
                type="text"
                inputMode="numeric"
                className="sales-target-modal__input sales-target-modal__input--large"
                value={formatDisplay(fiscalTarget)}
                onChange={(e) => setFiscalTarget(normalizeInput(e.target.value))}
                disabled={!isAdmin || saving}
              />
            </div>
            <button
              type="button"
              className="sales-target-modal__autofill"
              onClick={handleAutoFill}
              disabled={!isAdmin || saving}
            >
              年間目標を12等分して月別に反映
            </button>
          </div>

          {/* 月別目標 */}
          <div className="sales-target-modal__field">
            <div className="sales-target-modal__label-row">
              <label className="sales-target-modal__label">月別目標</label>
              <span className="sales-target-modal__sum">
                合計: ¥{monthlySum.toLocaleString()}
                {fiscalAmount > 0 && (
                  <span
                    className={
                      'sales-target-modal__sum-diff ' +
                      (monthlySum === fiscalAmount
                        ? 'sales-target-modal__sum-diff--ok'
                        : 'sales-target-modal__sum-diff--warn')
                    }
                  >
                    {monthlySum === fiscalAmount
                      ? '✓'
                      : ` (年間目標と差: ¥${(monthlySum - fiscalAmount).toLocaleString()})`}
                  </span>
                )}
              </span>
            </div>

            <div className="sales-target-modal__months-grid">
              {MONTH_ORDER.map((m) => (
                <div key={m} className="sales-target-modal__month-item">
                  <label className="sales-target-modal__month-label">
                    {m}月
                  </label>
                  <div className="sales-target-modal__input-wrap sales-target-modal__input-wrap--sm">
                    <span className="sales-target-modal__yen">¥</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="sales-target-modal__input"
                      value={formatDisplay(monthlyTargets[m] || '')}
                      onChange={(e) =>
                        setMonthlyTargets((prev) => ({
                          ...prev,
                          [m]: normalizeInput(e.target.value),
                        }))
                      }
                      disabled={!isAdmin || saving}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="sales-target-modal__error">エラー: {errorMsg}</div>
          )}
        </div>

        <div className="sales-target-modal__footer">
          <button
            type="button"
            className="sales-target-modal__btn sales-target-modal__btn--cancel"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
          {isAdmin && (
            <button
              type="button"
              className="sales-target-modal__btn sales-target-modal__btn--save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
