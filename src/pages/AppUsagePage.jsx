import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, Users, LogIn, PhoneCall, Bell, Cookie, Bus, Sparkles, Mail, HandHeart,
  UserCog, CalendarCheck, Tag, X, RefreshCw, ChevronRight, Search, Clock, Smartphone,
} from 'lucide-react';
import { dataService } from '../services/dataService';

// A module = a group of Activity action keys with a label + icon + colour. The
// count for a module is the sum of its actions' counts; clicking it drills into
// the exact entries (who + when). "login"/"followup"/"push"+"announcement" are the
// headline numbers the admin asked for.
const MODULES = [
  { key: 'logins',    label: 'Logins',          icon: LogIn,        color: '#2563EB', actions: ['login'] },
  { key: 'followups', label: 'Follow-ups',      icon: PhoneCall,    color: '#FF862A', actions: ['followup'] },
  { key: 'notifs',    label: 'Notifications',   icon: Bell,         color: '#DB2777', actions: ['push', 'announcement'] },
  { key: 'ghari',     label: 'Ghari Seva',      icon: Cookie,       color: '#EA580C', actions: ['ghari-order', 'ghari-void', 'ghari-purchase'] },
  { key: 'bus',       label: 'Bus Seva',        icon: Bus,          color: '#16A34A', actions: ['bus-event'] },
  { key: 'feed',      label: 'Feed',            icon: Sparkles,     color: '#9333EA', actions: ['feed', 'update-feed'] },
  { key: 'email',     label: 'Emails',          icon: Mail,         color: '#0D9488', actions: ['email'] },
  { key: 'seva',      label: 'Seva logged',     icon: HandHeart,    color: '#D97706', actions: ['seva'] },
  { key: 'devotees',  label: 'Devotee edits',   icon: UserCog,      color: '#4F46E5', actions: ['add-devotee', 'update-devotee', 'delete-devotee'] },
  { key: 'events',    label: 'Events',          icon: CalendarCheck,color: '#0891B2', actions: ['add-event', 'update-event', 'delete-event'] },
  { key: 'tags',      label: 'Bulk tags',       icon: Tag,          color: '#64748B', actions: ['bulk-tags'] },
  { key: 'logouts',   label: 'Logouts',         icon: LogIn,        color: '#94A3B8', actions: ['logout'] },
];

const cleanName = (actor) => String(actor || '').replace(/\s*\(.*\)$/, '').trim() || '—';
const normMob = (m) => String(m || '').replace(/\D/g, '');
const fmtDateTime = (iso) => {
  try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return String(iso || ''); }
};
const timeAgo = (iso) => {
  const t = Date.parse(iso || ''); if (isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};

// ── Drill-down list of raw activity rows (who + when) — filtered IN MEMORY ────
function DetailModal({ title, rows, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-text-main"><Activity className="h-4 w-4 text-[#FF862A]" /> {title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-text-muted">No activity recorded for this yet.</p>
          ) : (
            <>
              <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · newest first</p>
              <div className="space-y-1.5">
                {rows.map((r, i) => (
                  <div key={i} className="rounded-xl border border-border-light bg-bg-base px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-text-main">{cleanName(r.actor)}</p>
                        {r.actorMobile && <p className="text-[11px] font-semibold text-text-muted">📱 {r.actorMobile}</p>}
                      </div>
                      <span className="shrink-0 text-right text-[10px] font-semibold text-text-muted">{fmtDateTime(r.ts)}</span>
                    </div>
                    {r.detail && <p className="mt-0.5 text-[12px] text-text-main/90">{r.detail}</p>}
                    {r.device && <p className="mt-0.5 flex items-center gap-1 text-[10px] text-text-muted"><Smartphone className="h-3 w-3" /> {r.device}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function AppUsagePage({ user }) {
  const isAdmin = user?.role === 'Admin';
  const [data, setData] = useState(null); // { ok, rows, total, truncated, error }
  const [busy, setBusy] = useState(false);
  const [drill, setDrill] = useState(null); // { title, rows }
  const [q, setQ] = useState('');

  const load = async () => {
    setBusy(true);
    try { setData(await dataService.getUsageDump({ limit: 6000 })); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (isAdmin) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data?.rows || [];

  // Everything below is computed from the single fetched row set — no more calls.
  const byAction = useMemo(() => {
    const m = {}; rows.forEach(r => { const a = String(r.action || 'other'); m[a] = (m[a] || 0) + 1; }); return m;
  }, [rows]);
  const users = useMemo(() => {
    const by = {};
    rows.forEach(r => {
      const mob = normMob(r.actorMobile);
      const key = mob || ('name:' + cleanName(r.actor));
      const u = by[key] || (by[key] = { key, name: cleanName(r.actor), mobile: mob, count: 0, lastTs: '' });
      u.count++;
      const ts = String(r.ts || ''); if (ts > u.lastTs) { u.lastTs = ts; u.name = cleanName(r.actor); }
    });
    return Object.values(by).sort((a, b) => b.count - a.count);
  }, [rows]);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeThisWeek = useMemo(() => users.filter(u => Date.parse(u.lastTs || '') >= weekAgo).length, [users]); // eslint-disable-line react-hooks/exhaustive-deps
  const moduleCount = (m) => (m.actions || []).reduce((s, a) => s + (byAction[a] || 0), 0);
  const shownUsers = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? users.filter(u => u.name.toLowerCase().includes(t) || String(u.mobile || '').includes(t)) : users;
  }, [users, q]);

  const drillActions = (title, actions) => {
    const set = new Set(actions);
    setDrill({ title, rows: rows.filter(r => set.has(String(r.action))) });
  };
  const drillMember = (u) => {
    setDrill({
      title: u.name,
      rows: rows.filter(r => (u.mobile ? normMob(r.actorMobile) === u.mobile : cleanName(r.actor) === u.name)),
    });
  };

  if (!isAdmin) {
    return <div className="mx-auto max-w-md p-8 text-center text-sm font-semibold text-text-muted">This section is for admins only.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow"><Activity className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black text-text-main">App Usage</h1>
          <p className="text-[11px] font-semibold text-text-muted">Who’s using Akshar Connect, and how much</p>
        </div>
        <button onClick={load} disabled={busy} title="Refresh"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-surface text-text-muted hover:text-text-main">
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {data === null ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <p className="text-sm font-semibold">Loading usage…</p>
        </div>
      ) : data.ok === false ? (
        <p className="py-16 text-center text-sm text-rose-600">{data.error || 'Could not load usage. (Is the backend deployed?)'}</p>
      ) : (
        <>
          {/* Headline totals */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-2xl border border-border-light bg-surface p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted"><Users className="h-3.5 w-3.5 text-[#2563EB]" /> Members</div>
              <div className="mt-1 text-2xl font-black text-text-main">{users.length}</div>
              <div className="text-[11px] font-semibold text-text-muted">used the app</div>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted"><Clock className="h-3.5 w-3.5 text-emerald-600" /> Active</div>
              <div className="mt-1 text-2xl font-black text-text-main">{activeThisWeek}</div>
              <div className="text-[11px] font-semibold text-text-muted">this week</div>
            </div>
            <button onClick={() => drillActions('Logins', ['login'])}
              className="rounded-2xl border border-border-light bg-surface p-3 text-left transition-all hover:border-primary/40 active:scale-[0.98]">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted"><LogIn className="h-3.5 w-3.5 text-[#2563EB]" /> Logins</div>
              <div className="mt-1 text-2xl font-black text-text-main">{byAction.login || 0}</div>
              <div className="flex items-center gap-0.5 text-[11px] font-semibold text-primary">View who <ChevronRight className="h-3 w-3" /></div>
            </button>
            <div className="rounded-2xl border border-border-light bg-surface p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted"><Activity className="h-3.5 w-3.5 text-[#FF862A]" /> Events</div>
              <div className="mt-1 text-2xl font-black text-text-main">{rows.length}</div>
              <div className="text-[11px] font-semibold text-text-muted">{data.truncated ? `recent of ${data.total}` : 'total actions'}</div>
            </div>
          </div>

          {data.truncated && (
            <p className="mt-2 text-[11px] font-semibold text-text-muted">Showing the most recent {rows.length.toLocaleString('en-IN')} actions (of {data.total.toLocaleString('en-IN')} logged).</p>
          )}

          {/* Usage by module — tap a count to see who + when */}
          <h2 className="mb-2 mt-6 text-sm font-black text-text-main">Usage by module</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {MODULES.map(m => {
              const count = moduleCount(m);
              const Icon = m.icon;
              return (
                <button key={m.key} onClick={() => drillActions(m.label, m.actions)} disabled={count === 0}
                  className="flex items-center gap-3 rounded-2xl border border-border-light bg-surface p-3 text-left transition-all hover:border-primary/40 active:scale-[0.98] disabled:opacity-50 disabled:hover:border-border-light">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: m.color }}><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xl font-black leading-none text-text-main">{count}</div>
                    <div className="mt-0.5 truncate text-[11px] font-bold text-text-muted">{m.label}</div>
                  </div>
                  {count > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />}
                </button>
              );
            })}
          </div>

          {/* By member — tap a person to see everything they did */}
          <h2 className="mb-2 mt-6 text-sm font-black text-text-main">By member · {users.length}</h2>
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-border-light bg-surface px-3 py-2">
            <Search className="h-4 w-4 text-text-muted" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a member…"
              className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
            {q && <button onClick={() => setQ('')}><X className="h-4 w-4 text-text-muted" /></button>}
          </div>
          <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
            {shownUsers.length === 0 && <p className="py-10 text-center text-sm text-text-muted">No members{q ? ' match your search' : ' yet'}.</p>}
            {shownUsers.map((u) => (
              <button key={u.key} onClick={() => drillMember(u)}
                className="flex w-full items-center gap-3 border-b border-border-light px-3 py-2.5 text-left last:border-0 hover:bg-bg-base">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">{u.name[0] || '?'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-text-main">{u.name}</p>
                  <p className="truncate text-[11px] font-semibold text-text-muted">{u.mobile ? `📱 ${u.mobile} · ` : ''}last active {timeAgo(u.lastTs)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-black text-text-main">{u.count}</div>
                  <div className="text-[10px] font-semibold text-text-muted">actions</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
              </button>
            ))}
          </div>
        </>
      )}

      {drill && <DetailModal title={drill.title} rows={drill.rows} onClose={() => setDrill(null)} />}
    </div>
  );
}
