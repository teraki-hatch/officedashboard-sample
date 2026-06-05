import { useEffect, useState } from 'react';
import { saveEmployee } from './useEmployeeDetail';
import type { Employee, EmployeeInput } from './types';
import {
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  USER_ROLES,
  USER_ROLE_LABELS,
} from './types';
import './EmployeeEditModal.css';

type Props = {
  open: boolean;
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
};

export function EmployeeEditModal({
  open,
  employee,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<EmployeeInput>({
    name: '',
    email: '',
    role: 'member',
    employment_type: '正社員',
    standard_work_hours: 8,
    joined_at: null,
    resigned_at: null,
    status: 'active',
    hourly_rate: 0,
    cost_rate: 0,
    has_leave_management: true,
    has_attendance_management: true,
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: employee.name,
      email: employee.email,
      role: employee.role,
      employment_type: employee.employment_type || '正社員',
      standard_work_hours: Number(employee.standard_work_hours || 8),
      joined_at: employee.joined_at,
      resigned_at: employee.resigned_at,
      status: employee.status || 'active',
      hourly_rate: Number(employee.hourly_rate || 0),
      cost_rate: Number(employee.cost_rate || 0),
      has_leave_management: employee.has_leave_management !== false,
      has_attendance_management:
        employee.has_attendance_management !== false,
    });
    setError(null);
  }, [open, employee]);

  if (!open) return null;

  async function handleSubmit() {
    setError(null);
    if (!form.name.trim()) {
      setError('氏名は必須です');
      return;
    }
    if (!form.email.trim()) {
      setError('メールアドレスは必須です');
      return;
    }

    setSaving(true);
    const result = await saveEmployee(employee.id, form);
    setSaving(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="employee-modal__overlay">
      <div
        className="employee-modal__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="employee-modal__header">
          <h2 className="employee-modal__title">
            基本情報を編集
            <span className="employee-modal__sub">
              (社員番号: {employee.employee_code})
            </span>
          </h2>
          <button
            type="button"
            className="employee-modal__close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="employee-modal__body">
          <div className="employee-modal__row employee-modal__row--double">
            <label className="employee-modal__field">
              <span className="employee-modal__label">
                氏名 <span className="employee-modal__required">*</span>
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
              />
            </label>
            <label className="employee-modal__field">
              <span className="employee-modal__label">
                メール <span className="employee-modal__required">*</span>
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
              />
            </label>
          </div>

          <div className="employee-modal__row employee-modal__row--double">
            <label className="employee-modal__field">
              <span className="employee-modal__label">雇用形態</span>
              <select
                value={form.employment_type}
                onChange={(e) =>
                  setForm({ ...form, employment_type: e.target.value })
                }
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="employee-modal__field">
              <span className="employee-modal__label">権限</span>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value })
                }
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {USER_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="employee-modal__row employee-modal__row--double">
            <label className="employee-modal__field">
              <span className="employee-modal__label">
                所定労働時間
                <span className="employee-modal__hint">(時間/日)</span>
              </span>
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={form.standard_work_hours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    standard_work_hours: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label className="employee-modal__field">
              <span className="employee-modal__label">入社日</span>
              <input
                type="date"
                value={form.joined_at || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    joined_at: e.target.value || null,
                  })
                }
              />
            </label>
          </div>

          {/* 単価セクション (案件採算計算用) */}
          <div className="employee-modal__section">
            <div className="employee-modal__section-title">
              単価設定
              <span className="employee-modal__hint">（案件採算計算用）</span>
            </div>
            <div className="employee-modal__row employee-modal__row--double">
              <label className="employee-modal__field">
                <span className="employee-modal__label">
                  時給
                  <span className="employee-modal__hint">（請求単価）</span>
                </span>
                <div className="employee-modal__input-with-unit">
                  <span className="employee-modal__unit">¥</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={form.hourly_rate}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        hourly_rate: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </label>
              <label className="employee-modal__field">
                <span className="employee-modal__label">
                  原価レート
                  <span className="employee-modal__hint">（粗利計算用）</span>
                </span>
                <div className="employee-modal__input-with-unit">
                  <span className="employee-modal__unit">¥</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={form.cost_rate}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cost_rate: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="employee-modal__row employee-modal__row--double">
            <label className="employee-modal__field">
              <span className="employee-modal__label">在籍ステータス</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value })
                }
              >
                {EMPLOYEE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EMPLOYEE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            {form.status === 'inactive' && (
              <label className="employee-modal__field">
                <span className="employee-modal__label">退職日</span>
                <input
                  type="date"
                  value={form.resigned_at || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      resigned_at: e.target.value || null,
                    })
                  }
                />
              </label>
            )}
          </div>

          <div className="employee-modal__row employee-modal__row--checkboxes">
            <label className="employee-modal__checkbox">
              <input
                type="checkbox"
                checked={form.has_attendance_management}
                onChange={(e) =>
                  setForm({
                    ...form,
                    has_attendance_management: e.target.checked,
                  })
                }
              />
              勤怠管理を有効にする
            </label>
            <label className="employee-modal__checkbox">
              <input
                type="checkbox"
                checked={form.has_leave_management}
                onChange={(e) =>
                  setForm({
                    ...form,
                    has_leave_management: e.target.checked,
                  })
                }
              />
              有休管理を有効にする
            </label>
          </div>

          {error && (
            <div className="employee-modal__error">エラー: {error}</div>
          )}
        </div>

        <footer className="employee-modal__footer">
          <button
            type="button"
            className="employee-modal__btn employee-modal__btn--cancel"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="employee-modal__btn employee-modal__btn--primary"
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

export default EmployeeEditModal;
