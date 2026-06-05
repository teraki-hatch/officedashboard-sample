/**
 * 案件一覧ページ (Phase B-3 で新設)
 * 全クライアントの全案件 (performance_deals) を横断で見るためのページ。
 * 本実装は今後。
 */
export function DealsPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>案件一覧</h1>
      <p style={{ color: '#666', marginTop: 8 }}>
        全クライアント横断で案件 (商談・契約) を一覧で見るページです (実装中)。
      </p>
      <p style={{ color: '#666', marginTop: 16, fontSize: 13 }}>
        当面はクライアントごとの案件は{' '}
        <a href="/sales/clients" style={{ color: '#10b981' }}>
          クライアント一覧
        </a>
        から各クライアント詳細を開いて確認できます。
      </p>
    </div>
  );
}

export default DealsPage;
