import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import LoginModal from './components/LoginModal';
import AIOrderAgent from './components/AIOrderAgent';
import RevenueReports from './components/RevenueReports';
import Dashboard from './components/Dashboard';
import TransactionGrid from './components/TransactionGrid';
import ProductManagement from './components/ProductManagement';
import ClientManagement from './components/ClientManagement';
import SalesPlan from './components/SalesPlan';
import DebtImporter from './components/DebtImporter';
import GoogleSheetSettings from './components/GoogleSheetSettings';

import * as api from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('ai-agent');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [session, setSession] = useState(() => api.loadSession());
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [clients, setClients] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [plans, setPlans] = useState([]);
  const [baselines2025, setBaselines2025] = useState(new Map());
  const [isSyncing, setIsSyncing] = useState(false);
  const [bootstrapError, setBootstrapError] = useState('');

  const activeUser = session?.user || { name: '', role: 'sale', saleId: '' };

  // Load business data once we have a valid session; re-run when the token changes.
  const fetchAllData = async () => {
    if (!session?.token) return;
    setIsSyncing(true);
    setBootstrapError('');
    try {
      const data = await api.getBootstrap(session.token);
      setClients(data.clients || []);
      setTransactions(data.transactions || []);
      setMaterials(data.materials || []);
      setPlans(data.plans || []);
      setBaselines2025(new Map(Object.entries(data.baselines2025 || {})));
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
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [session?.token]);

  const handleLoginSuccess = (newSession) => {
    setSession(newSession);
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    api.clearSession();
    setSession(null);
    setClients([]);
    setTransactions([]);
    setMaterials([]);
    setPlans([]);
  };

  const handleAddMaterial = (newMat) => {
    // No product-catalogue tab exists in the Sheet yet — kept local-only.
    // See gas/SETUP.md for why this isn't wired to the backend.
    setMaterials(prev => [newMat, ...prev]);
  };

  const handleAddClient = async (newClient) => {
    setClients(prev => [newClient, ...prev]);
    try {
      await api.addClient(session.token, newClient);
    } catch (err) {
      alert('Không ghi được khách hàng mới lên Google Sheet: ' + err.message);
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
      />

      {/* Main Container */}
      <div className="main-content">
        <Navbar
          activeUser={activeUser}
          onOpenLoginModal={() => setShowLoginModal(true)}
          onLogout={handleLogout}
          isSyncing={isSyncing}
          onRefreshData={fetchAllData}
        />

        {bootstrapError && (
          <div style={{ margin: '16px 32px 0', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220, 38, 38, 0.12)', color: '#dc2626', fontSize: '0.85rem' }}>
            Lỗi tải dữ liệu từ backend: {bootstrapError}
          </div>
        )}

        <main className="page-container">
          {activeTab === 'ai-agent' && (
            <AIOrderAgent 
              clients={clients} 
              materials={materials} 
              transactions={transactions} 
            />
          )}

          {activeTab === 'revenue-reports' && (
            <RevenueReports
              transactions={transactions}
              clients={clients}
              activeUser={activeUser}
              baselines2025={baselines2025}
            />
          )}

          {activeTab === 'dashboard' && (
            <Dashboard 
              transactions={transactions} 
              clients={clients} 
              materials={materials} 
              plans={plans} 
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionGrid transactions={transactions} />
          )}

          {activeTab === 'products' && (
            <ProductManagement 
              materials={materials} 
              clients={clients} 
              transactions={transactions}
              activeUser={activeUser}
              onAddMaterial={handleAddMaterial}
            />
          )}

          {activeTab === 'clients' && (
            <ClientManagement 
              clients={clients}
              activeUser={activeUser}
              onAddClient={handleAddClient} 
            />
          )}

          {activeTab === 'sales-plan' && (
            <SalesPlan 
              plans={plans} 
              clients={clients} 
              transactions={transactions} 
              activeUser={activeUser}
              onAddPlan={handleAddPlan}
            />
          )}

          {activeTab === 'debt-importer' && (
            <DebtImporter />
          )}

          {activeTab === 'settings' && (
            <GoogleSheetSettings />
          )}
        </main>
      </div>

      {/* Switch-user modal — reuses the same login form, but is closable since we already have a session */}
      {showLoginModal && (
        <LoginModal
          onLoginSuccess={handleLoginSuccess}
          onClose={() => setShowLoginModal(false)}
          closable={true}
        />
      )}
    </div>
  );
}
