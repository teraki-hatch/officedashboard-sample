import { useMemo, useState } from 'react';
import { useAppUser } from '../../lib/useAppUser';
import { useAllMonthlyClosures } from './useAllMonthlyClosures';
import { useClosureActions } from './useClosureActions';
import {
  fmtShortTime,
  formatYearMonthJa,
  statusBadgeClass,
  statusLabel,
  toYearMonth,
} from './closureUtils';
import './MonthlyClosurePanel.css';

/**
 * 管理者画面: 月次勤怠締めパネル
 * --------------------------------------------------------------
 * - 対象月を選択
 * - 全社員一覧 (status バッジ / 確定 / 差戻し / ロック解除ボタン)
 * - 「提出済 全員確定」一括ボタン
 * --------------------------------------------------------------
 * React Hooks #310 対策: すべての useState / useMemo / カスタムフックを
 * return より前、かつ条件分岐より前に呼び出す
 */

type ConfirmDialog =
  | { kind: 'confirm'; userId: string; userName: string }
  | { kind: 'reject'; userId: string; userName: string }
  | { kind: 'unlock'; userId: string; userName: string }
  | null;

export function MonthlyClosurePanel() {
  // ===== すべての Hooks を最上段に集約 =====
  const { appUser } = useAppUser();

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-12
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ConfirmDialog>(null);
  const [dialogComment, setDialogComment] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const isAdmin = appUser?.role === 'admin';
  const yearMonth = toYearMonth(viewYear, viewMonth);

  const { rows, loading, error, reload } = useAllMonthlyClosures(
    yearMonth,
    isAdmin
  );
  const { confirm, reject, unlock, processing, lastError, clearError } =
    useClosureActions();

  const counts = useMemo(() => {
    let notSubmitted = 0;
    let submitted = 0;
    let confirmed = 0;
    for (const r of rows) {
      if (!r.closure) notSubmitted++;
      else if (r.closure.status === 'submitted') submitted++;
      else if (r.closure.status === 'confirmed') confirmed++;
    }
    return { notSubmitted, submitted, confirmed, total: rows.length };
  }, [rows]);

  // ===== ここから条件分岐/早期return OK =====

  if (!isAdmin) {
    return (
      <section className="card closure-panel">
        <p className="closure-panel__denied">管理者のみ利用できます</p>
      </section>
    );
  }

  const prevM = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const nextM = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleConfirm = async (userId: string) => {
    if (!appUser) return;
    setBusyUserId(userId);
    const r = await confirm({
      userId,
      yearMonth,
      actorId: appUser.id,
      note: dialogComment.trim() || undefined,
    });
    setBusyUserId(null);
    if (r.ok) {
      setDialog(null);
      setDialogComment('');
      reload();
    }
  };

  const handleReject = async (userId: string) => {
    if (!appUser) return;
    setBusyUserId(userId);
    const r = await reject({
      userId,
      yearMonth,
      actorId: appUser.id,
      comment: dialogComment.trim() || undefined,
    });
    setBusyUserId(null);
    if (r.ok) {
      setDialog(null);
      setDialogComment('');
      reload();
    }
  };

  const handleUnlock = async (userId: string) => {
    if (!appUser) return;
    setBusyUserId(userId);
    const r = await unlock({
      userId,
      yearMonth,
      actorId: appUser.id,
      comment: dialogComment.trim() || undefined,
    });
    setBusyUserId(null);
    if (r.ok) {
      setDialog(null);
      setDialogComment('');
      reload();
    }
  };

  const handleBulkConfirm = async () => {
    if (!appUser) return;
    if (
      !window.confirm(
        `${yearMonth} の提出済 ${counts.submitted}名を一括で確定します。よろしいですか?`
      )
    )
      return;
    setBulkBusy(true);
    let okCount = 0;
    let ngCount = 0;
    for (const r of rows) {
      if (r.closure?.status === 'submitted') {
        const result = await confirm({
          userId: r.user_id,
          yearMonth,
          actorId: appUser.id,
        });
        if (result.ok) okCount++;
        else ngCount++;
      }
    }
    setBulkBusy(false);
    reload();
    alert(`一括確定完了: 成功 ${okCount}件 / 失敗 ${ngCount}件`);
  };

  return (
    <section className="card closure-panel" role="tabpanel">
      <header className="closure-panel__head">
        <div>
          <h2 className="closure-panel__title">月次勤怠締め</h2>
          <p className="closure-panel__subtitle">
            社員ごとに勤怠を確定・差戻し・ロック解除します
          </p>
        </div>
      </header>

      {(error || lastError) && (
        <div className="closure-panel__error">
          <span>⚠</span>
          <p>{error || lastError}</p>
          {lastError && (
            <button
              type="button"
              className="closure-panel__error-close"
              onClick={clearError}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* 月選択 */}
      <div className="closure-panel__monthbar">
        <button type="button" className="closure-panel__month-btn" onClick={prevM}>
          ‹
        </button>
        <span className="closure-panel__month-label">
          {formatYearMonthJa(yearMonth)}
        </span>
        <button type="button" className="closure-panel__month-btn" onClick={nextM}>
          ›
        </button>
      </div>

      {/* 集計バー */}
      <div className="closure-panel__counts">
        <span className="closure-panel__count-item">全 {counts.total}名</span>
        <span className="closure-panel__count-item">
          未提出 <strong>{counts.notSubmitted}</strong>
        </span>
        <span className="closure-panel__count-item closure-panel__count-item--warn">
          提出済 <strong>{counts.submitted}</strong>
        </span>
        <span className="closure-panel__count-item closure-panel__count-item--ok">
          確定済 <strong>{counts.confirmed}</strong>
        </span>
      </div>

      {/* 一括確定ボタン */}
      {counts.submitted > 0 && (
        <div className="closure-panel__bulk">
          <button
            type="button"
            className="closure-panel__bulk-btn"
            onClick={handleBulkConfirm}
            disabled={bulkBusy}
          >
            {bulkBusy
              ? '一括確定中…'
              : `提出済 ${counts.submitted}名を一括確定`}
          </button>
        </div>
      )}

      {/* 一覧表 */}
      {loading ? (
        <p className="closure-panel__loading">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="closure-panel__empty">対象社員がいません</p>
      ) : (
        <ul className="closure-list">
          {rows.map((row) => {
            const c = row.closure;
            const isBusy = busyUserId === row.user_id || processing;
            return (
              <li key={row.user_id} className="closure-list__row">
                <div className="closure-list__user">
                  {row.employee_code && (
                    <span className="closure-list__code">[{row.employee_code}]</span>
                  )}
                  <span className="closure-list__name">{row.user_name}</span>
                </div>

                <div className="closure-list__status">
                  <span className={`badge ${statusBadgeClass(c?.status)}`}>
                    {statusLabel(c?.status)}
                  </span>
                  {c?.submitted_at && (
                    <span className="closure-list__time">
                      提出 {fmtShortTime(c.submitted_at)}
                    </span>
                  )}
                  {c?.confirmed_at && (
                    <span className="closure-list__time">
                      確定 {fmtShortTime(c.confirmed_at)}
                    </span>
                  )}
                </div>

                <div className="closure-list__actions">
                  {c?.status === 'submitted' && (
                    <>
                      <button
                        type="button"
                        className="closure-list__btn closure-list__btn--ok"
                        disabled={isBusy}
                        onClick={() =>
                          setDialog({
                            kind: 'confirm',
                            userId: row.user_id,
                            userName: row.user_name,
                          })
                        }
                      >
                        ✓ 確定
                      </button>
                      <button
                        type="button"
                        className="closure-list__btn closure-list__btn--reject"
                        disabled={isBusy}
                        onClick={() =>
                          setDialog({
                            kind: 'reject',
                            userId: row.user_id,
                            userName: row.user_name,
                          })
                        }
                      >
                        ↩ 差戻し
                      </button>
                    </>
                  )}
                  {c?.status === 'confirmed' && (
                    <button
                      type="button"
                      className="closure-list__btn closure-list__btn--unlock"
                      disabled={isBusy}
                      onClick={() =>
                        setDialog({
                          kind: 'unlock',
                          userId: row.user_id,
                          userName: row.user_name,
                        })
                      }
                    >
                      🔓 ロック解除
                    </button>
                  )}
                  {!c && (
                    <span className="closure-list__hint">本人の提出待ち</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 確認ダイアログ */}
      {dialog && (
        <div
          className="closure-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !processing) setDialog(null);
          }}
        >
          <div className="closure-modal" role="dialog" aria-modal="true">
            {dialog.kind === 'confirm' && (
              <>
                <h3 className="closure-modal__title">
                  {dialog.userName} さんの {formatYearMonthJa(yearMonth)} を確定
                </h3>
                <p className="closure-modal__lead">
                  確定するとロックされ、本人も含めて勤怠の修正ができなくなります。
                </p>
              </>
            )}
            {dialog.kind === 'reject' && (
              <>
                <h3 className="closure-modal__title">
                  {dialog.userName} さんの提出を差戻し
                </h3>
                <p className="closure-modal__lead">
                  本人に再提出してもらいます。差戻し理由を伝えると親切です。
                </p>
              </>
            )}
            {dialog.kind === 'unlock' && (
              <>
                <h3 className="closure-modal__title">
                  {dialog.userName} さんの確定をロック解除
                </h3>
                <p className="closure-modal__lead">
                  ロック解除すると、勤怠の修正・申請が再び可能になります。
                </p>
              </>
            )}

            <label className="closure-modal__label">
              {dialog.kind === 'confirm' ? 'メモ (任意)' : 'コメント (任意)'}
              <textarea
                className="closure-modal__textarea"
                rows={3}
                value={dialogComment}
                onChange={(e) => setDialogComment(e.target.value)}
                placeholder={
                  dialog.kind === 'reject'
                    ? '例: 休憩の入力に誤りがあるため確認して再提出してください'
                    : ''
                }
              />
            </label>

            <div className="closure-modal__actions">
              <button
                type="button"
                className="closure-modal__btn closure-modal__btn--cancel"
                onClick={() => {
                  setDialog(null);
                  setDialogComment('');
                }}
                disabled={processing}
              >
                キャンセル
              </button>
              {dialog.kind === 'confirm' && (
                <button
                  type="button"
                  className="closure-modal__btn closure-modal__btn--submit"
                  disabled={processing}
                  onClick={() => handleConfirm(dialog.userId)}
                >
                  {processing ? '確定中…' : '確定する'}
                </button>
              )}
              {dialog.kind === 'reject' && (
                <button
                  type="button"
                  className="closure-modal__btn closure-modal__btn--reject"
                  disabled={processing}
                  onClick={() => handleReject(dialog.userId)}
                >
                  {processing ? '差戻し中…' : '差戻す'}
                </button>
              )}
              {dialog.kind === 'unlock' && (
                <button
                  type="button"
                  className="closure-modal__btn closure-modal__btn--unlock"
                  disabled={processing}
                  onClick={() => handleUnlock(dialog.userId)}
                >
                  {processing ? '解除中…' : 'ロック解除'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
