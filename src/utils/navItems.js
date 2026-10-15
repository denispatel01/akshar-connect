// Single source of truth for navigation items, shared by the desktop Sidebar and
// the mobile bottom-bar/Menu sheet. Keeping this in one place means adding a module
// updates every surface at once (no drift between desktop and mobile).
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  FileSpreadsheet,
  BookOpen,
  CalendarDays,
  Mail,
  Settings,
  User,
  Tags,
  Tag,
  Activity,
  Cookie,
  Sparkles,
  Database,
  Quote,
  CalendarCheck,
  Bus,
} from 'lucide-react';

// A role stored in the Users sheet can drift in case/whitespace ("admin",
// " Admin ", etc.). The BACKEND compares roles case/space-insensitively
// (see ghariCanWrite_ in Code.gs), so the client MUST too — otherwise an
// Admin whose role isn't the exact string "Admin" is silently demoted to
// read-only here while the backend would happily accept their writes.
export const normRole = (user) => String(user?.role || '').trim().toLowerCase();
export const isAdminRole = (user) => normRole(user) === 'admin';
export const isSevakRole = (user) => normRole(user) === 'sevak';
export const isDevoteeRole = (user) => normRole(user) === 'devotee';

const hasModule = (user, mod) =>
  String(user?.modules || '')
    .split(/[,|]/)
    .map((s) => s.trim().toLowerCase())
    .includes(mod);

/**
 * Desktop nav, grouped into sections for the sidebar. Each group is
 * { label, items: [{ id, label, icon, adminOnly? }] }. Empty groups are dropped.
 * Mobile flattens this (see getAllNavItems).
 */
export function getNavGroups(user) {
  const isDevotee = isDevoteeRole(user);
  const isAdmin = isAdminRole(user);
  const isSevak = isSevakRole(user);
  // Admins get full access; all Sevaks see Ghari read-only (GhariPage gates
  // add/edit/delete to Admins). `ghari` module grant still works for any other role.
  const canGhari = isAdmin || isSevak || hasModule(user, 'ghari');
  // Bus Seva is visible to EVERYONE (read-only for non-staff; BusPage gates
  // add/edit/delete to Admins/Sevaks/`bus`-module users).
  const canBus = true;

  if (isDevotee) {
    return [
      {
        label: 'Main',
        items: [
          { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
          { id: 'vato', label: 'Vato', icon: Quote },
          { id: 'feed', label: 'Feed', icon: Sparkles },
          { id: 'swadhyay', label: 'Swadhyay', icon: BookOpen },
          { id: 'calendar', label: 'Calendar', icon: CalendarDays },
          { id: 'bus', label: 'Bus Seva', icon: Bus },
        ],
      },
      {
        label: 'Me',
        items: [
          { id: 'devotees', label: 'My Profile', icon: User },
          { id: 'family', label: 'Family', icon: Users },
          { id: 'activity', label: 'My Activity', icon: Activity },
        ],
      },
    ];
  }

  return [
    {
      label: 'Main',
      items: [
        { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
        { id: 'vato', label: 'Vato', icon: Quote },
        { id: 'feed', label: 'Feed', icon: Sparkles },
        { id: 'swadhyay', label: 'Swadhyay', icon: BookOpen },
        { id: 'calendar', label: 'Calendar', icon: CalendarDays },
      ],
    },
    {
      label: 'People',
      items: [
        { id: 'devotees', label: 'Divine Devotees', icon: Users },
        ...(isAdmin || isSevak
          ? [
              { id: 'followups', label: 'Follow-up', icon: PhoneCall },
              { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
            ]
          : []),
      ],
    },
    {
      label: 'Tools',
      items: [
        ...(isAdmin || isSevak
          ? [
              { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
              { id: 'email', label: 'Email', icon: Mail },
              { id: 'bulk-tags', label: 'Bulk Tags', icon: Tag },
            ]
          : []),
        ...(canGhari ? [{ id: 'ghari', label: 'Ghari Seva', icon: Cookie }] : []),
        ...(canBus ? [{ id: 'bus', label: 'Bus Seva', icon: Bus }] : []),
      ],
    },
    {
      label: 'Admin',
      items: isAdmin
        ? [
            { id: 'family-tags', label: 'Family Tags', icon: Tags, adminOnly: true },
            { id: 'data', label: 'Data Quality', icon: Database, adminOnly: true },
            { id: 'admin', label: 'Admin', icon: Settings, adminOnly: true },
          ]
        : [],
    },
    {
      label: 'Me',
      items: [{ id: 'activity', label: 'My Activity', icon: Activity }],
    },
  ].filter((g) => g.items.length > 0);
}

/** Flat list of every nav item (used by the mobile Menu sheet). */
export function getAllNavItems(user) {
  return getNavGroups(user).flatMap((g) => g.items);
}

/** The core tabs shown directly on the mobile bottom bar. */
export function getPrimaryMobile(user) {
  const isDevotee = isDevoteeRole(user);
  if (isDevotee) {
    return [
      { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
      { id: 'swadhyay', label: 'Swadhyay', icon: BookOpen },
      { id: 'devotees', label: 'My Profile', icon: User },
    ];
  }
  // Staff bar. During Ghari Seva, Ghari is the busiest screen — surface it as a
  // primary tab (one tap from app-open) for anyone with Ghari access, instead of
  // burying it in the Menu.
  const canGhari = isAdminRole(user) || isSevakRole(user) || hasModule(user, 'ghari');
  return [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'devotees', label: 'Devotees', icon: Users },
    ...(canGhari ? [{ id: 'ghari', label: 'Ghari', icon: Cookie }] : []),
    { id: 'swadhyay', label: 'Swadhyay', icon: BookOpen },
  ];
}
