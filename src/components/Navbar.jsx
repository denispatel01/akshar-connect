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

  return (
    <>
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b border-border-light bg-surface/80 backdrop-blur-xl shadow-sm">
        {/* Thin saffron→primary accent line for a premium feel */}
        <div className="h-0.5 w-full bg-gradient-to-r from-[#E56F18] via-[#FF862A] to-[#FFC08A]" />
        <div className="flex items-center justify-between px-4 py-2.5 sm:px-6">

          {/* Left: sidebar toggle (desktop) + back + refresh + search + brand */}
          <div className="flex items-center gap-2">
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

            <div className="flex items-center gap-2.5 cursor-pointer min-w-0" onClick={() => setActivePage('dashboard')}>
              <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="Akshar Connect"
                className="h-10 w-10 shrink-0 rounded-2xl shadow-md ring-1 ring-border-light" />
              <div className="min-w-0">
                <img src={`${import.meta.env.BASE_URL}images/logo.webp`} alt="Akshar Connect"
                  className="hidden sm:block h-7 w-auto max-w-[190px] object-contain object-left dark:brightness-200 dark:contrast-200" />
                <span className="sm:hidden flex items-center gap-1 font-display text-base font-bold text-text-main leading-tight">
                  Akshar Connect <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
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
              {/* Red dot if admin-only items are in overflow */}
              {!moreOpen && isAdmin && (
                <span className="absolute top-2 right-[calc(50%-14px)] h-2 w-2 rounded-full bg-red-500 ring-1 ring-surface" />
              )}
              {/* Green dot when there are new Feed posts (Feed lives in this menu on mobile) */}
              {!moreOpen && hasNewFeed && (
                <span className="absolute top-2 right-[calc(50%-2px)] h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-surface" />
              )}
            </div>
            <span className={`text-[10px] font-semibold ${moreOpen || moreActive ? 'font-bold' : ''}`}>Menu</span>
          </button>
        </div>
      </div>

      {/* ── More Bottom Sheet ────────────────────────────────────────────────── */}
      {/* Backdrop */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/30 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
      )}

      {/* Sheet sits BELOW the tab bar (z-40 < z-50) so the "More" button is never
          covered by the sheet's transparent padding — otherwise taps meant to
          close it land on the sheet instead (hide appeared broken). It also
          clears the tab bar height including the safe-area inset. */}
      <div className={`md:hidden fixed left-0 right-0 z-40 transition-all duration-300 ease-out ${moreOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}>
        <div className="mx-3 mb-3 flex max-h-[75vh] flex-col overflow-hidden rounded-3xl bg-surface border border-border-light shadow-2xl">

          {/* User card → My Account (pinned header) */}
          <button onClick={() => { setMoreOpen(false); navigate('account'); }}
            className="w-full shrink-0 text-left flex items-center gap-3 px-5 py-4 bg-primary border-b border-primary/20">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-sm font-bold text-white shadow-md">
              {user?.name?.[0] || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white leading-tight truncate">{user?.name || 'User'}</p>
              <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${isAdmin ? 'bg-red-500' : isSevak ? 'bg-amber-500' : 'bg-white/25'}`}>{user?.role || 'Devotee'}</span>
            </div>
            <span className="text-[11px] font-bold text-white/70">My Account ›</span>
          </button>

          {/* Scroll region — everything below the header scrolls INSIDE the box */}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>

          {/* Nav items in More — scrollable so a long list never gets cut off */}
          {moreItems.length > 0 && (
            <div className="py-2">
              {moreItems.map(({ id, label, icon: Icon, adminOnly }) => {
                const active = activePage === id;
                return (
                  <button key={id} onClick={() => navigate(id)}
                    className={`w-full flex items-center gap-4 px-5 py-3.5 transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-text-main hover:bg-bg-base'}`}>
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-primary text-white' : 'bg-bg-base border border-border-light text-text-muted'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={`flex-1 text-sm text-left ${active ? 'font-bold' : 'font-semibold'}`}>{label}</span>
                    {id === 'feed' && hasNewFeed && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">NEW</span>}
                    {adminOnly && <span className="h-2 w-2 rounded-full bg-red-500" />}
                    <ChevronRight className={`h-4 w-4 ${active ? 'text-primary' : 'text-text-muted'}`} />
                  </button>
                );
              })}
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-border-light mx-4" />

          {/* Utilities row */}
          <div className="flex items-center gap-2 px-4 py-3">
            <button onClick={toggleDarkMode}
              className="flex flex-1 items-center gap-3 rounded-2xl border border-border-light bg-bg-base px-4 py-3 text-sm font-semibold text-text-main transition-colors hover:bg-border-light">
              {isDarkModeOn ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-400" />}
              {isDarkModeOn ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button onClick={() => { setMoreOpen(false); onHardRefresh?.(); }}
              className="flex items-center justify-center h-12 w-12 rounded-2xl border border-border-light bg-bg-base text-text-muted hover:bg-border-light transition-colors"
              title="Clear cache & hard reload">
              <RefreshCw className={`h-4 w-4 ${updateAvailable ? 'text-amber-500' : ''}`} />
            </button>
          </div>

          {/* Logout */}
          <div className="px-4 pb-4">
            <button onClick={() => { setMoreOpen(false); onLogout(); }}
              className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 px-4 py-3.5 text-sm font-bold text-red-500 hover:bg-red-100 dark:hover:bg-red-900 transition-colors">
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
          </div>{/* /scroll region */}
        </div>
      </div>
      </>,
      document.body)}
    </>
  );
}
