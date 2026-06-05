import { useState } from 'react';
import { useAppUser } from '../../lib/useAppUser';
import { useAttendancePdfData } from './useAttendancePdfData';
import { printToPdf } from './pdfGenerator';
import './AttendancePdfView.css';

/**
 * 月次勤怠台帳 PDF出力ビュー
 * --------------------------------------------------------------
 * 旧 timetrack-app-clean の AttendancePdfView.jsx を OfficeHub 仕様に移植。
 * - 管理者のみアクセス可
 * - 対象月・対象社員を選択 → 「印刷・PDF出力」ボタンで新ウィンドウを開く
 * - 印刷ダイアログから「PDFとして保存」で日本語対応PDFを保存
 * --------------------------------------------------------------
 */

export function AttendancePdfView() {
  const { appUser } = useAppUser();
  const isAdmin = appUser?.role === 'admin';

  const now = new Date();
  const [viewYear, setViewYear] = useState<number>(now.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(now.getMonth() + 1);
  const [targetUser, setTargetUser] = useState<string>('all');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { data, loading, error } = useAttendancePdfData(viewYear, viewMonth, isAdmin);
  const { users, attRecs, attBreaks, leaveApproved, holidays } = data;

  if (!isAdmin) {
    return (
      <div className="pdfview pdfview--denied">
        <p className="pdfview__denied-msg">管理者のみ利用できます</p>
      </div>
    );
  }

  const handlePrint = () => {
    const targets = targetUser === 'all' ? users : users.filter((u) => u.id === targetUser);
    if (!targets.length) {
      setErrorMsg('出力対象の社員がいません');
      return;
    }
    setGenerating(true);
    setErrorMsg('');
    try {
      printToPdf({
        year: viewYear,
        month: viewMonth,
        users: targets,
        attRecs,
        attBreaks,
        leaveApproved,
        holidays,
        onProgress: setProgress,
      });
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      setErrorMsg(`PDF出力エラー: ${msg}`);
    }
    setGenerating(false);
  };

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

  const targets =
    targetUser === 'all' ? users : users.filter((u) => u.id === targetUser);
  const lastDay = new Date(viewYear, viewMonth, 0).getDate();

  return (
    <section className="card pdfview" role="tabpanel">
      <div className="pdfview__head">
        <h2 className="pdfview__title">月次勤怠台帳 PDF出力</h2>
        <p className="pdfview__subtitle">
          対象月・社員を選択して印刷ダイアログからPDF保存してください（日本語対応）
        </p>
      </div>

      {(errorMsg || error) && (
        <div className="pdfview__error">
          <span className="pdfview__error-icon">⚠</span>
          <p className="pdfview__error-msg">{errorMsg || error}</p>
          {errorMsg && (
            <button
              type="button"
              className="pdfview__error-close"
              onClick={() => setErrorMsg('')}
            >
              ✕
            </button>
          )}
        </div>
      )}

      <div className="pdfview__body">
        {/* 対象月 */}
        <div className="pdfview__field">
          <label className="pdfview__label">対象月</label>
          <div className="pdfview__month-picker">
            <button type="button" className="pdfview__month-btn" onClick={prevM}>
              ‹
            </button>
            <span className="pdfview__month-value">
              {viewYear}年{viewMonth}月
            </span>
            <button type="button" className="pdfview__month-btn" onClick={nextM}>
              ›
            </button>
          </div>
        </div>

        {/* 対象社員 */}
        <div className="pdfview__field">
          <label className="pdfview__label">対象社員</label>
          {loading ? (
            <p className="pdfview__hint">読み込み中...</p>
          ) : (
            <select
              className="pdfview__select"
              value={targetUser}
              onChange={(e) => setTargetUser(e.target.value)}
            >
              <option value="all">全社員({users.length}名)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.employee_code ? `[${u.employee_code}] ` : ''}
                  {u.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* プレビュー */}
        <div className="pdfview__preview">
          <div className="pdfview__preview-cell">
            <p className="pdfview__preview-label">対象月</p>
            <p className="pdfview__preview-value">
              {viewYear}年{viewMonth}月
            </p>
          </div>
          <div className="pdfview__preview-cell">
            <p className="pdfview__preview-label">対象社員</p>
            <p className="pdfview__preview-value">
              {targetUser === 'all'
                ? `全${users.length}名`
                : users.find((u) => u.id === targetUser)?.name ?? '—'}
            </p>
          </div>
          <div className="pdfview__preview-cell">
            <p className="pdfview__preview-label">日数</p>
            <p className="pdfview__preview-value">{lastDay}日</p>
          </div>
          <div className="pdfview__preview-cell">
            <p className="pdfview__preview-label">ページ数</p>
            <p className="pdfview__preview-value">{targets.length}P</p>
          </div>
        </div>

        {/* 出力ボタン */}
        <div className="pdfview__actions">
          <button
            type="button"
            className="pdfview__submit"
            onClick={handlePrint}
            disabled={generating || loading || users.length === 0}
          >
            {generating ? (
              <>
                <span className="pdfview__spinner" />
                <span>{progress || '処理中...'}</span>
              </>
            ) : (
              <>
                <span>🖨️</span>
                <span>印刷・PDF出力</span>
              </>
            )}
          </button>
        </div>

        {/* 使い方ガイド */}
        <div className="pdfview__guide">
          <p className="pdfview__guide-title">📄 PDF出力の手順</p>
          <ol className="pdfview__guide-steps">
            <li>
              「印刷・PDF出力」ボタンを押すと<strong>新しいウィンドウ</strong>が開きます
            </li>
            <li>
              印刷ダイアログで<strong>「送信先(宛先)」を「PDFとして保存」</strong>に変更します
            </li>
            <li>「保存」をクリックするとPDFファイルが保存されます</li>
          </ol>
          <div className="pdfview__guide-browsers">
            <p className="pdfview__guide-browsers-title">ブラウザ別のPDF保存方法:</p>
            <p>Chrome: 宛先 → 「PDFとして保存」</p>
            <p>Edge: プリンター → 「Microsoft Print to PDF」</p>
            <p>Safari: 左下「PDF」→「PDFとして保存」</p>
            <p>Firefox: プリンター → 「PDFとして保存」</p>
          </div>
          <p className="pdfview__guide-note">✅ この方式は日本語フォントが完全に対応しています</p>
        </div>

        <div className="pdfview__warning">
          <p className="pdfview__warning-title">⚠ ポップアップがブロックされた場合</p>
          <p>
            ブラウザのアドレスバー右側の「ポップアップがブロックされました」を許可してから
            再度ボタンを押してください
          </p>
        </div>
      </div>
    </section>
  );
}
