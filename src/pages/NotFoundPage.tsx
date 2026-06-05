import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div
        style={{
          fontSize: 48,
          fontWeight: 600,
          color: 'var(--primary-dark)',
          lineHeight: 1,
          letterSpacing: '0.04em',
        }}
      >
        404
      </div>
      <p style={{ color: 'var(--ink-mute)', marginTop: 18, fontSize: 14 }}>
        お探しのページは見つかりませんでした。
      </p>
      <Link
        to="/"
        style={{
          display: 'inline-block',
          marginTop: 18,
          padding: '9px 18px',
          background: 'var(--primary)',
          color: '#fff',
          borderRadius: 7,
          textDecoration: 'none',
          fontSize: 13.5,
          fontWeight: 500,
        }}
      >
        ホームへ戻る
      </Link>
    </div>
  );
}
