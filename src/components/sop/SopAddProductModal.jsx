import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, PackagePlus, ArrowLeft, Plus } from 'lucide-react';
import Modal from '../Modal';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { catKhoangTrang, timMaTrung, dungSanPhamMoi } from '../../utils/formClean';
import { timSanPhamChuaCo, trongGiongMa, TOI_DA_KET_QUA } from '../../utils/sopPlan';

const fmtGia = (v) => (v ? Number(v).toLocaleString('vi-VN') : '—');

// Hộp "Thêm sản phẩm vào kế hoạch" của Kế hoạch SOP. Hai chế độ trong CÙNG một Modal chung:
//   'pick'   : tìm trong danh mục (không cần gõ dấu) các SP chưa có trong kế hoạch, tick nhiều mã rồi thêm;
//   'create' : không thấy -> tạo SP mới vào danh mục (cùng quy tắc với form Thêm sản phẩm của Danh mục), xong tự vào kế hoạch.
// Việc ghi (thêm vào kế hoạch / ghi danh mục) do bên gọi làm qua onAddExisting / onCreate; onCreate trả { ok, error }.
export default function SopAddProductModal({
  materials, inPlanSet, groupsList, exclusiveList, initialQuery = '', initialGroup = 'ALL',
  canCreate = true, onAddExisting, onCreate, onClose
}) {
  const [mode, setMode] = useState('pick');
  const [q, setQ] = useState(initialQuery);
  const [group, setGroup] = useState(initialGroup);
  const [picked, setPicked] = useState(() => new Set());
  const dq = useDebouncedValue(q, 250);

  const [form, setForm] = useState({ sku: '', name: '', group: '', price: '', alias: '', exclusiveTo: '' });
  const [formInit, setFormInit] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const firstRef = useRef(null);

  const ketQua = useMemo(
    () => timSanPhamChuaCo(materials, inPlanSet, { q: dq, group }, TOI_DA_KET_QUA),
    [materials, inPlanSet, dq, group]
  );

  const formDirty = mode === 'create' && JSON.stringify(form) !== formInit;
  const dirty = mode === 'pick' ? picked.size > 0 : formDirty;
  useUnsavedGuard(dirty, 'Thêm sản phẩm vào kế hoạch');

  // Đổi chế độ thì đưa con trỏ về ô đầu của chế độ mới (nút vừa bấm đã biến mất nên focus rơi về body).
  useEffect(() => {
    const h = setTimeout(() => { if (firstRef.current && firstRef.current.focus) firstRef.current.focus(); }, 0);
    return () => clearTimeout(h);
  }, [mode]);

  const togglePick = (sku) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(sku)) next.delete(sku); else next.add(sku);
    return next;
  });

  const sangTaoMoi = () => {
    const goc = catKhoangTrang(q);
    const laMa = trongGiongMa(goc);
    const f = {
      sku: laMa ? goc : '', name: !laMa ? goc : '', group: group !== 'ALL' ? group : '', price: '', alias: '', exclusiveTo: ''
    };
    setForm(f);
    setFormInit(JSON.stringify(f));
    setError('');
    setMode('create');
  };

  const setF = (k) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, [k]: v })); setError(''); };

  const trungMa = useMemo(
    () => (mode === 'create' ? timMaTrung(materials, (m) => m.sku, form.sku) : null),
    [mode, materials, form.sku]
  );

  const themDaChon = () => { if (picked.size) onAddExisting([...picked]); };

  const luu = async (e) => {
    e.preventDefault();
    if (saving) return;
    const kq = dungSanPhamMoi(form, materials, groupsList);
    if (kq.error) { setError(kq.error); return; }
    setSaving(true);
    setError('');
    try {
      const r = await onCreate(kq.mat);
      if (r && r.ok === false) setError(r.error || 'Không lưu được, thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const khongKetQua = (mode === 'pick' ? ketQua.total === 0 : false);

  return (
    <Modal
      title={mode === 'pick' ? 'Thêm sản phẩm vào kế hoạch' : 'Thêm sản phẩm mới vào danh mục'}
      icon={<PackagePlus size={18} color="var(--karofi-cyan)" aria-hidden="true" />}
      width={mode === 'pick' ? 680 : 500}
      onClose={onClose}
      busy={saving}
      dirty={dirty}
      discardMessage={mode === 'pick'
        ? 'Các sản phẩm bạn đã tick chưa được thêm vào kế hoạch. Đóng bây giờ sẽ bỏ lựa chọn này.'
        : 'Thông tin sản phẩm mới chưa được lưu. Đóng bây giờ sẽ mất nội dung này.'}
    >
      {mode === 'pick' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} aria-hidden="true" />
              <input
                ref={firstRef} type="text" className="input-field" style={{ paddingLeft: '36px' }}
                placeholder="Tìm trong danh mục theo mã SKU, tên, alias…"
                aria-label="Tìm sản phẩm trong danh mục"
                value={q} onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select className="input-field" style={{ width: '180px', flex: '0 1 180px' }} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Lọc theo Nhóm SP">
              <option value="ALL">Tất cả Nhóm SP</option>
              {groupsList.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {ketQua.total > 0 && (
            <ul className="sop-pick-list" aria-label="Sản phẩm chưa có trong kế hoạch" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {ketQua.items.map((m) => (
                <li key={m.sku}>
                  <label className={'sop-pick-row' + (picked.has(m.sku) ? ' is-picked' : '')}>
                    <input
                      type="checkbox" checked={picked.has(m.sku)} onChange={() => togglePick(m.sku)}
                      aria-label={`Chọn ${m.sku} — ${m.name}`} style={{ width: '16px', height: '16px', flexShrink: 0 }}
                    />
                    <span className="code-font" style={{ fontWeight: 700, color: 'var(--cyan-text)', fontSize: '0.8rem', minWidth: '96px' }}>{m.sku}</span>
                    <span style={{ flex: 1, minWidth: '140px', fontWeight: 600, fontSize: '0.85rem' }}>
                      {m.name}{m.alias && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}> ({m.alias})</span>}
                    </span>
                    {m.group && <span className="badge badge-purple">{m.group}</span>}
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', color: 'var(--text-muted)', minWidth: '78px', textAlign: 'right' }}>{fmtGia(m.suggestedPrice)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div role="status" aria-live="polite" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {ketQua.total > ketQua.items.length && (
              <div>Đang hiện {ketQua.items.length} trong {ketQua.total.toLocaleString('vi-VN')} kết quả — còn {(ketQua.total - ketQua.items.length).toLocaleString('vi-VN')} kết quả, gõ thêm để thu hẹp.</div>
            )}
            {ketQua.daTrongKeHoach > 0 && (
              <div>{ketQua.daTrongKeHoach.toLocaleString('vi-VN')} sản phẩm khớp đã nằm trong kế hoạch nên không hiện ở đây.</div>
            )}
          </div>

          {khongKetQua && (
            <div className="state-card state-empty" style={{ flexDirection: 'column', gap: '4px' }}>
              <div>{ketQua.daTrongKeHoach > 0 ? 'Mọi sản phẩm khớp đều đã nằm trong kế hoạch.' : 'Không tìm thấy sản phẩm nào khớp trong danh mục.'}</div>
              {canCreate && <div style={{ fontSize: '0.8rem' }}>Nếu đây là sản phẩm mới, thêm vào danh mục ngay bên dưới.</div>}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '4px' }}>
            {canCreate ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={sangTaoMoi} style={{ color: 'var(--cyan-text)', whiteSpace: 'normal', textAlign: 'left' }}>
                <Plus size={14} aria-hidden="true" /> Không thấy sản phẩm? Thêm mới vào danh mục
              </button>
            ) : <span />}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
              <button type="button" className="btn btn-primary" disabled={!picked.size} onClick={themDaChon}>
                <Plus size={16} aria-hidden="true" /> Thêm {picked.size.toLocaleString('vi-VN')} sản phẩm vào kế hoạch
              </button>
            </div>
          </div>
        </>
      )}

      {mode === 'create' && (
        <form onSubmit={luu} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            Sản phẩm sẽ được ghi vào Danh mục sản phẩm (mọi người thấy ngay) và tự thêm vào kế hoạch này với số lượng 0.
          </p>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="sop-new-sku">Mã SKU Vật Tư (SAP Code):</label>
            <input
              id="sop-new-sku" ref={firstRef} type="text" required className="input-field" value={form.sku}
              onChange={setF('sku')} onBlur={() => setForm((f) => ({ ...f, sku: catKhoangTrang(f.sku) }))}
              aria-invalid={trungMa ? 'true' : undefined}
            />
            {trungMa && (
              <div role="status" style={{ marginTop: '6px', fontSize: '0.8rem', background: 'var(--warning-bg)', color: 'var(--warning-text)', padding: '8px 10px', borderRadius: 'var(--radius-md)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                <span>Mã <strong>{trungMa.sku}</strong> đã có trong danh mục ({trungMa.name}).</span>
                {inPlanSet.has(trungMa.sku)
                  ? <span>Đã nằm trong kế hoạch.</span>
                  : <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddExisting([trungMa.sku])}>Mã này đã có — bấm để thêm vào kế hoạch</button>}
              </div>
            )}
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="sop-new-name">Tên Vật Tư / Sản Phẩm:</label>
            <input id="sop-new-name" type="text" required className="input-field" value={form.name} onChange={setF('name')} />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="sop-new-group">Nhóm SP:</label>
            <input id="sop-new-group" type="text" list="sop-group-options" required className="input-field" value={form.group} onChange={setF('group')} placeholder="Chọn nhóm có sẵn hoặc gõ nhóm mới" />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="sop-new-price">Giá Bán Đề Xuất (VND):</label>
            <input id="sop-new-price" type="number" min="0" step="any" className="input-field" value={form.price} onChange={setF('price')} aria-describedby="sop-new-price-hint" />
            <div id="sop-new-price-hint" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Không bắt buộc — để trống nếu chưa có giá (tính là 0, doanh thu kế hoạch của mã này sẽ là 0 cho tới khi Admin cập nhật giá).
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="sop-new-alias">Alias / Tên Viết Tắt (Dùng cho AI):</label>
            <input id="sop-new-alias" type="text" className="input-field" value={form.alias} onChange={setF('alias')} />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="sop-new-excl">Độc quyền (tuỳ chọn):</label>
            <input id="sop-new-excl" type="text" list="sop-excl-options" className="input-field" value={form.exclusiveTo} onChange={setF('exclusiveTo')} placeholder="Khách/thương hiệu giữ độc quyền, nếu có" />
          </div>

          <datalist id="sop-group-options">{groupsList.map((g) => <option key={g} value={g} />)}</datalist>
          <datalist id="sop-excl-options">{exclusiveList.map((g) => <option key={g} value={g} />)}</datalist>

          {error && (
            <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)', background: 'var(--danger-bg)', padding: '8px 10px', borderRadius: 'var(--radius-md)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px', marginTop: '6px' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode('pick'); setError(''); }} disabled={saving} style={{ whiteSpace: 'normal', textAlign: 'left' }}>
              <ArrowLeft size={14} aria-hidden="true" /> Quay lại tìm trong danh mục
            </button>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !!trungMa}>
                {saving ? 'Đang lưu...' : 'Lưu vào danh mục & thêm vào kế hoạch'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
