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
} from 'lucide-react';
import { getAllNavItems, getPrimaryMobile } from '../utils/navItems';
import { useNewFeed } from '../utils/useNewFeed';
import GlobalSearch from './GlobalSearch';

export default function Navbar({ activePage, setActivePage, user, onLogout, onBack, canBack, onRefresh, refreshing, isDarkMode, toggleDarkMode, updateAvailable, onHardRefresh, sidebarCollapsed, onToggleSidebar }) {
  const isAdmin = user?.role === 'Admin';
  const isSevak = user?.role === 'Sevak';
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  // Rotating Gujarati slogans shown in the header centre (desktop). Text is taken
  // from the app's own darshan / quote assets, so the Gujarati is accurate.
  const SLOGANS = ['જય સ્વામિનારાયણ 🙏', 'બસ, એક તું રાજી થા', 'કરીએ એ જ કામ, જેમાં તારો રાજીપો'];
  const [sloganIdx, setSloganIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSloganIdx((s) => (s + 1) % SLOGANS.length), 5000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b border-border-light bg-surface/80 backdrop-blur-xl shadow-sm">
        {/* Thin saffron→primary accent line for a premium feel */}
        <div className="h-0.5 w-full bg-gradient-to-r from-[#E56F18] via-[#FF862A] to-[#FFC08A]" />
        <div className="relative flex items-center justify-between px-4 py-2.5 sm:px-6">

          {/* Centred greeting — desktop only, fills the header without crowding the
              left/right clusters (absolutely positioned, non-interactive). */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden max-w-[46%] -translate-x-1/2 -translate-y-1/2 items-center gap-3 lg:flex">
            <span key={sloganIdx} className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-bold text-primary animate-fade-in whitespace-nowrap"
              style={{ fontFamily: '"Noto Sans Gujarati","Shruti","Gujarati Sangam MN",sans-serif' }}>
              {SLOGANS[sloganIdx]}
            </span>
            <span className="shrink-0 text-xs font-semibold text-text-muted">{todayLabel}</span>
          </div>

          {/* Left: sidebar toggle (desktop) + back + refresh + search + brand */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Desktop-only: collapse / expand the sidebar */}
            <button onClick={onToggleSidebar} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-bg-base text-text-main hover:bg-border-light dark:hover:bg-surface">
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <button onClick={onBack} disabled={!canBack} title="Back"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-bg-base text-text-main hover:bg-border-light dark:hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              onClick={onRefresh}
              onMouseDown={startLongPress} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
              onTouchStart={startLongPress} onTouchEnd={cancelLongPress}
              title="Refresh · Hold 1.5 s to hard-reload"
              className={`flex h-9 w-9 items-center justify-center rounded-xl border bg-bg-base text-text-main hover:bg-border-light dark:hover:bg-surface transition-colors ${updateAvailable ? 'border-amber-400 text-amber-500 animate-pulse' : 'border-border-light'}`}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setSearchOpen(true)} title="Search"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-bg-base text-text-main hover:bg-border-light dark:hover:bg-surface">
              <Search className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0" onClick={() => setActivePage('dashboard')}>
              <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="Akshar Connect"
                className="h-9 w-9 sm:h-12 sm:w-12 shrink-0 rounded-xl sm:rounded-2xl shadow-md ring-1 ring-border-light" />
              <div className="min-w-0 leading-tight">
                <span className="block font-display text-base sm:text-2xl font-extrabold tracking-tight whitespace-nowrap bg-gradient-to-r from-[#E56F18] via-[#FF862A] to-[#FF9D52] bg-clip-text text-transparent">
                  Akshar Connect
                </span>
                <p className="hidden sm:block text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">Connecting Devotees with Divinity</p>
              </div>
            </div>
          </div>

          {/* Right: dark mode + user badge + logout (desktop) */}
          <div className="flex items-center gap-2">
            <button onClick={toggleDarkMode} title="Toggle theme"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-bg-base text-text-main hover:bg-border-light dark:hover:bg-surface">
              {isDarkModeOn ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={() => setActivePage('account')} title="My Account"
                className="flex items-center gap-2.5 rounded-2xl border border-border-light bg-bg-base px-3.5 py-1.5 hover:border-primary transition-colors">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {user?.name?.[0] || 'U'}
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-text-main leading-tight">{user?.name || 'User'}</p>
                  <span className={`inline-block text-[10px] font-bold ${isAdmin ? 'text-red-500' : isSevak ? 'text-amber-600' : 'text-indigo-500'}`}>{user?.role || 'Devotee'}</span>
                </div>
              </button>
              <button onClick={onLogout} title="Logout"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 hover:bg-red-100 transition-colors dark:bg-red-950 dark:border-red-900">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Updates apply automatically (the app reloads itself) — a thin bar just
          reassures the user while the new version swaps in; no action needed. */}
      {updateAvailable && (
        <div className="w-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center gap-2 px-4 py-1.5 z-40">
          <RefreshCw className="h-3 w-3 animate-spin" /> Updating to the latest version…
        </div>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} user={user}
        onOpenDevotee={(id) => setActivePage('devotees', { openDevoteeId: id })} />

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

          {/* Footer: theme, hard refresh, sign out */}
          <div className="flex shrink-0 items-center gap-2 border-t border-border-light bg-surface px-3 py-3">
            <button onClick={toggleDarkMode}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border-light bg-bg-base px-3 py-3 text-sm font-semibold text-text-main hover:bg-border-light">
              {isDarkModeOn ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-400" />}
              {isDarkModeOn ? 'Light' : 'Dark'}
            </button>
            <button onClick={() => { setMoreOpen(false); onHardRefresh?.(); }} title="Clear cache & hard reload"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border-light bg-bg-base text-text-muted hover:bg-border-light">
              <RefreshCw className={`h-4 w-4 ${updateAvailable ? 'text-amber-500' : ''}`} />
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
