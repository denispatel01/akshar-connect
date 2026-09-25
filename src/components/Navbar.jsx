import React, { useState } from 'react';
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
  Menu,
  X,
  Sparkles,
  ShieldAlert,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';

export default function Navbar({ activePage, setActivePage, user, onLogout, onBack, canBack, onRefresh, refreshing }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'devotees', label: 'Devotees', icon: Users },
    ...(user?.role === 'Admin' || user?.role === 'Sevak'
      ? [
          { id: 'followups', label: 'Follow-ups', icon: PhoneCall },
          { id: 'email', label: 'Email', icon: Mail },
          { id: 'admin', label: 'Admin Settings', icon: Settings }
        ]
      : [])
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#E0EAF4] bg-white/95 backdrop-blur-md shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
       <div className="flex items-center gap-2">
        {/* Back & Refresh (essential for standalone / home-screen app) */}
        <button
          onClick={onBack}
          disabled={!canBack}
          title="Back"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E4EBF3] bg-[#F0F4F8] text-[#003158] hover:bg-[#E4EBF3] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onRefresh}
          title="Refresh data"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E4EBF3] bg-[#F0F4F8] text-[#003158] hover:bg-[#E4EBF3]"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Brand Logo */}
        <div className="flex items-center gap-2.5 cursor-pointer min-w-0" onClick={() => setActivePage('dashboard')}>
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="Akshar Connect"
            className="h-10 w-10 shrink-0 rounded-2xl shadow-md ring-1 ring-[#E4EBF3]" />
          <div className="min-w-0">
            <img src={`${import.meta.env.BASE_URL}images/logo.webp`} alt="Akshar Connect — Connecting Devotees with Divinity"
              className="hidden sm:block h-7 w-auto max-w-[190px] object-contain object-left" />
            <span className="sm:hidden flex items-center gap-1 font-display text-base font-bold text-[#003158] leading-tight">
              Akshar Connect <span className="h-1.5 w-1.5 rounded-full bg-[#FF862A]"></span>
            </span>
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[#9BB5CB] leading-tight mt-0.5">
              Adajan Satsang Mandal
            </p>
          </div>
        </div>
       </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-[#F0F4F8] p-1 rounded-2xl border border-[#E4EBF3]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
                  active
                    ? 'bg-white text-[#003158] shadow-sm'
                    : 'text-[#9BB5CB] hover:text-[#003158]'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-[#FF862A]' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User Badge & Logout */}
        <div className="hidden sm:flex items-center gap-3">
          <div className="flex items-center gap-2.5 rounded-2xl border border-[#E4EBF3] bg-[#F0F4F8] px-3.5 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#003158] text-xs font-bold text-white">
              {user?.name?.[0] || 'U'}
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-[#003158] leading-tight">{user?.name || 'User'}</p>
              <span className={`inline-block text-[10px] font-bold ${user?.role === 'Admin' ? 'text-red-500' : user?.role === 'Sevak' ? 'text-amber-600' : 'text-[#9BB5CB]'}`}>
                {user?.role || 'Devotee'}
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            title="Logout"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E4EBF3] bg-[#F0F4F8] text-[#003158] md:hidden"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="border-t border-[#E0EAF4] bg-white px-4 py-3 md:hidden space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F0F4F8] border border-[#E4EBF3] mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#003158] text-sm font-bold text-white">
              {user?.name?.[0] || 'U'}
            </div>
            <div>
              <p className="text-sm font-bold text-[#003158]">{user?.name}</p>
              <p className="text-xs text-[#9BB5CB]">{user?.role} • {user?.mobile}</p>
            </div>
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActivePage(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-[#003158] text-white shadow-md'
                    : 'text-[#475569] hover:bg-[#F0F4F8]'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-[#FF862A]' : 'text-[#9BB5CB]'}`} />
                {item.label}
              </button>
            );
          })}

          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors mt-2"
          >
            <LogOut className="h-5 w-5 text-red-500" />
            Logout
          </button>
        </div>
      )}
    </header>
  );
}
