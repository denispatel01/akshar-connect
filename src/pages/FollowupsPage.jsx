import React, { useState, useEffect, useMemo } from 'react';
import {
  PhoneCall, Phone, Users2, ArrowLeft, Search, Filter, X, Check,
  CalendarCheck, ClipboardList, MessageSquare, UserRound, ChevronRight, Plus
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { tagsByCategory, tagChipStyle, tagLabel } from '../services/tagCatalog';
import { hasAnyTag } from '../services/devoteeSchema';

const OUTCOMES = ['Coming', 'Maybe', 'Not Coming'];
const OUTCOME_STYLE = {
  'Coming': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Maybe': 'bg-amber-100 text-amber-700 border-amber-200',
  'Not Coming': 'bg-red-100 text-red-700 border-red-200',
  '': 'bg-surface text-slate-500 border-border-light',
};
const AUDIENCE_CAP = 250;
const EVENT_TYPES = ['Sabha', 'Seva', 'Event', 'Padhramani'];
const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyEventForm = () => ({ title: '', date: todayStr(), time: '06:00 PM', venue: '', type: 'Sabha' });

export default function FollowupsPage({ user }) {
  const canManage = user?.role === 'Admin' || user?.role === 'Sevak';
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState(emptyEventForm());
  const [events, setEvents] = useState([]);
  const [devotees, setDevotees] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [fmap, setFmap] = useState({});           // devoteeId -> followup record (for selected event)
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);

  useEffect(() => {
    setEvents(dataService.getEvents());
    setDevotees(dataService.getDevotees());
  }, []);

  const openEvent = (ev) => {
    const list = dataService.getFollowupsForEvent(ev.id);
    const m = {}; list.forEach(f => { m[f.devoteeId] = f; });
    setFmap(m); setSelectedEvent(ev);
    setSearch(''); setSelectedTags([]); setPendingOnly(false); setShowTagPanel(false);
  };

  const contacted = (f) => !!(f && (f.call || f.inPerson || f.message || f.outcome));

  const submitEvent = (e) => {
    e.preventDefault();
    if (!eventForm.title.trim()) return;
    dataService.addSabha({
      title: eventForm.title.trim(),
      date: eventForm.date,
      time: eventForm.time,
      venue: eventForm.venue,
      type: eventForm.type,
    });
    setEvents(dataService.getEvents());
    setShowEventModal(false);
    setEventForm(emptyEventForm());
  };

  const save = (devId, patch) => {
    const rec = dataService.saveFollowup(selectedEvent.id, devId, { ...(fmap[devId] || {}), ...patch });
    setFmap(prev => ({ ...prev, [devId]: rec }));
  };

  const toggleTag = (key) =>
    setSelectedTags(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // Audience = devotees matching search + tag filter (+ pending filter)
  const audience = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devotees.filter(d => {
      if (q && !((d.name || '').toLowerCase().includes(q) || String(d.mobile || '').includes(search))) return false;
      if (selectedTags.length && !hasAnyTag(d, selectedTags)) return false;
      if (pendingOnly && contacted(fmap[d.id])) return false;
      return true;
    });
  }, [devotees, search, selectedTags, pendingOnly, fmap]);

  // Summary over the current (search + tag) audience, ignoring the pendingOnly view filter
  const summary = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = devotees.filter(d => {
      if (q && !((d.name || '').toLowerCase().includes(q) || String(d.mobile || '').includes(search))) return false;
      if (selectedTags.length && !hasAnyTag(d, selectedTags)) return false;
      return true;
    });
    const s = { total: base.length, contacted: 0, coming: 0, notComing: 0, maybe: 0, pending: 0 };
    base.forEach(d => {
      const f = fmap[d.id];
      if (contacted(f)) s.contacted++; else s.pending++;
      if (f?.outcome === 'Coming') s.coming++;
      else if (f?.outcome === 'Not Coming') s.notComing++;
      else if (f?.outcome === 'Maybe') s.maybe++;
    });
    return s;
  }, [devotees, search, selectedTags, fmap]);

  const waLink = (d) => {
    const num = String(d.whatsapp || d.mobile || '').replace(/\D/g, '');
    const to = num.length === 10 ? '91' + num : num;
    const txt = encodeURIComponent(`Jai Swaminarayan ${d.firstName || d.name || ''}, aavtaa ${selectedEvent?.title || 'sabha'} (${selectedEvent?.date || ''}) ma jarur padharjo. 🙏`);
    return `https://wa.me/${to}?text=${txt}`;
  };

  // ---------------- EVENT LIST VIEW ----------------
  if (!selectedEvent) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Event Follow-ups</h1>
            <p className="text-sm font-medium text-text-muted">
              Pick an event to run a follow-up drive — call, meet, or message devotees and track who is coming.
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => { setEventForm(emptyEventForm()); setShowEventModal(true); }}
              className="flex shrink-0 items-center gap-2 rounded-2xl bg-[#FF862A] px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#e06f19] active:scale-95"
            >
              <Plus className="h-4 w-4" /> New Event
            </button>
          )}
        </div>

        {events.length === 0 && (
          <div className="rounded-3xl border border-dashed border-[#CBD8E6] bg-surface p-10 text-center">
            <CalendarCheck className="mx-auto h-8 w-8 text-text-muted" />
            <p className="mt-2 text-sm font-semibold text-text-main">No events yet</p>
            <p className="text-xs text-slate-400">Use “+ New Event” to create a Sabha — it becomes an event here.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map(ev => {
            const done = dataService.getFollowupsForEvent(ev.id).filter(contacted).length;
            return (
              <button key={ev.id} onClick={() => openEvent(ev)}
                className="text-left rounded-3xl border border-border-light bg-surface p-6 shadow-xs transition-all hover:border-primary hover:shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="rounded-full bg-[#EAF0F7] px-3 py-1 text-[11px] font-bold text-[#1F3A5F]">{ev.type || 'Sabha'}</span>
                  <span className="text-xs font-semibold text-text-muted">{ev.date}</span>
                </div>
                <h3 className="text-base font-bold text-text-main mb-1">{ev.title}</h3>
                <p className="text-xs text-slate-500 mb-4">{ev.time} • {ev.venue}</p>
                <div className="pt-3 border-t border-border-light flex items-center justify-between">
                  <span className="text-xs text-slate-500"><span className="font-extrabold text-text-main">{done}</span> contacted</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-[#FF862A]">Open drive <ChevronRight className="h-4 w-4" /></span>
                </div>
              </button>
            );
          })}
        </div>

        {showEventModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-xl max-h-[85vh] overflow-y-auto">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-text-main">New Event</h2>
                <button onClick={() => setShowEventModal(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-light text-slate-400 hover:text-text-main">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={submitEvent} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">Title *</label>
                  <input required value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Weekly Satsang Sabha"
                    className="w-full rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">Date</label>
                    <input type="date" value={eventForm.date} onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">Time</label>
                    <input value={eventForm.time} onChange={e => setEventForm(f => ({ ...f, time: e.target.value }))}
                      placeholder="06:00 PM"
                      className="w-full rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">Venue</label>
                  <input value={eventForm.venue} onChange={e => setEventForm(f => ({ ...f, venue: e.target.value }))}
                    placeholder="e.g. Mandir Hall"
                    className="w-full rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">Type</label>
                  <select value={eventForm.type} onChange={e => setEventForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary">
                    {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowEventModal(false)}
                    className="rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-bold text-text-muted hover:text-text-main">
                    Cancel
                  </button>
                  <button type="submit"
                    className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#00264a] active:scale-95">
                    Create Event
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------- FOLLOW-UP BOARD VIEW ----------------
  const chips = [
    { label: 'Audience', value: summary.total, cls: 'text-text-main' },
    { label: 'Contacted', value: summary.contacted, cls: 'text-sky-600' },
    { label: 'Coming', value: summary.coming, cls: 'text-emerald-600' },
    { label: 'Maybe', value: summary.maybe, cls: 'text-amber-600' },
    { label: 'Not Coming', value: summary.notComing, cls: 'text-red-600' },
    { label: 'Pending', value: summary.pending, cls: 'text-slate-500' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-5">
      <button onClick={() => setSelectedEvent(null)} className="flex items-center gap-1.5 text-xs font-bold text-text-main hover:text-[#FF862A]">
        <ArrowLeft className="h-4 w-4" /> All events
      </button>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#EAF0F7] px-3 py-1 text-[11px] font-bold text-[#1F3A5F]">{selectedEvent.type || 'Sabha'}</span>
          <h1 className="text-xl font-bold text-text-main">{selectedEvent.title}</h1>
        </div>
        <p className="text-sm font-medium text-text-muted">{selectedEvent.date} • {selectedEvent.time} • {selectedEvent.venue}</p>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {chips.map(c => (
          <div key={c.label} className="rounded-2xl border border-border-light bg-surface px-3 py-2 text-center shadow-xs">
            <p className={`text-xl font-extrabold ${c.cls}`}>{c.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or mobile…"
              className="w-full rounded-2xl border border-border-light bg-surface pl-10 pr-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTagPanel(v => !v)}
              className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold ${selectedTags.length ? 'border-primary bg-[#EAF0F7] text-text-main' : 'border-border-light bg-surface text-text-muted'}`}>
              <Filter className="h-4 w-4" /> Tags{selectedTags.length ? ` (${selectedTags.length})` : ''}
            </button>
            <button onClick={() => setPendingOnly(v => !v)}
              className={`rounded-2xl border px-4 py-2.5 text-sm font-bold ${pendingOnly ? 'border-[#FF862A] bg-amber-50 text-[#C8642B]' : 'border-border-light bg-surface text-text-muted'}`}>
              Pending only
            </button>
          </div>
        </div>

        {showTagPanel && (
          <div className="rounded-2xl border border-border-light bg-surface p-4 space-y-3 max-h-[40vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-text-main">Target audience by tag — showing devotees with ANY selected tag</p>
              {selectedTags.length > 0 && (
                <button onClick={() => setSelectedTags([])} className="text-xs font-bold text-[#FF862A]">Clear</button>
              )}
            </div>
            {tagsByCategory().map(({ category, tags }) => (
              <div key={category.key}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{category.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => {
                    const on = selectedTags.includes(t.key);
                    return (
                      <button key={t.key} onClick={() => toggleTag(t.key)}
                        style={on ? tagChipStyle(t.key) : undefined}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${on ? '' : 'border border-border-light text-slate-500'}`}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Roster */}
      <div className="space-y-2">
        {audience.slice(0, AUDIENCE_CAP).map(d => {
          const f = fmap[d.id] || {};
          const Tick = ({ on, onClick, icon: Icon, label }) => (
            <button onClick={onClick} title={label}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${on ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-slate-400 hover:border-primary'}`}>
              <Icon className="h-4 w-4" />
            </button>
          );
          return (
            <div key={d.id} className="rounded-2xl border border-border-light bg-surface p-3 shadow-xs">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                {/* identity */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-text-main truncate">{d.name}</p>
                    {contacted(f) && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" /> {d.mobile || '—'}</p>
                  {d.tags?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.tags.slice(0, 3).map(k => (
                        <span key={k} style={tagChipStyle(k)} className="rounded-full px-2 py-0.5 text-[9px] font-bold">{tagLabel(k)}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Tick on={!!f.call} onClick={() => save(d.id, { call: !f.call })} icon={PhoneCall} label="Called" />
                  <Tick on={!!f.inPerson} onClick={() => save(d.id, { inPerson: !f.inPerson })} icon={UserRound} label="Met in person" />
                  <Tick on={!!f.message} onClick={() => save(d.id, { message: !f.message })} icon={MessageSquare} label="Messaged" />

                  <select value={f.outcome || ''} onChange={e => save(d.id, { outcome: e.target.value })}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold outline-none ${OUTCOME_STYLE[f.outcome || '']}`}>
                    <option value="">No response</option>
                    {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>

                  <a href={waLink(d)} target="_blank" rel="noreferrer"
                    className="flex h-8 items-center gap-1 rounded-xl bg-emerald-50 px-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    title="Send WhatsApp invite">
                    <MessageSquare className="h-3.5 w-3.5" /> WA
                  </a>
                </div>
              </div>

              <input
                defaultValue={f.remark || ''}
                onBlur={e => { if (e.target.value !== (f.remark || '')) save(d.id, { remark: e.target.value }); }}
                placeholder="Remark (assigned karyakarta, notes)…"
                className="mt-2 w-full rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] px-3 py-1.5 text-xs text-text-main outline-none focus:border-primary" />
            </div>
          );
        })}

        {audience.length === 0 && (
          <p className="text-center text-xs text-text-muted py-8">No devotees match this filter.</p>
        )}
        {audience.length > AUDIENCE_CAP && (
          <p className="text-center text-xs text-text-muted">Showing first {AUDIENCE_CAP} of {audience.length}. Use search or tags to narrow the audience.</p>
        )}
      </div>
    </div>
  );
}
