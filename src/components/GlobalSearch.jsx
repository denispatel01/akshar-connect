import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, User, MapPin, Phone, CalendarDays, Quote, Megaphone, ChevronRight } from 'lucide-react';
import { dataService } from '../services/dataService';
import { devoteeSearchText, scoreMatch } from '../utils/search';

const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);
const clip = (s, n = 90) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const PER_GROUP = 8;   // cap results shown per section
const TOTAL_CAP = 30;  // overall safety cap

// App-wide quick search. Now spans devotees, events, Vato and announcements —
// grouped by type, each result opens the right place. (The placeholder promised
// "devotees, vato, events & more" — this makes that true.)
export default function GlobalSearch({ open, onClose, onOpenDevotee, onNavigate, user }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const isDevotee = user?.role === 'Devotee';

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Hide female mobiles from devotee-role viewers (privacy rule).
  const showMobile = (d) => !(isDevotee && d.gender === 'Female');

  const nav = (page, params) => { onNavigate?.(page, params); onClose(); };

  // One config per searchable type. `text` is what we match on, `title`/`sub` are
  // what we show, `open` is where tapping goes. Devotees match on their OWN name /
  // mobile / DOB only (see utils/search.js) — never by karyakarta / reference.
  const groups = useMemo(() => {
    const s = q.trim();
    if (!s) return [];

    const types = [
      {
        key: 'devotee', label: 'Devotees', Icon: User,
        rows: dataService.getDevotees() || [],
        text: (d) => devoteeSearchText(d),
        name: (d) => d.name || '',
        open: (d) => { onOpenDevotee?.(d.id); onClose(); },
      },
      {
        key: 'event', label: 'Events', Icon: CalendarDays,
        rows: dataService.getEvents() || [],
        text: (e) => [e.title, e.venue, e.type, e.description, e.date].filter(Boolean).join(' '),
        name: (e) => e.title || '',
        open: () => nav('calendar'),
      },
      {
        key: 'vato', label: 'Vato', Icon: Quote,
        rows: dataService.getCachedVato() || [],
        text: (v) => [v.Gujarati, v.English].filter(Boolean).join(' '),
        name: (v) => [v.Gujarati, v.English].filter(Boolean).join(' '),
        open: () => nav('vato'),
      },
      {
        key: 'announcement', label: 'Announcements', Icon: Megaphone,
        rows: dataService.getCachedAnnouncements() || [],
        text: (a) => [a.title, a.body].filter(Boolean).join(' '),
        name: (a) => a.title || '',
        open: () => nav('dashboard'),
      },
    ];

    return types.map((t) => {
      const scored = (t.rows || [])
        .map((r) => ({ r, score: scoreMatch(String(t.text(r)).toLowerCase(), t.name(r), s) }))
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score);
      return { ...t, total: scored.length, items: scored.slice(0, PER_GROUP).map((x) => x.r) };
    }).filter((g) => g.items.length > 0);
  }, [q, isDevotee]);

  const totalShown = groups.reduce((n, g) => n + g.items.length, 0);

  if (!open) return null;

  // Render one result row by type.
  const renderRow = (g, item, i) => {
    if (g.key === 'devotee') {
      const d = item;
      return (
        <button key={`d-${d.id || i}`} onClick={() => g.open(d)}
          className="flex w-full items-center gap-3 border-b border-border-light/60 px-4 py-3 text-left last:border-0 hover:bg-bg-base">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {String(d.name || 'U')[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-text-main">{d.name || '—'}</p>
            <p className="flex items-center gap-2 truncate text-[11px] text-text-muted">
              {d.area && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{d.area}</span>}
              {showMobile(d) && last10(d.mobile) && <span className="inline-flex items-center gap-0.5"><Phone className="h-3 w-3" />{d.mobile}</span>}
              {d.familyId && <span>· {d.familyId}</span>}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
        </button>
      );
    }

    // Generic row (event / vato / announcement).
    let title = '', sub = '';
    if (g.key === 'event') { title = item.title || 'Event'; sub = [item.date, item.time, item.venue].filter(Boolean).join(' · '); }
    else if (g.key === 'vato') { title = clip(item.Gujarati || item.English, 100); sub = item.SN ? `Vato #${item.SN}` : ''; }
    else if (g.key === 'announcement') { title = item.title || 'Announcement'; sub = clip(item.body, 100); }

    return (
      <button key={`${g.key}-${item.id || item.SN || i}`} onClick={() => g.open(item)}
        className="flex w-full items-center gap-3 border-b border-border-light/60 px-4 py-3 text-left last:border-0 hover:bg-bg-base">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-base text-text-muted">
          <g.Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text-main"
            style={g.key === 'vato' ? { fontFamily: '"Noto Sans Gujarati","Shruti","Gujarati Sangam MN",sans-serif' } : undefined}>
            {title || '—'}
          </p>
          {sub && <p className="truncate text-[11px] text-text-muted">{sub}</p>}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
      </button>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex flex-col bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto mt-0 flex w-full max-w-xl flex-col overflow-hidden bg-surface shadow-2xl sm:mt-16 sm:rounded-3xl" style={{ maxHeight: '100vh' }} onClick={(e) => e.stopPropagation()}>
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-border-light px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <Search className="h-5 w-5 shrink-0 text-text-muted" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            autoFocus data-no-clear="true"
            placeholder="Search devotees, vato, events…"
            className="w-full bg-transparent text-base text-text-main outline-none placeholder:text-text-muted" />
          {q && (
            <button onClick={() => { setQ(''); inputRef.current?.focus(); }} title="Clear"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-text-muted hover:bg-bg-base">
              <X className="h-4 w-4" />
            </button>
          )}
          <button onClick={onClose} title="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-text-muted hover:bg-bg-base">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {!q.trim() && (
            <p className="px-5 py-10 text-center text-sm text-text-muted">Search devotees, Vato, events and announcements.</p>
          )}
          {q.trim() && totalShown === 0 && (
            <p className="px-5 py-10 text-center text-sm text-text-muted">No matches for “{q}”.</p>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border-light bg-bg-base px-4 py-1.5">
                <g.Icon className="h-3.5 w-3.5 text-text-muted" />
                <span className="text-[11px] font-black uppercase tracking-wide text-text-muted">{g.label}</span>
                <span className="ml-auto text-[11px] font-bold text-text-muted">{g.total > g.items.length ? `${g.items.length} of ${g.total}` : g.total}</span>
              </div>
              {g.items.map((item, i) => renderRow(g, item, i))}
            </div>
          ))}
          {totalShown >= TOTAL_CAP && <p className="px-5 py-3 text-center text-[11px] text-text-muted">Showing the top matches — refine your search.</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
