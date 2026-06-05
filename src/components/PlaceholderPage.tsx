import { ReactNode } from 'react';
import './PlaceholderPage.css';

type Props = {
  title: string;
  subtitle?: string;
  /** 大きく表示する状態ラベル (例: '構築中') */
  statusLabel?: string;
  /** 既存システムへのリンク */
  externalUrl?: string;
  externalLabel?: string;
  children?: ReactNode;
};

export function PlaceholderPage({
  title,
  subtitle,
  statusLabel,
  externalUrl,
  externalLabel,
  children,
}: Props) {
  return (
    <div className="placeholder">
      <header className="placeholder__head">
        <div>
          <h1 className="placeholder__title">{title}</h1>
          {subtitle && <p className="placeholder__subtitle">{subtitle}</p>}
        </div>
        {statusLabel && <span className="placeholder__status">{statusLabel}</span>}
      </header>

      <div className="placeholder__body card">
        {externalUrl ? (
          <>
            <p className="placeholder__msg">
              {externalLabel ?? 'こちらの機能は既存システムで提供されています。'}
            </p>
            <a
              className="placeholder__cta"
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              既存システムを開く ↗
            </a>
            <p className="placeholder__note">
              ※ OfficeHub からは URL リンクのみで連携しています。既存システムのコードやデータには手を加えません。
            </p>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
