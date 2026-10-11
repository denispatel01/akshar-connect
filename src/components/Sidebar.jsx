import React from 'react';
import { LogOut } from 'lucide-react';
import { getNavGroups } from '../utils/navItems';
import { useNewFeed } from '../utils/useNewFeed';

/**
 * Desktop-only left sidebar — the "real desktop app" navigation. Hidden on mobile
 * (<md), where the bottom tab bar + Menu sheet in Navbar handle navigation instead.
 *
 * Two widths: expanded (icons + labels, grouped) and collapsed (icon rail with
 * hover tooltips). The collapse state is owned by App and toggled from the header
 * hamburger, so the main content can reserve the matching left space.
 */
export default function Sidebar({ activePage, setActivePage, user, onLogout, collapsed }) {
  const groups = getNavGroups(user);
  const [hasNewFeed, clearNewFeed] = useNewFeed();

  const isAdmin = user?.role === 'Admin';
  const isSevak = user?.role === 'Sevak';
  const roleColor = isAdmin ? 'text-red-500' : isSevak ? 'text-amber-600' : 'text-indigo-500';

  const navigate = (id) => { if (id === 'feed') clearNewFeed(); setActivePage(id); };

  return (
    <aside
      className={`hidden md:flex flex-col shrink-0 border-r border-border-light bg-surface
        sticky top-[87px] h-[calc(100vh-87px)] transition-[width] duration-200 ease-out
        ${collapsed ? 'w-[72px]' : 'w-60'}`}
    >
      {/* Nav groups — scrolls independently of the page content */}
      <nav className="flex-1 overflow-y-auto overscroll-contain px-2.5 py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-1">
            {!collapsed && (
              <p className="px-3 pt-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-text-muted/70">
                {group.label}
              </p>
            )}
            {collapsed && <div className="my-2 mx-3 h-px bg-border-light first:hidden" />}
            <div className="flex flex-col gap-0.5">
              {group.items.map(({ id, label, icon: Icon, adminOnly }) => {
                const active = activePage === id;
                return (
                  <button
                    key={id}
                    onClick={() => navigate(id)}
                    title={collapsed ? label : undefined}
                    className={`group relative flex items-center rounded-xl text-sm font-semibold transition-all duration-150
                      ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'}
                      ${active
                        ? 'bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow-md shadow-primary/30'
                        : 'text-text-muted hover:text-text-main hover:bg-bg-base'}`}
                  >
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 transition-transform duration-150
                        ${active ? 'text-white' : 'text-text-muted group-hover:text-accent group-hover:scale-110'}`}
                      strokeWidth={active ? 2.4 : 2}
                    />
                    {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}

                    {/* New-feed dot */}
                    {id === 'feed' && hasNewFeed && !active && (
                      <span className={`absolute h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-surface
                        ${collapsed ? 'top-1.5 right-2.5' : 'right-3 static ring-0'}`} />
                    )}
                    {/* Admin-only marker */}
                    {adminOnly && (
                      <span className={`h-2 w-2 shrink-0 rounded-full bg-red-500
                        ${collapsed ? 'absolute top-1.5 right-2.5 ring-2 ring-surface' : ''}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: account card + logout */}
      <div className="shrink-0 border-t border-border-light p-2.5">
        <button
          onClick={() => setActivePage('account')}
          title={collapsed ? (user?.name || 'My Account') : undefined}
          className={`w-full flex items-center rounded-xl border border-border-light bg-bg-base hover:border-primary transition-colors
            ${collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-2'}`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {user?.name?.[0] || 'U'}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs font-bold text-text-main leading-tight">{user?.name || 'User'}</p>
              <span className={`text-[10px] font-bold ${roleColor}`}>{user?.role || 'Devotee'}</span>
            </div>
          )}
        </button>

        <button
          onClick={onLogout}
          title={collapsed ? 'Sign Out' : undefined}
          className={`mt-2 w-full flex items-center rounded-xl border border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 transition-colors
            ${collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2.5'}`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="text-sm font-bold">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
