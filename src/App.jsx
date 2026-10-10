import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import LoginModal from './components/LoginModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import LoadingScreen from './components/LoadingScreen';

/* Tải lười theo TAB (2026-09-04).
 *
 * Trước đây cả 10 tab nằm trong một gói duy nhất 393KB: người vào chỉ để xem
 * doanh thu vẫn tải cả phần quản lý giá, SOP, công nợ và AI agent. FC cùng cỡ
 * ứng dụng nhưng đã tách từ lâu (Dashboard/Exports/các modal nhập liệu là
 * chunk riêng) — đây là chép lại đúng khuôn đó.
 *
 * Khớp rất gọn với KeepAliveTab: nó trả null trước lần mở đầu tiên, nên chunk
 * của một tab CHƯA hề được yêu cầu tải cho tới khi người dùng bấm vào tab đó.
 * Ranh giới Suspense nằm trong chính KeepAliveTab, mỗi tab một cái, nên lượt
 * tải chunk không làm nháy tab đang xem.
 *
 * AIOrderAgent là tab mặc định nên gần như luôn được tải — nhưng tách vẫn có
 * lợi: nó kéo theo services/aiAgent.js, và giờ lượt tải đó chạy SONG SONG với
 * request getBootstrap thay vì nằm chặn trước nó. */
const AIOrderAgent = React.lazy(() => import('./components/AIOrderAgent'));
const OrdersReview = React.lazy(() => import('./components/OrdersReview'));
const RevenueReports = React.lazy(() => import('./components/RevenueReports'));
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const TransactionGrid = React.lazy(() => import('./components/TransactionGrid'));
const ProductPricing = React.lazy(() => import('./components/ProductPricing'));
const ClientManagement = React.lazy(() => import('./components/ClientManagement'));
const SalesPlan = React.lazy(() => import('./components/SalesPlan'));
const SopPlan = React.lazy(() => import('./components/SopPlan'));
const DebtManagement = React.lazy(() => import('./components/DebtManagement'));

import KeepAliveTab from './components/KeepAliveTab';
import { RefreshCw } from 'lucide-react';

import * as api from './services/api';
import { veCongSauDangXuat } from './services/karofiSession';
import { readBootstrapCache, writeBootstrapCache, clearBootstrapCache } from './services/dataCache';
import { useToast } from './components/ToastProvider';
import { useNavGuard } from './components/NavGuard';
import { chayLacQuan } from './utils/optimistic';
import { tabHopLe } from './utils/navMeta';
import { lamSachLoi } from './utils/errorText';
import { readUi, writeUi, setUiScope } from './utils/uiState';
import { gopGiaoDich } from './utils/txYears';

export default function App() {
  const toast = useToast();
  const guard = useNavGuard();
  const [session, setSession] = useState(() => api.loadSession());
  // Nhớ tab cuối qua F5 (Đợt 2 / mục 9). Chưa nhớ gì thì mặc định THEO VAI TRÒ (Đợt 3, navMeta.tabMacDinh):
  // admin/leader vào báo cáo doanh thu, Sale vào AI Nhận Đơn Hàng, kế toán vào Sản phẩm. tabHopLe() chặn tab đã nhớ mà vai trò hiện tại
  // không được vào (vd kế toán chỉ có 3 mục). Phạm vi theo tên người đăng nhập:
  // máy dùng chung thì người sau không thừa hưởng tab/bộ lọc của người trước.
  const [activeTab, setActiveTabRaw] = useState(() => {
    setUiScope(session && session.user && session.user.name);
    return tabHopLe(readUi('tab', null), session && session.user && session.user.role);
  });
  const setActiveTab = (id) => { setActiveTabRaw(id); writeUi('tab', id); };
  // Chuyển tab đi qua hộp thoại chung "còn thay đổi chưa lưu" (NavGuard).
  const requestTab = (id) => { if (id !== activeTab) guard(() => setActiveTab(id)); };
  // Which tabs have ever been opened. Tabs mount on first visit and then stay
  // mounted (hidden) — see KeepAliveTab for why.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));
  // Orders live in OrdersReview, which now stays mounted, so it no longer
  // refetches just because the user came back to the tab. This flag is how it
  // learns it genuinely needs to: set when the AI agent saves a new order.
  const [ordersStale, setOrdersStale] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  const [clients, setClients] = useState([]);
  // Giao dịch doanh thu (Đợt 4, 10/10/2026): bootstrap chỉ gửi năm nay + năm trước (`transactions`); năm cũ hơn CÓ dữ liệu được
  // liệt kê ở `olderYears` và tải khi một màn cần (ensureYears -> getTransactionsByYear), cất ở `olderTx`. Màn dùng
  // `allTransactions` (đã gộp phần cũ đã tải) và `txYears` để biết/ép tải năm cũ — xem utils/txYears.js + hooks/useEnsureYears.js.
  // Server cũ không biết tham số recent -> trả đủ, olderYears rỗng, mọi thứ chạy như trước.
  const [transactions, setTransactions] = useState([]);
  const [olderYears, setOlderYears] = useState([]);
  const [olderTx, setOlderTx] = useState({});
  const [yearErrors, setYearErrors] = useState({});
  const [txTotal, setTxTotal] = useState(null);
  const olderYearsRef = useRef([]);
  const olderTxRef = useRef({});
  const yearsLoadingRef = useRef(new Set());
  const tokenRef = useRef('');
  const [materials, setMaterials] = useState([]);
  const [plans, setPlans] = useState([]);
  const [plan2026, setPlan2026] = useState({});
  const [planDefaultMonth, setPlanDefaultMonth] = useState('');
  const [kits, setKits] = useState([]);
  const [baselines2025, setBaselines2025] = useState(new Map());
  // Đã nạp plan2026 + baselines2025 chưa. Hai khối này đến từ endpoint riêng
  // (getReportContext), chỉ nạp khi người dùng mở đúng màn cần tới.
  const [daNapBaoCao, setDaNapBaoCao] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [bootstrapError, setBootstrapError] = useState('');
  // Tracks whether the FIRST bootstrap fetch has finished (success or fail) —
  // used to show a full loading screen only for that initial wait, not for
  // every background "Đồng bộ Sheet" refresh afterwards (that one already
  // has its own small spinner in the Navbar).
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const activeUser = session?.user || { name: '', role: 'sale', saleId: '' };

  // When the data on screen came from the local cache rather than a fresh
  // backend response — drives the "số liệu có thể chưa mới nhất" hint.
  const [isShowingCached, setIsShowingCached] = useState(false);

  // Record every tab the user opens so KeepAliveTab keeps rendering it.
  useEffect(() => {
    setVisitedTabs(prev => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)));
  }, [activeTab]);

  // Nạp plan2026 + baselines2025 khi mở màn cần tới, không nạp lúc mở app.
  //
  // Hai màn này đều đã tải lười (React.lazy + KeepAliveTab), nên lượt gọi này
  // chạy song song với việc tải chunk của màn — người dùng không chờ thêm.
  // Nạp một lần cho cả phiên: đây là KPI năm và số nền 2025, không đổi trong
  // ngày, và cả hai màn dùng chung một lượt gọi.
  //
  // Tách thành hàm gọi được (2026-09-10) để màn "Đề xuất kế hoạch" có nút thử
  // lại: bảng nhập kế hoạch giờ DỰNG TỪ plan2026, nên một lượt gọi hỏng (đường
  // mạng này hỏng chừng một nửa số lượt) không được để Sale ngồi chờ đổi tab
  // qua lại. Hàm này CỐ Ý ném lỗi ra ngoài để nút bấm báo được cho người dùng.
  const napBaoCao = useCallback(async () => {
    if (!session?.token) return;
    const d = await api.getReportContext(session.token);
    setPlan2026(d.plan2026 || {});
    setBaselines2025(new Map(Object.entries(d.baselines2025 || {})));
    setDaNapBaoCao(true);
  }, [session?.token]);

  useEffect(() => {
    const canDenBaoCao = activeTab === 'revenue-reports' || activeTab === 'sales-plan';
    if (!canDenBaoCao || daNapBaoCao || !session?.token) return;
    napBaoCao().catch(() => {
      // Không đặt cờ daNapBaoCao: lần sau mở màn này sẽ thử lại. Hai màn vẫn
      // hiện được, chỉ thiếu cột so sánh — không chặn việc.
    });
  }, [activeTab, daNapBaoCao, session?.token, napBaoCao]);

  // Áp một payload bootstrap — ĐỦ khối (mở app, Đồng bộ, bản cache) hoặc MỘT PHẦN ({parts}: sau khi sửa một chỗ chỉ làm mới đúng
  // khối đó). Khối nào payload không có thì giữ nguyên state hiện tại.
  const applyBootstrap = (data) => {
    if ('clients' in data) setClients(data.clients || []);
    if ('transactions' in data) {
      setTransactions(data.transactions || []);
      const od = Array.isArray(data.olderYears) ? data.olderYears.map(String) : [];
      olderYearsRef.current = od;
      setOlderYears(od);
      setTxTotal(typeof data.txTotal === 'number' ? data.txTotal : null);
      // Chỉ giữ các năm cũ đã tải mà server VẪN coi là cũ: năm đã nằm trong phần gần đây (qua năm mới) hoặc server trả đủ
      // (olderYears rỗng) mà giữ thì cùng một giao dịch xuất hiện hai lần -> mọi tổng nhân đôi.
      const giu = {};
      Object.keys(olderTxRef.current).forEach((k) => { if (od.includes(k)) giu[k] = olderTxRef.current[k]; });
      olderTxRef.current = giu;
      setOlderTx(giu);
    }
    if ('materials' in data) setMaterials(data.materials || []);
    if ('plans' in data) setPlans(data.plans || []);
    if ('planDefaultMonth' in data) setPlanDefaultMonth(data.planDefaultMonth || '');
    if ('kits' in data) setKits(data.kits || []);
    // plan2026 và baselines2025 KHÔNG nằm trong bootstrap nữa. Cố ý cũng không
    // xoá chúng ở đây: mỗi lần bấm "Đồng bộ Sheet" là một lượt applyBootstrap,
    // mà xoá thì màn đang mở sẽ mất số đang xem rồi phải tải lại.
  };

  // Load business data once we have a valid session; re-run when the token changes.
  //
  // forceRefresh: chỉ nút "Đồng bộ Sheet" truyền true. Backend cache payload 10
  // phút và chỉ tự dọn khi CHÍNH APP ghi dữ liệu — sửa tay trên Sheet thì không
  // có đường nào báo cho nó biết, nên nút này phải nói rõ là ép đọc lại, nếu
  // không thì bấm bao nhiêu lần cũng vẫn ra số cũ (xem oemAppGetBootstrap_).
  // So sánh `=== true` có chủ đích: handler nào truyền thẳng hàm này vào onClick
  // sẽ đưa Event vào tham số đầu, và Event là truthy.
  const fetchAllData = async (forceRefresh) => {
    if (!session?.token) return;
    setIsSyncing(true);
    setBootstrapError('');
    try {
      const daTai = Object.keys(olderTxRef.current);
      const data = await api.getBootstrap(session.token, forceRefresh === true, { recent: true });
      applyBootstrap(data);
      setIsShowingCached(false);
      writeBootstrapCache(activeUser.name, data); // fire-and-forget
      // Đồng bộ / vừa nhập doanh thu: các năm cũ đã tải có thể đã cũ — tải lại ở nền, số cũ vẫn hiện tới khi có số mới.
      if (forceRefresh === true && daTai.length) daTai.forEach((y) => { if (olderYearsRef.current.includes(y)) taiNam(y, true); });
    } catch (err) {
      console.error('Error fetching backend data:', err);
      setBootstrapError(err.message || String(err));
      // CHỈ lỗi xác thực thật (khớp thông báo của oem-api/auth.js) mới đăng xuất. Mẫu cũ /hết hạn|token|unauthor/
      // bắt nhầm cả "hết hạn mức Gemini", "Unexpected token" (máy chủ trả HTML)… -> đá người dùng khỏi CẢ BA app
      // (clearSession xoá luôn phiên dùng chung) dù token còn hạn. Lỗi mạng/máy chủ: giữ phiên, hiện lỗi.
      if (/Phiên đăng nhập|chưa được cấp quyền|unauthor/i.test(err.message || '')) {
        api.clearSession();
        setSession(null);
      }
    } finally {
      setIsSyncing(false);
      setHasLoadedOnce(true);
    }
  };

  // Stale-while-revalidate: paint whatever we cached last time first (the app
  // becomes usable in milliseconds instead of waiting out a backend round-trip
  // that has been measured anywhere from 1.4s to well over a minute), then
  // always refresh in the background behind the existing "Đang tải lại" banner.
  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    // Đổi người / phiên: bỏ giao dịch năm cũ của người trước.
    olderTxRef.current = {};
    setOlderTx({});
    setYearErrors({});

    (async () => {
      const cached = await readBootstrapCache(session.user?.name);
      // Don't clobber fresher data if the network somehow won the race.
      if (cached && !cancelled && !hasLoadedOnce) {
        applyBootstrap(cached.data);
        setIsShowingCached(true);
        setHasLoadedOnce(true);
      }
      if (!cancelled) fetchAllData();
    })();

    return () => { cancelled = true; };
  }, [session?.token]);

  const handleLoginSuccess = (newSession) => {
    // Đổi người dùng: bộ lọc/tab nhớ được tính theo người MỚI.
    setUiScope(newSession && newSession.user && newSession.user.name);
    setSession(newSession);
    setShowLoginModal(false);
    // Đã có tab được nhớ (của người này, phạm vi theo tên) thì giữ; CHƯA có thì mặc định THEO VAI TRÒ (tabMacDinh:
    // admin/leader -> báo cáo, Sale -> AI, kế toán -> Sản phẩm), không thừa hưởng tab của người đăng nhập trước.
    // Dùng Raw: tab mặc định chưa phải lựa chọn của người dùng nên chưa ghi vào bộ nhớ.
    setActiveTabRaw(tabHopLe(readUi('tab', null), newSession?.user?.role));
  };

  const handleLogout = () => {
    api.clearSession();
    clearBootstrapCache(); // don't leave business data on a shared machine

    // Về CỔNG, không về form đăng nhập riêng của OEM: trình quản lý mật khẩu
    // của trình duyệt đã lưu thông tin cho form của cổng, nên form của OEM
    // không có gì tự điền và người dùng phải gõ tay mỗi lần.
    //
    // Đặt ở ĐÂY chứ không trong api.clearSession(): hàm đó còn được gọi khi
    // server báo token hết hạn, và chuyển trang giữa lúc người ta đang làm việc
    // là chuyện khác với việc họ chủ động bấm đăng xuất.
    if (veCongSauDangXuat()) return;   // đang rời trang, đừng setState nữa
    setSession(null);
    setClients([]);
    setTransactions([]);
    olderTxRef.current = {};
    olderYearsRef.current = [];
    setOlderTx({});
    setOlderYears([]);
    setYearErrors({});
    setTxTotal(null);
    setMaterials([]);
    setPlans([]);
    setPlan2026({});
    setPlanDefaultMonth('');
    setKits([]);
    setHasLoadedOnce(false);
    setIsShowingCached(false);
  };

  tokenRef.current = session?.token || '';

  // Tải giao dịch của MỘT năm cũ. `lamMoi` = tải lại năm đã có (giữ số cũ tới khi có số mới).
  async function taiNam(y, lamMoi) {
    if (yearsLoadingRef.current.has(y)) return;
    yearsLoadingRef.current.add(y);
    try {
      const d = await api.getTransactionsByYear(tokenRef.current, y);
      olderTxRef.current = { ...olderTxRef.current, [y]: (d && d.transactions) || [] };
      setOlderTx(olderTxRef.current);
      setYearErrors((p) => { if (!(y in p)) return p; const n = { ...p }; delete n[y]; return n; });
    } catch (err) {
      if (!lamMoi) setYearErrors((p) => ({ ...p, [y]: (err && err.message) || String(err) }));
    } finally {
      yearsLoadingRef.current.delete(y);
    }
  }
  // Các màn gọi khi cần năm cũ. Ổn định (không đổi định danh giữa các lần render) để effect của màn không chạy lặp.
  const ensureYears = useCallback((years) => {
    (years || []).map(String)
      .filter((y) => olderYearsRef.current.includes(y) && !olderTxRef.current[y] && !yearsLoadingRef.current.has(y))
      .forEach((y) => { taiNam(y, false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const retryYears = useCallback((years) => {
    const ys = (years || []).map(String);
    setYearErrors((p) => { const n = { ...p }; ys.forEach((y) => { delete n[y]; }); return n; });
    ensureYears(ys);
  }, [ensureYears]);
  const txYears = useMemo(() => ({
    olderYears, loaded: Object.keys(olderTx), errors: yearErrors, ensure: ensureYears, retry: retryYears
  }), [olderYears, olderTx, yearErrors, ensureYears, retryYears]);
  const allTransactions = useMemo(() => gopGiaoDich(transactions, olderTx), [transactions, olderTx]);

  // Sau khi sửa MỘT chỗ (kế hoạch, bộ sản phẩm, giá duyệt): làm mới đúng khối đổi thay vì tải lại toàn bộ bootstrap.
  // `parts` không phải mảng (vd Event) -> tải đủ như cũ. Máy chủ cũ không biết `parts` thì trả đủ và applyBootstrap vẫn áp đúng.
  const lamMoiKhoi = async (parts) => {
    if (!Array.isArray(parts) || !parts.length || !session?.token) { await fetchAllData(); return; }
    try {
      const data = await api.getBootstrap(session.token, false, { parts });
      applyBootstrap(data);
    } catch (err) {
      await fetchAllData();   // đường đủ có banner lỗi + Thử lại
    }
  };

  // All five writers below update the UI first and call the backend after, so the
  // app stays responsive on a connection where a write can take many seconds.
  // The catch blocks used to only alert() — which left the optimistic row sitting
  // in the list, so the user saw their new product listed AND a message saying it
  // had not been saved. Each one now restores the previous state on failure, so
  // what is on screen always matches what is in the Sheet.
  //
  // Trả { ok: true } hoặc { ok: false, error } (09/10/2026, xem utils/optimistic.js).
  // Trước đây lỗi bị nuốt ở đây nên modal Thêm/Sửa khách hàng + sản phẩm tưởng là
  // lưu xong, tự đóng và mất hết chữ đã gõ. Giờ modal xem kết quả: lỗi thì giữ form.
  const withOptimistic = (apply, revert, call, failMessage) =>
    chayLacQuan(apply, revert, call, failMessage, (msg) => toast.error(msg));

  const handleAddMaterial = async (newMat) => {
    const prev = materials;
    return withOptimistic(
      () => setMaterials(m => [newMat, ...m]),
      () => setMaterials(prev),
      () => api.addMaterial(session.token, newMat),
      'Không ghi được sản phẩm mới'
    );
  };

  const handleEditMaterial = async (sku, updates) => {
    const prev = materials;
    return withOptimistic(
      () => setMaterials(m => m.map(x => x.sku === sku ? { ...x, ...updates } : x)),
      () => setMaterials(prev),
      () => api.editMaterial(session.token, sku, updates),
      'Không cập nhật được sản phẩm'
    );
  };

  const handleAddClient = async (newClient) => {
    const prev = clients;
    return withOptimistic(
      () => setClients(c => [newClient, ...c]),
      () => setClients(prev),
      () => api.addClient(session.token, newClient),
      'Không ghi được khách hàng mới'
    );
  };

  const handleEditClient = async (updatedClient) => {
    const prev = clients;
    return withOptimistic(
      // Theo id (30/09/2026): form Sửa đổi được cả Code, khớp theo Code mới sẽ không thấy dòng cũ.
      () => setClients(c => c.map(x => (updatedClient.id != null ? x.id === updatedClient.id : x.code === updatedClient.code) ? updatedClient : x)),
      () => setClients(prev),
      () => api.editClient(session.token, updatedClient),
      'Không cập nhật được khách hàng'
    );
  };

  // No valid session — require login before showing any business data.
  if (!session) {
    return (
      <LoginModal
        onLoginSuccess={handleLoginSuccess}
        closable={false}
      />
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={requestTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        transactionCount={txTotal != null ? txTotal : allTransactions.length}
        activeUser={activeUser}
      />

      {/* Main Container */}
      <div className="main-content">
        <Navbar
          activeUser={activeUser}
          onOpenLoginModal={() => setShowLoginModal(true)}
          onLogout={() => guard(handleLogout)}
          isSyncing={isSyncing}
          onRefreshData={() => fetchAllData(true)}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          onOpenChangePassword={() => setShowChangePasswordModal(true)}
        />

        {/* isSyncing with no error yet showing (first attempt, or right after
            clicking "Thu lai" which clears bootstrapError before retrying) —
            without this, a retry that takes a while (backend round-trips have
            been measured up to ~45s+ per attempt, x4 attempts) looked like
            "the error just vanished and nothing happened". */}
        {isSyncing && hasLoadedOnce && !bootstrapError && (
          <div style={{ margin: '16px 32px 0', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--karofi-navy)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={14} className="animate-spin" />
            {isShowingCached
              ? 'Đang hiển thị số liệu đã lưu lần trước — đang tải bản mới nhất ở nền, bảng sẽ tự cập nhật khi xong.'
              : 'Đang tải lại dữ liệu từ máy chủ — có thể mất khá lâu nếu mạng đang chập chờn, vui lòng chờ...'}
          </div>
        )}

        {/* Từ 14/09/2026 thiếu saleId KHÔNG còn làm mất số liệu (mọi role đọc được
            tất cả), nhưng vẫn làm hỏng phần GHI: không có mã Sale thì không xác
            định được khách nào là của mình, nên lưu kế hoạch sẽ bị chặn. Giữ lại
            cảnh báo với nội dung đúng theo hệ quả mới. */}
        {activeUser.role === 'sale' && !activeUser.saleId && hasLoadedOnce && (
          <div style={{ margin: '16px 32px 0', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--warning-bg)', color: 'var(--warning-text)', fontSize: '0.85rem' }}>
            Tài khoản của bạn chưa được gán <strong>mã Sale</strong>.
            Bạn vẫn xem được số liệu, nhưng chưa lập được kế hoạch kinh doanh vì hệ thống
            không biết khách nào do bạn phụ trách. Vui lòng liên hệ Admin để bổ sung.
          </div>
        )}

        {bootstrapError && (
          <div style={{ margin: '16px 32px 0', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220, 38, 38, 0.12)', color: 'var(--danger)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span>Lỗi tải dữ liệu từ máy chủ: {lamSachLoi(bootstrapError)}</span>
            <button onClick={() => fetchAllData(true)} className="btn btn-secondary btn-sm" disabled={isSyncing}>
              Thử lại
            </button>
          </div>
        )}

        {!hasLoadedOnce ? (
          <LoadingScreen label="Đang tải dữ liệu OEM App..." />
        ) : (
        <main className="page-container">
          <KeepAliveTab isActive={activeTab === 'ai-agent'} hasVisited={visitedTabs.has('ai-agent')}>
            <AIOrderAgent
              clients={clients}
              materials={materials}
              transactions={allTransactions}
              kits={kits}
              token={session.token}
              onOrderSaved={() => setOrdersStale(true)}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'pending-orders'} hasVisited={visitedTabs.has('pending-orders')}>
            <OrdersReview
              token={session.token}
              activeUser={activeUser}
              materials={materials}
              clients={clients}
              isActive={activeTab === 'pending-orders'}
              isStale={ordersStale}
              onLoaded={() => setOrdersStale(false)}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'revenue-reports'} hasVisited={visitedTabs.has('revenue-reports')}>
            <RevenueReports
              transactions={allTransactions}
              txYears={txYears}
              clients={clients}
              activeUser={activeUser}
              baselines2025={baselines2025}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'dashboard'} hasVisited={visitedTabs.has('dashboard')}>
            <Dashboard
              transactions={allTransactions}
              txYears={txYears}
              clients={clients}
              materials={materials}
              plans={plans}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'transactions'} hasVisited={visitedTabs.has('transactions')}>
            <TransactionGrid
              transactions={allTransactions}
              txYears={txYears}
              materials={materials}
              token={session?.token}
              activeUser={activeUser}
              // Ép đọc lại: dữ liệu vừa được ghi bởi một dự án Apps Script
              // KHÁC (up-dt-oem), nên cache bootstrap phía client không có
              // đường nào tự biết là nó đã cũ.
              onImported={() => fetchAllData(true)}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'products'} hasVisited={visitedTabs.has('products')}>
            <ProductPricing
              token={session.token}
              materials={materials}
              clients={clients}
              kits={kits}
              activeUser={activeUser}
              onAddMaterial={handleAddMaterial}
              onEditMaterial={handleEditMaterial}
              onDataChanged={lamMoiKhoi}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'clients'} hasVisited={visitedTabs.has('clients')}>
            <ClientManagement
              clients={clients}
              activeUser={activeUser}
              onAddClient={handleAddClient}
              onEditClient={handleEditClient}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'sales-plan'} hasVisited={visitedTabs.has('sales-plan')}>
            <SalesPlan
              token={session.token}
              plans={plans}
              clients={clients}
              transactions={allTransactions}
              txYears={txYears}
              plan2026={plan2026}
              planDefaultMonth={planDefaultMonth}
              activeUser={activeUser}
              onDataChanged={lamMoiKhoi}
              onReloadPlanKpi={napBaoCao}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'sop'} hasVisited={visitedTabs.has('sop')}>
            <SopPlan
              token={session.token}
              activeUser={activeUser}
              materials={materials}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'debt-importer'} hasVisited={visitedTabs.has('debt-importer')}>
            <DebtManagement token={session.token} activeUser={activeUser} clients={clients} />
          </KeepAliveTab>

        </main>
        )}
      </div>

      {/* Switch-user modal — reuses the same login form, but is closable since we already have a session */}
      {showLoginModal && (
        <LoginModal
          onLoginSuccess={handleLoginSuccess}
          onClose={() => setShowLoginModal(false)}
          closable={true}
        />
      )}

      {showChangePasswordModal && (
        <ChangePasswordModal
          token={session.token}
          onClose={() => setShowChangePasswordModal(false)}
        />
      )}
    </div>
  );
}
