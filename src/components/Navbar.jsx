import React from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  PhoneCall,
  QrCode,
  FileSpreadsheet,
  Mail,
  Settings,
  LogOut,
  User,
  Moon,
  Sun,
  Sparkles,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';

export default function Navbar({ activePage, setActivePage, user, onLogout, onBack, canBack, onRefresh, refreshing, isDarkMode, toggleDarkMode }) {
  const navItems = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'devotees', label: 'Directory', icon: Users },
    ...(user?.role === 'Admin' || user?.role === 'Sevak'
      ? [
          { id: 'followups', label: 'Calls', icon: PhoneCall },
          { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
          { id: 'email', label: 'Email', icon: Mail },
          { id: 'admin', label: 'Admin', icon: Settings }
        ]
      : [])
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border-light bg-surface/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              disabled={!canBack}
              title="Back"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-bg-base text-text-main hover:bg-border-light dark:hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              onClick={onRefresh}
              title="Refresh data"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-bg-base text-text-main hover:bg-border-light dark:hover:bg-surface"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Brand Logo */}
            <div className="flex items-center gap-2.5 cursor-pointer min-w-0" onClick={() => setActivePage('dashboard')}>
              <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="Akshar Connect"
                className="h-10 w-10 shrink-0 rounded-2xl shadow-md ring-1 ring-border-light" />
              <div className="min-w-0">
                <img src={`${import.meta.env.BASE_URL}images/logo.webp`} alt="Akshar Connect"
                  className="hidden sm:block h-7 w-auto max-w-[190px] object-contain object-left dark:brightness-200 dark:contrast-200" />
                <span className="sm:hidden flex items-center gap-1 font-display text-base font-bold text-text-main leading-tight">
                  Akshar Connect <span className="h-1.5 w-1.5 rounded-full bg-accent"></span>
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-bg-base p-1 rounded-2xl border border-border-light">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
                    active
                      ? 'bg-surface text-text-main shadow-sm'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-accent' : ''}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* User Badge & Utilities */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              title="Toggle Theme"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-bg-base text-text-main hover:bg-border-light dark:hover:bg-surface"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="hidden sm:flex items-center gap-3">
              <div className="flex items-center gap-2.5 rounded-2xl border border-border-light bg-bg-base px-3.5 py-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {user?.name?.[0] || 'U'}
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-text-main leading-tight">{user?.name || 'User'}</p>
                  <span className={`inline-block text-[10px] font-bold ${user?.role === 'Admin' ? 'text-red-500' : user?.role === 'Sevak' ? 'text-amber-600' : 'text-text-muted'}`}>
                    {user?.role || 'Devotee'}
                  </span>
                </div>
              </div>

              <button
                onClick={onLogout}
                title="Logout"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 hover:bg-red-100 transition-colors dark:bg-red-950 dark:border-red-900"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-surface border-t border-border-light pb-safe px-2 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`flex flex-col items-center justify-center w-full py-2 ${
                active ? 'text-primary' : 'text-text-muted'
              }`}
            >
              <div className={`flex items-center justify-center h-8 w-14 rounded-full transition-colors ${active ? 'bg-bg-base' : 'bg-transparent'}`}>
                <Icon className={`h-5 w-5 ${active ? 'text-primary fill-primary/10' : ''}`} strokeWidth={active ? 2.5 : 2} />
              </div>
              <span className="text-[10px] font-semibold mt-1">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={onLogout}
          className="flex flex-col items-center justify-center w-full py-2 text-text-muted"
        >
          <div className="flex items-center justify-center h-8 w-14 rounded-full bg-transparent">
            <LogOut className="h-5 w-5" strokeWidth={2} />
          </div>
          <span className="text-[10px] font-semibold mt-1">Logout</span>
        </button>
      </div>
    </>
  );
}
