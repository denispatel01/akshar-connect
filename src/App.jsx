import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevoteesPage from './pages/DevoteesPage';
import FollowupsPage from './pages/FollowupsPage';
import AdminPage from './pages/AdminPage';
import ComingSoonPage from './pages/ComingSoonPage';
import { dataService } from './services/dataService';

export default function App() {
  // Restore the saved session synchronously so a returning user goes straight
  // to the app — no re-login, no flash of the sign-in screen.
  const [user, setUser] = useState(() => dataService.getCurrentSession());
  const [activePage, setActivePage] = useState('dashboard');
  const [history, setHistory] = useState([]);        // stack of previous pages (for Back)
  const [refreshKey, setRefreshKey] = useState(0);    // bump to remount pages after refresh
  const [refreshing, setRefreshing] = useState(false);
  /** Set from dashboard stat cards: total | ambrish | families | birthdays */
  const [devoteesPreset, setDevoteesPreset] = useState(null);
  const [openDevoteeId, setOpenDevoteeId] = useState(null);

  // When the background live-refresh finishes, re-read fresh data into the pages.
  useEffect(() => {
    const onRefreshed = () => setRefreshKey((k) => k + 1);
    window.addEventListener('ac-data-refreshed', onRefreshed);
    return () => window.removeEventListener('ac-data-refreshed', onRefreshed);
  }, []);

  // Navigate with history tracking
  const navigate = (page, options) => {
    if (page === activePage && !options?.devoteesPreset && !options?.openDevoteeId) return;
    if (page !== activePage) {
      setHistory((h) => [...h, activePage]);
      setActivePage(page);
    }
    if (page === 'devotees') {
      if (options?.openDevoteeId) setOpenDevoteeId(options.openDevoteeId);
      if (options?.devoteesPreset) setDevoteesPreset(options.devoteesPreset);
      else if (!options?.keepDevoteesPreset) setDevoteesPreset(null);
    }
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
        {activePage === 'devotees' && (
          <DevoteesPage
            user={user}
            devoteesPreset={devoteesPreset}
            onClearDevoteesPreset={() => setDevoteesPreset(null)}
            openDevoteeId={openDevoteeId}
            onClearOpenDevotee={() => setOpenDevoteeId(null)}
          />
        )}
        {activePage === 'followups' && <FollowupsPage user={user} />}
        {activePage === 'email' && <ComingSoonPage title="Email & Messaging" />}
        {activePage === 'admin' && <AdminPage user={user} />}
        {activePage === 'sabhas' && <ComingSoonPage title="Events & Attendance" />}
        {activePage === 'qr-scanner' && <ComingSoonPage title="QR Scanner" />}
        {activePage === 'reports' && <ComingSoonPage title="Reports & Export" />}
      </main>
    </div>
  );
}
