import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppUser } from '../lib/useAppUser';
import { useClients } from '../features/clients/useClients';
import { ClientEditModal } from '../features/clients/ClientEditModal';
import type { Client } from '../features/clients/types';
import './ClientsPage.css';

function formatYen(n: number): string {
  return '¥' + Math.round(Number(n || 0)).toLocaleString('ja-JP');
}

export function ClientsPage() {
  const { appUser } = useAppUser();
  // 編集権限: クライアントは全員編集OK (admin限定じゃない)
  const canEdit = !!appUser;
  const navigate = useNavigate();
  const { clients, loading, error, reload } = useClients();

  const [search, setSearch] = useState<string>('');
  const [editTarget, setEditTarget] = useState<Client | null | undefined>(undefined);
  // undefined = モーダル閉じ / null = 新規作成 / Client = 編集

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const fields = [
        c.name,
        c.short_name,
        c.industry,
        c.address,
        c.contact_person,
      ];
      return fields.some((f) => f && f.toLowerCase().includes(q));
    });
  }, [clients, search]);

  function handleRowClick(id: string) {
    navigate('/clients/' + id);
  }

  function handleAddClick() {
    setEditTarget(null);
  }

  function handleModalClose() {
    setEditTarget(undefined);
  }

  function handleSaved() {
    setEditTarget(undefined);
    reload();
  }

  return (
    <div className="clients-page">
      <header className="clients-page__header">
        <div>
          <h1 className="clients-page__title">クライアント管理</h1>
          <p className="clients-page__subtitle">
            取引先の情報を一元管理します
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="clients-page__add-btn"
            onClick={handleAddClick}
          >
            ＋ 新規クライアント
          </button>
        )}
      </header>

      <div className="clients-page__toolbar">
        <input
          type="search"
          className="clients-page__search"
          placeholder="🔍 会社名・業種・担当者で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="clients-page__error">データ取得エラー: {error}</div>
      )}

      <div className="clients-page__table-wrap">
        <table className="clients-page__table">
          <thead>
            <tr>
              <th className="clients-page__th clients-page__th--name">会社名</th>
              <th className="clients-page__th">業種</th>
              <th className="clients-page__th">担当窓口</th>
              <th className="clients-page__th clients-page__th--num">案件数</th>
              <th className="clients-page__th clients-page__th--num">月額合計</th>
              <th className="clients-page__th clients-page__th--status">状態</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="clients-page__empty">
                  読み込み中...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="clients-page__empty">
                  {search
                    ? '検索条件に一致するクライアントが見つかりません'
                    : 'クライアントが登録されていません'}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className="clients-page__row"
                  onClick={() => handleRowClick(c.id)}
                >
                  <td className="clients-page__td clients-page__td--name">
                    <div className="clients-page__name">{c.name}</div>
                    {c.short_name && (
                      <div className="clients-page__short-name">
                        {c.short_name}
                      </div>
                    )}
                  </td>
                  <td className="clients-page__td">
                    {c.industry || <span className="clients-page__mute">—</span>}
                  </td>
                  <td className="clients-page__td">
                    {c.contact_person || (
                      <span className="clients-page__mute">—</span>
                    )}
                  </td>
                  <td className="clients-page__td clients-page__td--num">
                    {c.deal_count}
                  </td>
                  <td className="clients-page__td clients-page__td--num">
                    {c.total_monthly > 0 ? (
                      formatYen(c.total_monthly)
                    ) : (
                      <span className="clients-page__mute">—</span>
                    )}
                  </td>
                  <td className="clients-page__td clients-page__td--status">
                    {c.is_active ? (
                      <span className="clients-page__badge clients-page__badge--active">
                        稼働中
                      </span>
                    ) : (
                      <span className="clients-page__badge clients-page__badge--inactive">
                        停止
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editTarget !== undefined && (
        <ClientEditModal
          open={true}
          client={editTarget}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

export default ClientsPage;
