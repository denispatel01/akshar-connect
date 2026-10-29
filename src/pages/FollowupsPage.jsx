import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  PhoneCall, Phone, Users2, Users, ArrowLeft, Search, Filter, X, Check,
  CalendarCheck, ClipboardList, MessageSquare, UserRound, ChevronRight, ChevronDown, MapPin, Plus, Pencil, Trash2
} from 'lucide-react';
import { dataService } from '../services/dataService';
import AutoTextarea from '../components/AutoTextarea';
import { tagsByCategory, tagChipStyle, tagLabel } from '../services/tagCatalog';
import { hasAnyTag } from '../services/devoteeSchema';
import { devoteeMatches } from '../utils/search';
import { alertSuccess, alertError, confirmDialog } from '../utils/sweetAlert';

// Default outcome options for a normal (attendance) event. Each event can now
// define its OWN set — e.g. a Ghari Seva drive uses order-focused outcomes.
const DEFAULT_OUTCOMES = ['Coming', 'Maybe', 'Not Coming', 'Call not received'];
// One-tap preset for a Ghari Seva follow-up drive.
const GHARI_OUTCOMES = ['Ghari order placed', 'Not interested', 'Did not receive a call', 'Unable to contact'];
const OUTCOME_PRESETS = [
  { label: 'Attendance (default)', outcomes: DEFAULT_OUTCOMES },
  { label: 'Ghari Seva', outcomes: GHARI_OUTCOMES },
];
const OUTCOME_STYLE = {
  'Coming': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Maybe': 'bg-amber-100 text-amber-700 border-amber-200',
  'Not Coming': 'bg-red-100 text-red-700 border-red-200',
  'Call not received': 'bg-slate-100 text-slate-600 border-slate-200',
  'Ghari order placed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Not interested': 'bg-red-100 text-red-700 border-red-200',
  'Did not receive a call': 'bg-slate-100 text-slate-600 border-slate-200',
  'Unable to contact': 'bg-amber-100 text-amber-700 border-amber-200',
  '': 'bg-surface text-slate-500 border-border-light',
};
// Style for any outcome (custom ones fall back to a neutral chip).
const outcomeStyle = (o) => OUTCOME_STYLE[o] || (o ? 'bg-sky-100 text-sky-700 border-sky-200' : OUTCOME_STYLE['']);
// Events store outcomes as a pipe-joined string; parse to a clean array.
const parseOutcomes = (v) => {
  const arr = Array.isArray(v) ? v : String(v || '').split('|');
  const out = arr.map(s => String(s).trim()).filter(Boolean);
  return out.length ? out : DEFAULT_OUTCOMES;
};
// Display a karyakarta full name as first + last only (drop middle name(s)).
const firstLastName = (full) => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return parts.length <= 2 ? parts.join(' ') : `${parts[0]} ${parts[parts.length - 1]}`;
};
const AUDIENCE_CAP = 250;
const EVENT_TYPES = ['Sabha', 'Seva', 'Event', 'Padhramani', 'Samaiyo', 'Karyakarta Sabha/Shibir'];
const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyEventForm = () => ({ title: '', date: todayStr(), time: '06:00 PM', venue: '', type: 'Sabha', description: '', tags: [], outcomes: [...DEFAULT_OUTCOMES], familyWise: false });
// Event tags are stored as a pipe-joined string on the backend; parse to an array.
const parseEventTags = (v) => Array.isArray(v) ? v : String(v || '').split('|').map(s => s.trim()).filter(Boolean);

// Defined at module scope so the roster doesn't remount on every keystroke/save.
function Tick({ on, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${on ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-slate-400 hover:border-primary'}`}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

// Compose + send a push reminder to the devotees currently listed, or to their
// karyakartas. Recipients are resolved to mobile numbers (the backend pushes to
// each number's registered devices). Devotees without a logged-in device simply
// don't receive it — the result tells you how many were reached.
function ReminderModal({ event, who, audience, karyakartaMobileFor, onClose }) {
  const recipients = useMemo(() => {
    const seen = new Set();
    const out = [];
    if (who === 'devotees') {
      audience.forEach(d => {
        const m = String(d.mobile || '').replace(/\D/g, '');
        if (!m || seen.has(m)) return; seen.add(m);
        out.push({ name: d.name, mobile: m });
      });
    } else {
      const names = new Set();
      audience.forEach(d => { const k = (d.followupKaryakarta || '').trim(); if (k) names.add(k); });
      [...names].sort().forEach(name => {
        const m = String(karyakartaMobileFor(name) || '').replace(/\D/g, '');
        if (!m || seen.has(m)) return; seen.add(m);
        out.push({ name: firstLastName(name), mobile: m });
      });
    }
    return out;
  }, [who, audience, karyakartaMobileFor]);

  const defaultBody = who === 'devotees'
    ? `Jai Swaminarayan 🙏 Reminder: ${event?.title || 'Sabha'} on ${event?.date || ''}${event?.time ? ' at ' + event.time : ''}${event?.venue ? ', ' + event.venue : ''}. Please do attend.`
    : `Jai Swaminarayan 🙏 Please complete your follow-up calls for ${event?.title || 'the sabha'} (${event?.date || ''}). Thank you for your seva.`;
  const [title, setTitle] = useState(`${event?.title || 'Event'} — reminder`);
  const [body, setBody] = useState(defaultBody);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) { alertError('Message needed', 'Enter a title and message.'); return; }
    if (!recipients.length) { alertError('No recipients', `No ${who} with a mobile number in this list.`); return; }
    setBusy(true);
    try {
      const r = await dataService.sendFollowupReminder({ title: title.trim(), body: body.trim(), mobiles: recipients.map(x => x.mobile) });
      onClose();
      alertSuccess('Reminder sent', `Delivered to ${r.reached || 0} of ${recipients.length} ${who} (${r.sent || 0} device${r.sent === 1 ? '' : 's'}). People without the app installed aren't reached.`);
    } catch (e) { alertError('Could not send', e.message || 'Try again.'); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-text-main"><PhoneCall className="h-4 w-4 text-[#FF862A]" /> Push reminder to {who}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full rounded-2xl border border-border-light bg-surface px-3 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Message</label>
            <AutoTextarea value={body} onChange={e => setBody(e.target.value)} minRows={3}
              className="w-full rounded-2xl border border-border-light bg-surface px-3 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
          </div>
          <div className="rounded-2xl border border-border-light bg-bg-base px-3 py-2">
            <p className="text-[11px] font-black uppercase tracking-wide text-text-muted">{recipients.length} recipient{recipients.length === 1 ? '' : 's'}</p>
            <p className="mt-1 text-[12px] text-text-main/90 line-clamp-3">{recipients.map(r => r.name).join(', ') || 'None with a mobile number'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border-light p-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border-light py-2.5 text-sm font-bold text-text-muted">Cancel</button>
          <button onClick={send} disabled={busy || !recipients.length}
            className="flex-[1.4] rounded-xl bg-[#FF862A] py-2.5 text-sm font-black text-white shadow-md active:scale-95 disabled:opacity-50">
            {busy ? 'Sending…' : `Send to ${recipients.length}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function FollowupsPage({ user }) {
  const canManage = user?.role === 'Admin' || user?.role === 'Sevak';
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState(emptyEventForm());
  const [editingEventId, setEditingEventId] = useState(null); // null = creating
  const [events, setEvents] = useState([]);
  const [devotees, setDevotees] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventMsg, setEventMsg] = useState(''); // transient success toast after create/edit
  const [highlightEventId, setHighlightEventId] = useState(null); // newly created event card to highlight
  const [fmap, setFmap] = useState({});           // devoteeId -> followup record (for selected event)
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [viewFilter, setViewFilter] = useState('all'); // all | pending | contacted
  const [karyakarta, setKaryakarta] = useState('');
  const [sortBy, setSortBy] = useState(''); // '' = Name A–Z | joinedDesc | joinedAsc | areaAsc | areaDesc
  const [headsOnly, setHeadsOnly] = useState(false); // show only family heads (Primary members)
  const [collapsedAreas, setCollapsedAreas] = useState(new Set()); // area names collapsed in a family-wise drive
  const toggleArea = (area) => setCollapsedAreas(prev => { const n = new Set(prev); n.has(area) ? n.delete(area) : n.add(area); return n; });
  // Area name (lowercased) -> assigned number from the Area Master, for area sorting.
  const areaNumMap = useMemo(() => {
    const m = {};
    (dataService.getAreas() || []).forEach(a => { if (a.name) m[String(a.name).trim().toLowerCase()] = a.number; });
    return m;
  }, []);
  // When set, the roster is filtered to devotees with this exact outcome — set by
  // tapping an outcome summary chip, so each count drills into its devotee list.
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [reminder, setReminder] = useState(null); // { who:'devotees'|'karyakartas' } while composing
  // Which roster cards have their call/in-person/message log expanded. Collapsed by
  // default — a karyakarta opens it only when they actually want to log a contact.
  const [openLog, setOpenLog] = useState({});

  useEffect(() => {
    setEvents(dataService.getEvents());
    // Dedupe by id — a sync/merge can leave the same devotee record in the array
    // more than once, which otherwise renders the same person as multiple cards
    // and double-counts them in the summary. Keep the first occurrence of each id.
    const seen = new Set();
    setDevotees(dataService.getDevotees().filter(d => (seen.has(d.id) ? false : (seen.add(d.id), true))));
  }, []);

  // Distinct follow-up karyakarta names (for the "my devotees" filter).
  const karyakartaOptions = useMemo(() => {
    const set = new Set();
    devotees.forEach(d => { const k = (d.followupKaryakarta || '').trim(); if (k) set.add(k); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [devotees]);

  // Default the filter to the signed-in karyakarta when their name matches one.
  useEffect(() => {
    if (karyakarta || !user?.name || !karyakartaOptions.length) return;
    const mine = karyakartaOptions.find(k => k.toLowerCase() === user.name.trim().toLowerCase());
    if (mine) setKaryakarta(mine);
  }, [karyakartaOptions, user, karyakarta]);

  const openEvent = (ev) => {
    const list = dataService.getFollowupsForEvent(ev.id);
    const m = {}; list.forEach(f => { m[f.devoteeId] = f; });
    setFmap(m); setSelectedEvent(ev);
    // Pre-filter the drive to the event's audience tags, so a karyakarta only sees
    // the relevant devotees (e.g. an event tagged "Friday Sabha" shows only them).
    const evTags = parseEventTags(ev.tags);
    setSearch(''); setSelectedTags(evTags); setViewFilter('all'); setShowTagPanel(false);
    // A family-wise drive (e.g. Annakutt Seva) opens showing one card per family
    // head by default — the seva is logged per household, not per person. The user
    // can still turn the "Family heads" filter off to see every member.
    setHeadsOnly(!!ev.familyWise); setOutcomeFilter('');
  };

  const contacted = (f) => !!(f && (f.call || f.inPerson || f.message || f.outcome));

  const submitEvent = (e) => {
    e.preventDefault();
    if (!eventForm.title.trim()) return;
    const payload = {
      title: eventForm.title.trim(),
      date: eventForm.date,
      time: eventForm.time,
      venue: eventForm.venue,
      type: eventForm.type,
      description: eventForm.description || '',
      tags: parseEventTags(eventForm.tags).join('|'),
      outcomes: (eventForm.outcomes && eventForm.outcomes.length ? eventForm.outcomes : DEFAULT_OUTCOMES).join('|'),
      familyWise: !!eventForm.familyWise,
    };
    const isNew = !editingEventId;
    const saved = editingEventId ? dataService.updateSabha(editingEventId, payload) : dataService.addSabha(payload);
    setEvents(dataService.getEvents());
    setShowEventModal(false);
    setEventForm(emptyEventForm());
    setEditingEventId(null);
    // Centered SweetAlert success (#102), closes on OK.
    alertSuccess(isNew ? 'Event created' : 'Event updated', `"${payload.title}" was ${isNew ? 'created' : 'updated'} successfully.`);
    if (saved) {
      setHighlightEventId(saved.id);
      setTimeout(() => setHighlightEventId(null), 3500);
      setTimeout(() => {
        const el = document.getElementById(`event-card-${saved.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  const openNewEvent = () => { setEditingEventId(null); setEventForm(emptyEventForm()); setShowEventModal(true); };
  const openEditEvent = (ev) => {
    setEditingEventId(ev.id);
    setEventForm({ title: ev.title || '', date: ev.date || todayStr(), time: ev.time || '', venue: ev.venue || '', type: ev.type || 'Sabha', description: ev.description || '', tags: parseEventTags(ev.tags), outcomes: parseOutcomes(ev.outcomes), familyWise: !!ev.familyWise });
    setShowEventModal(true);
  };
  const deleteEvent = async (ev) => {
    if (!(await confirmDialog({ title: 'Delete event?', text: `Delete event "${ev.title}"? This also removes its follow-up records. This cannot be undone.`, confirmText: 'Delete', danger: true }))) return;
    dataService.deleteSabha(ev.id);
    setEvents(dataService.getEvents());
  };

  const save = (devId, patch) => {
    const rec = dataService.saveFollowup(selectedEvent.id, devId, { ...(fmap[devId] || {}), ...patch });
    setFmap(prev => ({ ...prev, [devId]: rec }));
  };

  // ── Family-aware follow-up ────────────────────────────────────────────────
  // A drive has separate male/female karyakartas, but a family often answers as a
  // unit (the head says "my whole family is coming"). So two things are needed:
  //  1) VISIBILITY — when one karyakarta opens a devotee, they can see that another
  //     already contacted someone in the same family, who, and what they said.
  //  2) BULK MARK — one tap applies an outcome to every family member, while each
  //     member's own outcome can still be overridden afterwards (partial: 2 coming,
  //     2 not is just two different per-member outcomes).
  const familyMembers = useMemo(() => {
    const m = new Map();
    devotees.forEach(d => {
      if (!d.familyId) return;
      if (!m.has(d.familyId)) m.set(d.familyId, []);
      m.get(d.familyId).push(d);
    });
    return m;
  }, [devotees]);

  // Apply one outcome to every member of the family at once.
  const applyToFamily = (d, outcome) => {
    const members = familyMembers.get(d.familyId) || [d];
    members.forEach(m => save(m.id, { outcome }));
  };

  // Tags the event was created with are LOCKED during follow-up — they define the
  // event's audience, so a sevak must not be able to remove them by mistake (#64).
  // They can still ADD extra filter tags to narrow the list further.
  const lockedEventTags = useMemo(() => parseEventTags(selectedEvent?.tags), [selectedEvent]);
  const toggleTag = (key) => {
    if (lockedEventTags.includes(key)) return; // locked — cannot remove/toggle off
    setSelectedTags(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Audience = devotees matching search + tag filter (+ pending filter)
  const audience = useMemo(() => {
    const q = search.trim().toLowerCase();
    const areaNum = (d) => {
      const n = areaNumMap[String(d.area || '').trim().toLowerCase()];
      return (n === undefined || n === '' || isNaN(parseInt(n, 10))) ? null : parseInt(n, 10);
    };
    return devotees.filter(d => {
      if (headsOnly && d.type !== 'Primary') return false;
      if (q && !devoteeMatches(d, search)) return false;
      if (karyakarta && (d.followupKaryakarta || '').trim() !== karyakarta) return false;
      if (selectedTags.length && !hasAnyTag(d, selectedTags)) return false;
      if (viewFilter === 'pending' && contacted(fmap[d.id])) return false;
      if (viewFilter === 'contacted' && !contacted(fmap[d.id])) return false;
      if (outcomeFilter && (fmap[d.id]?.outcome || '') !== outcomeFilter) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === 'joinedDesc') return String(b.dateOfJoining || '').localeCompare(String(a.dateOfJoining || ''));
      if (sortBy === 'joinedAsc') return String(a.dateOfJoining || '').localeCompare(String(b.dateOfJoining || ''));
      if (sortBy === 'areaAsc' || sortBy === 'areaDesc') {
        const na = areaNum(a), nb = areaNum(b);
        if (na === null && nb === null) return String(a.area || '').localeCompare(String(b.area || ''));
        if (na === null) return 1;   // unnumbered areas last
        if (nb === null) return -1;
        return sortBy === 'areaAsc' ? na - nb : nb - na;
      }
      return String(a.name || '').localeCompare(String(b.name || '')); // A→Z
    });
  }, [devotees, search, selectedTags, viewFilter, fmap, karyakarta, outcomeFilter, sortBy, headsOnly, areaNumMap]);

  // Name → mobile for karyakartas (so a reminder can reach the karyakartas, not
  // only the devotees). Matches the assigned/default karyakarta name to a devotee
  // record; exact match, then unique first+last-words match.
  const karyakartaMobileFor = useMemo(() => {
    const exact = new Map();
    devotees.forEach(d => { if (d.name && d.mobile) exact.set(d.name.trim().toLowerCase(), d.mobile); });
    return (name) => {
      const q = String(name || '').trim().toLowerCase();
      if (!q) return '';
      if (exact.has(q)) return exact.get(q);
      const words = q.split(/\s+/).filter(Boolean);
      const hits = devotees.filter(d => d.mobile && d.name && (() => {
        const nw = String(d.name).toLowerCase().split(/\s+/).filter(Boolean);
        return words.every(w => nw.includes(w));
      })());
      return hits.length === 1 ? hits[0].mobile : '';
    };
  }, [devotees]);

  // Summary over the current (search + tag) audience, ignoring the pendingOnly view filter
  const summary = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = devotees.filter(d => {
      if (headsOnly && d.type !== 'Primary') return false;
      if (q && !devoteeMatches(d, search)) return false;
      if (karyakarta && (d.followupKaryakarta || '').trim() !== karyakarta) return false;
      if (selectedTags.length && !hasAnyTag(d, selectedTags)) return false;
      return true;
    });
    const s = { total: base.length, contacted: 0, pending: 0, byOutcome: {} };
    base.forEach(d => {
      const f = fmap[d.id];
      if (contacted(f)) s.contacted++; else s.pending++;
      if (f?.outcome) s.byOutcome[f.outcome] = (s.byOutcome[f.outcome] || 0) + 1;
    });
    return s;
  }, [devotees, search, selectedTags, fmap, karyakarta, headsOnly]);

  // This event's own outcome options (Ghari Seva drives differ from attendance).
  const eventOutcomes = useMemo(() => parseOutcomes(selectedEvent?.outcomes), [selectedEvent]);

  const telLink = (d) => {
    const num = String(d.mobile || d.whatsapp || '').replace(/\D/g, '');
    if (!num) return null;
    return `tel:${num.length === 10 ? '+91' + num : (num.startsWith('91') ? '+' + num : num)}`;
  };

  const waLink = (d) => {
    const num = String(d.whatsapp || d.mobile || '').replace(/\D/g, '');
    const to = num.length === 10 ? '91' + num : num;
    const txt = encodeURIComponent(`Jai Swaminarayan ${d.firstName || d.name || ''}, aavtaa ${selectedEvent?.title || 'sabha'} (${selectedEvent?.date || ''}) ma jarur padharjo. 🙏`);
    return `https://wa.me/${to}?text=${txt}`;
  };

  // ---------------- EVENT LIST VIEW ----------------
  // Transient success toast shown after creating / editing an event (#63).
  const eventToast = eventMsg ? (
    <div className="fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-xl animate-[fadeIn_0.2s_ease-out]">
      {eventMsg}
    </div>
  ) : null;

  if (!selectedEvent) {
    return (
      <>
      {eventToast}
      <div className="w-full mx-auto max-w-[1600px] px-4 py-6 sm:px-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-main">📞 Event Follow-ups</h1>
            <p className="text-sm font-medium text-text-muted">
              Pick an event to run a follow-up drive — call, meet, or message devotees and track who is coming.
            </p>
          </div>
          {canManage && (
            <button
              onClick={openNewEvent}
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...events].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(ev => {
            const done = dataService.getFollowupsForEvent(ev.id).filter(contacted).length;
            return (
              <div key={ev.id} id={`event-card-${ev.id}`}
                className={`rounded-3xl border bg-surface p-6 shadow-xs transition-all hover:border-primary hover:shadow-md ${highlightEventId === ev.id ? 'border-primary ring-4 ring-primary/30 animate-[fadeIn_0.3s_ease-out]' : 'border-border-light'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="rounded-full bg-[#EAF0F7] px-3 py-1 text-[11px] font-bold text-[#1F3A5F]">{ev.type || 'Sabha'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-muted">{ev.date}</span>
                    {canManage && (
                      <>
                        <button onClick={() => openEditEvent(ev)} title="Edit event"
                          className="grid h-7 w-7 place-items-center rounded-lg text-text-muted hover:bg-bg-base hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteEvent(ev)} title="Delete event"
                          className="grid h-7 w-7 place-items-center rounded-lg text-text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => openEvent(ev)} className="w-full text-left">
                  <h3 className="text-base font-bold text-text-main mb-1 break-words leading-snug">{ev.title}</h3>
                  <p className="text-xs text-slate-500 mb-4 break-words">{ev.time} • {ev.venue}</p>
                  <div className="pt-3 border-t border-border-light flex items-center justify-between">
                    <span className="text-xs text-slate-500"><span className="font-extrabold text-text-main">{done}</span> contacted</span>
                    <span className="flex items-center gap-1 text-xs font-bold text-[#FF862A]">Open drive <ChevronRight className="h-4 w-4" /></span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {showEventModal && createPortal(
          <div className="fixed inset-0 z-[60] bg-bg-base flex flex-col"
            style={{ paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)', paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)' }}
            onTouchStart={(e)=>e.stopPropagation()} onTouchEnd={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border-light bg-surface px-4 sm:px-6 py-4 shrink-0">
              <h2 className="text-lg font-bold text-text-main">{editingEventId ? 'Edit Event' : 'New Event'}</h2>
              <button onClick={() => { setShowEventModal(false); setEditingEventId(null); }}
                className="grid h-9 w-9 place-items-center rounded-full text-text-muted hover:bg-bg-base hover:text-text-main">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitEvent} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">Title *</label>
                  <input required value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Weekly Satsang Sabha"
                    className="w-full rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                {/* Family-wise drives (e.g. Annakutt Seva) are tracked per household,
                    so the drive opens showing one card per family head. */}
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border-light bg-surface px-4 py-3">
                  <input type="checkbox" checked={!!eventForm.familyWise}
                    onChange={e => setEventForm(f => ({ ...f, familyWise: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#FF862A]" />
                  <span>
                    <span className="block text-sm font-bold text-text-main">👨‍👩‍👧 Family-wise drive</span>
                    <span className="block text-[11px] font-semibold text-text-muted">The seva is logged per household (e.g. Annakutt Seva). The drive opens showing only family heads — set each family's outcome once. Karyakartas can still turn this off.</span>
                  </span>
                </label>
                {/* Follow-up outcome options — editable per event. A Ghari Seva drive
                    needs order-focused outcomes, not "Coming / Not coming". */}
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">Follow-up outcome options</label>
                  <p className="mb-1.5 text-[10px] font-semibold text-text-muted">These are the choices a karyakarta can pick when they follow up each devotee. Add, rename or remove them for this event.</p>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {OUTCOME_PRESETS.map(p => (
                      <button type="button" key={p.label} onClick={() => setEventForm(f => ({ ...f, outcomes: [...p.outcomes] }))}
                        className="rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/10">
                        Use “{p.label}” set
                      </button>
                    ))}
                  </div>
                  <div className="rounded-xl border border-border-light p-2 space-y-1.5">
                    {eventForm.outcomes.map((o, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={o}
                          onChange={e => setEventForm(f => { const n = [...f.outcomes]; n[i] = e.target.value; return { ...f, outcomes: n }; })}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1 rounded-lg border border-border-light bg-surface px-3 py-1.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
                        <button type="button" onClick={() => setEventForm(f => ({ ...f, outcomes: f.outcomes.filter((_, j) => j !== i) }))}
                          title="Remove option" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setEventForm(f => ({ ...f, outcomes: [...f.outcomes, ''] }))}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-primary/5"><Plus className="h-3.5 w-3.5" /> Add option</button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">Description <span className="normal-case text-slate-400">(optional)</span></label>
                  <AutoTextarea value={eventForm.description} onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))}
                    minRows={2} placeholder="Notes about this event…"
                    className="w-full rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">Devotee tags <span className="normal-case text-slate-400">(optional)</span></label>
                  <p className="mb-1.5 text-[10px] font-semibold text-text-muted">The drive will show only devotees who have ANY selected tag — so karyakartas skip irrelevant records.</p>
                  <div className="rounded-xl border border-border-light p-2 space-y-2">
                    {tagsByCategory().map(({ category, tags }) => (
                      <div key={category.key}>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{category.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map(t => {
                            const on = eventForm.tags.includes(t.key);
                            return (
                              <button type="button" key={t.key}
                                onClick={() => setEventForm(f => ({ ...f, tags: on ? f.tags.filter(k => k !== t.key) : [...f.tags, t.key] }))}
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
                </div>
                </div>
              </div>
              <div className="shrink-0 border-t border-border-light bg-surface px-4 sm:px-6 py-3 flex items-center justify-end gap-2">
                <button type="button" onClick={() => { setShowEventModal(false); setEditingEventId(null); }}
                  className="rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-bold text-text-muted hover:text-text-main">
                  Cancel
                </button>
                <button type="submit"
                  className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#00264a] active:scale-95">
                  {editingEventId ? 'Save Changes' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        , document.body)}
      </div>
      </>
    );
  }

  // ---------------- FOLLOW-UP BOARD VIEW ----------------
  // Positive-sounding outcomes (coming / order placed) show green, clearly-negative
  // ones red, the rest neutral — so the chip row reads at a glance for any outcome set.
  const outcomeChipCls = (o) => /coming|placed|yes|done|interested(?<!not interested)/i.test(o) && !/not /i.test(o)
    ? 'text-emerald-600' : /not |unable|no\b|refus/i.test(o) ? 'text-red-600' : 'text-amber-600';
  // Each chip is a filter: tapping it shows exactly those devotees in the roster
  // below (so a count is never a dead end — you can see WHO is coming, etc.).
  const applyChip = (fn) => { fn(); try { requestAnimationFrame(() => window.scrollTo({ top: 400, behavior: 'smooth' })); } catch { /* ignore */ } };
  const chips = [
    { label: 'Devotees', value: summary.total, cls: 'text-text-main',
      active: !outcomeFilter && viewFilter === 'all', apply: () => { setOutcomeFilter(''); setViewFilter('all'); } },
    { label: 'Contacted', value: summary.contacted, cls: 'text-sky-600',
      active: !outcomeFilter && viewFilter === 'contacted', apply: () => { setOutcomeFilter(''); setViewFilter('contacted'); } },
    ...eventOutcomes.map(o => ({ label: o, value: summary.byOutcome[o] || 0, cls: outcomeChipCls(o),
      active: outcomeFilter === o, apply: () => { setOutcomeFilter(o); setViewFilter('all'); } })),
    { label: 'Pending', value: summary.pending, cls: 'text-slate-500',
      active: !outcomeFilter && viewFilter === 'pending', apply: () => { setOutcomeFilter(''); setViewFilter('pending'); } },
  ];

  return (
    <>
    {eventToast}
    <div className="w-full max-w-none px-4 py-6 sm:px-6 space-y-5">
      <button onClick={() => setSelectedEvent(null)} className="flex items-center gap-1.5 text-xs font-bold text-text-main hover:text-[#FF862A]">
        <ArrowLeft className="h-4 w-4" /> All events
      </button>

      <div className="flex flex-col gap-1">
        <span className="w-fit rounded-full bg-[#EAF0F7] px-3 py-1 text-[11px] font-bold text-[#1F3A5F]">{selectedEvent.type || 'Sabha'}</span>
        <h1 className="text-lg sm:text-xl font-bold text-text-main break-words leading-snug">{selectedEvent.title}</h1>
        <p className="text-sm font-medium text-text-muted break-words">{selectedEvent.date} • {selectedEvent.time} • {selectedEvent.venue}</p>
      </div>

      {/* Summary chips — tap one to list those devotees below. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {chips.map(c => (
          <button key={c.label} onClick={() => applyChip(c.apply)}
            className={`rounded-2xl border px-3 py-2 text-center shadow-xs transition-all active:scale-95 ${c.active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border-light bg-surface hover:border-primary/40'}`}>
            <p className={`text-xl font-extrabold ${c.cls}`}>{c.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{c.label}</p>
          </button>
        ))}
      </div>

      {/* Reminder bar — send a push to the devotees currently listed, or to their
          karyakartas, nudging them about this event. Staff only. */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2.5">
          <span className="text-xs font-bold text-text-muted">
            Send push reminder{outcomeFilter ? ` · ${outcomeFilter}` : viewFilter !== 'all' ? ` · ${viewFilter}` : ''}:
          </span>
          <button onClick={() => setReminder({ who: 'devotees' })}
            className="flex items-center gap-1.5 rounded-xl bg-[#FF862A] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#e06f19] active:scale-95">
            <PhoneCall className="h-3.5 w-3.5" /> To devotees ({audience.length})
          </button>
          <button onClick={() => setReminder({ who: 'karyakartas' })}
            className="flex items-center gap-1.5 rounded-xl border border-primary bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 active:scale-95">
            <Users className="h-3.5 w-3.5" /> To karyakartas
          </button>
        </div>
      )}
      {reminder && (
        <ReminderModal
          event={selectedEvent}
          who={reminder.who}
          audience={audience}
          karyakartaMobileFor={karyakartaMobileFor}
          onClose={() => setReminder(null)}
        />
      )}

      {/* Controls */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, DOB or mobile…"
              className="w-full rounded-2xl border border-border-light bg-surface pl-10 pr-10 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
            {search && (
              <button type="button" onClick={() => setSearch('')} title="Clear search"
                className="absolute right-2.5 top-2 grid h-7 w-7 place-items-center rounded-full text-text-muted hover:bg-bg-base hover:text-text-main">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
            {karyakartaOptions.length > 0 && (
              <select value={karyakarta} onChange={e => setKaryakarta(e.target.value)}
                title="Filter to one karyakarta's devotees"
                className={`col-span-2 sm:col-auto w-full sm:w-auto min-w-0 truncate rounded-2xl border px-3 py-2.5 text-sm font-bold outline-none ${karyakarta ? 'border-primary bg-[#EAF0F7] text-text-main' : 'border-border-light bg-surface text-text-muted'}`}>
                <option value="">All karyakartas</option>
                {karyakartaOptions.map(k => <option key={k} value={k}>{firstLastName(k)}</option>)}
              </select>
            )}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} title="Sort"
              className={`col-span-2 sm:col-auto w-full sm:w-auto min-w-0 truncate rounded-2xl border px-3 py-2.5 text-sm font-bold outline-none ${sortBy ? 'border-primary bg-[#EAF0F7] text-text-main' : 'border-border-light bg-surface text-text-muted'}`}>
              <option value="">Sort: Name (A–Z)</option>
              <option value="joinedDesc">Recently joined</option>
              <option value="joinedAsc">Oldest joined</option>
              <option value="areaAsc">Area (1 → last)</option>
              <option value="areaDesc">Area (last → 1)</option>
            </select>
            <button onClick={() => setHeadsOnly(v => !v)}
              title="Show only family heads (primary members)"
              className={`col-span-2 sm:col-auto w-full sm:w-auto flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold ${headsOnly ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-muted'}`}>
              <UserRound className="h-4 w-4" /> Family heads
            </button>
            <button onClick={() => setShowTagPanel(v => !v)}
              className={`col-span-2 sm:col-auto w-full sm:w-auto flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold ${selectedTags.length ? 'border-primary bg-[#EAF0F7] text-text-main' : 'border-border-light bg-surface text-text-muted'}`}>
              <Filter className="h-4 w-4" /> Tags{selectedTags.length ? ` (${selectedTags.length})` : ''}
            </button>
            {/* Segmented filter takes its own full-width row on mobile with equal-width
                buttons so "Contacted" never clips off the screen edge. */}
            <div className="col-span-2 sm:col-auto flex w-full sm:w-auto overflow-hidden rounded-2xl border border-border-light">
              {[['all', 'All'], ['pending', 'Pending'], ['contacted', 'Contacted']].map(([v, label]) => (
                <button key={v} onClick={() => setViewFilter(v)}
                  className={`flex-1 sm:flex-none px-2.5 sm:px-3.5 py-2.5 text-sm font-bold transition-colors ${viewFilter === v ? (v === 'contacted' ? 'bg-emerald-500 text-white' : v === 'pending' ? 'bg-[#FF862A] text-white' : 'bg-primary text-white') : 'bg-surface text-text-muted'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {showTagPanel && (
          <div className="rounded-2xl border border-border-light bg-surface p-4 space-y-3 max-h-[40vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-text-main">Filter devotees by tag — showing devotees with ANY selected tag</p>
              {selectedTags.some(k => !lockedEventTags.includes(k)) && (
                <button onClick={() => setSelectedTags(prev => prev.filter(k => lockedEventTags.includes(k)))} className="text-xs font-bold text-[#FF862A]">Clear</button>
              )}
            </div>
            {lockedEventTags.length > 0 && (
              <p className="flex items-center gap-1.5 rounded-xl bg-[#EAF0F7] px-3 py-2 text-[11px] font-semibold text-[#1F3A5F]">
                🔒 This event's tags are fixed and cannot be removed during follow-up. You can add more tags to narrow the list.
              </p>
            )}
            {tagsByCategory().map(({ category, tags }) => (
              <div key={category.key}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{category.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => {
                    const on = selectedTags.includes(t.key);
                    const locked = lockedEventTags.includes(t.key);
                    return (
                      <button key={t.key} onClick={() => toggleTag(t.key)} disabled={locked}
                        title={locked ? "Fixed by this event — can't be removed" : undefined}
                        style={on ? tagChipStyle(t.key) : undefined}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${on ? '' : 'border border-border-light text-slate-500'} ${locked ? 'cursor-not-allowed ring-1 ring-[#1F3A5F]/30' : ''}`}>
                        {locked && '🔒 '}{t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Result count — devotees AND distinct families, since a drive is usually
          thought of per family (one head often answers for the whole household). */}
      {(() => {
        const famOf = (d) => d.familyId || `solo:${d.id}`;
        const shownFam = new Set(audience.map(famOf)).size;
        const totalFam = new Set(devotees.map(famOf)).size;
        return (
          <p className="text-xs font-bold text-text-muted">
            Showing <span className="text-text-main">{audience.length}</span> of {devotees.length} devotees
            {' · '}<span className="text-text-main">{shownFam}</span> of {totalFam} families
          </p>
        );
      })()}

      {/* Shared karyakarta suggestions for the per-card "Assign" inputs. */}
      <datalist id="followup-karyakarta-list">
        {karyakartaOptions.map(k => <option key={k} value={k} />)}
      </datalist>

      {/* Roster — flat grid, or grouped into collapsible areas for a family-wise drive. */}
      {(() => {
        const renderCard = (d) => {
          const f = fmap[d.id] || {};
          // All OTHER members of this devotee's family (contacted or not) — so a
          // karyakarta can mark each member coming / not coming right here.
          const famAll = d.familyId ? (familyMembers.get(d.familyId) || []).filter(m => m.id !== d.id) : [];
          // Assigned karyakarta = this follow-up's own override, else the devotee's
          // default assignee. "Done by" = who actually saved the follow-up — so if
          // Prerakbhai is assigned but Nirdoshbhai covered for him, both are visible.
          const assigned = (f.assignedTo || d.followupKaryakarta || '').trim();
          const doneBy = (f.contactedBy || '').trim();
          const coveredBy = contacted(f) && doneBy && assigned && doneBy.toLowerCase() !== assigned.toLowerCase();
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
                  {/* Assigned karyakarta + who actually did the follow-up (and when). */}
                  {assigned && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-text-muted">
                      <Users className="h-3 w-3" /> Assigned: <span className="text-text-main" title={assigned}>{firstLastName(assigned)}</span>
                    </p>
                  )}
                  {contacted(f) && doneBy && (
                    <p className={`mt-0.5 flex items-center gap-1 text-[11px] font-semibold ${coveredBy ? 'text-amber-600' : 'text-emerald-600'}`}>
                      <UserRound className="h-3 w-3" />
                      {coveredBy ? <>Done by {firstLastName(doneBy)} <span className="font-normal">(covered for {firstLastName(assigned)})</span></> : <>by {firstLastName(doneBy)}</>}
                      {f.contactedOn ? <span className="font-normal text-text-muted"> · {new Date(f.contactedOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span> : null}
                    </p>
                  )}
                  {d.tags?.length > 0 && (() => {
                    // Show the tags that MATCH the active filter first, so it's clear
                    // why this devotee qualifies (a devotee can have many tags and the
                    // matching one may not be among the first few).
                    const matching = d.tags.filter(k => selectedTags.includes(k));
                    const rest = d.tags.filter(k => !selectedTags.includes(k));
                    const shown = [...matching, ...rest].slice(0, 3);
                    return (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {shown.map(k => (
                          <span key={k} style={tagChipStyle(k)}
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${selectedTags.includes(k) ? 'ring-1 ring-primary ring-offset-1' : ''}`}>
                            {tagLabel(k)}
                          </span>
                        ))}
                        {d.tags.length > 3 && <span className="rounded-full bg-bg-base px-2 py-0.5 text-[9px] font-bold text-text-muted">+{d.tags.length - 3}</span>}
                      </div>
                    );
                  })()}
                </div>

                {/* actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Call / in-person / message are collapsed by default. Tap "Log" to
                      reveal them only when you actually want to record a contact. The
                      count badge shows how many are already logged. */}
                  {(() => {
                    const n = (f.call ? 1 : 0) + (f.inPerson ? 1 : 0) + (f.message ? 1 : 0);
                    const open = !!openLog[d.id];
                    if (!open) {
                      return (
                        <button onClick={() => setOpenLog(o => ({ ...o, [d.id]: true }))}
                          title="Log how you contacted this devotee"
                          className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-colors ${n ? 'border-primary bg-primary/10 text-primary' : 'border-border-light bg-surface text-text-muted hover:border-primary'}`}>
                          <ClipboardList className="h-3.5 w-3.5" /> Log{n ? ` (${n})` : ''}
                        </button>
                      );
                    }
                    return (
                      <>
                        <Tick on={!!f.call} onClick={() => save(d.id, { call: !f.call })} icon={PhoneCall} label="Called" />
                        <Tick on={!!f.inPerson} onClick={() => save(d.id, { inPerson: !f.inPerson })} icon={UserRound} label="Met in person" />
                        <Tick on={!!f.message} onClick={() => save(d.id, { message: !f.message })} icon={MessageSquare} label="Messaged" />
                        <button onClick={() => setOpenLog(o => ({ ...o, [d.id]: false }))} title="Hide log options"
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-light bg-surface text-text-muted hover:border-primary">
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    );
                  })()}

                  <select value={f.outcome || ''} onChange={e => save(d.id, { outcome: e.target.value })}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold outline-none ${outcomeStyle(f.outcome || '')}`}>
                    <option value="">No response</option>
                    {[...new Set([...eventOutcomes, ...(f.outcome ? [f.outcome] : [])])].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>

                  {telLink(d) && (
                    <a href={telLink(d)}
                      className="flex h-8 items-center gap-1 rounded-xl bg-sky-50 px-2.5 text-xs font-bold text-sky-700 hover:bg-sky-100"
                      title={`Call ${d.mobile || ''}`}>
                      <PhoneCall className="h-3.5 w-3.5" /> Call
                    </a>
                  )}
                  <a href={waLink(d)} target="_blank" rel="noreferrer"
                    className="flex h-8 items-center gap-1 rounded-xl bg-emerald-50 px-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    title="Send WhatsApp invite">
                    <MessageSquare className="h-3.5 w-3.5" /> WA
                  </a>
                </div>
              </div>

              {/* Family — mark each member coming / not coming right here, so a
                  mixed household (e.g. 3 coming, 2 not) can be recorded without
                  opening every member's card. Shows who already followed up too. */}
              {famAll.length > 0 && (
                <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1 text-[11px] font-bold text-primary">
                      <Users className="h-3 w-3" /> Family members ({famAll.length})
                    </p>
                    {/* Apply one outcome to the WHOLE family (this devotee + all members)
                        in a single step. Each member can still be changed individually. */}
                    <select value="" onChange={e => { if (e.target.value) applyToFamily(d, e.target.value); }}
                      title="Set the same outcome for everyone in this family"
                      className="shrink-0 rounded-lg border border-primary/30 bg-surface px-2 py-1 text-[11px] font-bold text-primary outline-none">
                      <option value="">Set all to…</option>
                      {eventOutcomes.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {famAll.map((member) => {
                      const mf = fmap[member.id] || {};
                      return (
                        <div key={member.id} className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-semibold text-text-main">{member.name}</p>
                            {mf.contactedBy && <p className="truncate text-[10px] text-text-muted">by {mf.contactedBy}</p>}
                          </div>
                          <select value={mf.outcome || ''} onChange={e => save(member.id, { outcome: e.target.value })}
                            className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold outline-none ${outcomeStyle(mf.outcome || '')}`}>
                            <option value="">No response</option>
                            {[...new Set([...eventOutcomes, ...(mf.outcome ? [mf.outcome] : [])])].map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Assign (or re-assign) the karyakarta for this devotee's follow-up.
                  Overrides the devotee's default assignee for this event only. */}
              <input
                list="followup-karyakarta-list"
                defaultValue={f.assignedTo || ''}
                onBlur={e => { if (e.target.value.trim() !== (f.assignedTo || '')) save(d.id, { assignedTo: e.target.value.trim() }); }}
                placeholder={d.followupKaryakarta ? `Assign karyakarta (default: ${d.followupKaryakarta})` : 'Assign karyakarta…'}
                className="mt-2 w-full rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] px-3 py-1.5 text-xs text-text-main outline-none focus:border-primary" />
              <input
                defaultValue={f.remark || ''}
                onBlur={e => { if (e.target.value !== (f.remark || '')) save(d.id, { remark: e.target.value }); }}
                placeholder="Remark (notes)…"
                className="mt-2 w-full rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] px-3 py-1.5 text-xs text-text-main outline-none focus:border-primary" />
            </div>
          );
        };

        const shown = audience.slice(0, AUDIENCE_CAP);
        const capNote = audience.length > AUDIENCE_CAP
          ? <p className="text-center text-xs text-text-muted">Showing first {AUDIENCE_CAP} of {audience.length}. Use search or tags to narrow the list.</p>
          : null;
        if (audience.length === 0) {
          return <p className="text-center text-xs text-text-muted py-8">No devotees match this filter.</p>;
        }

        // Family-wise drive: group the roster by area into expand/collapse sections,
        // so a karyakarta works through one area (one locality) at a time.
        if (selectedEvent?.familyWise) {
          const areaNum = (name) => {
            const n = areaNumMap[String(name || '').trim().toLowerCase()];
            return (n === undefined || n === '' || isNaN(parseInt(n, 10))) ? null : parseInt(n, 10);
          };
          const groups = new Map();
          shown.forEach(d => {
            const a = String(d.area || '').trim() || 'No area';
            if (!groups.has(a)) groups.set(a, []);
            groups.get(a).push(d);
          });
          const areas = [...groups.keys()].sort((a, b) => {
            const na = areaNum(a), nb = areaNum(b);
            if (na !== null && nb !== null) return na - nb;
            if (na !== null) return -1;
            if (nb !== null) return 1;
            return a.localeCompare(b);
          });
          return (
            <div className="space-y-3">
              {areas.map(area => {
                const list = groups.get(area);
                const collapsed = collapsedAreas.has(area);
                return (
                  <div key={area} className="overflow-hidden rounded-2xl border border-border-light bg-bg-base">
                    <button onClick={() => toggleArea(area)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface">
                      <span className="flex items-center gap-2 text-sm font-black text-text-main">
                        <MapPin className="h-4 w-4 text-primary" /> {area}
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{list.length}</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${collapsed ? '' : 'rotate-180'}`} />
                    </button>
                    {!collapsed && (
                      <div className="grid grid-cols-1 gap-2 p-3 pt-0 xl:grid-cols-2 2xl:grid-cols-3">
                        {list.map(renderCard)}
                      </div>
                    )}
                  </div>
                );
              })}
              {capNote}
            </div>
          );
        }

        return (
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
            {shown.map(renderCard)}
            {capNote && <div className="col-span-full">{capNote}</div>}
          </div>
        );
      })()}
    </div>
    </>
  );
}
