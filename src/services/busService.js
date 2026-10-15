// ===========================================================================
// Akshar Connect — Bus Seva service (OFFLINE-FIRST)
// ---------------------------------------------------------------------------
// Bus bookings for a trip/occasion (e.g. Sharad Purnima). The module records
// MANY events over time — each event is one bus trip — and within an event a
// list of bookings, where one booking can seat several people together. This
// replaces the manual WhatsApp seat list.
//
// Design mirrors ghariService (proven): every write lands synchronously in
// localStorage AND a durable outbox; a background sync engine drains the outbox
// to the Apps Script backend with retries and removes an op only after the
// server acks it. Ids are client-generated and stable, and the backend upserts
// by id, so replaying an op whose ack was lost never creates a duplicate.
// ===========================================================================

import { dataService, backendApi, backendOnline } from './dataService';
import { scoreMatch, devoteeSearchText } from '../utils/search';

// ── Seat types (the berth arrangement, mirrors the WhatsApp shorthand) ───────
export const BUS_SEAT_TYPES = {
  single_sofo:   { key: 'single_sofo',   label: 'Single sofo',  short: 'Single',  sofo: true, color: '#2563EB' },
  double_sofo:   { key: 'double_sofo',   label: 'Double sofo',  short: 'Double',  sofo: true, color: '#16A34A' },
  sharing_sofo:  { key: 'sharing_sofo',  label: 'Sharing sofo', short: 'Sharing', sofo: true, color: '#0D9488' },
};
export const DEFAULT_SEAT_TYPE = 'single_sofo';

// ── Storage keys ─────────────────────────────────────────────────────────────
const EVENTS_KEY   = 'ac_bus_events_v1';
const BOOKINGS_KEY = 'ac_bus_bookings_v1';
const OUTBOX_KEY   = 'ac_bus_outbox_v1';

// ── Small persistence helpers (every read/write is try/caught) ───────────────
function readJSON_(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function writeJSON_(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

let MEM = { events: null, bookings: null };
let flushing = false;
let inited = false;
// The last error that blocked a sync (e.g. the backend action isn't deployed yet,
// or a permission rejection), so the UI can tell the user WHY nothing cleared.
let lastFlushError = '';

function nowISO_() { return new Date().toISOString(); }
function norm_(s) { return String(s || '').toLowerCase().trim(); }

function emit_(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ } }

// ── Normalizers (coerce sheet strings → typed objects) ───────────────────────
function normalizeEvent_(e) {
  return {
    id: String(e.id || ''),
    title: String(e.title || '').trim(),
    date: String(e.date || '').trim(),
    destination: String(e.destination || '').trim(),
    remarks: String(e.remarks || '').trim(),
    status: (String(e.status || 'active').toLowerCase() === 'void') ? 'void' : 'active',
    createdBy: String(e.createdBy || ''), createdOn: String(e.createdOn || ''),
    updatedBy: String(e.updatedBy || ''), updatedOn: String(e.updatedOn || ''),
  };
}
function normalizeBooking_(b) {
  let passengers = b.passengers;
  if (!passengers) { try { passengers = JSON.parse(b.passengersJson || '[]'); } catch { passengers = []; } }
  passengers = (passengers || [])
    .map(p => ({ name: String(p.name || '').trim(), devoteeId: String(p.devoteeId || '') }))
    .filter(p => p.name);
  return {
    id: String(b.id || ''),
    eventId: String(b.eventId || ''),
    passengers,
    seatType: BUS_SEAT_TYPES[b.seatType] ? b.seatType : DEFAULT_SEAT_TYPE,
    mobile: String(b.mobile || '').replace(/\D/g, ''),
    karyakarta: String(b.karyakarta || '').trim(),
    karyakartaId: String(b.karyakartaId || ''),
    remarks: String(b.remarks || '').trim(),
    status: (String(b.status || 'active').toLowerCase() === 'void') ? 'void' : 'active',
    createdBy: String(b.createdBy || ''), createdOn: String(b.createdOn || ''),
    updatedBy: String(b.updatedBy || ''), updatedOn: String(b.updatedOn || ''),
  };
}

// Flatten a typed booking → the backend row (keeps the Sheet readable).
function toBackendBooking_(b) {
  return {
    id: b.id, eventId: b.eventId,
    passengersJson: JSON.stringify(b.passengers || []),
    passengerCount: (b.passengers || []).length,
    seatType: b.seatType, mobile: b.mobile || '',
    karyakarta: b.karyakarta || '', karyakartaId: b.karyakartaId || '',
    remarks: b.remarks || '', status: b.status || 'active',
    createdBy: b.createdBy, createdOn: b.createdOn, updatedBy: b.updatedBy, updatedOn: b.updatedOn,
  };
}

// ── In-memory cache (hydrated synchronously on first use) ────────────────────
function events_() {
  if (!MEM.events) MEM.events = (readJSON_(EVENTS_KEY, []) || []).map(normalizeEvent_);
  return MEM.events;
}
function bookings_() {
  if (!MEM.bookings) MEM.bookings = (readJSON_(BOOKINGS_KEY, []) || []).map(normalizeBooking_);
  return MEM.bookings;
}
function saveEventsLocal_() { writeJSON_(EVENTS_KEY, MEM.events); }
function saveBookingsLocal_() { writeJSON_(BOOKINGS_KEY, MEM.bookings); }
function outbox_() { return readJSON_(OUTBOX_KEY, []) || []; }
function setOutbox_(arr) { writeJSON_(OUTBOX_KEY, arr); }

// ── Durable outbox (collapse duplicate pending ops for the same id) ──────────
function enqueueUpsert_(action, row) {
  const next = outbox_().filter(op => !(op.action === action && op.payload?.row?.id === row.id));
  next.push({ opId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, action, payload: { row }, tries: 0, queuedAt: nowISO_() });
  setOutbox_(next);
}
function enqueueDelete_(action, upsertAction, id) {
  const box = outbox_().filter(op => {
    const k = op.payload?.row?.id ?? op.payload?.id;
    return !((op.action === action || op.action === upsertAction) && k === id);
  });
  box.push({ opId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, action, payload: { id }, tries: 0, queuedAt: nowISO_() });
  setOutbox_(box);
}

async function flush() {
  if (flushing) return;
  if (!backendOnline() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  const box = outbox_();
  if (!box.length) return;
  flushing = true;
  try {
    const succeeded = new Set();
    const meta = {};
    for (const op of box) {
      try { await backendApi(op.action, op.payload); succeeded.add(op.opId); }
      catch (e) {
        const msg = String((e && e.message) || e);
        lastFlushError = msg;
        // A permission rejection never succeeds on retry — drop it so the local
        // edit's revert (on the next syncDown) is visible, not silently stuck.
        if (/not allowed/i.test(msg)) { succeeded.add(op.opId); emit_('ac-bus-error', { message: msg, action: op.action }); }
        else meta[op.opId] = { tries: (op.tries || 0) + 1, lastError: msg };
      }
      emit_('ac-bus-synced', { pending: outbox_().filter(o => !succeeded.has(o.opId)).length });
    }
    const now = outbox_().filter(o => !succeeded.has(o.opId)).map(o => meta[o.opId] ? { ...o, ...meta[o.opId] } : o);
    setOutbox_(now);
    if (!now.length) lastFlushError = ''; // everything synced — clear the error
  } finally {
    flushing = false;
    emit_('ac-bus-synced', { pending: outbox_().length });
  }
}

// ── Pull the latest from the backend, keeping un-synced local work ───────────
async function syncDown() {
  if (!backendOnline() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { ok: false, offline: true };
  let res;
  try { res = await backendApi('busBootstrap', {}); } catch (e) { return { ok: false, error: e.message }; }
  const serverEvents = (res.events || []).map(normalizeEvent_);
  const serverBookings = (res.bookings || []).map(normalizeBooking_);

  const box = outbox_();
  const pendingEventIds = new Set(box.filter(o => o.action === 'busUpsertEvent' || o.action === 'busDeleteEvent').map(o => o.payload?.row?.id ?? o.payload?.id));
  const pendingBookingIds = new Set(box.filter(o => o.action === 'busUpsertBooking' || o.action === 'busDeleteBooking').map(o => o.payload?.row?.id ?? o.payload?.id));

  // Server is authoritative EXCEPT for ids with a pending local op (keep local).
  const mergedEvents = serverEvents.filter(e => !pendingEventIds.has(e.id));
  events_().forEach(e => { if (pendingEventIds.has(e.id)) mergedEvents.push(e); });
  MEM.events = mergedEvents.map(normalizeEvent_); saveEventsLocal_();

  const mergedBookings = serverBookings.filter(b => !pendingBookingIds.has(b.id));
  bookings_().forEach(b => { if (pendingBookingIds.has(b.id)) mergedBookings.push(b); });
  MEM.bookings = mergedBookings.map(normalizeBooking_); saveBookingsLocal_();

  emit_('ac-bus-synced', { pending: outbox_().length, refreshed: true });
  return { ok: true };
}

// ── One-time init ────────────────────────────────────────────────────────────
function init() {
  if (inited) return;
  inited = true;
  events_(); bookings_();
  try {
    window.addEventListener('online', () => { flush().then(() => syncDown()); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
  } catch { /* non-browser */ }
  flush().then(() => syncDown()).catch(() => {});
}

// ── Devotee lookup for autocomplete (reuse the cached directory) ─────────────
function searchDevotees(query, limit = 8) {
  const q = norm_(query);
  if (!q) return [];
  const list = dataService.getDevotees() || [];
  return list
    .map(d => ({ d, s: scoreMatch(devoteeSearchText(d), d.name || '', query) }))
    .filter(x => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.d);
}

// Seat numbers are a running per-event sequence over ACTIVE bookings in creation
// order — exactly like the hand-written list (1, 2, 3 …). Returns a map
// bookingId -> [seatNo, …] (one per passenger) plus each booking's first seat no.
function seatNumbers_(eventId) {
  const list = getBookings(eventId);
  let n = 0;
  const byBooking = {};
  list.forEach(b => {
    const nos = (b.passengers || []).map(() => ++n);
    byBooking[b.id] = nos;
  });
  return byBooking;
}

// All non-void bookings for an event, oldest first (matches seat-number order).
function getBookings(eventId, { includeVoid = false } = {}) {
  return bookings_()
    .filter(b => b.eventId === eventId && (includeVoid || b.status !== 'void'))
    .sort((a, b) => String(a.createdOn).localeCompare(String(b.createdOn)) || String(a.id).localeCompare(String(b.id)));
}

// ===========================================================================
// Public API
// ===========================================================================
export const busService = {
  init,
  flush,
  syncDown,

  // ---- Reads (instant, offline) ----
  // Events, newest trip first (by date, then createdOn).
  getEvents: ({ includeVoid = false } = {}) => events_()
    .filter(e => includeVoid || e.status !== 'void')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdOn).localeCompare(String(a.createdOn))),
  getEventById: (id) => events_().find(e => e.id === id) || null,

  getBookings,
  getBookingById: (id) => bookings_().find(b => b.id === id) || null,
  seatNumbers: seatNumbers_,

  // Quick totals for an event card: bookings, people, and a per-seat-type tally.
  eventStats: (eventId) => {
    const list = getBookings(eventId);
    const stats = { bookings: list.length, people: 0, bySeatType: {} };
    Object.keys(BUS_SEAT_TYPES).forEach(k => { stats.bySeatType[k] = 0; });
    list.forEach(b => {
      stats.people += (b.passengers || []).length;
      stats.bySeatType[b.seatType] = (stats.bySeatType[b.seatType] || 0) + 1;
    });
    return stats;
  },

  pendingCount: () => outbox_().length,
  lastError: () => lastFlushError,
  isOnline: () => backendOnline() && (typeof navigator === 'undefined' || navigator.onLine !== false),

  searchDevotees,

  // Reproduce the WhatsApp-style numbered seat list for an event, so it can be
  // copied back into a group chat (seat number per person, seat type per booking).
  buildShareText: (eventId) => {
    const ev = busService.getEventById(eventId);
    const list = getBookings(eventId);
    const seats = seatNumbers_(eventId);
    const head = [ev?.title || 'Bus Seva', ev?.destination, ev?.date].filter(Boolean).join(' · ');
    const lines = list.map(b => {
      const nos = seats[b.id] || [];
      const people = (b.passengers || []).map((p, i) => `${nos[i]}. ${p.name}`).join(', ');
      const type = BUS_SEAT_TYPES[b.seatType]?.label || '';
      const tail = [type, b.remarks].filter(Boolean).join(' — ');
      return `${people}${tail ? ' - ' + tail : ''}`;
    });
    return `${head}\n\n${lines.join('\n')}`;
  },

  // ---- Writes (optimistic + durable) ----
  saveEvent: (input) => {
    const actor = dataService.currentActor();
    const now = nowISO_();
    const existingIdx = input.id ? events_().findIndex(e => e.id === input.id) : -1;
    const prev = existingIdx >= 0 ? MEM.events[existingIdx] : null;
    const id = input.id || `BEV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const event = normalizeEvent_({
      ...(prev || {}), id,
      title: input.title ?? prev?.title ?? '',
      date: input.date ?? prev?.date ?? '',
      destination: input.destination ?? prev?.destination ?? '',
      remarks: input.remarks ?? prev?.remarks ?? '',
      status: input.status ?? prev?.status ?? 'active',
      createdBy: prev?.createdBy || actor, createdOn: prev?.createdOn || now,
      updatedBy: actor, updatedOn: now,
    });
    if (existingIdx >= 0) MEM.events[existingIdx] = event; else MEM.events.unshift(event);
    saveEventsLocal_();
    enqueueUpsert_('busUpsertEvent', event);
    emit_('ac-bus-changed');
    flush();
    try { dataService.logActivity('bus-event', event.title, `${prev ? 'updated' : 'added'} bus seva event "${event.title}"`); } catch { /* ignore */ }
    return event;
  },
  voidEvent: (id) => {
    const e = busService.getEventById(id); if (!e) return null;
    return busService.saveEvent({ ...e, status: 'void' });
  },
  restoreEvent: (id) => {
    const e = busService.getEventById(id); if (!e) return null;
    return busService.saveEvent({ ...e, status: 'active' });
  },

  saveBooking: (input) => {
    const actor = dataService.currentActor();
    const now = nowISO_();
    const existingIdx = input.id ? bookings_().findIndex(b => b.id === input.id) : -1;
    const prev = existingIdx >= 0 ? MEM.bookings[existingIdx] : null;
    const eventId = input.eventId || prev?.eventId || '';
    const id = input.id || `BBK-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const passengers = (input.passengers ?? prev?.passengers ?? [])
      .map(p => ({ name: String(p.name || '').trim(), devoteeId: String(p.devoteeId || '') }))
      .filter(p => p.name);
    const booking = normalizeBooking_({
      ...(prev || {}), id, eventId, passengers,
      seatType: input.seatType ?? prev?.seatType ?? DEFAULT_SEAT_TYPE,
      mobile: input.mobile ?? prev?.mobile ?? '',
      karyakarta: input.karyakarta ?? prev?.karyakarta ?? '',
      karyakartaId: input.karyakartaId ?? prev?.karyakartaId ?? '',
      remarks: input.remarks ?? prev?.remarks ?? '',
      status: input.status ?? prev?.status ?? 'active',
      createdBy: prev?.createdBy || actor, createdOn: prev?.createdOn || now,
      updatedBy: actor, updatedOn: now,
    });
    if (existingIdx >= 0) MEM.bookings[existingIdx] = booking; else MEM.bookings.push(booking);
    saveBookingsLocal_();
    enqueueUpsert_('busUpsertBooking', toBackendBooking_(booking));
    emit_('ac-bus-changed');
    flush();
    return booking;
  },
  voidBooking: (id) => {
    const b = busService.getBookingById(id); if (!b) return null;
    return busService.saveBooking({ ...b, status: 'void' });
  },
};
