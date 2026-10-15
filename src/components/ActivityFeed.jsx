import React, { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import { RefreshCw, Activity as ActivityIcon, Smartphone, Clock, GitCommitHorizontal, LayoutList, ChevronDown } from 'lucide-react';

// Emoji per action kind for quick scanning.
const ACTION_EMOJI = {
  'add-devotee': '🆕', 'update-devotee': '✏️', 'delete-devotee': '🗑️',
  'add-event': '📅', 'update-event': '🗓️', 'delete-event': '❌',
  followup: '📞', 'bulk-tags': '🏷️', area: '🗺️', login: '🔓', logout: '🔒',
};

function timeAgo(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts || '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fullTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts || '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// Just the clock time, for the timeline rows.
function clockTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
// "Today" / "Yesterday" / "Mon, 12 Oct 2025" — the timeline's day headers.
function dayLabel(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 'Earlier';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
// Split rows (already newest-first) into day sections, keeping order.
function groupByDay(rows) {
  const out = []; const idx = {};
  rows.forEach((r) => {
    const key = dayLabel(r.ts);
    if (idx[key] === undefined) { idx[key] = out.length; out.push({ key, items: [] }); }
    out[idx[key]].items.push(r);
  });
  return out;
}
// "Digesh Patel (99…)" -> "Digesh Patel"
const actorName = (a) => String(a || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || 'Someone';

// Group actions into readable sections (first matching test wins).
const GROUPS = [
  { key: 'auth', title: 'Logins & Logouts', test: (a) => /^(login|logout)/i.test(a) },
  { key: 'email', title: 'Email', test: (a) => /(mail|email)/i.test(a) },
  { key: 'changes', title: 'Adds, Edits & Deletes', test: (a) => /(add|update|delete|create|edit|void|remove)/i.test(a) },
  { key: 'other', title: 'Other activity', test: () => true },
];
function groupRows(rows) {
  const buckets = { auth: [], email: [], changes: [], other: [] };
  rows.forEach((r) => {
    const a = String(r.action || '');
    const g = GROUPS.find((x) => x.test(a)) || GROUPS[GROUPS.length - 1];
    buckets[g.key].push(r);
  });
  return buckets;
}

// Lazy loading: fetch one small page at a time instead of hundreds of rows up
// front. "Load more" grows the window by PAGE each tap.
const PAGE = 20;
// Last 10 digits of a mobile — used to match an actor to the signed-in user.
const last10_ = (v) => String(v || '').replace(/\D/g, '').slice(-10);
export default function ActivityFeed({ mine = false }) {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [err, setErr] = useState('');
  // Timeline (chronological, grouped by day) vs grouped-by-kind. Remembered per
  // device. Timeline is the default.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('ac-activity-view') || 'timeline'; } catch { return 'timeline'; }
  });
  const setViewPersist = (v) => { setView(v); try { localStorage.setItem('ac-activity-view', v); } catch { /* ignore */ } };
  // Which section headers are collapsed (day in timeline view, kind in grouped).
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggleSec = (k) => setCollapsed((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // In "Everyone" mode, hide the viewer's OWN actions — those live under "My
  // activity". Match on the real signed-in mobile (not a view-as identity); fall
  // back to the name when an older row has no mobile in its actor string.
  const dropMine = (list) => {
    if (mine) return list;
    const sess = dataService.getCurrentSession() || {};
    const myMob = last10_(sess.mobile);
    const myName = String(sess.name || '').trim().toLowerCase();
    if (!myMob && !myName) return list;
    return list.filter((r) => {
      const a = String(r.actor || '');
      const m = (a.match(/\(([^)]*)\)\s*$/) || [])[1];
      const aMob = last10_(m);
      if (aMob && myMob) return aMob !== myMob;
      return actorName(a).toLowerCase() !== myName;
    });
  };

  // Fetch the newest `reqLimit` actions. The backend returns the most-recent N, so
  // growing the window and re-fetching shows the next page without loading the whole
  // history at once.
  const load = async (reqLimit, { more = false } = {}) => {
    if (more) setLoadingMore(true); else setLoading(true);
    setErr('');
    try {
      const list = await dataService.getActivity({ mine, limit: reqLimit });
      setHasMore(list.length >= reqLimit); // a full page back likely means more exist
      setRows(dropMine(list));
    } catch (e) { setErr('Could not load activity. Pull to refresh.'); }
    finally { setLoading(false); setLoadingMore(false); }
  };
  // Initial load / scope switch → back to the first page.
  useEffect(() => { setLimit(PAGE); load(PAGE); /* eslint-disable-next-line */ }, [mine]);

  const loadMore = () => { const next = limit + PAGE; setLimit(next); load(next, { more: true }); };
  const refresh = () => { setLimit(PAGE); load(PAGE); };

  // Precompute the sections for the active view, so Expand/Collapse all knows the
  // exact section keys on screen.
  const dayGroups = view === 'timeline' ? groupByDay(rows) : [];
  const buckets = view === 'grouped' ? groupRows(rows) : null;
  const sectionKeys = view === 'timeline'
    ? dayGroups.map((d) => d.key)
    : (buckets ? GROUPS.filter((g) => buckets[g.key].length > 0).map((g) => g.key) : []);
  const collapseAll = () => setCollapsed(new Set(sectionKeys));
  const expandAll = () => setCollapsed(new Set());

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-text-muted">{loading ? 'Loading…' : `${rows.length}${hasMore ? '+' : ''} ${mine ? 'of your actions' : 'recent actions'}`}</p>
        <div className="flex items-center gap-2">
          {/* Timeline / Grouped toggle */}
          <div className="inline-flex rounded-xl border border-border-light bg-bg-base p-0.5 text-[11px] font-bold">
            <button onClick={() => setViewPersist('timeline')} title="Timeline view"
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-colors ${view === 'timeline' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
              <GitCommitHorizontal className="h-3.5 w-3.5" /> Timeline
            </button>
            <button onClick={() => setViewPersist('grouped')} title="Grouped view"
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-colors ${view === 'grouped' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
              <LayoutList className="h-3.5 w-3.5" /> Grouped
            </button>
          </div>
          {rows.length > 0 && (
            <div className="inline-flex items-center gap-1.5">
              <button onClick={expandAll} className="rounded-xl border border-border-light bg-surface px-2.5 py-1.5 text-[11px] font-bold text-text-muted hover:border-primary hover:text-primary">Expand all</button>
              <button onClick={collapseAll} className="rounded-xl border border-border-light bg-surface px-2.5 py-1.5 text-[11px] font-bold text-text-muted hover:border-primary hover:text-primary">Collapse all</button>
            </div>
          )}
          <button onClick={refresh} className="inline-flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-3 py-1.5 text-xs font-bold text-text-main hover:bg-bg-base">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {err && <p className="text-xs font-bold text-red-500 mb-2">{err}</p>}

      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-muted">
          <ActivityIcon className="h-8 w-8 opacity-40" />
          <p className="text-sm font-semibold">No activity yet.</p>
        </div>
      )}

      {/* ── Timeline view — chronological, grouped by day with a connecting line. ── */}
      {view === 'timeline' && rows.length > 0 && (
        <div className="space-y-5">
          {dayGroups.map((day) => {
            const isCollapsed = collapsed.has(day.key);
            return (
            <section key={day.key}>
              <button onClick={() => toggleSec(day.key)}
                className="mb-2.5 flex w-full items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-text-muted">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {day.key}
                <span className="rounded-full bg-bg-base px-2 py-0.5 text-[10px] font-bold text-text-muted">{day.items.length}</span>
              </button>
              {!isCollapsed && (
              <ol className="relative ml-[9px] space-y-3 border-l-2 border-border-light pl-5">
                {day.items.map((r, i) => (
                  <li key={i} className="relative">
                    {/* dot on the line */}
                    <span className="absolute -left-[26px] grid h-5 w-5 place-items-center rounded-full border-2 border-surface bg-primary/10 text-[11px]" title={r.action}>
                      {ACTION_EMOJI[r.action] || '•'}
                    </span>
                    <p className="text-sm font-semibold text-text-main break-words">
                      {!mine && <span className="font-black">{actorName(r.actor)} </span>}
                      {r.detail || r.action}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-semibold text-text-muted">
                      <span className="inline-flex items-center gap-1" title={fullTime(r.ts)}><Clock className="h-3 w-3" /> {clockTime(r.ts)} · {timeAgo(r.ts)}</span>
                      {r.device && <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> {r.device}</span>}
                    </div>
                  </li>
                ))}
              </ol>
              )}
            </section>
            );
          })}
        </div>
      )}

      {/* ── Grouped view — by action kind. ── */}
      {view === 'grouped' && buckets && (
          <div className="space-y-6">
            {GROUPS.filter((g) => buckets[g.key].length > 0).map((g) => {
              const isCollapsed = collapsed.has(g.key);
              return (
              <section key={g.key}>
                <button onClick={() => toggleSec(g.key)}
                  className="mb-2 flex w-full items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-text-muted">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                  {g.title}
                  <span className="rounded-full bg-bg-base px-2 py-0.5 text-[10px] font-bold text-text-muted">{buckets[g.key].length}</span>
                </button>
                {!isCollapsed && (
                <ol className="space-y-2">
                  {buckets[g.key].map((r, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-2xl border border-border-light bg-surface px-3.5 py-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl">{ACTION_EMOJI[r.action] || '•'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text-main break-words">
                          {!mine && <span className="font-black">{actorName(r.actor)} </span>}
                          {r.detail || r.action}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-semibold text-text-muted">
                          <span className="inline-flex items-center gap-1" title={fullTime(r.ts)}><Clock className="h-3 w-3" /> {timeAgo(r.ts)}</span>
                          {r.device && <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> {r.device}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                )}
              </section>
              );
            })}
          </div>
      )}

      {/* Lazy "load more" — fetches the next page only when asked. */}
      {!loading && rows.length > 0 && hasMore && (
        <div className="mt-4 flex justify-center">
          <button onClick={loadMore} disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-5 py-2.5 text-sm font-bold text-text-main hover:bg-bg-base disabled:opacity-60">
            {loadingMore ? <><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</> : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
