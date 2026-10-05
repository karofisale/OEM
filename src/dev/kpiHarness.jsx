/**
 * kpiHarness.jsx — CHỈ DEV. Dựng màn KPI Năm với "máy chủ giả": chặn fetch tới API và trả dữ liệu trong bộ nhớ.
 * Mở /kpi-harness.html (?sua=1 để bắt đầu ở trạng thái "đã sửa tay"; ?tay=1 để không có nguồn).
 */
const q = new URLSearchParams(window.location.search);
const kho = {
  rows: [
    { code: 'TECOM', name: 'Công ty TECOM', pic: 'Luyến', months: [3e9, 2e9, 2.5e9, 3e9, 2e9, 2.5e9, 3e9, 2.5e9, 2e9, 3e9, 3e9, 3.5e9] },
    { code: 'CTMAXIMVN', name: 'Maxim VN', pic: 'Hà', months: [1e9, 1.5e9, 1e9, 1e9, 1.5e9, 1e9, 1e9, 1e9, 1.5e9, 1e9, 1e9, 1.5e9] },
    { code: 'CHTUANDP', name: 'CH Tuấn', pic: 'Hà', months: [5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8, 5e8] }
  ],
  nguon: q.get('tay') ? null : { sourcePlanId: 'AP-1', sourceKind: 'final', label: 'Kế hoạch năm FC — Final #1', appliedAt: new Date().toISOString(), appliedBy: 'hai',
    editedManually: !!q.get('sua'), editedBy: q.get('sua') ? 'Hải' : '', editedAt: null },
  luu: []
};
window.__kho = kho;
const realFetch = window.fetch.bind(window);
window.fetch = async (url, opts) => {
  try {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (body && body.fn === 'getPlanNam') return new Response(JSON.stringify({ result: { nam: body.args[1], rows: kho.rows, nguon: kho.nguon } }), { status: 200 });
    if (body && body.fn === 'savePlanNam') {
      kho.rows = body.args[2];
      kho.luu.push(body.args[2]);
      if (kho.nguon) { kho.nguon.editedManually = true; kho.nguon.editedBy = 'Hải'; }
      return new Response(JSON.stringify({ result: { ok: true, nam: body.args[1], savedCount: body.args[2].length } }), { status: 200 });
    }
  } catch (e) { /* rơi xuống fetch thật */ }
  return realFetch(url, opts);
};

const [{ StrictMode }, { createRoot }, { ToastProvider }, { default: PlanNamPanel }] = await Promise.all([
  import('react'), import('react-dom/client'), import('../components/ToastProvider'), import('../components/salesplan/PlanNamPanel'), import('../index.css')
]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <div style={{ padding: '16px', maxWidth: '1500px', margin: '0 auto' }}>
        <PlanNamPanel token="harness" onSaved={() => Promise.resolve()} />
      </div>
    </ToastProvider>
  </StrictMode>
);
