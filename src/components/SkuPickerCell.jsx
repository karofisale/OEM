import React from 'react';
import Combobox from './Combobox';
import { materialMatchesQuery } from '../services/aiAgent';

// Searchable Mã VT cell — free-type by code, name, or alias (word order doesn't
// matter, see materialMatchesQuery). Shared by AIOrderAgent and OrdersReview.
// The dropdown mechanics (keyboard nav, portal so the list isn't clipped by the
// table's overflow) now live in Combobox.
export default function SkuPickerCell({ sku, name, materials, onSelect }) {
  return (
    <Combobox
      initialText={sku ? `${sku} - ${name}` : ''}
      options={materials}
      filterFn={materialMatchesQuery}
      toText={(m) => `${m.sku} - ${m.name}`}
      getKey={(m) => m.sku}
      onSelect={onSelect}
      placeholder="Tìm theo mã, tên hoặc alias..."
      ariaLabel="Tìm mã vật tư"
      inputClassName="input-field code-font"
      inputStyle={{ padding: '4px 8px', fontSize: '0.775rem', fontWeight: 700, color: '#0369a1' }}
      renderOption={(m) => (
        <>
          <div className="code-font" style={{ fontWeight: 700, color: '#00a0e9', fontSize: '0.775rem' }}>{m.sku}</div>
          <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
            {m.name}{m.alias ? ` (${m.alias})` : ''}
          </div>
        </>
      )}
    />
  );
}
