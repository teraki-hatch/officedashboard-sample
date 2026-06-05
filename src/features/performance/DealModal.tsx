import { useEffect, useState } from 'react';
import { useDealMutations } from './useDealMutations';
import { useActiveUsers } from './useActiveUsers';
import type {
  AssigneeRole,
  DealAssigneeInput,
  DealCategory,
  DealInput,
  DealStatus,
  PerformanceDeal,
} from './types';
import {
  ASSIGNEE_ROLE_LABELS,
  ASSIGNEE_ROLE_ORDER,
  COMPANY_CATEGORIES,
  COMPANY_USER_ID,
  DEAL_CATEGORY_ICONS,
  DEAL_CATEGORY_LABELS,
  DEAL_CATEGORY_ORDER,
  DEAL_STATUS_LABELS,
  DEAL_STATUS_ORDER,
  isAllocationValid,
} from './types';
import './DealModal.css';

type DealModalProps = {
  open: boolean;
  userId: string;
  authUserId: string;
  editing: PerformanceDeal | null;
  onClose: () => void;
  onSaved: () => void;
};

type AssigneeRow = {
  user_id: string;
  role: AssigneeRole;
  /** 0〜100 (UI上は%表示、DB保存時は /100 する) */
  allocation_percent: string;
};

const ROLE_DEFAULT_PERCENT: Record<AssigneeRole, number> = {
  pm: 30,
  pl: 70,
  member: 50,
};

export function DealModal(props: DealModalProps) {
  const { open, userId, authUserId, editing, onClose, onSaved } = props;
  const { createDeal, updateDeal, deleteDeal, saving } = useDealMutations();
  const { users: activeUsers } = useActiveUsers();

  const [category, setCategory] = useState<DealCategory>('consulting');
  const [dealName, setDealName] = useState<string>('');
  const [status, setStatus] = useState<DealStatus>('in_progress');
  const [expectedCloseDate, setExpectedCloseDate] = useState<string>('');
  const [closedDate, setClosedDate] = useState<string>('');
  const [terminatedDate, setTerminatedDate] = useState<string>('');
  const [salesAmount, setSalesAmount] = useState<string>('');
  const [monthlyAmount, setMonthlyAmount] = useState<string>('');
  const [grossProfit, setGrossProfit] = useState<string>('');
  const [meetingCount, setMeetingCount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [assigneeRows, setAssigneeRows] = useState<AssigneeRow[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCategory(editing.category);
      setDealName(editing.deal_name);
      setStatus(editing.status);
      setExpectedCloseDate(editing.expected_close_date || '');
      setClosedDate(editing.closed_date || '');
      setTerminatedDate(editing.terminated_date || '');
      setSalesAmount(String(editing.sales_amount ?? 0));
      setMonthlyAmount(String(editing.monthly_amount ?? 0));
      setGrossProfit(String(editing.gross_profit ?? 0));
      setMeetingCount(String(editing.meeting_count ?? 0));
      setNotes(editing.notes || '');
      // 既存 assignees をフォーム状態に反映
      const rows: AssigneeRow[] = (editing.assignees || []).map((a) => ({
        user_id: a.user_id,
        role: a.role,
        allocation_percent: String(Math.round(Number(a.allocation_ratio) * 100)),
      }));
      setAssigneeRows(
        rows.length > 0
          ? rows
          : [{ user_id: userId, role: 'pm', allocation_percent: '100' }]
      );
    } else {
      setCategory('consulting');
      setDealName('');
      setStatus('in_progress');
      setExpectedCloseDate('');
      setClosedDate('');
      setTerminatedDate('');
      setSalesAmount('');
      setMonthlyAmount('');
      setGrossProfit('');
      setMeetingCount('');
      setNotes('');
      setAssigneeRows([
        { user_id: userId, role: 'pm', allocation_percent: '100' },
      ]);
    }
    setErrMsg(null);
  }, [open, editing, userId]);

  if (!open) return null;

  const isCompanyCategory = COMPANY_CATEGORIES.includes(category);

  // カテゴリが会社案件になったとき、assignees を会社ダミーに切り替え
  function handleCategoryChange(c: DealCategory) {
    setCategory(c);
    if (COMPANY_CATEGORIES.includes(c)) {
      // 会社案件: 担当者を会社ダミーに固定 (1人, 100%)
      setAssigneeRows([
        { user_id: COMPANY_USER_ID, role: 'pm', allocation_percent: '100' },
      ]);
    } else {
      // 個人カテゴリに戻したとき、assignees が会社ダミーだけならリセット
      const onlyCompany =
        assigneeRows.length === 1 && assigneeRows[0].user_id === COMPANY_USER_ID;
      if (onlyCompany) {
        setAssigneeRows([
          { user_id: userId, role: 'pm', allocation_percent: '100' },
        ]);
      }
    }
  }

  function addAssigneeRow() {
    const usedIds = new Set(assigneeRows.map((r) => r.user_id));
    // 既存に含まれない最初のユーザーを初期選択
    const firstAvailable = activeUsers.find((u) => !usedIds.has(u.id));
    const nextUserId = firstAvailable?.id ?? '';
    // 未使用の役割を選ぶ (PM があれば PL、両方あれば member)
    const usedRoles = new Set(assigneeRows.map((r) => r.role));
    let nextRole: AssigneeRole = 'member';
    if (!usedRoles.has('pl')) nextRole = 'pl';
    if (!usedRoles.has('pm')) nextRole = 'pm';
    setAssigneeRows((prev) => [
      ...prev,
      {
        user_id: nextUserId,
        role: nextRole,
        allocation_percent: String(ROLE_DEFAULT_PERCENT[nextRole]),
      },
    ]);
  }

  function removeAssigneeRow(idx: number) {
    setAssigneeRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAssigneeRow(idx: number, patch: Partial<AssigneeRow>) {
    setAssigneeRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  }

  // 按分合計 (%)
  const totalPercent = assigneeRows.reduce(
    (s, r) => s + Number(r.allocation_percent || 0),
    0
  );
  const allocationOk = Math.abs(totalPercent - 100) < 0.5;

  async function handleSubmit() {
    setErrMsg(null);
    if (!dealName.trim()) {
      setErrMsg('案件名を入力してください');
      return;
    }
    const sa = Number(salesAmount || 0);
    const ma = Number(monthlyAmount || 0);
    const gp = Number(grossProfit || 0);
    const mc = Number(meetingCount || 0);
    if (Number.isNaN(sa) || sa < 0) {
      setErrMsg('一時金は0以上の数値で入力してください');
      return;
    }
    if (Number.isNaN(ma) || ma < 0) {
      setErrMsg('月額は0以上の数値で入力してください');
      return;
    }
    if (Number.isNaN(gp)) {
      setErrMsg('粗利は数値で入力してください');
      return;
    }
    if (Number.isNaN(mc) || mc < 0) {
      setErrMsg('面談数は0以上の整数で入力してください');
      return;
    }
    if (
      (status === 'won' ||
        status === 'in_support' ||
        status === 'terminated' ||
        status === 'lost') &&
      !closedDate
    ) {
      const label = status === 'lost' ? '失注日' : '成約日';
      setErrMsg(`${label}を入力してください`);
      return;
    }
    if (status === 'terminated' && !terminatedDate) {
      setErrMsg('終了日を入力してください');
      return;
    }
    if (closedDate && terminatedDate && terminatedDate < closedDate) {
      setErrMsg('終了日は成約日以降にしてください');
      return;
    }

    // 担当者バリデーション
    if (assigneeRows.length === 0) {
      setErrMsg('担当者を1人以上設定してください');
      return;
    }
    const seen = new Set<string>();
    for (const r of assigneeRows) {
      if (!r.user_id) {
        setErrMsg('担当者を選択してください');
        return;
      }
      if (seen.has(r.user_id)) {
        setErrMsg('同じ担当者を重複して指定できません');
        return;
      }
      seen.add(r.user_id);
      const p = Number(r.allocation_percent || 0);
      if (Number.isNaN(p) || p <= 0 || p > 100) {
        setErrMsg('按分率は1〜100の数値で入力してください');
        return;
      }
    }
    if (!allocationOk) {
      setErrMsg(`按分率の合計が100%になるようにしてください (現在: ${totalPercent.toFixed(1)}%)`);
      return;
    }

    const assignees: DealAssigneeInput[] = assigneeRows.map((r, idx) => ({
      user_id: r.user_id,
      role: r.role,
      allocation_ratio: Number(r.allocation_percent) / 100,
      display_order: idx,
    }));

    // 追加バリデーション(整合性チェック)
    if (!isAllocationValid(assignees)) {
      setErrMsg('按分率の合計が100%になっていません');
      return;
    }

    // 主担当 user_id: 会社案件なら会社ダミー、それ以外は assignees の先頭
    const effectiveUserId = isCompanyCategory
      ? COMPANY_USER_ID
      : assignees[0].user_id;

    const input: DealInput = {
      user_id: effectiveUserId,
      category,
      deal_name: dealName.trim(),
      status,
      expected_close_date: expectedCloseDate || null,
      closed_date: closedDate || null,
      terminated_date: terminatedDate || null,
      sales_amount: sa,
      monthly_amount: ma,
      gross_profit: gp,
      meeting_count: Math.floor(mc),
      notes: notes.trim() || null,
      assignees,
    };

    let ok = false;
    if (editing) {
      ok = await updateDeal(editing.id, input);
    } else {
      ok = await createDeal(input, authUserId);
    }
    if (ok) {
      onSaved();
      onClose();
    } else {
      setErrMsg('保存に失敗しました');
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`案件「${editing.deal_name}」を削除します。よろしいですか?`)) {
      return;
    }
    const ok = await deleteDeal(editing.id);
    if (ok) {
      onSaved();
      onClose();
    } else {
      setErrMsg('削除に失敗しました');
    }
  }

  const showExpectedDate = status === 'prospect' || status === 'in_progress';
  const showClosedDate =
    status === 'won' ||
    status === 'in_support' ||
    status === 'terminated' ||
    status === 'lost';
  const showTerminatedDate = status === 'terminated';

  return (
    <div className="deal-modal__backdrop">
      <div className="deal-modal" onClick={(e) => e.stopPropagation()}>
        <header className="deal-modal__header">
          <h2 className="deal-modal__title">
            {editing ? '案件を編集' : '案件を追加'}
          </h2>
          <button
            type="button"
            className="deal-modal__close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>

        <div className="deal-modal__body">
          <div className="deal-modal__field">
            <label className="deal-modal__label">業務領域 *</label>
            <div className="deal-modal__category-row">
              {DEAL_CATEGORY_ORDER.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={
                    'deal-modal__category-btn' +
                    (category === c ? ' deal-modal__category-btn--active' : '') +
                    (COMPANY_CATEGORIES.includes(c)
                      ? ' deal-modal__category-btn--company'
                      : '')
                  }
                  onClick={() => handleCategoryChange(c)}
                  data-category={c}
                >
                  <span className="deal-modal__category-icon">
                    {DEAL_CATEGORY_ICONS[c]}
                  </span>
                  {DEAL_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            {isCompanyCategory && (
              <div className="deal-modal__hint deal-modal__hint--info">
                🏢 会社案件として登録されます (個人の業績には乗りません)
              </div>
            )}
          </div>

          <div className="deal-modal__field">
            <label className="deal-modal__label">案件名 / 顧客名 *</label>
            <input
              type="text"
              className="deal-modal__input"
              value={dealName}
              onChange={(e) => setDealName(e.target.value)}
              placeholder="例: ABC商事様 新規案件"
              maxLength={120}
            />
          </div>

          <div className="deal-modal__field">
            <label className="deal-modal__label">ステータス *</label>
            <div className="deal-modal__status-row">
              {DEAL_STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={
                    'deal-modal__status-btn' +
                    (status === s ? ' deal-modal__status-btn--active' : '')
                  }
                  onClick={() => setStatus(s)}
                  data-status={s}
                >
                  {DEAL_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* ========== 担当者 (按分) ========== */}
          {!isCompanyCategory && (
            <div className="deal-modal__field">
              <div className="deal-modal__assignees-header">
                <label className="deal-modal__label" style={{ margin: 0 }}>
                  担当者と按分 *
                </label>
                <span
                  className={
                    'deal-modal__alloc-total' +
                    (allocationOk
                      ? ' deal-modal__alloc-total--ok'
                      : ' deal-modal__alloc-total--ng')
                  }
                >
                  合計: {totalPercent.toFixed(0)}%
                </span>
              </div>
              <div className="deal-modal__assignees">
                {assigneeRows.map((row, idx) => (
                  <div key={idx} className="deal-modal__assignee-row">
                    <select
                      className="deal-modal__assignee-user"
                      value={row.user_id}
                      onChange={(e) =>
                        updateAssigneeRow(idx, { user_id: e.target.value })
                      }
                    >
                      <option value="">担当者を選択</option>
                      {activeUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="deal-modal__assignee-role"
                      value={row.role}
                      onChange={(e) => {
                        const role = e.target.value as AssigneeRole;
                        updateAssigneeRow(idx, { role });
                      }}
                    >
                      {ASSIGNEE_ROLE_ORDER.map((r) => (
                        <option key={r} value={r}>
                          {ASSIGNEE_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      className="deal-modal__assignee-pct"
                      value={row.allocation_percent}
                      onChange={(e) =>
                        updateAssigneeRow(idx, {
                          allocation_percent: e.target.value,
                        })
                      }
                    />
                    <span className="deal-modal__assignee-unit">%</span>
                    <button
                      type="button"
                      className="deal-modal__assignee-del"
                      onClick={() => removeAssigneeRow(idx)}
                      disabled={assigneeRows.length === 1}
                      aria-label="削除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="deal-modal__assignee-add"
                onClick={addAssigneeRow}
              >
                + 担当者を追加
              </button>
              <div className="deal-modal__hint">
                売上は按分率に応じて個人業績に振り分けられます (合計100%必須)
              </div>
            </div>
          )}

          {showExpectedDate && (
            <div className="deal-modal__field">
              <label className="deal-modal__label">着地予定日</label>
              <input
                type="date"
                className="deal-modal__input"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
              />
            </div>
          )}

          {showClosedDate && (
            <div className="deal-modal__field">
              <label className="deal-modal__label">
                {status === 'lost' ? '失注日 *' : '成約日 *'}
              </label>
              <input
                type="date"
                className="deal-modal__input"
                value={closedDate}
                onChange={(e) => setClosedDate(e.target.value)}
              />
            </div>
          )}

          {showTerminatedDate && (
            <div className="deal-modal__field">
              <label className="deal-modal__label">終了日 *</label>
              <input
                type="date"
                className="deal-modal__input"
                value={terminatedDate}
                onChange={(e) => setTerminatedDate(e.target.value)}
              />
              <div className="deal-modal__hint">
                この月までは売上に計上、翌月から計上停止します
              </div>
            </div>
          )}

          <div className="deal-modal__row2">
            <div className="deal-modal__field">
              <label className="deal-modal__label">一時金 (円)</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="deal-modal__input"
                value={salesAmount}
                onChange={(e) => setSalesAmount(e.target.value)}
                placeholder="0"
              />
              <div className="deal-modal__hint">
                初期費用など、成約月にのみ計上
              </div>
            </div>
            <div className="deal-modal__field">
              <label className="deal-modal__label">月額 (円)</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="deal-modal__input"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
                placeholder="0"
              />
              <div className="deal-modal__hint">
                成約月〜終了月の間、毎月計上
              </div>
            </div>
          </div>

          <div className="deal-modal__row2">
            <div className="deal-modal__field">
              <label className="deal-modal__label">粗利 (円)</label>
              <input
                type="number"
                inputMode="numeric"
                className="deal-modal__input"
                value={grossProfit}
                onChange={(e) => setGrossProfit(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="deal-modal__field">
              <label className="deal-modal__label">面談数</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="deal-modal__input"
                value={meetingCount}
                onChange={(e) => setMeetingCount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="deal-modal__field">
            <label className="deal-modal__label">メモ</label>
            <textarea
              className="deal-modal__textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="案件の補足情報"
            />
          </div>

          {errMsg && <div className="deal-modal__error">{errMsg}</div>}
        </div>

        <footer className="deal-modal__footer">
          {editing && (
            <button
              type="button"
              className="deal-modal__btn deal-modal__btn--danger"
              onClick={handleDelete}
              disabled={saving}
            >
              削除
            </button>
          )}
          <div className="deal-modal__footer-spacer" />
          <button
            type="button"
            className="deal-modal__btn deal-modal__btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="deal-modal__btn deal-modal__btn--primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? '保存中...' : editing ? '更新' : '追加'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default DealModal;
