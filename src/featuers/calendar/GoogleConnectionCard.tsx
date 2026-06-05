// Phase: Googleカレンダー接続UI (設定画面に置くカード)
import { useState } from 'react';
import { useGoogleConnection } from './useGoogleConnection';

export function GoogleConnectionCard() {
  const { initialized, connected, googleEmail, loading, error, connect, disconnect } =
    useGoogleConnection();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConnect = async () => {
    setBusy(true);
    await connect();
    // connect 内で遷移するので、ここに戻ってくることは基本ない
    setBusy(false);
  };

  const handleDisconnect = async () => {
    setBusy(true);
    await disconnect();
    setBusy(false);
    setConfirming(false);
  };

  return (
    <section className="gconn-card">
      <header className="gconn-card__header">
        <div className="gconn-card__title-wrap">
          <span className="gconn-card__icon" aria-hidden>📅</span>
          <h3 className="gconn-card__title">Googleカレンダー連携</h3>
        </div>
        {initialized && (
          <span
            className={
              'gconn-card__badge ' +
              (connected
                ? 'gconn-card__badge--connected'
                : 'gconn-card__badge--disconnected')
            }
          >
            {connected ? '● 連携中' : '○ 未連携'}
          </span>
        )}
      </header>

      <p className="gconn-card__desc">
        Googleカレンダーと連携すると、ホーム画面の「今日の予定」や工数入力画面で
        予定を参照できます。
      </p>

      {!initialized || loading ? (
        <div className="gconn-card__loading">読み込み中…</div>
      ) : connected ? (
        <div className="gconn-card__connected">
          <div className="gconn-card__email">
            <span className="gconn-card__email-label">連携アカウント</span>
            <span className="gconn-card__email-value">
              {googleEmail ?? '(メールアドレス不明)'}
            </span>
          </div>

          {!confirming ? (
            <button
              type="button"
              className="gconn-card__btn gconn-card__btn--ghost"
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              連携を解除
            </button>
          ) : (
            <div className="gconn-card__confirm">
              <p className="gconn-card__confirm-msg">
                本当に連携を解除しますか？ ホーム画面の今日の予定や工数入力画面でカレンダーが利用できなくなります。
              </p>
              <div className="gconn-card__confirm-actions">
                <button
                  type="button"
                  className="gconn-card__btn gconn-card__btn--danger"
                  onClick={handleDisconnect}
                  disabled={busy}
                >
                  {busy ? '処理中…' : '解除する'}
                </button>
                <button
                  type="button"
                  className="gconn-card__btn gconn-card__btn--ghost"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="gconn-card__disconnected">
          <button
            type="button"
            className="gconn-card__btn gconn-card__btn--primary"
            onClick={handleConnect}
            disabled={busy}
          >
            {busy ? '接続中…' : 'Googleカレンダーと連携する'}
          </button>
          <p className="gconn-card__hint">
            ※ アプリのログインとは別の Google 認証です。読み取り専用権限のみ要求します。
          </p>
        </div>
      )}

      {error && <div className="gconn-card__error">エラー: {error}</div>}

      <style>{`
        .gconn-card {
          border: 1px solid var(--line);
          border-radius: var(--radius, 8px);
          padding: 20px 24px;
          background: var(--surface, #fff);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .gconn-card__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .gconn-card__title-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .gconn-card__icon {
          font-size: 18px;
        }
        .gconn-card__title {
          font-size: 15px;
          font-weight: 600;
          color: var(--ink);
          margin: 0;
        }
        .gconn-card__badge {
          font-size: 12px;
          padding: 3px 10px;
          border-radius: 999px;
          font-weight: 500;
        }
        .gconn-card__badge--connected {
          background: var(--ok-bg, #EDF3E3);
          color: var(--ok, #6C8F3D);
        }
        .gconn-card__badge--disconnected {
          background: #f1efe8;
          color: var(--ink-mute);
        }
        .gconn-card__desc {
          font-size: 13px;
          color: var(--ink-mute);
          margin: 0;
          line-height: 1.6;
        }
        .gconn-card__loading {
          font-size: 13px;
          color: var(--ink-soft);
          padding: 8px 0;
        }
        .gconn-card__connected {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .gconn-card__email {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 10px 12px;
          background: #f8f5e9;
          border-radius: 6px;
        }
        .gconn-card__email-label {
          font-size: 11px;
          color: var(--ink-mute);
        }
        .gconn-card__email-value {
          font-size: 13px;
          color: var(--ink);
          font-family: var(--font-mono);
          word-break: break-all;
        }
        .gconn-card__disconnected {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .gconn-card__hint {
          font-size: 11.5px;
          color: var(--ink-soft);
          margin: 0;
        }
        .gconn-card__btn {
          border: 1px solid transparent;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 120ms ease;
          align-self: flex-start;
        }
        .gconn-card__btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .gconn-card__btn--primary {
          background: var(--primary);
          color: #fff;
          border-color: var(--primary);
        }
        .gconn-card__btn--primary:hover:not(:disabled) {
          background: var(--primary-dark);
          border-color: var(--primary-dark);
        }
        .gconn-card__btn--ghost {
          background: #fff;
          color: var(--ink-mute);
          border-color: var(--line-strong);
        }
        .gconn-card__btn--ghost:hover:not(:disabled) {
          background: var(--primary-pale);
          color: var(--primary-dark);
          border-color: var(--primary);
        }
        .gconn-card__btn--danger {
          background: var(--danger, #B5523C);
          color: #fff;
          border-color: var(--danger, #B5523C);
        }
        .gconn-card__btn--danger:hover:not(:disabled) {
          filter: brightness(0.92);
        }
        .gconn-card__confirm {
          padding: 12px;
          background: var(--danger-bg, #F4E1DA);
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .gconn-card__confirm-msg {
          font-size: 12.5px;
          color: var(--ink);
          margin: 0;
          line-height: 1.5;
        }
        .gconn-card__confirm-actions {
          display: flex;
          gap: 8px;
        }
        .gconn-card__error {
          font-size: 12px;
          color: var(--danger, #B5523C);
          background: var(--danger-bg, #F4E1DA);
          padding: 8px 12px;
          border-radius: 6px;
        }
      `}</style>
    </section>
  );
}
