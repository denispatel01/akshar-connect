import React, { useRef, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  FileSpreadsheet,
  Mail,
  Settings,
  LogOut,
  User,
  Moon,
  Sun,
  ArrowLeft,
  RefreshCw,
  Tags,
  Tag,
  MoreHorizontal,
  X,
  ChevronRight,
} from 'lucide-react';

export default function Navbar({ activePage, setActivePage, user, onLogout, onBack, canBack, onRefresh, refreshing, isDarkMode, toggleDarkMode, updateAvailable, onHardRefresh }) {
  const isDevotee = user?.role === 'Devotee';
  const isAdmin = user?.role === 'Admin';
  const isSevak = user?.role === 'Sevak';
  const [moreOpen, setMoreOpen] = useState(false);

  const longPressTimer = useRef(null);
  const startLongPress = () => { longPressTimer.current = setTimeout(() => onHardRefresh?.(), 1500); };
  const cancelLongPress = () => { clearTimeout(longPressTimer.current); };

  // ── Desktop nav: all items ──────────────────────────────────────────────────
  const allNavItems = isDevotee
    ? [
        { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
        { id: 'devotees', label: 'My Profile', icon: User },
      ]
    : [
        { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
        { id: 'devotees', label: 'Directory', icon: Users },
        ...(isAdmin || isSevak
          ? [
              { id: 'followups', label: 'Follow-up', icon: PhoneCall },
              { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
              { id: 'email', label: 'Email', icon: Mail },
            ]
          : []),
        ...(isAdmin || isSevak
          ? [{ id: 'bulk-tags', label: 'Bulk Tags', icon: Tag }]
          : []),
        ...(isAdmin
          ? [
              { id: 'family-tags', label: 'Family Tags', icon: Tags, adminOnly: true },
              { id: 'admin', label: 'Admin', icon: Settings, adminOnly: true },
            ]
          : []),
      ];

  // ── Mobile: primary tabs (max 4) + overflow into More sheet ────────────────
  const primaryMobile = isDevotee
    ? [
        { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
        { id: 'devotees', label: 'My Profile', icon: User },
      ]
    : [
        { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
        { id: 'devotees', label: 'Directory', icon: Users },
        ...(isAdmin || isSevak ? [{ id: 'followups', label: 'Follow-up', icon: PhoneCall }] : []),
      ];

  const moreItems = isDevotee
    ? []
    : [
        ...(isAdmin || isSevak ? [
          { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
          { id: 'email', label: 'Email', icon: Mail },
          { id: 'bulk-tags', label: 'Bulk Tags', icon: Tag },
        ] : []),
        ...(isAdmin ? [
          { id: 'family-tags', label: 'Family Tags', icon: Tags, adminOnly: true },
          { id: 'admin', label: 'Admin', icon: Settings, adminOnly: true },
        ] : []),
      ];

  // Is the active page inside the "More" sheet?
  const moreActive = moreItems.some((i) => i.id === activePage);

  const navigate = (id) => { setActivePage(id); setMoreOpen(false); };

  const roleColor = isAdmin ? 'text-red-500' : isSevak ? 'text-amber-600' : 'text-indigo-500';
  const roleBg   = isAdmin ? 'bg-red-50 dark:bg-red-950' : isSevak ? 'bg-amber-50 dark:bg-amber-950' : 'bg-indigo-50 dark:bg-indigo-950';

  return (
    <>
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b border-border-light bg-surface/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">

          {/* Left: back + refresh + brand */}
          <div className="flex items-center gap-2">
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

          {/* Centre: desktop nav */}
          <nav className="hidden md:flex items-center gap-1 bg-bg-base p-1 rounded-2xl border border-border-light">
            {allNavItems.map(({ id, label, icon: Icon, adminOnly }) => {
              const active = activePage === id;
              return (
                <button key={id} onClick={() => setActivePage(id)}
                  className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${active ? 'bg-surface text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
                  <Icon className={`h-4 w-4 ${active ? 'text-accent' : ''}`} />
                  {label}
                  {adminOnly && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 ring-1 ring-bg-base" />}
                </button>
              );
            })}
          </nav>

          {/* Right: dark mode + user badge + logout (desktop) */}
          <div className="flex items-center gap-2">
            <button onClick={toggleDarkMode} title="Toggle theme"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-bg-base text-text-main hover:bg-border-light dark:hover:bg-surface">
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={() => setActivePage('account')} title="My Account"
                className="flex items-center gap-2.5 rounded-2xl border border-border-light bg-bg-base px-3.5 py-1.5 hover:border-primary transition-colors">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {user?.name?.[0] || 'U'}
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-text-main leading-tight">{user?.name || 'User'}</p>
                  <span className={`inline-block text-[10px] font-bold ${roleColor}`}>{user?.role || 'Devotee'}</span>
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

      {/* Update banner */}
      {updateAvailable && (
        <div className="w-full bg-amber-500 text-white text-xs font-bold flex items-center justify-between px-4 py-2 z-40">
          <span>New update available</span>
          <button onClick={onHardRefresh} className="ml-4 rounded-lg bg-white/20 px-3 py-1 font-bold hover:bg-white/30 shrink-0">
            Update Now
          </button>
        </div>
      )}

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
              {moreOpen ? <X className="h-5 w-5" strokeWidth={2.5} /> : <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />}
              {/* Red dot if admin-only items are in overflow */}
              {!moreOpen && isAdmin && (
                <span className="absolute top-2 right-[calc(50%-14px)] h-2 w-2 rounded-full bg-red-500 ring-1 ring-surface" />
              )}
            </div>
            <span className={`text-[10px] font-semibold ${moreOpen || moreActive ? 'font-bold' : ''}`}>More</span>
          </button>
        </div>
      </div>

      {/* ── More Bottom Sheet ────────────────────────────────────────────────── */}
      {/* Backdrop */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
      )}

      <div className={`md:hidden fixed left-0 right-0 z-50 transition-all duration-300 ease-out ${moreOpen ? 'bottom-[56px] translate-y-0 opacity-100' : 'bottom-[56px] translate-y-full opacity-0 pointer-events-none'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-3 mb-3 rounded-3xl bg-surface border border-border-light shadow-2xl overflow-hidden">

          {/* User card → My Account */}
          <button onClick={() => { setMoreOpen(false); navigate('account'); }}
            className="w-full text-left flex items-center gap-3 px-5 py-4 bg-primary border-b border-primary/20">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-sm font-bold text-white shadow-md">
              {user?.name?.[0] || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white leading-tight truncate">{user?.name || 'User'}</p>
              <span className={`text-[11px] font-bold ${isAdmin ? 'text-red-300' : isSevak ? 'text-amber-300' : 'text-indigo-200'}`}>{user?.role || 'Devotee'}</span>
            </div>
            <span className="text-[11px] font-bold text-white/70">My Account ›</span>
          </button>

          {/* Nav items in More */}
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
              {isDarkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-400" />}
              {isDarkMode ? 'Light Mode' : 'Dark Mode'}
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
        </div>
      </div>
    </>
  );
}
