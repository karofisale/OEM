import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Clock, AlertTriangle, CheckCircle2, Loader2, DownloadCloud } from 'lucide-react';
import * as api from '../services/api';
import SubTabs from './SubTabs';
import KeepAliveTab from './KeepAliveTab';
import TableState from './TableState';
import TonKhoPanel from './thanhly/TonKhoPanel';
import BangGiaPanel from './thanhly/BangGiaPanel';
import BoLocPanel from './thanhly/BoLocPanel';
import { SUBTABS } from '../utils/navMeta';
import { usePersistentState } from '../hooks/usePersistentState';
import { useToast } from './ToastProvider';
import { hienNgay } from '../utils/vnDate';
import { lamSachLoi } from '../utils/errorText';

// Số liệu quá cũ (phút) thì mở lại tab sẽ tải lại: người khác có thể đã lên đơn / admin đã cập nhật giá trong lúc này.
const CU_SAU_PHUT = 2;
// Đang chờ máy SAP cào (admin vừa bấm "Cập nhật ngay"): tự hỏi lại mỗi 30 giây, tối đa 10 phút.
const NHIP_HOI_MS = 30000;
const HOI_TOI_DA = 20;

/**
 * "Bán hàng thanh lý" (21/10/2026) — tồn kho thanh lý (SAP MB52, Plant 0400, kho 1402), bảng giá thanh lý, và lên đơn thanh lý.
 *
 * Dữ liệu một lần cho cả 3 tab con (api.getThanhLy). Chỉ giữ số tồn MỚI NHẤT, không lịch sử. Hàng gia dụng ngoài lọc nước bị loại
 * theo từ khoá do Admin sửa (tab "Bộ lọc hàng"). Đơn thanh lý xuất thẳng sang "Đơn Hàng Chờ Duyệt" cho Admin đưa vào SAP, rồi xoá
 * ở đó như mọi đơn — không có kho lưu riêng.
 */
export default function ThanhLy({ token, activeUser, clients, isActive = true, onOrderSaved, onOpenOrders }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dangYeuCau, setDangYeuCau] = useState(false);
  const lastLoad = useRef(0);
  const dangTai = useRef(false);
  const dem = useRef(0);

  const role = String(activeUser.role || '').toLowerCase();
  const laQuanTri = ['admin', 'creator'].includes(role);

  const tabs = SUBTABS['thanh-ly'].filter((t) => t.id !== 'rules' || laQuanTri);
  const [subSaved, setSubView] = usePersistentState('sub.thanh-ly', 'order');
  const subView = tabs.some((t) => t.id === subSaved) ? subSaved : 'order';

  const tai = useCallback(async ({ im } = {}) => {
    if (dangTai.current) return null;
    dangTai.current = true;
    if (!im) setLoading(true);
    setLoadError('');
    try {
      const d = await api.getThanhLy(token);
      setData(d);
      lastLoad.current = Date.now();
      return d;
    } catch (err) {
      // Lần tải ngầm (tự hỏi lại) lỗi thì giữ số liệu đang có, không phá màn.
      if (!im) setLoadError(err.message || String(err));
      return null;
    } finally {
      dangTai.current = false;
      if (!im) setLoading(false);
    }
  }, [token]);

  // Tải lần đầu khi tab hiện ra; các lần sau chỉ tải lại khi số liệu đã cũ.
  useEffect(() => {
    if (!isActive) return;
    if (!data || Date.now() - lastLoad.current > CU_SAU_PHUT * 60000) tai({ im: !!data });
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const cho = !!(data && data.job && (data.job.pending || data.job.status === 'running'));
  useEffect(() => {
    if (!cho || !isActive) { dem.current = 0; return undefined; }
    const h = setInterval(() => {
      if (++dem.current > HOI_TOI_DA) { clearInterval(h); return; }
      tai({ im: true });
    }, NHIP_HOI_MS);
    return () => clearInterval(h);
  }, [cho, isActive, tai]);

  const yeuCauCapNhat = async () => {
    if (dangYeuCau) return;
    setDangYeuCau(true);
    try {
      await api.tlRequestRefresh(token);
      toast.success('Đã gửi yêu cầu. Máy có SAP sẽ cào kho 1402 trong vòng 5 phút — màn hình tự cập nhật khi xong.');
      dem.current = 0;
      await tai({ im: true });
    } catch (err) {
      toast.error('Không gửi được yêu cầu: ' + lamSachLoi(err.message || err));
    } finally {
      setDangYeuCau(false);
    }
  };

  if (loading && !data) return <TableState loading loadingLabel="Đang tải tồn kho thanh lý..." />;
  if (loadError && !data) return <TableState error={loadError} errorPrefix="Không tải được tồn kho thanh lý" onRetry={() => tai()} />;
  if (!data) return null;

  const job = data.job || {};
  const loiJob = job.status === 'error' && job.message;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '220px' }}>
          <strong style={{ color: 'var(--karofi-navy)' }}>Tồn kho thanh lý · kho {(data.slocs || []).join(', ')}</strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            SAP MB52 · Plant {data.plant} · chỉ số tồn hiện tại, không lưu lịch sử
          </span>
        </div>

        <span
          className={'badge ' + (data.updatedAt ? (data.updatedToday ? 'badge-emerald' : 'badge-amber') : 'badge-rose')}
          title={data.updatedAt ? 'Lần cào SAP gần nhất' : 'Chưa có lượt cào nào'}
        >
          {data.updatedAt ? (data.updatedToday ? <CheckCircle2 size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />) : <AlertTriangle size={12} aria-hidden="true" />}
          {data.updatedAt
            ? <>Cập nhật: {hienNgay(data.updatedAt)}{data.updatedToday ? ' (hôm nay)' : ' — CHƯA cập nhật hôm nay'}</>
            : 'Chưa có dữ liệu tồn kho'}
        </span>

        {cho && (
          <span className="badge badge-blue" title={job.requestedAt ? `Yêu cầu lúc ${hienNgay(job.requestedAt)}${job.requestedBy ? ' bởi ' + job.requestedBy : ''}` : ''}>
            <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Đang chờ máy SAP cập nhật…
          </span>
        )}
        {loiJob && !cho && (
          <span className="badge badge-rose" title={job.message} style={{ maxWidth: '420px', whiteSpace: 'normal' }}>
            <AlertTriangle size={12} aria-hidden="true" /> Lượt cào gần nhất lỗi: {String(job.message).slice(0, 120)}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '4px' }} title="Máy có SAP tự cào theo các khung giờ này mỗi ngày">
            <Clock size={12} aria-hidden="true" /> Tự cập nhật lúc {(job.gioChay || []).join(' · ')}
          </span>
          {laQuanTri && (
            <button onClick={yeuCauCapNhat} disabled={dangYeuCau || cho} className="btn btn-secondary btn-sm" title="Yêu cầu máy có SAP cào ngay (nhận trong ≤ 5 phút)">
              {dangYeuCau ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />} Cập nhật tồn ngay
            </button>
          )}
          <button onClick={() => tai()} disabled={loading} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} /> Tải lại
          </button>
        </div>
      </div>

      {loadError && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220, 38, 38, 0.12)', color: 'var(--danger)', fontSize: '0.85rem' }}>
          Không tải lại được: {lamSachLoi(loadError)}
        </div>
      )}

      <SubTabs tabs={tabs} active={subView} onChange={setSubView} ariaLabel="Bán hàng thanh lý" />

      <KeepAliveTab isActive={subView === 'order'}>
        <TonKhoPanel
          token={token}
          data={data}
          clients={clients}
          onReload={() => tai({ im: true })}
          onOrderSaved={onOrderSaved}
          onOpenOrders={onOpenOrders}
        />
      </KeepAliveTab>

      <KeepAliveTab isActive={subView === 'price'}>
        <BangGiaPanel token={token} data={data} canEdit={!!data.canEditPrice} onReload={() => tai({ im: true })} />
      </KeepAliveTab>

      {laQuanTri && (
        <KeepAliveTab isActive={subView === 'rules'}>
          <BoLocPanel token={token} data={data} onReload={() => tai({ im: true })} />
        </KeepAliveTab>
      )}
    </div>
  );
}
