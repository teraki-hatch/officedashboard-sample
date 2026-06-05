import { useEffect, useMemo, useRef, useState } from 'react';
import type { Deal } from './types';
import './ProjectCombobox.css';

type Props = {
  deals: Deal[];
  value: string; // selected deal_id
  onChange: (dealId: string, clientId: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * 案件選択コンボボックス
 * - クライアント名 - 案件名 で表示
 * - 案件選択時、deal_id と client_id を両方コールバックに渡す
 */
export function DealCombobox({
  deals,
  value,
  onChange,
  placeholder = '案件を選択...',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => deals.find((d) => d.id === value) || null,
    [deals, value]
  );

  // フィルタ: クライアント名と案件名の両方で検索
  // 並び順: 外部クライアント (is_internal=false) を先、社内を後にまとめる
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q
      ? deals
      : deals.filter((d) => {
          const clientName = (d.client?.name || '').toLowerCase();
          const dealName = (d.deal_name || '').toLowerCase();
          return clientName.includes(q) || dealName.includes(q);
        });
    // 外部 → 社内 の順にソート
    return [...matched].sort((a, b) => {
      const aInt = a.client?.is_internal ? 1 : 0;
      const bInt = b.client?.is_internal ? 1 : 0;
      if (aInt !== bInt) return aInt - bInt;
      // 同じグループ内は クライアント名 → 案件名 で安定ソート
      const ac = (a.client?.name || '').localeCompare(b.client?.name || '', 'ja');
      if (ac !== 0) return ac;
      return (a.deal_name || '').localeCompare(b.deal_name || '', 'ja');
    });
  }, [deals, query]);

  // 外部クリックで閉じる
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleSelect(d: Deal) {
    onChange(d.id, d.client_id || '');
    setOpen(false);
    setQuery('');
  }

  function formatLabel(d: Deal): { client: string; deal: string; isInternal: boolean; color: string | null } {
    const clientName = d.client?.name || '(クライアント未設定)';
    const dealName = d.deal_name || '(案件名未設定)';
    return {
      client: clientName,
      deal: dealName,
      isInternal: d.client?.is_internal || false,
      color: d.client?.color || null,
    };
  }

  return (
    <div className="proj-cb" ref={wrapRef}>
      {!open && (
        <button
          type="button"
          className="proj-cb__trigger"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          {selected ? (
            <>
              {selected.client?.color && (
                <span
                  className="proj-cb__color"
                  style={{ background: selected.client.color }}
                  aria-hidden
                />
              )}
              <span className="proj-cb__selected-name">
                <strong>{formatLabel(selected).client}</strong>
                <span style={{ color: '#888', margin: '0 6px' }}>—</span>
                {formatLabel(selected).deal}
                {selected.client?.is_internal && (
                  <span style={{ marginLeft: 6, color: '#888', fontSize: 12 }}>
                    (社内)
                  </span>
                )}
              </span>
            </>
          ) : (
            <span className="proj-cb__placeholder">{placeholder}</span>
          )}
          <span className="proj-cb__arrow">▾</span>
        </button>
      )}

      {open && !disabled && (
        <>
          <input
            type="text"
            className="proj-cb__input"
            placeholder="クライアント名・案件名で検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul className="proj-cb__list">
            {filtered.length === 0 ? (
              <li className="proj-cb__empty">該当なし</li>
            ) : (
              filtered.map((d) => {
                const lbl = formatLabel(d);
                return (
                  <li
                    key={d.id}
                    className={
                      'proj-cb__item' +
                      (d.id === value ? ' proj-cb__item--active' : '')
                    }
                    onClick={() => handleSelect(d)}
                  >
                    {lbl.color && (
                      <span
                        className="proj-cb__color"
                        style={{ background: lbl.color }}
                        aria-hidden
                      />
                    )}
                    <span className="proj-cb__item-name">
                      <strong>{lbl.client}</strong>
                      <span style={{ color: '#888', margin: '0 4px' }}>—</span>
                      {lbl.deal}
                    </span>
                    {lbl.isInternal && (
                      <span
                        style={{
                          marginLeft: 6,
                          color: '#888',
                          fontSize: 11,
                          background: '#f0f0f0',
                          padding: '1px 6px',
                          borderRadius: 4,
                        }}
                      >
                        社内
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </>
      )}
    </div>
  );
}
