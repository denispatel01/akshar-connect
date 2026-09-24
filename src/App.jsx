import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevoteesPage from './pages/DevoteesPage';
import SabhasPage from './pages/SabhasPage';
import FollowupsPage from './pages/FollowupsPage';
import QrScannerPage from './pages/QrScannerPage';
import ReportsPage from './pages/ReportsPage';
import AdminPage from './pages/AdminPage';
import { dataService } from './services/dataService';

export default function App() {
  const [user, setUser] = useState(null);
  const [activePage, setActivePage] = useState('dashboard');
  const [history, setHistory] = useState([]);        // stack of previous pages (for Back)
  const [refreshKey, setRefreshKey] = useState(0);    // bump to remount pages after refresh
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const sessionUser = dataService.getCurrentSession();
    if (sessionUser) setUser(sessionUser);
  }, []);

  // Navigate with history tracking
  const navigate = (page) => {
    if (page === activePage) return;
    setHistory((h) => [...h, activePage]);
    setActivePage(page);
  };

  const goBack = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setActivePage(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };

  const refresh = async () => {
    setRefreshing(true);
    try { await dataService.bootstrap(); }
    finally { setRefreshing(false); setRefreshKey((k) => k + 1); }
  };

  const handleLoginSuccess = (userObj) => {
    setUser(userObj);
    setActivePage('dashboard');
    setHistory([]);
  };

  const handleLogout = () => {
    dataService.logout();
    setUser(null);
    setHistory([]);
    setActivePage('dashboard');
  };

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col font-sans">
      <Navbar
        activePage={activePage}
        setActivePage={navigate}
        user={user}
        onLogout={handleLogout}
        onBack={goBack}
        canBack={history.length > 0}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <main className="flex-1 pb-12" key={refreshKey}>
        {activePage === 'dashboard' && <DashboardPage setActivePage={navigate} user={user} />}
        {activePage === 'devotees' && <DevoteesPage user={user} />}
        {activePage === 'sabhas' && <SabhasPage user={user} />}
        {activePage === 'followups' && <FollowupsPage user={user} />}
        {activePage === 'qr-scanner' && <QrScannerPage />}
        {activePage === 'reports' && <ReportsPage />}
        {activePage === 'admin' && <AdminPage user={user} />}
      </main>
    </div>
  );
}
