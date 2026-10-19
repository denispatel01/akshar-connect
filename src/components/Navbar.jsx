import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LogOut,
  Moon,
  Sun,
  ArrowLeft,
  RefreshCw,
  Menu,
  X,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
} from 'lucide-react';
import { getAllNavItems, getPrimaryMobile } from '../utils/navItems';
import { useNewFeed } from '../utils/useNewFeed';
import GlobalSearch from './GlobalSearch';
import { dataService } from '../services/dataService';
import { isBirthdayToday } from '../utils/birthdays';

export default function Navbar({ activePage, setActivePage, user, onLogout, onBack, canBack, onRefresh, refreshing, isDarkMode, toggleDarkMode, updateAvailable, onHardRefresh, sidebarCollapsed, onToggleSidebar }) {
  const isAdmin = user?.role === 'Admin';
  const isSevak = user?.role === 'Sevak';
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // The Home page's search bar (and any other entry point) opens global search by
  // firing this event, so we don't have to thread a callback through the app.
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener('ac-open-search', open);
    return () => window.removeEventListener('ac-open-search', open);
  }, []);

  // Lock the page behind the Menu sheet so dragging inside the sheet scrolls the
  // sheet — not the background screen.
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [moreOpen]);

  // Make the Menu easy to close: Esc, and the phone's Back button / gesture.
  // Opening pushes a history entry so Back simply dismisses the Menu instead of
  // leaving the app.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false); };
    const onPop = () => setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    window.history.pushState({ acMenu: true }, '');
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      // If we're closing for a reason other than Back, remove the entry we pushed.
      if (window.history.state && window.history.state.acMenu) window.history.back();
    };
  }, [moreOpen]);

  // Swipe-down-to-dismiss. `drag` is how far the sheet has been pulled down (px).
  const [drag, setDrag] = useState(0);
  const dragStart = useRef(null);
  const onDragStart = (e) => { dragStart.current = e.touches ? e.touches[0].clientY : e.clientY; };
  const onDragMove = (e) => {
    if (dragStart.current == null) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    setDrag(Math.max(0, y - dragStart.current));
  };
  const onDragEnd = () => {
    if (dragStart.current == null) return;
    const far = drag > 110;
    dragStart.current = null;
    setDrag(0);
    if (far) setMoreOpen(false);
  };

  const [hasNewFeed, clearNewFeed] = useNewFeed();

  // Lightweight "something to see" dot on the bell — announcements or a birthday today.
  const [hasNotifs, setHasNotifs] = useState(false);
  useEffect(() => {
    const check = () => {
      try {
        const anns = (dataService.getCachedAnnouncements?.() || []);
        const bday = (dataService.getDevotees?.() || []).some((d) => isBirthdayToday(d.dob));
        setHasNotifs(anns.length > 0 || bday);
      } catch { /* ignore */ }
    };
    check();
    window.addEventListener('ac-push-received', check);
    return () => window.removeEventListener('ac-push-received', check);
  }, []);

  const longPressTimer = useRef(null);
  const startLongPress = () => { longPressTimer.current = setTimeout(() => onHardRefresh?.(), 1500); };
  const cancelLongPress = () => { clearTimeout(longPressTimer.current); };

  // ── Mobile: 3 core tabs + a Menu (hamburger). Everything else goes in the Menu,
  // so adding modules never makes the bar taller/crowded. ──────────────────────
  const primaryMobile = getPrimaryMobile(user);

  // The Menu holds every nav item that isn't a primary tab — nothing is lost.
  const primaryIds = new Set(primaryMobile.map((i) => i.id));
  const moreItems = getAllNavItems(user).filter((i) => !primaryIds.has(i.id));

  // Is the active page inside the "More" sheet?
  const moreActive = moreItems.some((i) => i.id === activePage);

  const navigate = (id) => { if (id === 'feed') clearNewFeed(); setActivePage(id); setMoreOpen(false); };

  const isDarkModeOn = isDarkMode;

  return (
    <>
      {/* ── Top Header — single row ────────────────────────────────────────────
          Light theme: white header, the logo sits directly (no chip), dark icons.
          Dark theme: flat dark surface; the light-background logo goes on a white
          chip so it stays readable. A saffron accent line runs along the bottom. */}
      <header className="sticky top-0 z-40 w-full bg-white text-[#0A2E52] shadow-sm border-b border-black/5 dark:bg-[#0B1322] dark:text-white dark:border-white/10">
        <div className="relative flex items-center gap-2 px-3 py-2 sm:px-5 sm:py-2.5">
          {/* Left: sidebar toggle (desktop) + back + "Akshar Connect" wordmark text */}
          <button onClick={onToggleSidebar} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden md:flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#0A2E52]/70 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/10">
            {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          <button onClick={onBack} disabled={!canBack} title="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#0A2E52]/90 hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed">
            <ArrowLeft className="h-5 w-5" />
          </button>
          {/* Brand: temple icon + "Akshar Connect" wordmark, left-aligned (tap → Home).
              Both the cropped temple-logo.png and the wordmark fill their boxes, so an
              equal box height gives equal visible heights. Dark mode: white chip. */}
          <button onClick={() => setActivePage('dashboard')} title="Akshar Connect — Home"
            className="z-10 flex min-w-0 shrink items-center gap-1.5 leading-none dark:rounded-xl dark:bg-white/95 dark:px-1.5 dark:py-1 sm:gap-2.5">
            <img src={`${import.meta.env.BASE_URL}images/temple-logo.png`} alt=""
              className="h-6 w-auto shrink-0 rounded-lg object-contain sm:h-9" />
            {/* The wordmark is very wide (~8:1); cap its width on phones so it can never
                run under the right-side icons. object-contain keeps temple+wordmark the
                same height until the cap kicks in on very narrow screens. */}
            <img src={`${import.meta.env.BASE_URL}images/wordmark.webp`} alt="Akshar Connect"
              className="h-6 w-auto max-w-[52vw] object-contain sm:h-9 sm:max-w-none" />
          </button>

          {/* Right: search + notifications + theme toggle (+ account/logout on desktop) */}
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
            {/* Search: on phones the Home page's search bar is the entry point, so the
                header icon is desktop-only to give the brand room. */}
            <button onClick={() => setSearchOpen(true)} title="Search"
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl text-[#0A2E52]/90 hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10">
              <Search className="h-5 w-5" />
            </button>
            <button onClick={() => window.dispatchEvent(new Event('ac-open-notifications'))} title="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[#0A2E52]/90 hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10">
              <Bell className="h-5 w-5" />
              {hasNotifs && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#FF5A3D] ring-2 ring-white dark:ring-[#0B1322]" />}
            </button>
            {/* Single theme toggle — shows the icon of the theme you'd switch TO
                (moon in light mode, sun in dark mode). */}
            <button onClick={toggleDarkMode} title={isDarkModeOn ? 'Switch to light theme' : 'Switch to dark theme'}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[#0A2E52]/90 hover:bg-black/5 dark:text-white/90 dark:hover:bg-white/10">
              {isDarkModeOn ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="hidden sm:flex items-center gap-1.5">
              <button onClick={() => setActivePage('account')} title="My Account"
                className="flex items-center gap-2 rounded-2xl border border-black/10 bg-black/[0.04] px-3 py-1.5 hover:border-primary transition-colors dark:border-white/15 dark:bg-white/5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {user?.name?.[0] || 'U'}
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-[#0A2E52] leading-tight dark:text-white">{user?.name || 'User'}</p>
                  <span className={`inline-block text-[10px] font-bold ${isAdmin ? 'text-red-600 dark:text-red-300' : isSevak ? 'text-amber-600 dark:text-amber-300' : 'text-indigo-600 dark:text-indigo-300'}`}>{user?.role || 'Devotee'}</span>
                </div>
              </button>
              <button onClick={onLogout} title="Logout"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-300/60 bg-red-50 text-red-600 hover:bg-red-100 transition-colors dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        {/* Saffron accent line along the bottom */}
        <div className="h-[3px] w-full bg-gradient-to-r from-[#E56F18] via-[#FF862A] to-[#FFC08A]" />
      </header>

      {/* Updates apply automatically (the app reloads itself) — a thin bar just
          reassures the user while the new version swaps in; no action needed. */}
      {updateAvailable && (
        <div className="w-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center gap-2 px-4 py-1.5 z-40">
          <RefreshCw className="h-3 w-3 animate-spin" /> Updating to the latest version…
        </div>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} user={user}
        onOpenDevotee={(id) => setActivePage('devotees', { openDevoteeId: id })}
        onNavigate={(page, params) => setActivePage(page, params)} />

      {/* Mobile bottom bar + Menu sheet are rendered via a portal on <body> so no
          transformed/animated ancestor can ever turn their `fixed` positioning into
          `absolute` (which made the bar scroll with the page on some phones). */}
      {createPortal(
      <>
      {/* ── Mobile Bottom Tab Bar ────────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border-light shadow-[0_-2px_16px_rgba(0,0,0,0.08)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch">

          {/* Primary tabs */}
          {primaryMobile.map(({ id, label, icon: Icon }) => {
            const active = activePage === id && !moreOpen;
            return (
              <button key={id} onClick={() => { setMoreOpen(false); setActivePage(id); }}
                className={`flex flex-col items-center justify-center flex-1 py-2.5 gap-1 transition-colors ${active ? 'text-primary' : 'text-text-muted'}`}>
                <div className={`flex items-center justify-center h-7 w-12 rounded-2xl transition-all duration-200 ${active ? 'bg-primary/10' : ''}`}>
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.8} />
                </div>
                <span className={`text-[10px] font-semibold ${active ? 'font-bold' : ''}`}>{label}</span>
              </button>
            );
          })}

          {/* More button — always shown */}
          <button onClick={() => setMoreOpen((o) => !o)}
            className={`flex flex-col items-center justify-center flex-1 py-2.5 gap-1 transition-colors relative ${moreOpen || moreActive ? 'text-primary' : 'text-text-muted'}`}>
            <div className={`flex items-center justify-center h-7 w-12 rounded-2xl transition-all duration-200 ${moreOpen || moreActive ? 'bg-primary/10' : ''}`}>
              {moreOpen ? <X className="h-5 w-5" strokeWidth={2.5} /> : <Menu className="h-5 w-5" strokeWidth={1.8} />}
            </div>
            <span className={`text-[10px] font-semibold ${moreOpen || moreActive ? 'font-bold' : ''}`}>Menu</span>
          </button>
        </div>
      </div>

      {/* ── Full-screen Menu ─────────────────────────────────────────────────── */}
      {/* Opens as its OWN screen (not a popup), covering the whole viewport incl.
          the bottom bar, with every item shown as a tile so nothing is hidden
          behind a scroll. */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-bg-base"
          style={{
            paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
            transform: drag ? `translateY(${drag}px)` : undefined,
            transition: dragStart.current == null ? 'transform 0.2s ease' : 'none',
          }}>

          {/* Grab handle + "swipe down / tap to close" — the whole top strip is a
              big, easy close target (drag it down, or just tap it). */}
          <div className="shrink-0 cursor-pointer select-none bg-primary pt-2"
            onClick={() => setMoreOpen(false)}
            onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
            onMouseDown={onDragStart} onMouseMove={onDragMove} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}>
            <div className="mx-auto h-1.5 w-12 rounded-full bg-white/50" />
            <p className="py-1 text-center text-[10px] font-bold uppercase tracking-wider text-white/70">Swipe down or tap here to close</p>
          </div>

          {/* Header: My Account + close */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border-light bg-primary px-4 pb-3 pt-1">
            <button onClick={() => { setMoreOpen(false); navigate('account'); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-sm font-bold text-white shadow-md">{user?.name?.[0] || 'U'}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold leading-tight text-white">{user?.name || 'User'}</p>
                <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${isAdmin ? 'bg-red-500' : isSevak ? 'bg-amber-500' : 'bg-white/25'}`}>{user?.role || 'Devotee'}</span>
              </div>
              <span className="text-[11px] font-bold text-white/70">My Account ›</span>
            </button>
            <button onClick={() => setMoreOpen(false)} aria-label="Close menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-white hover:bg-white/25">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tile grid — sized to fit on one screen (auto-rows share the height). */}
          <div className="grid flex-1 content-start grid-cols-3 gap-2.5 overflow-y-auto p-3">
            {moreItems.map(({ id, label, icon: Icon, adminOnly }) => {
              const active = activePage === id;
              return (
                <button key={id} onClick={() => navigate(id)}
                  className={`relative flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border-light bg-surface text-text-main hover:bg-bg-base'}`}>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? 'bg-primary text-white' : 'bg-bg-base border border-border-light text-text-muted'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-bold leading-tight">{label}</span>
                  {id === 'feed' && hasNewFeed && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500" />}
                  {adminOnly && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
                </button>
              );
            })}
          </div>

          {/* Footer: theme, refresh, sign out. Refresh = tap to refresh, hold 1.5s
              to clear cache & hard-reload (this is where the header ⟳ moved to). */}
          <div className="flex shrink-0 items-center gap-2 border-t border-border-light bg-surface px-3 py-3">
            <button onClick={toggleDarkMode}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border-light bg-bg-base px-3 py-3 text-sm font-semibold text-text-main hover:bg-border-light">
              {isDarkModeOn ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-400" />}
              {isDarkModeOn ? 'Light' : 'Dark'}
            </button>
            <button
              onClick={() => { setMoreOpen(false); onRefresh?.(); }}
              onMouseDown={startLongPress} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
              onTouchStart={startLongPress} onTouchEnd={cancelLongPress}
              title="Refresh · Hold 1.5 s to clear cache & hard-reload"
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border bg-bg-base px-3 py-3 text-sm font-semibold text-text-main hover:bg-border-light ${updateAvailable ? 'border-amber-400 text-amber-600 dark:text-amber-400' : 'border-border-light'}`}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''} ${updateAvailable ? 'text-amber-500' : ''}`} />
              {updateAvailable ? 'Update' : 'Refresh'}
            </button>
            <button onClick={() => { setMoreOpen(false); onLogout(); }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-bold text-red-500 hover:bg-red-100 dark:border-red-900 dark:bg-red-950">
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>

          {/* Big, thumb-reachable Close — no need to reach the top-right ✕. */}
          <button onClick={() => setMoreOpen(false)}
            className="mx-3 mb-3 flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-text-main/90 py-3.5 text-sm font-black text-bg-base active:scale-[0.99]">
            <X className="h-4 w-4" /> Close menu
          </button>
        </div>
      )}
      </>,
      document.body)}
    </>
  );
}
