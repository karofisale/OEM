import React, { useState, useMemo } from 'react';
import { clientMatchesQuery } from '../services/aiAgent';

// Searchable Mã KH cell — free-type by code, name, or alias (word order doesn't
// matter, see clientMatchesQuery), so a wrong/unmatched client can be corrected
// without hunting through the full client list. Shared by AIOrderAgent and OrdersReview.
export default function ClientPickerCell({ code, name, clients, onSelect }) {
  // Shows the raw Mã KH (code) only, never codeSearch — codeSearch is just an
  // internal search aid, not what should end up saved/displayed as "the code".
  const [query, setQuery] = useState(code || name || '');
  const [showDropdown, setShowDropdown] = useState(false);

  const matches = useMemo(() => {
    return (clients || []).filter(c => clientMatchesQuery(c, query)).slice(0, 30);
  }, [clients, query]);

  const handleSelect = (c) => {
    setQuery(String(c.code || ''));
    setShowDropdown(false);
    onSelect(c);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input-field"
        style={{ padding: '4px 8px', fontSize: '0.775rem', fontWeight: 700 }}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
        onFocus={(e) => { e.target.select(); setShowDropdown(true); }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="Tìm khách theo mã, tên hoặc alias..."
      />
      {showDropdown && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: '280px', zIndex: 30,
          background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)', maxHeight: '240px', overflowY: 'auto'
        }}>
          {matches.map(c => (
            <div
              key={c.code}
              onMouseDown={() => handleSelect(c)}
              style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
            >
              <div className="code-font" style={{ fontWeight: 700, color: '#00a0e9', fontSize: '0.775rem' }}>{c.codeSearch || c.code}</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                {c.name}{c.alias ? ` (${c.alias})` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
