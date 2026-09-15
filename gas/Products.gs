/** Material/product catalogue — derived from transactions + tab "Products" overrides. */

// There is no dedicated product-catalogue tab in the ORIGINAL Sheet — "Materials"
// there is a month-by-SKU pivot, not a catalogue — so materials are still derived
// from transactions primarily. Alias/Nhóm SP/Giá bán đề xuất edits (added
// 2026-08-19, "Sửa" button for admin) now persist on a small sheet this app
// owns and auto-creates — see oemAppGetMaterialCatalogSheet_ — whose values
// override the transaction-derived alias/group per SKU, and which also seeds
// brand-new SKUs that have no transaction history yet (added via "Thêm Sản
// Phẩm Mới", previously local-only/lost-on-refresh).
function oemAppDeriveMaterials_(transactions, aliasHints, catalogMap) {
  var map = {};
  transactions.forEach(function (t) {
    if (!t.sku) return;
    if (!map[t.sku]) {
      var words = t.skuName.split(' ');
      map[t.sku] = {
        sku: t.sku,
        name: t.skuName,
        alias: words[0] + ' ' + (words[1] || ''),
        unit: t.unit || 'PC',
        group: t.group || 'Linh kiện OEM',
        totalQty: 0,
        totalRevenue: 0,
        prices: [],
        latestPrice: 0,
        latestTaxRate: 0.08,
        latestDateSort: -1
      };
    }
    var mat = map[t.sku];
    mat.totalQty += t.qty;
    mat.totalRevenue += t.netRevenue;
    if (t.price > 0) {
      mat.prices.push(t.price);
      var dateSort = oemAppDateSortValue_(t.date);
      if (dateSort >= mat.latestDateSort) {
        mat.latestDateSort = dateSort;
        mat.latestPrice = t.price;
        mat.latestTaxRate = t.taxRate > 0 ? t.taxRate : 0.08;
      }
    }
  });

  catalogMap = catalogMap || {};
  var out = Object.keys(map).map(function (sku) {
    var m = map[sku];
    var avgPrice = m.prices.length
      ? Math.round(m.prices.reduce(function (a, b) { return a + b; }, 0) / m.prices.length)
      : 0;
    var override = catalogMap[sku] || {};
    return {
      sku: m.sku,
      name: override.name || m.name,
      alias: override.alias || m.alias,
      unit: m.unit,
      group: override.group || m.group,
      totalQty: m.totalQty,
      avgPrice: avgPrice,
      latestPrice: m.latestPrice,
      latestPriceVat: Math.round(m.latestPrice * (1 + m.latestTaxRate)),
      suggestedPrice: override.suggestedPrice || 0,
      exclusiveTo: override.exclusiveTo || '',
      promoPrice: override.promoPrice || 0,
      promoQty: override.promoQty || 0,
      learnedAliases: (aliasHints && aliasHints[sku]) || [],
      // SKU này đã có dòng trong tab Products chưa. Sai khác quan trọng: phần
      // lớn SKU ở đây SUY RA TỪ LỊCH SỬ GIAO DỊCH, chưa từng được ai khai báo
      // vào danh mục — tức chưa có Nhóm SP, chưa có alias chuẩn. Màn "Lịch sử
      // doanh thu" dùng cờ này để nhắc sau mỗi lượt nhập ZSD450.
      inCatalog: !!catalogMap[sku]
    };
  });

  // Brand-new SKUs added only via "Thêm Sản Phẩm Mới" (no transaction history yet)
  // don't appear in `map` above — add them here so they still show up in the list.
  Object.keys(catalogMap).forEach(function (sku) {
    if (map[sku]) return;
    var c = catalogMap[sku];
    out.push({
      sku: sku, name: c.name || sku, alias: c.alias || '', unit: 'PC', group: c.group || 'Linh kiện OEM',
      totalQty: 0, avgPrice: 0, latestPrice: 0, latestPriceVat: 0, suggestedPrice: c.suggestedPrice || 0,
      exclusiveTo: c.exclusiveTo || '',
      promoPrice: c.promoPrice || 0,
      promoQty: c.promoQty || 0,
      inCatalog: true,
      learnedAliases: (aliasHints && aliasHints[sku]) || []
    });
  });

  return out;
}

// ---------- Product catalogue (tab "Products", already exists in the Sheet —
// user-created, same precedent as "Orders": found by name, NOT auto-created,
// throws if missing) ----------
// Columns (1-indexed): CateID, Ma LK (SKU), Ten LK, Nhom SP, Alias, Gia ban,
// Duyet gia, Ngay duyet, Doc quyen, Gia KM, SL KM. CateID is a per-Nhom-SP
// lookup number (19 existing groups = CateID 1..19). "Doc quyen" (2026-08-22,
// added by the user for the SOP planning filter) is FREE TEXT - eg the name
// of the client/brand holding exclusivity on that SKU, not a yes/no flag - so
// the SOP planning filter is a dropdown of distinct values, same treatment as
// "Nhom SP", not a checkbox.
//
// "Duyet gia"/"Ngay duyet" (cols G/H) sat reserved and unwritten since the
// tab was created; the add/edit flow below (Sua/Them) never touches them.
// Repurposed 2026-08-26 for the bảng giá bán price-proposal feature (see
// PricePlan.gs) as "trạng thái áp dụng gần nhất"/"ngày áp dụng gần nhất" —
// only oemAppApplyPriceListToProducts_ writes them, when Admin/Creator
// approves a price batch. "Gia KM"/"SL KM" (cols J/K) were already present
// on the Sheet with headers but no data when this feature was built — same
// deal: only oemAppApplyPriceListToProducts_ writes them.
var OEMAPP_PRODUCTS_SHEET = 'Products';


function oemAppGetProductsSheet_() {
  var sheet = oemAppSS_().getSheetByName(OEMAPP_PRODUCTS_SHEET); // one attach per request
  if (!sheet) throw new Error('Khong tim thay tab "Products" tren Google Sheet.');
  return sheet;
}

// Returns { bySku: {sku: {cateId, name, group, alias, suggestedPrice,
// promoPrice, promoQty, exclusiveTo, rowIndex}}, maxCateId, groupToCateId } -
// the latter two let add/edit resolve a CateID for a Nhom SP by name (reuse
// the existing id, or hand out the next one for a brand-new group) without
// the caller needing to know the lookup table.
function oemAppLoadMaterialCatalog_() {
  var sheet = oemAppGetProductsSheet_();
  var rows = sheet.getDataRange().getValues();
  var bySku = {};
  var maxCateId = 0;
  var groupToCateId = {};
  for (var i = 1; i < rows.length; i++) {
    var sku = String(rows[i][1] || '');
    if (!sku) continue;
    var cateId = oemAppParseNum_(rows[i][0]);
    var group = String(rows[i][3] || '');
    if (cateId > maxCateId) maxCateId = cateId;
    if (group && !groupToCateId[group.toLowerCase()]) groupToCateId[group.toLowerCase()] = cateId;
    bySku[sku] = {
      cateId: cateId,
      name: String(rows[i][2] || ''),
      group: group,
      alias: String(rows[i][4] || ''),
      suggestedPrice: oemAppParseNum_(rows[i][5]),
      exclusiveTo: String(rows[i][8] || ''),
      promoPrice: oemAppParseNum_(rows[i][9]),
      promoQty: oemAppParseNum_(rows[i][10]),
      // 1-based real sheet row. Carrying it here lets add/edit locate a SKU from
      // the catalog they already loaded, instead of re-reading the whole tab a
      // second time just to find the row number (what oemAppFindProductRow_ did).
      rowIndex: i + 1
    };
  }
  return { bySku: bySku, maxCateId: maxCateId, groupToCateId: groupToCateId };
}


function oemAppResolveCateId_(catalog, group) {
  if (!group) return catalog.maxCateId + 1;
  var existing = catalog.groupToCateId[String(group).toLowerCase()];
  return existing || catalog.maxCateId + 1;
}

// Sale/Admin/Creator - same permission tier as addClient/addPlan (Sale can add
// their own new SKUs; see canEditCatalogue in ProductManagement.jsx).

// Sale/Admin/Creator - same permission tier as addClient/addPlan (Sale can add
// their own new SKUs; see canEditCatalogue in ProductManagement.jsx).
function oemAppAddMaterial_(token, material) {
  var user = oemAppRequireSession_(token);
  if (!['creator', 'admin', 'sale'].includes(user.role)) {
    throw new Error('Khong co quyen them san pham moi.');
  }
  if (!material || !material.sku) throw new Error('Thieu ma SKU.');
  var sheet = oemAppGetProductsSheet_();
  // One read of the Products tab serves both the duplicate check and the CateID
  // lookup (previously two full getDataRange().getValues() passes).
  var catalog = oemAppLoadMaterialCatalog_();
  if (catalog.bySku[String(material.sku)]) {
    throw new Error('Ma SKU ' + material.sku + ' da co trong tab Products - dung nut "Sua" de cap nhat.');
  }
  var cateId = oemAppResolveCateId_(catalog, material.group);
  sheet.appendRow([
    cateId, material.sku, material.name || '', material.group || '',
    material.alias || '', material.suggestedPrice || 0, '', '', material.exclusiveTo || ''
  ]);
  // Perf (2026-08-26): sản phẩm nằm trong khối "catalog" cache riêng (xem
  // SalesData.gs) vì materials được tính lại từ TOÀN BỘ lịch sử giao dịch —
  // đắt hơn nhiều so với clients/plans. Chỉ bump đúng version này thay vì
  // oemAppInvalidateBootstrap_ (vốn cũng đúng vì cache key ngoài đã gộp cả 2
  // version, nhưng gọi nhầm hàm kia sẽ vô tình bắt clients/plans build lại dù
  // không đổi).
  oemAppInvalidateCatalog_();
  return { ok: true };
}

/**
 * Thêm NHIỀU sản phẩm mới vào tab Products trong MỘT lượt gọi.
 *
 * Vì sao cần bản gộp thay vì gọi addMaterial nhiều lần: sau một đợt nhập ZSD450
 * có thể lòi ra hàng chục SKU chưa khai báo, mà đường mạng tới backend này hỏng
 * chừng một nửa số lượt (xem api.js) — hai chục lượt gọi liên tiếp gần như chắc
 * chắn có lượt hỏng giữa chừng, để lại một nửa danh sách đã lưu và người dùng
 * không biết nửa nào. Một lượt gọi thì hoặc xong hết, hoặc không gì cả.
 *
 * SKU đã có trong tab thì BỎ QUA chứ không ném lỗi: cả lô là danh sách máy tự
 * rà ra, một mã đã được người khác thêm xong trong lúc đó không phải là lỗi của
 * người đang bấm. Trả về số bỏ qua để giao diện nói lại cho đúng.
 *
 * CateID cấp phát trong bộ nhớ khi chạy: lô có hai nhóm mới thì hai nhóm đó
 * phải nhận hai id khác nhau — dùng oemAppResolveCateId_ cho từng dòng sẽ cấp
 * trùng một id vì maxCateId không đổi trong suốt vòng lặp.
 */
function oemAppAddMaterials_(token, list) {
  var user = oemAppRequireSession_(token);
  if (!['creator', 'admin', 'sale'].includes(user.role)) {
    throw new Error('Khong co quyen them san pham moi.');
  }
  if (!list || !list.length) throw new Error('Khong co san pham nao de luu.');

  var sheet = oemAppGetProductsSheet_();
  var catalog = oemAppLoadMaterialCatalog_();
  var nextCateId = catalog.maxCateId;
  var groupToCateId = {};
  Object.keys(catalog.groupToCateId).forEach(function (g) { groupToCateId[g] = catalog.groupToCateId[g]; });

  var rows = [];
  var added = [], skipped = [];
  var daThayTrongLo = {};

  list.forEach(function (m) {
    if (!m || !m.sku) return;
    var sku = String(m.sku).trim();
    if (!sku) return;
    // Trùng ngay trong chính lô gửi lên cũng phải chặn, không chỉ trùng với tab.
    if (catalog.bySku[sku] || daThayTrongLo[sku]) { skipped.push(sku); return; }
    daThayTrongLo[sku] = true;

    var group = String(m.group || '').trim();
    var cateId;
    var khoa = group.toLowerCase();
    if (group && groupToCateId[khoa]) {
      cateId = groupToCateId[khoa];
    } else {
      nextCateId++;
      cateId = nextCateId;
      if (group) groupToCateId[khoa] = cateId;
    }

    rows.push([
      cateId, sku, m.name || '', group,
      m.alias || '', m.suggestedPrice || 0, '', '', m.exclusiveTo || ''
    ]);
    added.push(sku);
  });

  if (rows.length) {
    // Ghi một khối thay vì appendRow từng dòng — cùng khuôn với mọi hàm ghi lô
    // khác trong backend này.
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    oemAppInvalidateCatalog_();
  }
  return { ok: true, added: added, addedCount: added.length, skipped: skipped, skippedCount: skipped.length };
}


// Admin/Creator only - editing Alias/Nhom SP/Gia ban of a material that may
// already exist purely from transaction history (no Products row yet), hence
// the append-if-missing branch instead of throwing.

// Admin/Creator only - editing Alias/Nhom SP/Gia ban of a material that may
// already exist purely from transaction history (no Products row yet), hence
// the append-if-missing branch instead of throwing.
function oemAppEditMaterial_(token, sku, updates) {
  var user = oemAppRequireSession_(token);
  if (!['creator', 'admin'].includes(user.role)) {
    throw new Error('Chi Admin moi co quyen sua danh muc san pham.');
  }
  if (!sku) throw new Error('Thieu ma SKU.');
  updates = updates || {};
  var sheet = oemAppGetProductsSheet_();
  // Single Products read: the catalog now carries each SKU's real sheet row.
  var catalog = oemAppLoadMaterialCatalog_();
  var existingEntry = catalog.bySku[String(sku)];
  var rowIndex = existingEntry ? existingEntry.rowIndex : -1;
  if (rowIndex === -1) {
    var newCateId = oemAppResolveCateId_(catalog, updates.group);
    sheet.appendRow([
      newCateId, sku, updates.name || '', updates.group || '',
      updates.alias || '', updates.suggestedPrice || 0, '', '', updates.exclusiveTo || ''
    ]);
  } else {
    var existing = sheet.getRange(rowIndex, 1, 1, 9).getValues()[0];
    var name = updates.name != null ? updates.name : existing[2];
    var group = updates.group != null ? updates.group : existing[3];
    var alias = updates.alias != null ? updates.alias : existing[4];
    var suggestedPrice = updates.suggestedPrice != null ? updates.suggestedPrice : existing[5];
    var cateId = updates.group != null ? oemAppResolveCateId_(catalog, group) : existing[0];
    var exclusiveTo = updates.exclusiveTo != null ? updates.exclusiveTo : existing[8];
    // Cols 7-8 (Duyet gia/Ngay duyet) round-trip unchanged — this flow never touches them.
    sheet.getRange(rowIndex, 1, 1, 9).setValues([[cateId, sku, name, group, alias, suggestedPrice, existing[6], existing[7], exclusiveTo]]);
  }
  // Perf (2026-08-26): sản phẩm nằm trong khối "catalog" cache riêng (xem
  // SalesData.gs) vì materials được tính lại từ TOÀN BỘ lịch sử giao dịch —
  // đắt hơn nhiều so với clients/plans. Chỉ bump đúng version này thay vì
  // oemAppInvalidateBootstrap_ (vốn cũng đúng vì cache key ngoài đã gộp cả 2
  // version, nhưng gọi nhầm hàm kia sẽ vô tình bắt clients/plans build lại dù
  // không đổi).
  oemAppInvalidateCatalog_();
  return { ok: true };
}

// Called by oemAppApprovePriceBatch_ (PricePlan.gs) when Admin/Creator clicks
// Duyệt — writes the newly-approved retail/promo prices straight into
// Products (cols F/J/K), and stamps cols G/H with an "applied" label + the
// chosen effective date. Existing SKUs only (a price proposal can't target a
// SKU that isn't already in the catalog); per-row targeted writes since the
// approved rows are scattered across the sheet, not contiguous like a fresh
// import block.
// Perf (2026-08-26): đọc nguyên khối cột F-H (Giá bán/Duyệt giá/Ngày duyệt)
// và J-K (Giá KM/SL KM) 1 LẦN, sửa đúng các dòng cần đổi trong bộ nhớ, rồi
// ghi lại nguyên khối — LUÔN 4 lệnh Sheet cố định dù đợt duyệt có bao nhiêu
// SKU, thay vì 2-3 lệnh riêng × N dòng (rowIndex của các SKU nằm rải rác khắp
// Products nên không thể gộp thành 1 vùng liền như cách làm ở SOP_Plan).
function oemAppApplyPriceListToProducts_(items) {
  var sheet = oemAppGetProductsSheet_();
  var catalog = oemAppLoadMaterialCatalog_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var dataRowCount = lastRow - 1; // dữ liệu từ dòng 2
  var blockFH = sheet.getRange(2, 6, dataRowCount, 3).getValues();
  var blockJK = sheet.getRange(2, 10, dataRowCount, 2).getValues();

  var appliedCount = 0;
  items.forEach(function (item) {
    var entry = catalog.bySku[String(item.sku)];
    if (!entry) return; // SKU removed from Products since the proposal was made — skip, don't invent a row
    var idx = entry.rowIndex - 2;
    if (idx < 0 || idx >= dataRowCount) return;
    blockFH[idx][0] = item.retail || 0;
    blockFH[idx][1] = 'Đã áp dụng';
    blockFH[idx][2] = item.effectiveDate || '';
    blockJK[idx][0] = item.promoPrice || 0;
    blockJK[idx][1] = item.promoQty || 0;
    appliedCount++;
  });

  if (appliedCount) {
    sheet.getRange(2, 6, dataRowCount, 3).setValues(blockFH);
    sheet.getRange(2, 10, dataRowCount, 2).setValues(blockJK);
    // Perf (2026-08-26): sản phẩm nằm trong khối "catalog" cache riêng (xem
  // SalesData.gs) vì materials được tính lại từ TOÀN BỘ lịch sử giao dịch —
  // đắt hơn nhiều so với clients/plans. Chỉ bump đúng version này thay vì
  // oemAppInvalidateBootstrap_ (vốn cũng đúng vì cache key ngoài đã gộp cả 2
  // version, nhưng gọi nhầm hàm kia sẽ vô tình bắt clients/plans build lại dù
  // không đổi).
  oemAppInvalidateCatalog_();
  }
  return appliedCount;
}
