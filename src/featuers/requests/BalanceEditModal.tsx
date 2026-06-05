import { useEffect, useMemo, useState } from 'react';
import {
  calcNextGrant,
  calcYearsOfService,
  type GrantBrief,
} from './leaveUtils';
import type {
  LeaveBalance,
  UserForLeaveAdmin,
} from './types';
import './BalanceEditModal.css';

/**
 * 残日数編集モーダル (Phase 3-8)
 * --------------------------------------------------------------
 * - users.hire_date 編集
 * - leave_balances の granted_days / carryover_days / adjusted_days / note 編集
 * - 入社日変更時に「勤続年数・次回付与日」のプレビューを表示
 * --------------------------------------------------------------
 */

export type BalanceEditModalProps = {
  user: UserForLeaveAdmin;
  fiscalYear: number;
  /** 現在の balance (なければ undefined) */
  balance: LeaveBalance | undefined;
  grants: GrantBrief[];
  saving: boolean;
  errorMessage: string | null;
  onConfirm: (params: {
    newHireDate: string;
    grantedDays: number;
    carryoverDays: number;
    adjustedDays: number;
    note: string;
    newHasLeaveManagement: boolean;
  }) => void;
  onClose: () => void;
};

export function BalanceEditModal({
  user,
  fiscalYear,
  balance,
  grants,
  saving,
  errorMessage,
  onConfirm,
  onClose,
}: BalanceEditModalProps) {
  const [hireDate, setHireDate] = useState<string>((user.hire_date ?? '').slice(0, 10));
  const [granted, setGranted] = useState<string>(String(balance?.granted_days ?? 0));
  const [carry, setCarry] = useState<string>(String(balance?.carryover_days ?? 0));
  const [adjust, setAdjust] = useState<string>(String(balance?.adjusted_days ?? 0));
  const [note, setNote] = useState<string>(balance?.note ?? '');
  /** has_leave_management: undefined/null は true 扱い (デフォルト) */
  const [hasLeaveManagement, setHasLeaveManagement] = useState<boolean>(
    user.has_leave_management !== false
  );

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // 入社日プレビュー
  const grantPreview = useMemo(() => {
    if (!hireDate) return null;
    try {
      return calcNextGrant(hireDate, grants, user.id);
    } catch {
      return null;
    }
  }, [hireDate, grants, user.id]);

  const onClickBackdrop = () => {
    if (saving) return;
    onClose();
  };

  const onSubmit = () => {
    const grantedN = parseFloat(granted);
    const carryN = parseFloat(carry);
    const adjustN = parseFloat(adjust);
    onConfirm({
      newHireDate: hireDate,
      grantedDays: Number.isFinite(grantedN) ? grantedN : 0,
      carryoverDays: Number.isFinite(carryN) ? carryN : 0,
      adjustedDays: Number.isFinite(adjustN) ? adjustN : 0,
      note,
      newHasLeaveManagement: hasLeaveManagement,
    });
  };

  return (
    <div
      className="bal-edit__backdrop"
      onClick={onClickBackdrop}
      role="presentation"
    >
      <div
        className="bal-edit__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bal-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bal-edit__header">
          <h3 id="bal-edit-title" className="bal-edit__title">
            残日数編集 — {user.name ?? user.email ?? user.id}
          </h3>
          <p className="bal-edit__sub">
            {fiscalYear} 年度 {user.employee_code ? `(${user.employee_code})` : ''}
          </p>
        </header>

        {errorMessage && (
          <div className="bal-edit__error">
            <p>{errorMessage}</p>
          </div>
        )}

        {/* ===== 入社日 ===== */}
        <section className="bal-edit__section">
          <label className="bal-edit__label">入社日</label>
          <input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            className="bal-edit__input"
            disabled={saving}
          />
          {grantPreview && (
            <p className="bal-edit__preview">
              勤続 {calcYearsOfService(hireDate) ?? 0} 年 ／ 次回付与:{' '}
              <strong>{grantPreview.currentGrantDate}</strong> (
              {grantPreview.currentGrantDays}日)
              {grantPreview.isDue && (
                <span className="bal-edit__preview-due"> ＜付与可能＞</span>
              )}
            </p>
          )}
        </section>

        {/* ===== 有休管理対象 ===== */}
        <section className="bal-edit__section">
          <label className="bal-edit__checkbox">
            <input
              type="checkbox"
              checked={hasLeaveManagement}
              onChange={(e) => setHasLeaveManagement(e.target.checked)}
              disabled={saving}
            />
            <span>有休管理対象</span>
          </label>
          <p className="bal-edit__hint">
            役員・パート等で年休管理しない場合はチェックを外してください。
            <br />
            チェックを外すと、有休管理タブの一覧から非表示になります (「対象外も表示」で表示可能)。
          </p>
        </section>

        {/* ===== 残日数 ===== */}
        <section className="bal-edit__row3">
          <div className="bal-edit__col">
            <label className="bal-edit__label">付与日数</label>
            <input
              type="number"
              step="0.5"
              value={granted}
              onChange={(e) => setGranted(e.target.value)}
              className="bal-edit__input"
              disabled={saving}
            />
          </div>
          <div className="bal-edit__col">
            <label className="bal-edit__label">繰越日数</label>
            <input
              type="number"
              step="0.5"
              value={carry}
              onChange={(e) => setCarry(e.target.value)}
              className="bal-edit__input"
              disabled={saving}
            />
          </div>
          <div className="bal-edit__col">
            <label className="bal-edit__label">調整日数</label>
            <input
              type="number"
              step="0.5"
              value={adjust}
              onChange={(e) => setAdjust(e.target.value)}
              className="bal-edit__input"
              disabled={saving}
            />
          </div>
        </section>

        {/* ===== メモ ===== */}
        <section className="bal-edit__section">
          <label className="bal-edit__label">メモ (任意)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="bal-edit__textarea"
            disabled={saving}
            placeholder="調整理由など"
          />
        </section>

        {/* ===== ボタン ===== */}
        <div className="bal-edit__actions">
          <button
            type="button"
            className="bal-edit__btn bal-edit__btn--save"
            onClick={onSubmit}
            disabled={saving}
          >
            {saving ? '保存中…' : '保存する'}
          </button>
          <button
            type="button"
            className="bal-edit__btn bal-edit__btn--cancel"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
