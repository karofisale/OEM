import React from 'react';
import Combobox from './Combobox';
import { clientMatchesQuery } from '../services/aiAgent';

// Searchable Mã KH cell — free-type by code, name, or alias (word order doesn't
// matter, see clientMatchesQuery). Shared by AIOrderAgent and OrdersReview.
//
// The input shows the raw Mã KH (code) only, never codeSearch — codeSearch is a
// search aid, not what should end up saved or displayed as "the code".
export default function ClientPickerCell({ code, name, clients, onSelect }) {
  return (
    <Combobox
      initialText={code || name || ''}
      options={clients || []}
      filterFn={clientMatchesQuery}
      toText={(c) => String(c.code || '')}
      getKey={(c) => c.code || c.name}
      onSelect={onSelect}
      placeholder="Tìm khách theo mã, tên hoặc alias..."
      ariaLabel="Tìm khách hàng"
      inputStyle={{ padding: '4px 8px', fontSize: '0.775rem', fontWeight: 700 }}
      renderOption={(c) => (
        <>
          <div className="code-font" style={{ fontWeight: 700, color: 'var(--karofi-cyan)', fontSize: '0.775rem' }}>
            {c.codeSearch || c.code}
          </div>
          <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
            {c.name}{c.alias ? ` (${c.alias})` : ''}
          </div>
        </>
      )}
    />
  );
}
