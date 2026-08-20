import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import LoginModal from './components/LoginModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import AIOrderAgent from './components/AIOrderAgent';
import OrdersReview from './components/OrdersReview';
import RevenueReports from './components/RevenueReports';
import Dashboard from './components/Dashboard';
import TransactionGrid from './components/TransactionGrid';
import ProductManagement from './components/ProductManagement';
import ClientManagement from './components/ClientManagement';
import SalesPlan from './components/SalesPlan';
import DebtImporter from './components/DebtImporter';
import GoogleSheetSettings from './components/GoogleSheetSettings';
import LoadingScreen from './components/LoadingScreen';
import KeepAliveTab from './components/KeepAliveTab';
import { RefreshCw } from 'lucide-react';

import * as api from './services/api';
import { readBootstrapCache, writeBootstrapCache, clearBootstrapCache } from './services/dataCache';

export default function App() {
  const [activeTab, setActiveTab] = useState('ai-agent');
  // Which tabs have ever been opened. Tabs mount on first visit and then stay
  // mounted (hidden) — see KeepAliveTab for why.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['ai-agent']));
  // Orders live in OrdersReview, which now stays mounted, so it no longer
  // refetches just because the user came back to the tab. This flag is how it
  // learns it genuinely needs to: set when the AI agent saves a new order.
  const [ordersStale, setOrdersStale] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [session, setSession] = useState(() => api.loadSession());
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  const [clients, setClients] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [plans, setPlans] = useState([]);
  const [baselines2025, setBaselines2025] = useState(new Map());
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

  const applyBootstrap = (data) => {
    setClients(data.clients || []);
    setTransactions(data.transactions || []);
    setMaterials(data.materials || []);
    setPlans(data.plans || []);
    setBaselines2025(new Map(Object.entries(data.baselines2025 || {})));
  };

  // Load business data once we have a valid session; re-run when the token changes.
  const fetchAllData = async () => {
    if (!session?.token) return;
    setIsSyncing(true);
    setBootstrapError('');
    try {
      const data = await api.getBootstrap(session.token);
      applyBootstrap(data);
      setIsShowingCached(false);
      writeBootstrapCache(activeUser.name, data); // fire-and-forget
    } catch (err) {
      console.error('Error fetching backend data:', err);
      setBootstrapError(err.message || String(err));
      // Token likely expired server-side — force re-login.
      if (/hết hạn|token|unauthor/i.test(err.message || '')) {
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
    setSession(newSession);
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    api.clearSession();
    clearBootstrapCache(); // don't leave business data on a shared machine
    setSession(null);
    setClients([]);
    setTransactions([]);
    setMaterials([]);
    setPlans([]);
    setHasLoadedOnce(false);
    setIsShowingCached(false);
  };

  const handleAddMaterial = async (newMat) => {
    setMaterials(prev => [newMat, ...prev]);
    try {
      await api.addMaterial(session.token, newMat);
    } catch (err) {
      alert('Không ghi được sản phẩm mới lên Google Sheet: ' + err.message);
    }
  };

  const handleEditMaterial = async (sku, updates) => {
    setMaterials(prev => prev.map(m => m.sku === sku ? { ...m, ...updates } : m));
    try {
      await api.editMaterial(session.token, sku, updates);
    } catch (err) {
      alert('Không cập nhật được sản phẩm lên Google Sheet: ' + err.message);
    }
  };

  const handleAddClient = async (newClient) => {
    setClients(prev => [newClient, ...prev]);
    try {
      await api.addClient(session.token, newClient);
    } catch (err) {
      alert('Không ghi được khách hàng mới lên Google Sheet: ' + err.message);
    }
  };

  const handleEditClient = async (updatedClient) => {
    setClients(prev => prev.map(c => c.code === updatedClient.code ? updatedClient : c));
    try {
      await api.editClient(session.token, updatedClient);
    } catch (err) {
      alert('Không cập nhật được khách hàng lên Google Sheet: ' + err.message);
    }
  };

  const handleAddPlan = async (newPlan) => {
    setPlans(prev => [newPlan, ...prev]);
    try {
      await api.addPlan(session.token, newPlan);
    } catch (err) {
      alert('Không ghi được kế hoạch mới lên Google Sheet: ' + err.message);
    }
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
        setActiveTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        transactionCount={transactions.length}
      />

      {/* Main Container */}
      <div className="main-content">
        <Navbar
          activeUser={activeUser}
          onOpenLoginModal={() => setShowLoginModal(true)}
          onLogout={handleLogout}
          isSyncing={isSyncing}
          onRefreshData={fetchAllData}
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
              : 'Đang tải lại dữ liệu từ backend — có thể mất khá lâu nếu mạng đang chập chờn, vui lòng chờ...'}
          </div>
        )}

        {bootstrapError && (
          <div style={{ margin: '16px 32px 0', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220, 38, 38, 0.12)', color: '#dc2626', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span>Lỗi tải dữ liệu từ backend: {bootstrapError}</span>
            <button onClick={fetchAllData} className="btn btn-secondary btn-sm" disabled={isSyncing}>
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
              transactions={transactions}
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
              transactions={transactions}
              clients={clients}
              activeUser={activeUser}
              baselines2025={baselines2025}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'dashboard'} hasVisited={visitedTabs.has('dashboard')}>
            <Dashboard
              transactions={transactions}
              clients={clients}
              materials={materials}
              plans={plans}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'transactions'} hasVisited={visitedTabs.has('transactions')}>
            <TransactionGrid transactions={transactions} />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'products'} hasVisited={visitedTabs.has('products')}>
            <ProductManagement
              materials={materials}
              clients={clients}
              activeUser={activeUser}
              onAddMaterial={handleAddMaterial}
              onEditMaterial={handleEditMaterial}
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
              plans={plans}
              clients={clients}
              transactions={transactions}
              activeUser={activeUser}
              onAddPlan={handleAddPlan}
            />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'debt-importer'} hasVisited={visitedTabs.has('debt-importer')}>
            <DebtImporter />
          </KeepAliveTab>

          <KeepAliveTab isActive={activeTab === 'settings'} hasVisited={visitedTabs.has('settings')}>
            <GoogleSheetSettings />
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
