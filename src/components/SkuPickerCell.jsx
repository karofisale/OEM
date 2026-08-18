import React, { useState, useMemo } from 'react';
import { materialMatchesQuery } from '../services/aiAgent';

// Searchable Mã VT cell — free-type by code, name, or alias (word order doesn't
// matter, see materialMatchesQuery), so a wrong/blank SKU can be corrected without
// hunting through the full SKU catalogue. Shared by AIOrderAgent and OrdersReview.
export default function SkuPickerCell({ sku, name, materials, onSelect }) {
  const [query, setQuery] = useState(sku ? `${sku} - ${name}` : '');
  const [showDropdown, setShowDropdown] = useState(false);

  const matches = useMemo(() => {
    return materials.filter(m => materialMatchesQuery(m, query)).slice(0, 30);
  }, [materials, query]);

  const handleSelect = (m) => {
    setQuery(`${m.sku} - ${m.name}`);
    setShowDropdown(false);
    onSelect(m);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input-field code-font"
        style={{ padding: '4px 8px', fontSize: '0.775rem', fontWeight: 700, color: '#0369a1' }}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
        onFocus={(e) => { e.target.select(); setShowDropdown(true); }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="Tìm theo mã, tên hoặc alias..."
      />
      {showDropdown && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: '280px', zIndex: 30,
          background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)', maxHeight: '240px', overflowY: 'auto'
        }}>
          {matches.map(m => (
            <div
              key={m.sku}
              onMouseDown={() => handleSelect(m)}
              style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
            >
              <div className="code-font" style={{ fontWeight: 700, color: '#00a0e9', fontSize: '0.775rem' }}>{m.sku}</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                {m.name}{m.alias ? ` (${m.alias})` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
