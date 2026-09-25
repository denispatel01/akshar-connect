import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevoteesPage from './pages/DevoteesPage';
import FollowupsPage from './pages/FollowupsPage';
import AdminPage from './pages/AdminPage';
import ComingSoonPage from './pages/ComingSoonPage';
import Footer from './components/Footer';
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

  // Pull to refresh tracking
  const [touchStart, setTouchStart] = useState(0);

  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientY);
  const handleTouchEnd = (e) => {
    if (touchStart === 0) return;
    const touchEnd = e.changedTouches[0].clientY;
    if (touchEnd - touchStart > 100 && window.scrollY === 0 && !refreshing) {
      refresh();
    }
    setTouchStart(0);
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

  // Dark Mode Toggle
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('ac-dark-mode') === 'true';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('ac-dark-mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('ac-dark-mode', 'false');
    }
  }, [isDarkMode]);

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col font-sans transition-colors duration-200" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <Navbar
        activePage={activePage}
        setActivePage={navigate}
        user={user}
        onLogout={handleLogout}
        onBack={goBack}
        canBack={history.length > 0}
        onRefresh={refresh}
        refreshing={refreshing}
        isDarkMode={isDarkMode}
        toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />

      <main className="flex-1 pb-24 sm:pb-12 animate-fade-in transition-all duration-300" key={`${activePage}-${refreshKey}`}>
        {activePage === 'dashboard' && <DashboardPage setActivePage={navigate} user={user} refreshing={refreshing} />}
        {activePage === 'devotees' && (
          <DevoteesPage
            user={user}
            devoteesPreset={devoteesPreset}
            onClearDevoteesPreset={() => setDevoteesPreset(null)}
            openDevoteeId={openDevoteeId}
            onClearOpenDevotee={() => setOpenDevoteeId(null)}
            refreshing={refreshing}
          />
        )}
        {activePage === 'followups' && <FollowupsPage user={user} refreshing={refreshing} />}
        {activePage === 'email' && <ComingSoonPage title="Email & Messaging" />}
        {activePage === 'admin' && <AdminPage user={user} />}
        {activePage === 'sabhas' && <ComingSoonPage title="Events & Attendance" />}
        {activePage === 'qr-scanner' && <ComingSoonPage title="QR Scanner" />}
        {activePage === 'reports' && <ComingSoonPage title="Reports & Export" />}
      </main>

      <Footer />
    </div>
  );
}
