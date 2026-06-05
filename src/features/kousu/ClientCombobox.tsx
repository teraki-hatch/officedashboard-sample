// Phase C-5 (cont.): CSSクラス名を proj-cb__* に統一 + color 表示復活
import { useEffect, useMemo, useRef, useState } from 'react';
import './ProjectCombobox.css';

export type ClientOption = {
  id: string;
  name: string;
  is_internal?: boolean;
  color?: string | null;
};

type Props = {
  clients: ClientOption[];
  value: string;
  onChange: (clientId: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function ClientCombobox({
  clients,
  value,
  onChange,
  placeholder = 'クライアントを選択...',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => clients.find((c) => c.id === value) || null,
    [clients, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query]);

  // 外部クリックで閉じる
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleSelect(c: ClientOption) {
    onChange(c.id);
    setOpen(false);
    setQuery('');
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
              {selected.color && (
                <span
                  className="proj-cb__color"
                  style={{ background: selected.color }}
                  aria-hidden
                />
              )}
              <span className="proj-cb__selected-name">
                {selected.name}
                {selected.is_internal && (
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
            placeholder="検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul className="proj-cb__list">
            {filtered.length === 0 ? (
              <li className="proj-cb__empty">該当なし</li>
            ) : (
              filtered.map((c) => (
                <li
                  key={c.id}
                  className={
                    'proj-cb__item' +
                    (c.id === value ? ' proj-cb__item--active' : '')
                  }
                  onClick={() => handleSelect(c)}
                >
                  {c.color && (
                    <span
                      className="proj-cb__color"
                      style={{ background: c.color }}
                      aria-hidden
                    />
                  )}
                  <span className="proj-cb__item-name">{c.name}</span>
                  {c.is_internal && (
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
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
