/** Client (Khach hang OEM) CRUD — tab tracked by OEMAPP_GIDS.CLIENTS. */

// ---------- Data readers (all require a valid session) ----------

function oemAppLoadClients_() {
  var rows = oemAppGetRows_(OEMAPP_GIDS.CLIENTS);
  return rows.slice(1).map(function (row, idx) {
    return {
      code: String(row[1] || ('CLI-' + (1000 + idx))),
      codeSearch: oemAppGetClientTextCode_(row[3] || row[2], row[1], row[2]),
      name: String(row[3] || row[2] || 'Khách hàng OEM'),
      alias: String(row[4] || ''),
      type: String(row[5] || 'Doanh nghiệp'),
      sale: String(row[6] || 'KH Đình Hoan'),
      address: String(row[7] || ''),
      status: String(row[8] || 'Active').trim()
    };
  }).filter(function (c) { return c.name && c.name !== 'Client name'; });
}


// ---------- Writers ----------
// Both are plain appendRow — never overwrite/rewrite existing rows — to keep
// this safe against the live production data in this Sheet.

function oemAppAddClient_(token, client) {
  oemAppRequireSession_(token);
  oemAppGetSheetByGid_(OEMAPP_GIDS.CLIENTS).appendRow([
    '', // Reconciliation Acct — left blank, not used by the app
    client.code || '',
    client.codeSearch || '',
    client.name || '',
    client.alias || '',
    client.type || 'Doanh nghiệp',
    client.sale || '',
    client.address || '',
    client.status || 'Active'
  ]);
  return { ok: true };
}


function oemAppEditClient_(token, client) {
  oemAppRequireSession_(token);
  var sheet = oemAppGetSheetByGid_(OEMAPP_GIDS.CLIENTS);
  var rows = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(client.code)) { rowIndex = i; break; }
  }
  if (rowIndex === -1) throw new Error('Không tìm thấy khách hàng với mã ' + client.code + ' để sửa.');

  var existing = rows[rowIndex];
  sheet.getRange(rowIndex + 1, 2, 1, 8).setValues([[
    existing[1],
    client.codeSearch || existing[2],
    client.name || existing[3],
    client.alias != null ? client.alias : existing[4],
    client.type || existing[5],
    client.sale || existing[6],
    client.address != null ? client.address : existing[7],
    client.status || existing[8]
  ]]);
  return { ok: true };
}
