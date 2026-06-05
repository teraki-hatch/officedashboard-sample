import { useEffect, useState } from 'react';
import { useDealMutations } from '../performance/useDealMutations';
import { useActiveUsers } from '../performance/useActiveUsers';
import { getSupabase } from '../../lib/supabase';
import type {
  AssigneeRole,
  DealCategory,
  DealInput,
  DealStatus,
} from '../performance/types';
import {
  ASSIGNEE_ROLE_LABELS,
  ASSIGNEE_ROLE_ORDER,
  COMPANY_USER_ID,
  DEAL_CATEGORY_LABELS,
  DEAL_CATEGORY_ORDER,
  DEAL_STATUS_LABELS,
  DEAL_STATUS_ORDER,
} from '../performance/types';

/**
 * クライアント詳細から呼び出すシンプルな案件作成・編集モーダル
 * - client_id は固定 (引数で受け取る)
 * - 主担当 user_id は assignees の先頭 (pm 優先)
 * - 担当者: 行追加方式 (役割と按分%を個別指定、合計100%必須)
 */

// 役割ごとの目安按分%(3人体制で100%になる比率)
const ROLE_DEFAULT_PERCENT: Record<AssigneeRole, number> = {
  pm: 50,
  pl: 30,
  member: 20,
};

export type ClientDealAssigneeForm = {
  user_id: string;
  role: AssigneeRole;
  allocation_percent: number; // 0-100
};

export type ClientDealForm = {
  id?: string | null;
  deal_name: string;
  category: DealCategory;
  status: DealStatus;
  monthly_amount: number;
  sales_amount: number;
  expected_close_date: string | null;
  closed_date: string | null;
  terminated_date: string | null;
  assignee_user_ids: string[];
  assignees_detailed?: ClientDealAssigneeForm[];
  notes: string | null;
};

type Props = {
  open: boolean;
  clientId: string;
  authUserId: string;
  editing: ClientDealForm | null;
  onClose: () => void;
  onSaved: () => void;
};

type RowState = {
  user_id: string;
  role: AssigneeRole;
  percent: string; // 入力中は文字列保持
};

export function ClientDealModal({
  open,
  clientId,
  authUserId,
  editing,
  onClose,
  onSaved,
}: Props) {
  const { createDeal, updateDeal, deleteDeal, saving, error } = useDealMutations();
  const { users: activeUsers } = useActiveUsers();

  const [dealName, setDealName] = useState('');
  const [category, setCategory] = useState<DealCategory>('consulting');
  const [status, setStatus] = useState<DealStatus>('prospect');
  const [monthlyAmount, setMonthlyAmount] = useState<string>('0');
  const [salesAmount, setSalesAmount] = useState<string>('0');
  const [expectedCloseDate, setExpectedCloseDate] = useState<string>('');
  const [closedDate, setClosedDate] = useState<string>('');
  const [terminatedDate, setTerminatedDate] = useState<string>('');
  const [rows, setRows] = useState<RowState[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [deletingNow, setDeletingNow] = useState<boolean>(false);

  // 編集モードの初期化
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDealName(editing.deal_name);
      setCategory(editing.category);
      setStatus(editing.status);
      setMonthlyAmount(String(editing.monthly_amount || 0));
      setSalesAmount(String(editing.sales_amount || 0));
      setExpectedCloseDate(editing.expected_close_date || '');
      setClosedDate(editing.closed_date || '');
      setTerminatedDate(editing.terminated_date || '');
      setNotes(editing.notes || '');

      // 詳細情報があればそれを優先、なければ user_ids から構築
      if (editing.assignees_detailed && editing.assignees_detailed.length > 0) {
        setRows(
          editing.assignees_detailed.map((a) => ({
            user_id: a.user_id,
            role: a.role,
            percent: String(a.allocation_percent),
          }))
        );
      } else if (editing.assignee_user_ids && editing.assignee_user_ids.length > 0) {
        // 旧データ: 役割なしの場合は先頭pm、残りmember、均等割り
        const n = editing.assignee_user_ids.length;
        const each = Math.floor(100 / n);
        const remainder = 100 - each * n;
        setRows(
          editing.assignee_user_ids.map((uid, idx) => ({
            user_id: uid,
            role: idx === 0 ? 'pm' : 'member',
            percent: String(idx === 0 ? each + remainder : each),
          }))
        );
      } else {
        setRows([]);
      }
    } else {
      // 新規
      setDealName('');
      setCategory('consulting');
      setStatus('prospect');
      setMonthlyAmount('0');
      setSalesAmount('0');
      setExpectedCloseDate('');
      setClosedDate('');
      setTerminatedDate('');
      setRows([]);
      setNotes('');
    }
  }, [open, editing]);

  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !deletingNow) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, saving, deletingNow]);

  if (!open) return null;

  const isEdit = !!editing?.id;
  const totalPercent = rows.reduce(
    (sum, r) => sum + (Number(r.percent) || 0),
    0
  );
  const isPercentValid = Math.abs(totalPercent - 100) < 0.01;
  const hasAllUsers = rows.every((r) => !!r.user_id);
  const hasNoDupUser =
    new Set(rows.map((r) => r.user_id).filter(Boolean)).size ===
    rows.filter((r) => !!r.user_id).length;
  const canSave =
    dealName.trim().length > 0 &&
    rows.length > 0 &&
    isPercentValid &&
    hasAllUsers &&
    hasNoDupUser &&
    !saving &&
    !deletingNow;

  function addRow() {
    // 次のデフォルト役割: 未設定の役割を順に
    const usedRoles = new Set(rows.map((r) => r.role));
    let nextRole: AssigneeRole = 'member';
    for (const r of ASSIGNEE_ROLE_ORDER) {
      if (!usedRoles.has(r)) {
        nextRole = r;
        break;
      }
    }
    setRows((prev) => [
      ...prev,
      {
        user_id: '',
        role: nextRole,
        percent: String(ROLE_DEFAULT_PERCENT[nextRole]),
      },
    ]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        // 役割が変わったら、目安%に自動更新 (ユーザーが手で入れた値が
        // デフォルト値と同じだった場合に限る = 「触ってないなら追従」挙動)
        if (
          patch.role &&
          patch.role !== r.role &&
          Number(r.percent) === ROLE_DEFAULT_PERCENT[r.role]
        ) {
          next.percent = String(ROLE_DEFAULT_PERCENT[patch.role]);
        }
        return next;
      })
    );
  }

  function distributeEvenly() {
    if (rows.length === 0) return;
    const each = Math.floor(100 / rows.length);
    const remainder = 100 - each * rows.length;
    setRows((prev) =>
      prev.map((r, i) => ({
        ...r,
        percent: String(i === 0 ? each + remainder : each),
      }))
    );
  }

  async function handleSave() {
    if (!canSave) return;

    // 新規追加時のみ重複チェック (編集時は対象外)
    if (!isEdit) {
      const supabase = getSupabase();
      if (supabase) {
        const { data: existing } = await supabase
          .from('performance_deals')
          .select('id, deal_name, monthly_amount')
          .eq('client_id', clientId)
          .eq('deal_name', dealName.trim())
          .eq('monthly_amount', Number(monthlyAmount) || 0);

        if (existing && existing.length > 0) {
          // eslint-disable-next-line no-alert
          const proceed = window.confirm(
            `⚠️ 同じ案件が既に登録されています:\n\n` +
              `案件名: ${dealName.trim()}\n` +
              `月額: ¥${Number(monthlyAmount).toLocaleString()}\n\n` +
              `重複して追加しますか？\n` +
              `(別契約・別フェーズなどで本当に複数登録が必要な場合のみOK)`
          );
          if (!proceed) return;
        }
      }
    }

    // 主担当: pmの人 (居なければ最初の人)
    const pmRow = rows.find((r) => r.role === 'pm');
    const primaryUserId = pmRow ? pmRow.user_id : rows[0].user_id;

    // 役割順 (PM → PL → メンバー) でソート
    const roleOrder: Record<AssigneeRole, number> = { pm: 0, pl: 1, member: 2 };
    const sortedRows = [...rows].sort(
      (a, b) => roleOrder[a.role] - roleOrder[b.role]
    );

    const input: DealInput = {
      user_id: primaryUserId,
      client_id: clientId,
      category,
      deal_name: dealName.trim(),
      status,
      expected_close_date: expectedCloseDate || null,
      closed_date: closedDate || null,
      terminated_date: terminatedDate || null,
      sales_amount: Number(salesAmount) || 0,
      monthly_amount: Number(monthlyAmount) || 0,
      gross_profit: 0,
      meeting_count: 0,
      notes: notes.trim() || null,
      assignees: sortedRows.map((r, idx) => ({
        user_id: r.user_id,
        role: r.role,
        allocation_ratio: (Number(r.percent) || 0) / 100,
        display_order: idx,
      })),
    };

    let ok = false;
    if (isEdit && editing?.id) {
      ok = await updateDeal(editing.id, input);
    } else {
      ok = await createDeal(input, authUserId);
    }
    if (ok) {
      onSaved();
      onClose();
    }
  }

  async function handleDelete() {
    if (!editing?.id) return;
    // eslint-disable-next-line no-alert
    if (
      !window.confirm(
        `案件「${editing.deal_name}」を削除しますか？\n紐づく工数や請求明細の参照は外れます。`
      )
    ) {
      return;
    }
    setDeletingNow(true);
    const ok = await deleteDeal(editing.id);
    setDeletingNow(false);
    if (ok) {
      onSaved();
      onClose();
    }
  }

  // 既に行に追加されているユーザーは選択肢から除外 (自分の行は除く)
  function availableUsersForRow(rowIdx: number) {
    const usedIds = new Set(
      rows.map((r, i) => (i !== rowIdx ? r.user_id : null)).filter(Boolean)
    );
    return activeUsers.filter(
      (u) => !usedIds.has(u.id) || u.id === COMPANY_USER_ID
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={() => {
        if (!saving && !deletingNow) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 8,
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18 }}>
            {isEdit ? '案件を編集' : '案件を追加'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || deletingNow}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              color: '#888',
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* 案件名 */}
          <div>
            <label style={lblStyle}>
              案件名 <span style={{ color: '#d33' }}>*</span>
            </label>
            <input
              type="text"
              value={dealName}
              onChange={(e) => setDealName(e.target.value)}
              placeholder="例: SNS運用支援費"
              disabled={saving}
              style={inputStyle}
            />
          </div>

          {/* カテゴリ・ステータス */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lblStyle}>領域 (カテゴリ)</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DealCategory)}
                disabled={saving}
                style={inputStyle}
              >
                {DEAL_CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {DEAL_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={lblStyle}>ステータス</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DealStatus)}
                disabled={saving}
                style={inputStyle}
              >
                {DEAL_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {DEAL_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 金額 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lblStyle}>月額 (円)</label>
              <input
                type="number"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
                disabled={saving}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={lblStyle}>売上金額 (円・初期)</label>
              <input
                type="number"
                value={salesAmount}
                onChange={(e) => setSalesAmount(e.target.value)}
                disabled={saving}
                style={inputStyle}
              />
            </div>
          </div>

          {/* 日付 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
            }}
          >
            <div>
              <label style={lblStyle}>受注予定日</label>
              <input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                disabled={saving}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={lblStyle}>受注日</label>
              <input
                type="date"
                value={closedDate}
                onChange={(e) => setClosedDate(e.target.value)}
                disabled={saving}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={lblStyle}>終了日</label>
              <input
                type="date"
                value={terminatedDate}
                onChange={(e) => setTerminatedDate(e.target.value)}
                disabled={saving}
                style={inputStyle}
              />
            </div>
          </div>

          {/* 担当者 (行追加方式) */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <div>
                <label style={{ ...lblStyle, margin: 0 }}>
                  担当者・按分 <span style={{ color: '#d33' }}>*</span>
                </label>
                <small style={{ color: '#888', fontSize: 11 }}>
                  目安: PM {ROLE_DEFAULT_PERCENT.pm}% / PL {ROLE_DEFAULT_PERCENT.pl}% / メンバー {ROLE_DEFAULT_PERCENT.member}%
                </small>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={distributeEvenly}
                    disabled={saving}
                    style={{
                      padding: '4px 10px',
                      background: '#f5f5f5',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    均等割り
                  </button>
                )}
                <button
                  type="button"
                  onClick={addRow}
                  disabled={saving}
                  style={{
                    padding: '4px 10px',
                    background: '#4a8a4a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  + 担当者を追加
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  border: '1px dashed #ddd',
                  borderRadius: 4,
                  textAlign: 'center',
                  color: '#888',
                  fontSize: 13,
                }}
              >
                「+ 担当者を追加」で担当者を追加してください
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                {rows.map((row, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 110px 90px 40px',
                      gap: 8,
                      padding: '8px 10px',
                      borderBottom:
                        idx < rows.length - 1 ? '1px solid #eee' : 'none',
                      alignItems: 'center',
                    }}
                  >
                    <select
                      value={row.user_id}
                      onChange={(e) =>
                        updateRow(idx, { user_id: e.target.value })
                      }
                      disabled={saving}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    >
                      <option value="">担当者を選択...</option>
                      {availableUsersForRow(idx).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.role}
                      onChange={(e) =>
                        updateRow(idx, { role: e.target.value as AssigneeRole })
                      }
                      disabled={saving}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    >
                      {ASSIGNEE_ROLE_ORDER.map((r) => (
                        <option key={r} value={r}>
                          {ASSIGNEE_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <input
                        type="number"
                        value={row.percent}
                        onChange={(e) =>
                          updateRow(idx, { percent: e.target.value })
                        }
                        disabled={saving}
                        min="0"
                        max="100"
                        style={{
                          ...inputStyle,
                          padding: '6px 8px',
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ fontSize: 13, color: '#666' }}>%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={saving}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#d33',
                        cursor: 'pointer',
                        fontSize: 18,
                      }}
                      title="削除"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {/* 合計表示 */}
                <div
                  style={{
                    padding: '8px 10px',
                    background: isPercentValid ? '#eaf5ea' : '#fee',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>合計</span>
                  <span style={{ color: isPercentValid ? '#2e7d32' : '#d33' }}>
                    {totalPercent.toFixed(0)} %{' '}
                    {isPercentValid
                      ? '✓'
                      : `(あと ${(100 - totalPercent).toFixed(0)}%)`}
                  </span>
                </div>
              </div>
            )}

            {!hasNoDupUser && (
              <small
                style={{
                  color: '#d33',
                  fontSize: 11,
                  marginTop: 4,
                  display: 'block',
                }}
              >
                同じ担当者が複数行に指定されています
              </small>
            )}
            {rows.length > 0 && !hasAllUsers && (
              <small
                style={{
                  color: '#d33',
                  fontSize: 11,
                  marginTop: 4,
                  display: 'block',
                }}
              >
                未選択の担当者があります
              </small>
            )}
            <small
              style={{
                color: '#888',
                fontSize: 11,
                marginTop: 4,
                display: 'block',
              }}
            >
              PM が主担当になります (居なければ先頭の人)
            </small>
          </div>

          {/* メモ */}
          <div>
            <label style={lblStyle}>メモ</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {error && (
            <div
              style={{
                color: '#d33',
                fontSize: 13,
                padding: 8,
                background: '#fee',
                borderRadius: 4,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #e5e5e5',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deletingNow}
                style={{
                  padding: '8px 16px',
                  background: '#fff',
                  color: '#d33',
                  border: '1px solid #d33',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                {deletingNow ? '削除中...' : '削除'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deletingNow}
              style={{
                padding: '8px 16px',
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                padding: '8px 20px',
                background: canSave ? '#4a8a4a' : '#aaa',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: canSave ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? '保存中...' : isEdit ? '更新' : '追加'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const lblStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#666',
  marginBottom: 4,
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
