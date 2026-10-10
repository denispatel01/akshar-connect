import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevoteesPage from './pages/DevoteesPage';
import FollowupsPage from './pages/FollowupsPage';
import AdminPage from './pages/AdminPage';
import ReportsPage from './pages/ReportsPage';
import BulkTagPage from './pages/BulkTagPage';
import FamilyTagPage from './pages/FamilyTagPage';
import GhariPage from './pages/GhariPage';
import AccountPage from './pages/AccountPage';
import ActivityPage from './pages/ActivityPage';
import SwadhyayPage from './pages/SwadhyayPage';
import CalendarPage from './pages/CalendarPage';
import DataQualityPage from './pages/DataQualityPage';
import FeedPage from './pages/FeedPage';
import ComingSoonPage from './pages/ComingSoonPage';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import NotificationsPopup from './components/NotificationsPopup';
import { dataService } from './services/dataService';
import { initPush } from './services/pushService';

export default function App() {
  // Restore the saved session synchronously so a returning user goes straight
  // to the app — no re-login, no flash of the sign-in screen.
  const [user, setUser] = useState(() => dataService.getCurrentSession());
  const [activePage, setActivePage] = useState('dashboard');
  // Register for push on launch when a session is already restored.
  useEffect(() => { if (user) { try { initPush(user); } catch (e) {} } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [history, setHistory] = useState([]);        // stack of previous pages (for Back)
  const [refreshKey, setRefreshKey] = useState(0);    // bump to remount pages after refresh
  const [refreshing, setRefreshing] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Passive flag only — the service worker auto-updates and reloads itself from
  // main.jsx (loop-guarded there). We do NOT trigger skip-waiting/reloads here, to
  // avoid compounding into a refresh loop.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      if (reg.waiting) { setUpdateAvailable(true); return; }
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) setUpdateAvailable(true);
        });
      });
    });
  }, []);
  /** Set from dashboard stat cards: total | ambrish | families | birthdays */
  const [devoteesPreset, setDevoteesPreset] = useState(null);
  const [filterPreset, setFilterPreset] = useState(null);
  const [openDevoteeId, setOpenDevoteeId] = useState(null);

  // NOTE: the background live-refresh (ac-data-refreshed) intentionally does NOT
  // bump refreshKey anymore — remounting the active page here wiped the user's
  // in-progress search/scroll ~2s after opening (#147). Pages that need the fresh
  // data listen for 'ac-data-refreshed' themselves and re-read in place, so state
  // (search, filters) is preserved. refreshKey is now only bumped by a manual
  // pull-to-refresh / refresh button, which the user initiates on purpose.

  // Navigate with history tracking
  const navigate = (page, options) => {
    // Always jump back to the top — lets Home/logo act as a "scroll to top"
    // even when you're already on that page.
    try { window.scrollTo(0, 0); document.scrollingElement && (document.scrollingElement.scrollTop = 0); } catch (e) {}
    if (page === activePage && !options?.devoteesPreset && !options?.openDevoteeId && !options?.filterPreset) return;
    if (page !== activePage) {
      setHistory((h) => [...h, activePage]);
      setActivePage(page);
    }
    if (page === 'devotees') {
      if (options?.openDevoteeId) setOpenDevoteeId(options.openDevoteeId);
      if (options?.devoteesPreset) setDevoteesPreset(options.devoteesPreset);
      else if (!options?.keepDevoteesPreset) setDevoteesPreset(null);

      if (options?.filterPreset) setFilterPreset(options.filterPreset);
      else if (!options?.keepFilterPreset) setFilterPreset(null);
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

  // Clear all SW caches and hard-reload — equivalent to "Empty Cache & Hard Reload"
  const hardRefresh = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } finally {
      window.location.reload(true);
    }
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
    try { initPush(userObj); } catch (e) { /* non-native / no plugin */ }
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
      <NotificationsPopup user={user} />
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
        updateAvailable={updateAvailable}
        onHardRefresh={hardRefresh}
      />

      <main className="flex-1 pb-24 sm:pb-12 animate-fade-in transition-all duration-300" key={`${activePage}-${refreshKey}`}>
        <ErrorBoundary key={activePage} page={activePage}>
        {activePage === 'dashboard' && <DashboardPage setActivePage={navigate} user={user} refreshing={refreshing} />}
        {(activePage === 'devotees' || activePage === 'family') && (
          <DevoteesPage
            key={activePage}
            user={user}
            familyView={activePage === 'family'}
            devoteesPreset={devoteesPreset}
            filterPreset={filterPreset}
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
        {activePage === 'reports' && <ReportsPage setActivePage={navigate} />}
        {activePage === 'bulk-tags' && <BulkTagPage user={user} />}
        {activePage === 'family-tags' && <FamilyTagPage user={user} />}
        {activePage === 'ghari' && <GhariPage user={user} />}
        {activePage === 'swadhyay' && <SwadhyayPage user={user} />}
        {/* Seva is merged into the Calendar — keep the route as a redirect for any
            existing links/bookmarks so nothing breaks. */}
        {(activePage === 'calendar' || activePage === 'seva') && <CalendarPage user={user} />}
        {activePage === 'feed' && <FeedPage user={user} />}
        {activePage === 'data' && <DataQualityPage user={user} setActivePage={navigate} />}
        {activePage === 'account' && <AccountPage user={user} setActivePage={navigate} />}
        {activePage === 'activity' && <ActivityPage user={user} />}
        </ErrorBoundary>
      </main>

      <Footer />
    </div>
  );
}
