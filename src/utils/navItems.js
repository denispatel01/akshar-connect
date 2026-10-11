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
} from 'lucide-react';

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
  const isDevotee = user?.role === 'Devotee';
  const isAdmin = user?.role === 'Admin';
  const isSevak = user?.role === 'Sevak';
  const canGhari = isAdmin || hasModule(user, 'ghari');

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

/** The 3 core tabs shown directly on the mobile bottom bar. */
export function getPrimaryMobile(user) {
  const isDevotee = user?.role === 'Devotee';
  return isDevotee
    ? [
        { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
        { id: 'swadhyay', label: 'Swadhyay', icon: BookOpen },
        { id: 'devotees', label: 'My Profile', icon: User },
      ]
    : [
        { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
        { id: 'devotees', label: 'Devotees', icon: Users },
        { id: 'swadhyay', label: 'Swadhyay', icon: BookOpen },
      ];
}
