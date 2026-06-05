import { useEffect, useState } from 'react';
import {
  createSalaryRecord,
  updateSalaryRecord,
} from './useEmployeeSalary';
import type { FixedAllowance, SalaryInput, SalaryRecord } from './types';
import { EMPTY_SALARY_INPUT } from './types';
import './SalaryEditModal.css';

type Props = {
  open: boolean;
  userId: string;
  /** null = 新規作成 / SalaryRecord = 編集 */
  record: SalaryRecord | null;
  onClose: () => void;
  onSaved: () => void;
};

export function SalaryEditModal({
  open,
  userId,
  record,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<SalaryInput>(EMPTY_SALARY_INPUT);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (record) {
      setForm({
        effective_from: record.effective_from,
        effective_to: record.effective_to,
        base_salary: record.base_salary,
        hourly_wage: record.hourly_wage,
        overtime_rate: record.overtime_rate,
        fixed_allowances: record.fixed_allowances,
        memo: record.memo,
      });
    } else {
      // 新規時は今日の月初をデフォルトに
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      setForm({
        ...EMPTY_SALARY_INPUT,
        effective_from: `${yyyy}-${mm}-01`,
      });
    }
    setError(null);
  }, [open, record]);

  if (!open) return null;

  async function handleSubmit() {
    setError(null);
    if (!form.effective_from) {
      setError('適用開始日は必須です');
      return;
    }
    if (
      form.effective_to &&
      form.effective_to < form.effective_from
    ) {
      setError('適用終了日は開始日以降にしてください');
      return;
    }

    setSaving(true);
    const result = record
      ? await updateSalaryRecord(record.id, form)
      : await createSalaryRecord(userId, form);
    setSaving(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  function updateAllowance(
    index: number,
    field: keyof FixedAllowance,
    value: string
  ) {
    const next = [...form.fixed_allowances];
    if (field === 'amount') {
      next[index] = { ...next[index], amount: Number(value) || 0 };
    } else {
      next[index] = { ...next[index], name: value };
    }
    setForm({ ...form, fixed_allowances: next });
  }

  function addAllowance() {
    setForm({
      ...form,
      fixed_allowances: [
        ...form.fixed_allowances,
        { name: '', amount: 0 },
      ],
    });
  }

  function removeAllowance(index: number) {
    const next = form.fixed_allowances.filter((_, i) => i !== index);
    setForm({ ...form, fixed_allowances: next });
  }

  return (
    <div className="salary-modal__overlay">
      <div
        className="salary-modal__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="salary-modal__header">
          <h2 className="salary-modal__title">
            {record ? '給与情報を編集' : '給与情報を追加'}
          </h2>
          <button
            type="button"
            className="salary-modal__close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="salary-modal__body">
          {/* 適用期間 */}
          <div className="salary-modal__row salary-modal__row--double">
            <label className="salary-modal__field">
              <span className="salary-modal__label">
                適用開始日 <span className="salary-modal__required">*</span>
              </span>
              <input
                type="date"
                value={form.effective_from}
                onChange={(e) =>
                  setForm({ ...form, effective_from: e.target.value })
                }
              />
            </label>
            <label className="salary-modal__field">
              <span className="salary-modal__label">
                適用終了日
                <span className="salary-modal__hint">
                  （空欄=現在も有効）
                </span>
              </span>
              <input
                type="date"
                value={form.effective_to || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    effective_to: e.target.value || null,
                  })
                }
              />
            </label>
          </div>

          {/* 基本給 / 時給 */}
          <div className="salary-modal__row salary-modal__row--double">
            <label className="salary-modal__field">
              <span className="salary-modal__label">基本給 (月額)</span>
              <div className="salary-modal__input-with-unit">
                <span className="salary-modal__unit">¥</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={form.base_salary}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      base_salary: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </label>
            <label className="salary-modal__field">
              <span className="salary-modal__label">
                時給
                <span className="salary-modal__hint">（残業代計算用）</span>
              </span>
              <div className="salary-modal__input-with-unit">
                <span className="salary-modal__unit">¥</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={form.hourly_wage}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hourly_wage: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </label>
          </div>

          {/* 残業割増率 */}
          <div className="salary-modal__row">
            <label className="salary-modal__field salary-modal__field--narrow">
              <span className="salary-modal__label">
                残業割増率
                <span className="salary-modal__hint">（例: 1.25）</span>
              </span>
              <input
                type="number"
                min={1}
                max={3}
                step={0.05}
                value={form.overtime_rate}
                onChange={(e) =>
                  setForm({
                    ...form,
                    overtime_rate: Number(e.target.value) || 1.25,
                  })
                }
              />
            </label>
          </div>

          {/* 固定手当 */}
          <div className="salary-modal__section">
            <div className="salary-modal__section-header">
              <span className="salary-modal__section-title">
                固定手当
              </span>
              <button
                type="button"
                className="salary-modal__add-btn"
                onClick={addAllowance}
              >
                ＋ 手当を追加
              </button>
            </div>
            {form.fixed_allowances.length === 0 ? (
              <p className="salary-modal__empty">
                固定手当はまだ登録されていません
              </p>
            ) : (
              <div className="salary-modal__allowances">
                {form.fixed_allowances.map((a, i) => (
                  <div key={i} className="salary-modal__allowance-row">
                    <input
                      type="text"
                      className="salary-modal__allowance-name"
                      placeholder="手当名 (例: 役職手当)"
                      value={a.name}
                      onChange={(e) =>
                        updateAllowance(i, 'name', e.target.value)
                      }
                    />
                    <div className="salary-modal__input-with-unit salary-modal__allowance-amount">
                      <span className="salary-modal__unit">¥</span>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={a.amount}
                        onChange={(e) =>
                          updateAllowance(i, 'amount', e.target.value)
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="salary-modal__remove-btn"
                      onClick={() => removeAllowance(i)}
                      title="削除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* メモ */}
          <div className="salary-modal__row">
            <label className="salary-modal__field">
              <span className="salary-modal__label">メモ</span>
              <textarea
                rows={3}
                value={form.memo || ''}
                onChange={(e) =>
                  setForm({ ...form, memo: e.target.value || null })
                }
                placeholder="昇給理由など"
              />
            </label>
          </div>

          {error && (
            <div className="salary-modal__error">エラー: {error}</div>
          )}
        </div>

        <footer className="salary-modal__footer">
          <button
            type="button"
            className="salary-modal__btn salary-modal__btn--cancel"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="salary-modal__btn salary-modal__btn--primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default SalaryEditModal;
