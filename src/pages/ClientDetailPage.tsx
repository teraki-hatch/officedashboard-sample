import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppUser } from '../lib/useAppUser';
import {
  useClient,
  fetchDealsForClient,
  fetchInvoicesForClient,
  fetchTimeAggregateForClient,
  deleteClient,
} from '../features/clients/useClient';
import type {
  ClientInvoice,
  ClientTimeAggregate,
} from '../features/clients/useClient';
import { ClientEditModal } from '../features/clients/ClientEditModal';
import { ClientDealModal } from '../features/clients/ClientDealModal';
import type { ClientDealForm } from '../features/clients/ClientDealModal';
import type { DealCategory, DealStatus } from '../features/performance/types';
import './ClientDetailPage.css';

/**
 * Phase C-3: projects 廃止に伴う改修
 *   - 「関連プロジェクト」セクション完全削除
 *   - 「プロジェクト別工数」→「作業カテゴリ別工数」
 *   - サマリーカード「プロジェクト N件」を削除
 *   - PROJECT_STATUS_LABELS / ClientProject 型インポート削除
 */

// Supabase の nested select は型推論が不安定なので緩めに型付け
type DealAssignee = {
  id: string;
  user_id: string;
  role: string;
  allocation_ratio: number;
  user?: { id: string; name: string; employee_code: string } | null
       | Array<{ id: string; name: string; employee_code: string }>;
};

type Deal = {
  id: string;
  deal_name: string;
  category: string;
  status: string;
  monthly_amount: number;
  sales_amount?: number;
  expected_close_date?: string | null;
  closed_date: string | null;
  terminated_date: string | null;
  notes?: string | null;
  assignees?: DealAssignee[];
};

const CATEGORY_LABELS: Record<string, string> = {
  consulting: 'コンサル',
  media: '媒体',
  rpo: 'RPO',
  creative: 'クリエイティブ',
  maintenance: '保守',
  other: 'その他',
};

const STATUS_LABELS: Record<string, string> = {
  prospect: '見込',
  in_progress: '営業中',
  proposed: '提案中',
  negotiating: '交渉中',
  contract: '契約調整中',
  won: '成約',
  in_support: '支援中',
  on_hold: '保留',
  terminated: '終了',
  lost: '失注',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: '下書き',
  issued: '発行済',
  sent: '送付済',
  paid: '入金済',
  overdue: '滞納',
  void: '取消',
};

function formatYen(n: number | null | undefined): string {
  return '¥' + Math.round(Number(n || 0)).toLocaleString('ja-JP');
}

function formatHours(n: number): string {
  return n.toFixed(1) + 'h';
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

function getUserName(a: DealAssignee): string {
  const u = a.user;
  if (!u) return '';
  if (Array.isArray(u)) return u[0]?.name || '';
  return u.name || '';
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { appUser } = useAppUser();
  const canEdit = !!appUser;

  const { client, loading, error, reload } = useClient(id || null);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState<boolean>(true);

  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState<boolean>(true);

  const [timeAgg, setTimeAgg] = useState<ClientTimeAggregate | null>(null);
  const [timeLoading, setTimeLoading] = useState<boolean>(true);

  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // 案件モーダル用
  const [dealModalOpen, setDealModalOpen] = useState<boolean>(false);
  const [editingDeal, setEditingDeal] = useState<ClientDealForm | null>(null);

  // 案件reload関数 (モーダル保存後に呼ぶ)
  async function reloadDeals() {
    if (!id) return;
    setDealsLoading(true);
    const dealsData = await fetchDealsForClient(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setDeals(dealsData as any as Deal[]);
    setDealsLoading(false);
  }

  function openCreateDeal() {
    setEditingDeal(null);
    setDealModalOpen(true);
  }

  function openEditDeal(d: Deal) {
    // 既存assigneesから role + 按分% を抽出
    const detailedAssignees = (d.assignees || []).map((a) => ({
      user_id: a.user_id,
      role: (a.role as 'pm' | 'pl' | 'member') || 'member',
      allocation_percent: Math.round((a.allocation_ratio || 0) * 100),
    }));

    setEditingDeal({
      id: d.id,
      deal_name: d.deal_name,
      category: d.category as DealCategory,
      status: d.status as DealStatus,
      monthly_amount: d.monthly_amount || 0,
      sales_amount: d.sales_amount || 0,
      expected_close_date: d.expected_close_date || null,
      closed_date: d.closed_date,
      terminated_date: d.terminated_date,
      notes: d.notes || null,
      assignee_user_ids: detailedAssignees.map((a) => a.user_id),
      assignees_detailed: detailedAssignees,
    });
    setDealModalOpen(true);
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!id) return;

      setDealsLoading(true);
      setInvoicesLoading(true);
      setTimeLoading(true);

      // 並列でフェッチ (projects 廃止により3つに)
      const [dealsData, invoicesData, timeData] = await Promise.all([
        fetchDealsForClient(id),
        fetchInvoicesForClient(id),
        fetchTimeAggregateForClient(id),
      ]);

      if (!alive) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDeals(dealsData as any as Deal[]);
      setInvoices(invoicesData);
      setTimeAgg(timeData);
      setDealsLoading(false);
      setInvoicesLoading(false);
      setTimeLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [id]);

  async function handleDelete() {
    if (!client) return;
    if (
      !window.confirm(
        `「${client.name}」を削除しますか？\n紐付いている案件は残りますが、クライアント情報の関連は外れます。`
      )
    ) {
      return;
    }
    setDeleting(true);
    const result = await deleteClient(client.id);
    setDeleting(false);
    if ('error' in result) {
      alert('削除エラー: ' + result.error);
      return;
    }
    navigate('/sales/clients');
  }

  function handleEditSaved() {
    setEditOpen(false);
    reload();
  }

  if (loading) {
    return <div className="client-detail__loading">読み込み中...</div>;
  }
  if (error || !client) {
    return (
      <div className="client-detail__error">
        <p>クライアントが見つかりません</p>
        <button
          type="button"
          className="client-detail__back-btn"
          onClick={() => navigate('/sales/clients')}
        >
          ← 一覧に戻る
        </button>
      </div>
    );
  }

  const totalMonthly = deals.reduce(
    (acc, d) => acc + Number(d.monthly_amount || 0),
    0
  );

  const totalInvoiced = invoices.reduce(
    (acc, i) => acc + Number(i.total_amount || 0),
    0
  );
  const unpaidInvoices = invoices.filter(
    (i) => i.status !== 'paid' && i.status !== 'void'
  );
  const unpaidAmount = unpaidInvoices.reduce(
    (acc, i) => acc + Number(i.total_amount || 0),
    0
  );

  return (
    <div className="client-detail">
      <header className="client-detail__header">
        <button
          type="button"
          className="client-detail__back"
          onClick={() => navigate('/sales/clients')}
        >
          ← クライアント一覧
        </button>
        <div className="client-detail__title-row">
          <div>
            <h1 className="client-detail__title">{client.name}</h1>
            {client.short_name && (
              <p className="client-detail__short-name">{client.short_name}</p>
            )}
          </div>
          <div className="client-detail__actions">
            {!client.is_active && (
              <span className="client-detail__badge client-detail__badge--inactive">
                停止中
              </span>
            )}
            {canEdit && (
              <>
                <button
                  type="button"
                  className="client-detail__btn client-detail__btn--secondary"
                  onClick={() => setEditOpen(true)}
                >
                  編集
                </button>
                <button
                  type="button"
                  className="client-detail__btn client-detail__btn--danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? '削除中...' : '削除'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ===== サマリーカード (Phase C-3: 4枚→3枚、プロジェクトカード削除) ===== */}
      <div className="client-detail__summary">
        <div className="client-detail__summary-card">
          <div className="client-detail__summary-label">案件</div>
          <div className="client-detail__summary-value">{deals.length}件</div>
          <div className="client-detail__summary-sub">
            月額 {formatYen(totalMonthly)}
          </div>
        </div>
        <div className="client-detail__summary-card">
          <div className="client-detail__summary-label">工数(直近12ヶ月)</div>
          <div className="client-detail__summary-value">
            {formatHours(timeAgg?.totalHours || 0)}
          </div>
          <div className="client-detail__summary-sub">
            カテゴリ {timeAgg?.byCategory.length || 0}種
          </div>
        </div>
        <div className="client-detail__summary-card">
          <div className="client-detail__summary-label">請求書</div>
          <div className="client-detail__summary-value">
            {invoices.length}件
          </div>
          <div className="client-detail__summary-sub">
            未入金 {formatYen(unpaidAmount)}
          </div>
        </div>
      </div>

      <div className="client-detail__grid">
        {/* 会社情報 */}
        <section className="client-detail__card">
          <h2 className="client-detail__section-title">会社情報</h2>
          <dl className="client-detail__dl">
            <dt>業種</dt>
            <dd>
              {client.industry || (
                <span className="client-detail__mute">未設定</span>
              )}
            </dd>
            <dt>住所</dt>
            <dd>
              {client.address || (
                <span className="client-detail__mute">未設定</span>
              )}
            </dd>
            <dt>電話番号</dt>
            <dd>
              {client.phone ? (
                <a href={`tel:${client.phone}`}>{client.phone}</a>
              ) : (
                <span className="client-detail__mute">未設定</span>
              )}
            </dd>
            <dt>メール</dt>
            <dd>
              {client.email ? (
                <a href={`mailto:${client.email}`}>{client.email}</a>
              ) : (
                <span className="client-detail__mute">未設定</span>
              )}
            </dd>
            <dt>Webサイト</dt>
            <dd>
              {client.website ? (
                <a
                  href={client.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {client.website}
                </a>
              ) : (
                <span className="client-detail__mute">未設定</span>
              )}
            </dd>
          </dl>
        </section>

        {/* 担当窓口 */}
        <section className="client-detail__card">
          <h2 className="client-detail__section-title">担当窓口</h2>
          <dl className="client-detail__dl">
            <dt>担当者名</dt>
            <dd>
              {client.contact_person || (
                <span className="client-detail__mute">未設定</span>
              )}
            </dd>
            <dt>担当者電話</dt>
            <dd>
              {client.contact_phone ? (
                <a href={`tel:${client.contact_phone}`}>
                  {client.contact_phone}
                </a>
              ) : (
                <span className="client-detail__mute">未設定</span>
              )}
            </dd>
            <dt>担当者メール</dt>
            <dd>
              {client.contact_email ? (
                <a href={`mailto:${client.contact_email}`}>
                  {client.contact_email}
                </a>
              ) : (
                <span className="client-detail__mute">未設定</span>
              )}
            </dd>
          </dl>
        </section>
      </div>

      {/* メモ */}
      <section className="client-detail__card client-detail__card--full">
        <h2 className="client-detail__section-title">メモ</h2>
        {client.notes ? (
          <p className="client-detail__notes">{client.notes}</p>
        ) : (
          <p className="client-detail__mute">メモは未設定です</p>
        )}
      </section>

      {/* ===== 関連案件 ===== */}
      <section className="client-detail__card client-detail__card--full">
        <div className="client-detail__deals-header">
          <h2 className="client-detail__section-title client-detail__section-title--inline">
            関連案件 ({deals.length}件)
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {deals.length > 0 && (
              <div className="client-detail__deals-total">
                月額合計: <strong>{formatYen(totalMonthly)}</strong>
              </div>
            )}
            <button
              type="button"
              onClick={openCreateDeal}
              style={{
                padding: '6px 14px',
                background: '#1A1A1A',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              + 案件を追加
            </button>
          </div>
        </div>
        {dealsLoading ? (
          <p className="client-detail__mute">読み込み中...</p>
        ) : deals.length === 0 ? (
          <p className="client-detail__mute">関連案件はありません</p>
        ) : (
          <table className="client-detail__deals-table">
            <thead>
              <tr>
                <th>案件名</th>
                <th>領域</th>
                <th>担当</th>
                <th>状態</th>
                <th className="client-detail__td-num">月額</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => openEditDeal(d)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{d.deal_name}</td>
                  <td>{CATEGORY_LABELS[d.category] || d.category}</td>
                  <td>
                    {(d.assignees || [])
                      .map(getUserName)
                      .filter(Boolean)
                      .join(', ')}
                  </td>
                  <td>
                    {STATUS_LABELS[d.status] || d.status}
                    {d.terminated_date && (
                      <span className="client-detail__terminated">
                        {' '}
                        ({d.terminated_date.slice(0, 10)} 終了)
                      </span>
                    )}
                  </td>
                  <td className="client-detail__td-num">
                    {formatYen(d.monthly_amount)}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 12, color: '#888' }}>
                    編集
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ===== 工数集計 (Phase C-3: プロジェクト別 → カテゴリ別) ===== */}
      <section className="client-detail__card client-detail__card--full">
        <h2 className="client-detail__section-title">
          工数 (直近12ヶ月)
        </h2>
        {timeLoading ? (
          <p className="client-detail__mute">読み込み中...</p>
        ) : !timeAgg || timeAgg.totalHours === 0 ? (
          <p className="client-detail__mute">
            工数の入力はまだありません
          </p>
        ) : (
          <div className="client-detail__time-grid">
            <div>
              <h3 className="client-detail__subsection-title">
                作業カテゴリ別
              </h3>
              <table className="client-detail__deals-table">
                <thead>
                  <tr>
                    <th>カテゴリ</th>
                    <th className="client-detail__td-num">合計工数</th>
                    <th className="client-detail__td-num">割合</th>
                  </tr>
                </thead>
                <tbody>
                  {timeAgg.byCategory.map((c) => {
                    const pct =
                      timeAgg.totalHours > 0
                        ? (c.hours / timeAgg.totalHours) * 100
                        : 0;
                    return (
                      <tr key={c.categoryId}>
                        <td>{c.categoryName}</td>
                        <td className="client-detail__td-num">
                          {formatHours(c.hours)}
                        </td>
                        <td className="client-detail__td-num">
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="client-detail__total-row">
                    <td>
                      <strong>合計</strong>
                    </td>
                    <td className="client-detail__td-num">
                      <strong>{formatHours(timeAgg.totalHours)}</strong>
                    </td>
                    <td className="client-detail__td-num">
                      <strong>100.0%</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="client-detail__subsection-title">月別</h3>
              <table className="client-detail__deals-table">
                <thead>
                  <tr>
                    <th>月</th>
                    <th className="client-detail__td-num">工数</th>
                  </tr>
                </thead>
                <tbody>
                  {timeAgg.byMonth.map((m) => (
                    <tr key={m.yearMonth}>
                      <td>{m.yearMonth}</td>
                      <td className="client-detail__td-num">
                        {formatHours(m.hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ===== 関連請求書 ===== */}
      <section className="client-detail__card client-detail__card--full">
        <div className="client-detail__deals-header">
          <h2 className="client-detail__section-title client-detail__section-title--inline">
            請求書 ({invoices.length}件)
          </h2>
          {invoices.length > 0 && (
            <div className="client-detail__deals-total">
              請求合計: <strong>{formatYen(totalInvoiced)}</strong>
              {unpaidAmount > 0 && (
                <span style={{ marginLeft: 16, color: '#dc2626' }}>
                  未入金: <strong>{formatYen(unpaidAmount)}</strong>
                </span>
              )}
            </div>
          )}
        </div>
        {invoicesLoading ? (
          <p className="client-detail__mute">読み込み中...</p>
        ) : invoices.length === 0 ? (
          <p className="client-detail__mute">請求書はありません</p>
        ) : (
          <table className="client-detail__deals-table">
            <thead>
              <tr>
                <th>請求月</th>
                <th>請求番号</th>
                <th>発行日</th>
                <th>支払期限</th>
                <th>状態</th>
                <th>入金日</th>
                <th className="client-detail__td-num">金額</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.billing_month?.slice(0, 7) || '—'}</td>
                  <td>{inv.invoice_number}</td>
                  <td>{formatDate(inv.issue_date)}</td>
                  <td>{formatDate(inv.due_date)}</td>
                  <td>
                    {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                  </td>
                  <td>{formatDate(inv.paid_date)}</td>
                  <td className="client-detail__td-num">
                    {formatYen(inv.total_amount)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="client-detail__btn client-detail__btn--secondary client-detail__btn--small"
                      onClick={() =>
                        navigate(`/billing/invoices/${inv.id}`)
                      }
                    >
                      開く
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editOpen && (
        <ClientEditModal
          open={true}
          client={client}
          onClose={() => setEditOpen(false)}
          onSaved={handleEditSaved}
        />
      )}

      {dealModalOpen && id && appUser?.auth_user_id && (
        <ClientDealModal
          open={true}
          clientId={id}
          authUserId={appUser.auth_user_id}
          editing={editingDeal}
          onClose={() => {
            setDealModalOpen(false);
            setEditingDeal(null);
          }}
          onSaved={() => {
            reloadDeals();
          }}
        />
      )}
    </div>
  );
}

export default ClientDetailPage;
