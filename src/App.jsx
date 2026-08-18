import React, { useState, useEffect, useRef } from 'react';
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

import { 
  loadUsers, 
  loadClients, 
  loadTransactions, 
  loadMaterials, 
  loadSalesPlans 
} from './services/sheetService';

export default function App() {
  const [activeTab, setActiveTab] = useState('ai-agent');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [users, setUsers] = useState([]);
  const [activeUser, setActiveUser] = useState({ name: 'hai.cao@karofi.com', role: 'creator', saleId: '' });
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [clients, setClients] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [plans, setPlans] = useState([]);
  const [isSyncing, setIsSyncing] = useState(true);
  const hasSetDefaultUserRef = useRef(false);

  // Initial Load
  const fetchAllData = async () => {
    setIsSyncing(true);
    try {
      const [uList, cList, tList, mList, pList] = await Promise.all([
        loadUsers(),
        loadClients(),
        loadTransactions(),
        loadMaterials(),
        loadSalesPlans()
      ]);

      setUsers(uList);
      // Only set the default active user on the very first load — a manual
      // "Đồng bộ Sheet" refresh must not silently log the current user out.
      if (uList && uList.length > 0 && !hasSetDefaultUserRef.current) {
        setActiveUser(uList[0]);
        hasSetDefaultUserRef.current = true;
      }
      setClients(cList);
      setTransactions(tList);
      setMaterials(mList);
      setPlans(pList);
    } catch (err) {
      console.error('Error fetching sheet data:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleAddMaterial = (newMat) => {
    setMaterials(prev => [newMat, ...prev]);
  };

  const handleAddClient = (newClient) => {
    setClients(prev => [newClient, ...prev]);
  };

  const handleAddPlan = (newPlan) => {
    setPlans(prev => [newPlan, ...prev]);
  };

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
          isSyncing={isSyncing}
          onRefreshData={fetchAllData}
        />

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

      {/* Login & Role Switcher Modal */}
      {showLoginModal && (
        <LoginModal 
          users={users}
          activeUser={activeUser}
          onSelectUser={(u) => { hasSetDefaultUserRef.current = true; setActiveUser(u); }}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </div>
  );
}
