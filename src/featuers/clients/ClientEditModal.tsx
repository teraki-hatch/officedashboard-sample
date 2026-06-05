import { useEffect, useState } from 'react';
import { saveClient } from './useClient';
import type { Client, ClientInput } from './types';
import { EMPTY_CLIENT_INPUT } from './types';
import './ClientEditModal.css';

type Props = {
  open: boolean;
  /** null = 新規作成, Client = 編集 */
  client: Client | null;
  onClose: () => void;
  onSaved: () => void;
};

const INDUSTRY_OPTIONS = [
  '製造業',
  '建設業',
  '不動産業',
  '小売業',
  '卸売業',
  '飲食業',
  'サービス業',
  'IT・情報通信',
  '運輸・物流',
  '医療・福祉',
  '教育',
  '金融・保険',
  'その他',
];

export function ClientEditModal({ open, client, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ClientInput>(EMPTY_CLIENT_INPUT);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (client) {
      setForm({
        name: client.name,
        short_name: client.short_name,
        industry: client.industry,
        address: client.address,
        phone: client.phone,
        email: client.email,
        website: client.website,
        contact_person: client.contact_person,
        contact_phone: client.contact_phone,
        contact_email: client.contact_email,
        notes: client.notes,
        is_active: client.is_active,
      });
    } else {
      setForm(EMPTY_CLIENT_INPUT);
    }
    setError(null);
  }, [open, client]);

  function update<K extends keyof ClientInput>(key: K, value: ClientInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const result = await saveClient(form, client?.id);
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  if (!open) return null;

  // 既存データが選択肢にない場合も表示できるようにする
  const currentIndustry = form.industry || '';
  const showCustomIndustry =
    currentIndustry !== '' && !INDUSTRY_OPTIONS.includes(currentIndustry);

  return (
    <div className="client-modal__overlay">
      <div className="client-modal" onClick={(e) => e.stopPropagation()}>
        <header className="client-modal__header">
          <h2 className="client-modal__title">
            {client ? 'クライアント編集' : '新規クライアント追加'}
          </h2>
          <button
            type="button"
            className="client-modal__close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>

        <div className="client-modal__body">
          {error && <div className="client-modal__error">{error}</div>}

          <div className="client-modal__field">
            <label className="client-modal__label">
              会社名 <span className="client-modal__required">*</span>
            </label>
            <input
              type="text"
              className="client-modal__input"
              value={form.name || ''}
              onChange={(e) => update('name', e.target.value)}
              placeholder="株式会社○○"
            />
          </div>

          <div className="client-modal__row">
            <div className="client-modal__field">
              <label className="client-modal__label">略称</label>
              <input
                type="text"
                className="client-modal__input"
                value={form.short_name || ''}
                onChange={(e) => update('short_name', e.target.value)}
                placeholder="○○"
              />
            </div>
            <div className="client-modal__field">
              <label className="client-modal__label">業種</label>
              <select
                className="client-modal__input"
                value={showCustomIndustry ? '__custom__' : currentIndustry}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__custom__') {
                    // カスタムを選んだら空文字にしておき、下のテキスト入力で入力させる
                    update('industry', '');
                  } else {
                    update('industry', v || null);
                  }
                }}
              >
                <option value="">未設定</option>
                {INDUSTRY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                {showCustomIndustry && (
                  <option value="__custom__">{currentIndustry}(カスタム)</option>
                )}
              </select>
            </div>
          </div>

          <h3 className="client-modal__section-title">会社情報</h3>

          <div className="client-modal__field">
            <label className="client-modal__label">住所</label>
            <input
              type="text"
              className="client-modal__input"
              value={form.address || ''}
              onChange={(e) => update('address', e.target.value)}
              placeholder="〒000-0000 ○○県○○市..."
            />
          </div>

          <div className="client-modal__row">
            <div className="client-modal__field">
              <label className="client-modal__label">電話番号</label>
              <input
                type="tel"
                className="client-modal__input"
                value={form.phone || ''}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="03-0000-0000"
              />
            </div>
            <div className="client-modal__field">
              <label className="client-modal__label">メール</label>
              <input
                type="email"
                className="client-modal__input"
                value={form.email || ''}
                onChange={(e) => update('email', e.target.value)}
                placeholder="info@example.com"
              />
            </div>
          </div>

          <div className="client-modal__field">
            <label className="client-modal__label">Webサイト</label>
            <input
              type="url"
              className="client-modal__input"
              value={form.website || ''}
              onChange={(e) => update('website', e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <h3 className="client-modal__section-title">担当窓口</h3>

          <div className="client-modal__field">
            <label className="client-modal__label">担当者名</label>
            <input
              type="text"
              className="client-modal__input"
              value={form.contact_person || ''}
              onChange={(e) => update('contact_person', e.target.value)}
              placeholder="山田 太郎"
            />
          </div>

          <div className="client-modal__row">
            <div className="client-modal__field">
              <label className="client-modal__label">担当者電話</label>
              <input
                type="tel"
                className="client-modal__input"
                value={form.contact_phone || ''}
                onChange={(e) => update('contact_phone', e.target.value)}
                placeholder="090-0000-0000"
              />
            </div>
            <div className="client-modal__field">
              <label className="client-modal__label">担当者メール</label>
              <input
                type="email"
                className="client-modal__input"
                value={form.contact_email || ''}
                onChange={(e) => update('contact_email', e.target.value)}
                placeholder="taro@example.com"
              />
            </div>
          </div>

          <h3 className="client-modal__section-title">その他</h3>

          <div className="client-modal__field">
            <label className="client-modal__label">メモ</label>
            <textarea
              className="client-modal__textarea"
              value={form.notes || ''}
              onChange={(e) => update('notes', e.target.value)}
              rows={4}
              placeholder="案件メモ、社内共有事項など"
            />
          </div>

          <div className="client-modal__field">
            <label className="client-modal__checkbox-label">
              <input
                type="checkbox"
                checked={form.is_active ?? true}
                onChange={(e) => update('is_active', e.target.checked)}
              />
              <span>稼働中(取引中)</span>
            </label>
          </div>
        </div>

        <footer className="client-modal__footer">
          <button
            type="button"
            className="client-modal__btn client-modal__btn--secondary"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="client-modal__btn client-modal__btn--primary"
            onClick={handleSubmit}
            disabled={saving || !form.name?.trim()}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ClientEditModal;
