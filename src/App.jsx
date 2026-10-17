import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import GlobalInputClear from './components/GlobalInputClear';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevoteesPage from './pages/DevoteesPage';
import FollowupsPage from './pages/FollowupsPage';
import AdminPage from './pages/AdminPage';
import ReportsPage from './pages/ReportsPage';
import BulkTagPage from './pages/BulkTagPage';
import FamilyTagPage from './pages/FamilyTagPage';
import GhariPage from './pages/GhariPage';
import LeaderboardPage from './pages/LeaderboardPage';
import BusPage from './pages/BusPage';
import AppUsagePage from './pages/AppUsagePage';
import AccountPage from './pages/AccountPage';
import ActivityPage from './pages/ActivityPage';
import SwadhyayPage from './pages/SwadhyayPage';
import CalendarPage from './pages/CalendarPage';
import DataQualityPage from './pages/DataQualityPage';
import FeedPage from './pages/FeedPage';
import EmailPage from './pages/EmailPage';
import VatoPage from './pages/VatoPage';
import AttendancePage from './pages/AttendancePage';
import ComingSoonPage from './pages/ComingSoonPage';
import Footer from './components/Footer';
import ScrollHelper from './components/ScrollHelper';
import ErrorBoundary from './components/ErrorBoundary';
import NotificationsPopup from './components/NotificationsPopup';
import { dataService } from './services/dataService';
import { initPush } from './services/pushService';
import { installProperCase } from './utils/properCase';

export default function App() {
  // Restore the saved session synchronously so a returning user goes straight
  // to the app — no re-login, no flash of the sign-in screen.
  const [user, setUser] = useState(() => dataService.getCurrentSession());
  // "View as" — an Admin can preview the app as another user (their role, menus
  // and screens). The real `user` stays the signed-in admin (backend auth and the
  // Exit control use it); `effectiveUser` is what the UI renders as. Only an Admin
  // can start it, and a persistent banner makes the impersonation impossible to miss.
  const [viewAs, setViewAs] = useState(null);
  const realIsAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';
  const effectiveUser = (realIsAdmin && viewAs) ? viewAs : user;
  const startViewAs = (u) => { if (realIsAdmin && u) { setViewAs(u); setActivePage('dashboard'); setHistory([]); try { dataService.breadcrumb(`view-as ${u.name}`); } catch (e) {} } };
  const exitViewAs = () => { setViewAs(null); setActivePage('dashboard'); setHistory([]); };
  // Deep-link from a push notification: ?n=<page> opens that section on launch.
  const initialPage = (() => {
    try {
      const n = new URLSearchParams(window.location.search).get('n');
      const allowed = ['vato', 'feed', 'swadhyay', 'calendar', 'devotees', 'dashboard'];
      if (n && allowed.includes(n)) {
        // Clean the URL so a later refresh doesn't re-trigger it.
        try { window.history.replaceState({}, '', window.location.pathname); } catch (e) {}
        return n;
      }
    } catch (e) {}
    return 'dashboard';
  })();
  const [activePage, setActivePage] = useState(initialPage);
  // Register for push on launch when a session is already restored.
  useEffect(() => { if (user) { try { initPush(user); } catch (e) {} } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // iOS push deep-link recovery. On iOS the notificationclick target URL is
  // dropped when the PWA was killed — iOS reopens the app at start_url, losing
  // ?n=. The service worker instead stashes the target section in the Cache API;
  // read it here on boot and route there. We poll briefly because the app launch
  // and the SW's click handler race, and only honor a FRESH stash (< 60s) so an
  // old tap can't hijack a normal open.
  useEffect(() => {
    let cancelled = false;
    const allowed = ['vato', 'feed', 'swadhyay', 'calendar', 'devotees', 'dashboard'];
    const tryRead = async () => {
      try {
        if (!('caches' in window)) return true; // nothing to read, stop
        const cache = await caches.open('ac-deeplink');
        const res = await cache.match('pending');
        if (!res) return false; // not written yet — keep polling
        const { page, ts } = await res.json();
        await cache.delete('pending');
        if (!cancelled && page && allowed.includes(page) && (Date.now() - ts) < 60000) {
          setActivePage(page);
        }
        return true;
      } catch (e) { return true; }
    };
    (async () => {
      for (let i = 0; i < 8 && !cancelled; i++) {
        if (await tryRead()) return;
        await new Promise(r => setTimeout(r, 300));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // App-wide: tidy text inputs to proper case on blur (skips email/PIN/number/
  // search/date inputs, textareas, and any field marked data-nocase).
  useEffect(() => installProperCase(), []);

  // Non-blocking "loading" awareness: a thin top bar shows during a manual refresh
  // and briefly whenever the page changes, so the user knows something is loading
  // without being blocked from interacting.
  const [navPulse, setNavPulse] = useState(false);
  useEffect(() => {
    setNavPulse(true);
    const t = setTimeout(() => setNavPulse(false), 700);
    return () => clearTimeout(t);
  }, [activePage]);
  // App-wide data-loading indicator: any in-flight backend request keeps the thin
  // top bar visible (non-blocking — the user can keep interacting). Driven by the
  // 'ac-loading' event dispatched from dataService's api() in-flight counter.
  const [dataLoading, setDataLoading] = useState(false);
  useEffect(() => {
    const onLoading = (e) => setDataLoading(!!e?.detail?.loading);
    window.addEventListener('ac-loading', onLoading);
    return () => window.removeEventListener('ac-loading', onLoading);
  }, []);
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
      try { dataService.breadcrumb(`open ${page}`); } catch (e) {}
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

  // Desktop sidebar collapse — remembered across sessions.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('ac-sidebar-collapsed') === 'true'; } catch (e) { return false; }
  });
  const toggleSidebar = () => setSidebarCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem('ac-sidebar-collapsed', String(next)); } catch (e) {}
    return next;
  });

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
      {/* Non-blocking top loading bar */}
      <div className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-[#FF862A]/10 transition-opacity duration-200 ${(refreshing || navPulse || dataLoading) ? 'opacity-100' : 'opacity-0'}`}>
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#FF862A] to-transparent" style={{ animation: 'ac-progress 0.9s linear infinite' }} />
      </div>
      {/* View-as banner — always visible while impersonating, with a one-tap exit. */}
      {viewAs && realIsAdmin && (
        <div className="sticky top-0 z-[55] flex items-center justify-center gap-2 bg-indigo-600 px-4 py-1.5 text-center text-[12px] font-bold text-white">
          <span>👁️ Viewing as <b>{viewAs.name}</b> ({viewAs.role}) — changes you make are saved as yourself.</span>
          <button onClick={exitViewAs} className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-black hover:bg-white/30">Exit</button>
        </div>
      )}
      <NotificationsPopup user={effectiveUser} onNavigate={navigate} />
      <GlobalInputClear />
      <Navbar
        activePage={activePage}
        setActivePage={navigate}
        user={effectiveUser}
        onLogout={handleLogout}
        onBack={goBack}
        canBack={history.length > 0}
        onRefresh={refresh}
        refreshing={refreshing}
        isDarkMode={isDarkMode}
        toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        updateAvailable={updateAvailable}
        onHardRefresh={hardRefresh}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
      />

      {/* Desktop app shell: left sidebar + content column. On mobile the sidebar is
          hidden (Navbar's bottom bar handles nav) and this is just the content. */}
      <div className="flex flex-1 min-h-0">
        <Sidebar
          activePage={activePage}
          setActivePage={navigate}
          user={effectiveUser}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
        />

        {/* Content column reserves the fixed sidebar's width on desktop (so the
            sidebar stays put while the page scrolls). */}
        <div className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ${sidebarCollapsed ? 'md:pl-[72px]' : 'md:pl-60'}`}>
      <main className="flex-1 pb-24 sm:pb-12 animate-fade-in transition-all duration-300" key={`${activePage}-${refreshKey}`}>
        <ErrorBoundary key={activePage} page={activePage}>
        {activePage === 'dashboard' && <DashboardPage setActivePage={navigate} user={effectiveUser} refreshing={refreshing} />}
        {(activePage === 'devotees' || activePage === 'family') && (
          <DevoteesPage
            key={activePage}
            user={effectiveUser}
            familyView={activePage === 'family'}
            devoteesPreset={devoteesPreset}
            filterPreset={filterPreset}
            onClearDevoteesPreset={() => setDevoteesPreset(null)}
            openDevoteeId={openDevoteeId}
            onClearOpenDevotee={() => setOpenDevoteeId(null)}
            refreshing={refreshing}
          />
        )}
        {activePage === 'followups' && <FollowupsPage user={effectiveUser} refreshing={refreshing} />}
        {activePage === 'email' && <EmailPage user={effectiveUser} />}
        {activePage === 'admin' && <AdminPage user={effectiveUser} onViewAs={startViewAs} />}
        {activePage === 'sabhas' && <ComingSoonPage title="Events & Attendance" />}
        {activePage === 'qr-scanner' && <ComingSoonPage title="QR Scanner" />}
        {activePage === 'reports' && <ReportsPage setActivePage={navigate} />}
        {activePage === 'bulk-tags' && <BulkTagPage user={effectiveUser} />}
        {activePage === 'family-tags' && <FamilyTagPage user={effectiveUser} />}
        {activePage === 'ghari' && <GhariPage user={effectiveUser} />}
        {activePage === 'leaderboard' && <LeaderboardPage user={effectiveUser} />}
        {activePage === 'bus' && <BusPage user={effectiveUser} />}
        {activePage === 'app-usage' && <AppUsagePage user={effectiveUser} />}
        {activePage === 'swadhyay' && <SwadhyayPage user={effectiveUser} />}
        {/* Seva is merged into the Calendar — keep the route as a redirect for any
            existing links/bookmarks so nothing breaks. */}
        {(activePage === 'calendar' || activePage === 'seva') && <CalendarPage user={effectiveUser} />}
        {activePage === 'feed' && <FeedPage user={effectiveUser} />}
        {activePage === 'vato' && <VatoPage user={effectiveUser} />}
        {activePage === 'attendance' && <AttendancePage user={effectiveUser} />}
        {activePage === 'data' && <DataQualityPage user={effectiveUser} setActivePage={navigate} />}
        {activePage === 'account' && <AccountPage user={effectiveUser} setActivePage={navigate} />}
        {activePage === 'activity' && <ActivityPage user={effectiveUser} />}
        </ErrorBoundary>
      </main>

          <Footer />
        </div>
      </div>
      <ScrollHelper />
    </div>
  );
}
