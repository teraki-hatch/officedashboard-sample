import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseConfigDiagnosis } from '../lib/supabase';
import './LoginPage.css';

export function LoginPage() {
  const navigate = useNavigate();
  const { signInWithEmail, signInAsDemo, isDemoMode, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [demoName, setDemoName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    navigate('/', { replace: true });
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signInWithEmail(email, password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    navigate('/', { replace: true });
  };

  const onDemo = (e: FormEvent) => {
    e.preventDefault();
    signInAsDemo(demoName.trim() || 'ゲスト');
    navigate('/', { replace: true });
  };

  return (
    <div className="login">
      <div className="login__center">
        <div className="login__brand">
          <img src="/logomark.png" alt="As Partner" className="login__logo" />
          <div className="login__brand-sub">OfficeHub</div>
        </div>

        <div className="login__card">
          <h2 className="login__heading">ログイン</h2>
          {isDemoMode ? (
            <>
              <p className="login__demo-msg">
                Supabase の接続情報が未設定です。<br />
                <code>.env</code> を設定するまでは、デモログインで画面を確認できます。
              </p>
              <form onSubmit={onDemo}>
                <label className="login__label">
                  表示名
                  <input
                    className="login__input"
                    type="text"
                    placeholder="例: 山田 太郎"
                    value={demoName}
                    onChange={(e) => setDemoName(e.target.value)}
                    autoFocus
                  />
                </label>
                <button className="login__submit" type="submit">
                  デモログイン
                </button>
              </form>
            </>
          ) : (
            <form onSubmit={onSubmit}>
              <label className="login__label">
                メールアドレス
                <input
                  className="login__input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label className="login__label">
                パスワード
                <div className="login__password-wrap">
                  <input
                    className="login__input login__input--password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="login__password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                    title={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </label>
              {error && (
                <>
                  <div className="login__error">{error}</div>
                  {import.meta.env.DEV && <ConnectionDiagnosis />}
                </>
              )}
              <button className="login__submit" type="submit" disabled={submitting}>
                {submitting ? '認証中…' : 'ログイン'}
              </button>
            </form>
          )}
          <div className="login__footer">
            <span className="badge badge--mute">v0.1.0</span>
            <span className="login__hint">問い合わせ: 管理者まで</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** パスワード表示中アイコン (開いた目) */
function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** パスワード非表示中アイコン (斜線入りの目) */
function EyeOffIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a19.77 19.77 0 0 1 4.22-5.06" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 7 10 7a19.86 19.86 0 0 1-3.17 4.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

/**
 * Supabase 接続診断パネル (キー本体は表示しない)
 */
function ConnectionDiagnosis() {
  const d = getSupabaseConfigDiagnosis();
  const Row = ({ label, ok, note }: { label: string; ok: boolean; note?: string }) => (
    <div className="diag__row">
      <span className={`diag__mark ${ok ? 'diag__mark--ok' : 'diag__mark--ng'}`}>
        {ok ? '✓' : '✗'}
      </span>
      <span className="diag__label">{label}</span>
      {note && <span className="diag__note">{note}</span>}
    </div>
  );

  return (
    <details className="diag">
      <summary className="diag__summary">接続診断 (Supabase 接続が失敗した場合の確認用)</summary>
      <div className="diag__body">
        <Row label={`環境変数名: ${d.envVarNames.url}`} ok={d.urlPresent} note="設定有無" />
        <Row label="URL が https:// で始まる" ok={d.urlStartsWithHttps} />
        <Row label="URL に supabase.co を含む" ok={d.urlContainsSupabaseCo} />
        <Row label={`URL の長さ`} ok={d.urlLength > 0} note={`${d.urlLength} 文字`} />
        <Row
          label={`環境変数名: ${d.envVarNames.anonKey}`}
          ok={d.anonKeyPresent}
          note="設定有無"
        />
        <Row label={`ANON KEY の長さ`} ok={d.anonKeyLength > 0} note={`${d.anonKeyLength} 文字`} />
        <p className="diag__hint">
          ※ 値そのものは表示していません。詳細は DevTools の Console に以下のログが出ます。
          <br />
          ・<code>[OfficeHub:supabase] config check</code> (環境変数の状態)
          <br />
          ・<code>[OfficeHub:auth] signIn attempt</code> (ログイン試行時の想定URL)
          <br />
          ・<code>[OfficeHub:auth] reachability probe</code> (Supabaseへの到達可否)
          <br />
          ・<code>[OfficeHub:auth] signIn result</code> (失敗時はステータスコードと推定原因)
        </p>
        <p className="diag__hint">
          <strong>すべて ✓ なのに失敗する場合の確認順:</strong>
        </p>
        <ol className="diag__steps">
          <li>
            DevTools → Network タブ を開いてからログイン → リクエスト一覧で
            <code>token?grant_type=password</code> の行を探す。
            <br />
            ・行が無い → SDK 内で fetch が落ちている (Console 参照)
            <br />
            ・Status が (failed) → CORS / DNS / 拡張機能
            <br />
            ・Status 200 → 実は成功している (画面側の遷移の問題)
            <br />
            ・Status 400/401 → エンドポイント到達済み (認証情報の問題)
          </li>
          <li>
            ブラウザの拡張機能 (広告ブロッカー・プライバシー保護) を一時無効化して再試行。
          </li>
          <li>
            シークレットウィンドウで開いて再試行 (キャッシュ・拡張の影響を除外)。
          </li>
          <li>
            Supabase Dashboard → Authentication → URL Configuration の Site URL に
            OfficeHub の Vercel URL が登録されているか確認。
          </li>
        </ol>
      </div>
    </details>
  );
}
