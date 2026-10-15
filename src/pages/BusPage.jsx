import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, X, Check, Trash2, RefreshCw, ArrowLeft, User, Users, Bus, Calendar, MapPin,
  CloudOff, Cloud, Pencil, Copy, Armchair, ChevronRight,
} from 'lucide-react';
import { busService, BUS_SEAT_TYPES, DEFAULT_SEAT_TYPE } from '../services/busService';
import { alertError, alertSuccess, confirmDialog } from '../utils/sweetAlert';
import { isAdminRole, isSevakRole } from '../utils/navItems';
import AutoTextarea from '../components/AutoTextarea';

// Proper-case a NAME however it was typed ("RAVI"/"ravi" → "Ravi").
const properName = (s) => String(s || '').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const toProperCase = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (d) => { if (!d) return ''; try { return new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } };

// ───────────────────────── Sync / connectivity strip ────────────────────────
function SyncStrip() {
  const [pending, setPending] = useState(busService.pendingCount());
  const [online, setOnline] = useState(busService.isOnline());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onSync = () => { setPending(busService.pendingCount()); setOnline(busService.isOnline()); };
    window.addEventListener('ac-bus-synced', onSync);
    window.addEventListener('ac-bus-changed', onSync);
    window.addEventListener('online', onSync); window.addEventListener('offline', onSync);
    const t = setInterval(onSync, 4000);
    return () => { window.removeEventListener('ac-bus-synced', onSync); window.removeEventListener('ac-bus-changed', onSync); window.removeEventListener('online', onSync); window.removeEventListener('offline', onSync); clearInterval(t); };
  }, []);
  const syncNow = async () => { setBusy(true); try { await busService.flush(); await busService.syncDown(); } finally { setBusy(false); setPending(busService.pendingCount()); } };
  const synced = pending === 0;
  return (
    <button onClick={syncNow} disabled={busy}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
        !online ? 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300'
        : synced ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300'
        : 'border-orange-200 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-300'}`}>
      {!online ? <CloudOff className="h-3.5 w-3.5" /> : synced ? <Cloud className="h-3.5 w-3.5" /> : <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />}
      {!online ? 'Offline — saved on device' : synced ? 'All saved' : `${pending} to sync`}
    </button>
  );
}

// ───────────────────────── Devotee autocomplete picker ──────────────────────
function DevoteePicker({ value, onPick, onText, placeholder, icon: Icon = User, inputRef, onCommit }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const boxRef = useRef(null);
  useEffect(() => { setQ(value || ''); }, [value]);
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const change = (raw) => { const text = toProperCase(raw); setQ(text); onText?.(text); setResults(busService.searchDevotees(text)); setOpen(true); };
  const pick = (d) => { setQ(d.name); onPick?.(d); setOpen(false); onCommit?.(); };
  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (open && results.length) pick(results[0]); else { setOpen(false); onCommit?.(); } }
    else if (e.key === 'Escape') setOpen(false);
  };
  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2.5 focus-within:border-primary transition-colors">
        <Icon className="h-4 w-4 shrink-0 text-text-muted" />
        <input ref={inputRef} value={q} onChange={(e) => change(e.target.value)} onKeyDown={onKeyDown}
          onFocus={() => { if (q) { setResults(busService.searchDevotees(q)); setOpen(true); } }}
          placeholder={placeholder} className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
        {q && <button type="button" onClick={() => { change(''); onPick?.(null); }} className="text-text-muted hover:text-text-main"><X className="h-4 w-4" /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-2xl border border-border-light bg-surface shadow-xl">
          {results.map((d) => (
            <button key={d.id || `h:${d.name}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(d)}
              className="flex w-full items-center gap-3 border-b border-border-light px-3 py-2.5 text-left last:border-0 hover:bg-bg-base">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-xs font-bold text-white">{d.name?.[0] || '?'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-text-main">{d.name}</span>
                <span className="block truncate text-[11px] text-text-muted">{[d.area, d.mobile].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Seat-type chip selector ──────────────────────────
function SeatTypePicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.values(BUS_SEAT_TYPES).map(t => {
        const on = value === t.key;
        return (
          <button key={t.key} type="button" onClick={() => onChange(t.key)}
            className="flex items-center gap-1.5 rounded-xl border-2 px-2.5 py-1.5 text-xs font-bold transition-all"
            style={on ? { borderColor: t.color, background: t.color, color: '#fff' } : { borderColor: t.color + '55', background: t.color + '14', color: t.color }}>
            <Armchair className="h-3.5 w-3.5" /> {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────── Booking form (new + edit) ────────────────────────
function BookingForm({ eventId, initialBooking, onSaved, onCancel, onDelete, readOnly }) {
  const isEdit = !!initialBooking;
  const [passengers, setPassengers] = useState(() => {
    const p = (initialBooking?.passengers || []).map(x => ({ ...x }));
    return p.length ? p : [{ name: '', devoteeId: '' }];
  });
  const [seatType, setSeatType] = useState(initialBooking?.seatType || DEFAULT_SEAT_TYPE);
  const [mobile, setMobile] = useState(initialBooking?.mobile || '');
  const [showMobile, setShowMobile] = useState(!!initialBooking?.mobile);
  const [karyakarta, setKaryakarta] = useState(initialBooking?.karyakarta || '');
  const [karyakartaId, setKaryakartaId] = useState(initialBooking?.karyakartaId || '');
  const [remarks, setRemarks] = useState(initialBooking?.remarks || '');
  const mobileRef = useRef(null);

  const setPax = (i, patch) => setPassengers(ps => ps.map((p, j) => j === i ? { ...p, ...patch } : p));
  const addPax = () => setPassengers(ps => [...ps, { name: '', devoteeId: '' }]);
  const removePax = (i) => setPassengers(ps => ps.length > 1 ? ps.filter((_, j) => j !== i) : ps);

  const save = () => {
    const clean = passengers.map(p => ({ name: properName(p.name), devoteeId: p.devoteeId || '' })).filter(p => p.name);
    if (!clean.length) { alertError('Add a passenger', 'Enter at least one person for this seat booking.'); return; }
    const booking = busService.saveBooking({
      id: initialBooking?.id, eventId,
      passengers: clean, seatType,
      mobile: String(mobile || '').replace(/\D/g, ''),
      karyakarta: properName(karyakarta), karyakartaId,
      remarks: remarks.trim(), status: initialBooking?.status || 'active',
    });
    onSaved?.(booking);
  };

  return (
    <div className="space-y-3">
      {/* Passengers */}
      <div>
        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-text-muted">People in this seat</label>
        <div className="space-y-2">
          {passengers.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2563EB]/10 text-[11px] font-black text-[#2563EB]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <DevoteePicker value={p.name} placeholder="Search devotee or type name"
                  onText={(t) => setPax(i, { name: t, devoteeId: '' })}
                  onPick={(d) => { if (d) { setPax(i, { name: d.name, devoteeId: d.id }); if (d.mobile && !mobile) { setMobile(String(d.mobile)); setShowMobile(true); } } else setPax(i, { name: '', devoteeId: '' }); }} />
              </div>
              {passengers.length > 1 && (
                <button type="button" onClick={() => removePax(i)} title="Remove person"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 dark:bg-rose-950 dark:border-rose-900"><X className="h-4 w-4" /></button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addPax}
          className="mt-2 flex items-center gap-1.5 rounded-xl border border-dashed border-border-light bg-surface px-3 py-1.5 text-[11px] font-bold text-text-muted hover:border-primary hover:text-primary">
          <Plus className="h-3.5 w-3.5" /> Add another person to this seat
        </button>
      </div>

      {/* Seat type */}
      <div>
        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-text-muted">Seat type</label>
        <SeatTypePicker value={seatType} onChange={setSeatType} />
      </div>

      {/* Karyakarta / reference */}
      <div>
        <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Karyakarta / Reference (optional)</label>
        <DevoteePicker value={karyakarta} icon={Users} placeholder="Who arranged this booking"
          onText={(t) => { setKaryakarta(t); setKaryakartaId(''); }}
          onPick={(d) => { if (d) { setKaryakarta(d.name); setKaryakartaId(d.id); } else { setKaryakarta(''); setKaryakartaId(''); } }} />
      </div>

      {/* Mobile */}
      {showMobile ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2 focus-within:border-primary">
          <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-text-muted">Mobile</span>
          <input ref={mobileRef} inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
            placeholder="Contact number" maxLength={13} className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
          <button type="button" onClick={() => { setMobile(''); setShowMobile(false); }} className="shrink-0 text-text-muted hover:text-text-main"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => { setShowMobile(true); setTimeout(() => { try { mobileRef.current?.focus(); } catch { /* ignore */ } }, 0); }}
          className="flex items-center gap-1.5 rounded-xl border border-dashed border-border-light bg-surface px-3 py-1.5 text-[11px] font-bold text-text-muted hover:border-primary hover:text-primary">
          <Plus className="h-3.5 w-3.5" /> Add mobile number
        </button>
      )}

      <AutoTextarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (e.g. sharing with someone)" minRows={1}
        className="w-full rounded-2xl border border-border-light bg-surface px-3 py-2.5 text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted focus:border-primary" />

      {!readOnly && (
        <div className="flex items-center gap-2 pt-1">
          {onDelete && <button onClick={onDelete} title="Delete booking" className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 dark:bg-rose-950 dark:border-rose-900"><Trash2 className="h-4 w-4" /></button>}
          {onCancel && <button onClick={onCancel} className="rounded-xl border border-border-light px-3 py-2.5 text-sm font-bold text-text-muted">Cancel</button>}
          <button onClick={save} className="ml-auto rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#2563EB] px-5 py-2.5 text-sm font-black text-white shadow-md active:scale-95">{isEdit ? 'Save booking' : 'Add booking'}</button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Event form (new + edit) ──────────────────────────
function EventForm({ initialEvent, onSaved, onCancel }) {
  const [title, setTitle] = useState(initialEvent?.title || '');
  const [date, setDate] = useState(initialEvent?.date || '');
  const [destination, setDestination] = useState(initialEvent?.destination || '');
  const [remarks, setRemarks] = useState(initialEvent?.remarks || '');
  const save = () => {
    if (!title.trim()) { alertError('Title needed', 'Give this bus seva a name (e.g. “Sharad Purnima 2025”).'); return; }
    const ev = busService.saveEvent({ id: initialEvent?.id, title: title.trim(), date, destination: destination.trim(), remarks: remarks.trim(), status: initialEvent?.status || 'active' });
    onSaved?.(ev);
  };
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-text-main"><Bus className="h-4 w-4 text-[#2563EB]" /> {initialEvent ? 'Edit bus seva' : 'New bus seva'}</h3>
          <button onClick={onCancel} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sharad Purnima 2025"
              className="w-full rounded-2xl border border-border-light bg-surface px-3 py-2.5 text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted focus:border-primary" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Date</label>
              <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2.5 focus-within:border-primary">
                <Calendar className="h-4 w-4 shrink-0 text-text-muted" />
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-text-main outline-none" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Destination</label>
              <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2.5 focus-within:border-primary">
                <MapPin className="h-4 w-4 shrink-0 text-text-muted" />
                <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Where to" className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
              </div>
            </div>
          </div>
          <AutoTextarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (optional)" minRows={1}
            className="w-full rounded-2xl border border-border-light bg-surface px-3 py-2.5 text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted focus:border-primary" />
        </div>
        <div className="flex items-center gap-2 border-t border-border-light p-3">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-border-light py-2.5 text-sm font-bold text-text-muted">Cancel</button>
          <button onClick={save} className="flex-[1.4] rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#2563EB] py-2.5 text-sm font-black text-white shadow-md active:scale-95">{initialEvent ? 'Save' : 'Create event'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ───────────────────────── Booking row ──────────────────────────────────────
function BookingRow({ booking, seatNos, onOpen, canEdit }) {
  const t = BUS_SEAT_TYPES[booking.seatType] || {};
  const names = (booking.passengers || []).map((p, i) => `${seatNos[i]}. ${p.name}`).join(', ');
  return (
    <button onClick={() => canEdit && onOpen(booking)} disabled={!canEdit}
      className="flex w-full items-center gap-3 border-b border-border-light px-3 py-3 text-left last:border-0 hover:bg-bg-base disabled:cursor-default">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold text-text-main">{names}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: t.color }}>{t.label}</span>
          {booking.karyakarta && <span className="text-[11px] font-semibold text-[#2563EB]">via {booking.karyakarta}</span>}
          {booking.mobile && <span className="text-[11px] font-semibold text-text-muted">📱 {booking.mobile}</span>}
        </div>
        {booking.remarks && <div className="mt-0.5 truncate text-[11px] text-text-muted">📝 {booking.remarks}</div>}
      </div>
      {canEdit && <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />}
    </button>
  );
}

// ───────────────────────── Event detail ─────────────────────────────────────
function EventDetail({ eventId, canEdit, onBack }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  useEffect(() => {
    const on = () => refresh();
    window.addEventListener('ac-bus-changed', on); window.addEventListener('ac-bus-synced', on);
    return () => { window.removeEventListener('ac-bus-changed', on); window.removeEventListener('ac-bus-synced', on); };
  }, []);

  const event = busService.getEventById(eventId);
  const bookings = busService.getBookings(eventId);
  const seats = busService.seatNumbers(eventId);
  const stats = busService.eventStats(eventId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // booking being edited
  const [editEvent, setEditEvent] = useState(false);

  if (!event) return (
    <div className="p-4"><button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-text-muted"><ArrowLeft className="h-4 w-4" /> Back</button><p className="mt-6 text-center text-sm text-text-muted">This event is no longer available.</p></div>
  );

  const copyList = async () => {
    const text = busService.buildShareText(eventId);
    try { await navigator.clipboard.writeText(text); alertSuccess('Copied', 'The seat list is on your clipboard — paste it into WhatsApp.'); }
    catch { alertError('Could not copy', 'Your browser blocked clipboard access.'); }
  };
  const deleteBooking = async () => {
    const ok = await confirmDialog({ title: 'Delete booking?', text: 'This removes the seat booking. You can re-add it later.', confirmText: 'Delete', danger: true });
    if (ok) { busService.voidBooking(editing.id); setEditing(null); refresh(); }
  };
  const deleteEvent = async () => {
    const ok = await confirmDialog({ title: 'Delete this bus seva?', text: `“${event.title}” and its ${stats.bookings} booking(s) will be removed.`, confirmText: 'Delete', danger: true });
    if (ok) { busService.voidEvent(eventId); onBack(); }
  };

  return (
    <div className="mx-auto max-w-2xl p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-surface text-text-muted hover:text-text-main"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-black text-text-main">{event.title}</h2>
          <p className="truncate text-[11px] font-semibold text-text-muted">{[event.destination, fmtDate(event.date)].filter(Boolean).join(' · ') || 'No date set'}</p>
        </div>
        <SyncStrip />
      </div>

      {/* Stat row */}
      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-2xl border border-border-light bg-surface p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">People</div>
          <div className="mt-0.5 text-xl font-black text-text-main">{stats.people}</div>
        </div>
        <div className="rounded-2xl border border-border-light bg-surface p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Bookings</div>
          <div className="mt-0.5 text-xl font-black text-text-main">{stats.bookings}</div>
        </div>
        <div className="col-span-2 rounded-2xl border border-border-light bg-surface p-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">By seat type</div>
          <div className="flex flex-wrap gap-1">
            {Object.values(BUS_SEAT_TYPES).map(t => stats.bySeatType[t.key] > 0 && (
              <span key={t.key} className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: t.color }}>{t.short}: {stats.bySeatType[t.key]}</span>
            ))}
            {stats.bookings === 0 && <span className="text-[11px] text-text-muted">No bookings yet</span>}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canEdit && (
          <button onClick={() => { setEditing(null); setAdding(true); }} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#2563EB] px-4 py-2 text-sm font-black text-white shadow-md active:scale-95">
            <Plus className="h-4 w-4" /> Add booking
          </button>
        )}
        <button onClick={copyList} disabled={!stats.bookings} className="flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-3 py-2 text-sm font-bold text-text-muted disabled:opacity-50 hover:text-text-main">
          <Copy className="h-4 w-4" /> Copy list
        </button>
        {canEdit && (
          <>
            <button onClick={() => setEditEvent(true)} className="flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-3 py-2 text-sm font-bold text-text-muted hover:text-text-main"><Pencil className="h-4 w-4" /> Edit</button>
            <button onClick={deleteEvent} className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-600 dark:bg-rose-950 dark:border-rose-900"><Trash2 className="h-4 w-4" /></button>
          </>
        )}
      </div>

      {/* Bookings list */}
      <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
        {bookings.length === 0 ? (
          <div className="py-12 text-center">
            <Bus className="mx-auto mb-2 h-10 w-10 text-text-muted" />
            <p className="text-sm font-bold text-text-muted">No seats booked yet</p>
            {canEdit && <p className="mt-1 text-[12px] text-text-muted">Tap “Add booking” to seat the first person.</p>}
          </div>
        ) : bookings.map(b => (
          <BookingRow key={b.id} booking={b} seatNos={seats[b.id] || []} canEdit={canEdit} onOpen={(bk) => { setAdding(false); setEditing(bk); }} />
        ))}
      </div>

      {/* Add / edit booking sheet */}
      {(adding || editing) && createPortal(
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => { setAdding(false); setEditing(null); }}>
          <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-black text-text-main"><Armchair className="h-4 w-4 text-[#2563EB]" /> {editing ? 'Edit booking' : 'Add booking'}</h3>
              <button onClick={() => { setAdding(false); setEditing(null); }} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <BookingForm eventId={eventId} initialBooking={editing}
                onSaved={() => { setAdding(false); setEditing(null); refresh(); }}
                onCancel={() => { setAdding(false); setEditing(null); }}
                onDelete={editing ? deleteBooking : null} />
            </div>
          </div>
        </div>,
        document.body
      )}

      {editEvent && <EventForm initialEvent={event} onSaved={() => { setEditEvent(false); refresh(); }} onCancel={() => setEditEvent(false)} />}
    </div>
  );
}

// ───────────────────────── Event card (list) ────────────────────────────────
function EventCard({ event, onOpen }) {
  const stats = busService.eventStats(event.id);
  return (
    <button onClick={() => onOpen(event)} className="flex w-full items-center gap-3 rounded-2xl border border-border-light bg-surface p-4 text-left shadow-sm transition-all hover:border-[#2563EB]/40 hover:shadow-md active:scale-[0.99]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white shadow"><Bus className="h-6 w-6" /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-black text-text-main">{event.title}</div>
        <div className="truncate text-[12px] font-semibold text-text-muted">{[event.destination, fmtDate(event.date)].filter(Boolean).join(' · ') || 'No date set'}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] font-bold text-text-muted">
          <span className="rounded-full bg-[#2563EB]/10 px-2 py-0.5 text-[#2563EB]">{stats.people} people</span>
          <span>{stats.bookings} booking{stats.bookings === 1 ? '' : 's'}</span>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" />
    </button>
  );
}

// ───────────────────────── Page root ────────────────────────────────────────
export default function BusPage({ user }) {
  const canEdit = isAdminRole(user) || isSevakRole(user) ||
    String(user?.modules || '').toLowerCase().split(/[,|]/).map(s => s.trim()).includes('bus');
  const [, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const [openId, setOpenId] = useState(null);
  const [newEvent, setNewEvent] = useState(false);

  useEffect(() => { try { busService.init(); } catch { /* ignore */ } }, []);
  useEffect(() => {
    const on = () => refresh();
    window.addEventListener('ac-bus-changed', on); window.addEventListener('ac-bus-synced', on);
    return () => { window.removeEventListener('ac-bus-changed', on); window.removeEventListener('ac-bus-synced', on); };
  }, []);

  const events = useMemo(() => busService.getEvents(), [openId, newEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  if (openId) return <EventDetail eventId={openId} canEdit={canEdit} onBack={() => setOpenId(null)} />;

  return (
    <div className="mx-auto max-w-2xl p-3 sm:p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white shadow"><Bus className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black text-text-main">Bus Seva</h1>
          <p className="text-[11px] font-semibold text-text-muted">Bus bookings & seats for every trip</p>
        </div>
        <SyncStrip />
      </div>

      {canEdit && (
        <button onClick={() => setNewEvent(true)} className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#2563EB]/40 bg-[#2563EB]/5 py-3 text-sm font-black text-[#2563EB] active:scale-[0.99]">
          <Plus className="h-5 w-5" /> New bus seva event
        </button>
      )}

      {events.length === 0 ? (
        <div className="rounded-2xl border border-border-light bg-surface py-16 text-center">
          <Bus className="mx-auto mb-3 h-12 w-12 text-text-muted" />
          <p className="text-sm font-bold text-text-muted">No bus seva events yet</p>
          {canEdit && <p className="mt-1 text-[12px] text-text-muted">Create one to start recording seat bookings.</p>}
        </div>
      ) : (
        <div className="space-y-2.5">
          {events.map(ev => <EventCard key={ev.id} event={ev} onOpen={(e) => setOpenId(e.id)} />)}
        </div>
      )}

      {newEvent && <EventForm onSaved={(ev) => { setNewEvent(false); setOpenId(ev.id); }} onCancel={() => setNewEvent(false)} />}
    </div>
  );
}
