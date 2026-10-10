import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronRight, X, Plus, Check, Trash2, Music, Headphones,
  HeartHandshake, CalendarDays, Search, User, Users, Clock, MapPin, Pencil,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { alertError } from '../utils/sweetAlert';
import Swal from 'sweetalert2';

const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);
const iso = (d) => d.toLocaleDateString('en-CA');
const todayISO = () => iso(new Date());

// Seva categories (merged in from the Seva module).
const SEVA_CATEGORIES = ['Yuva Pravrutti', 'Padhramani', 'Zoli Seva', 'Satsang Visit', 'Shravan Seva', 'Other'];
const fmtTimeRange = (f, t) => [f, t].filter(Boolean).join(' – ');

// Activity types shown on the calendar.
const TYPES = {
  seva: { label: 'Seva', icon: HeartHandshake, dot: 'bg-purple-500', ring: 'ring-purple-500', text: 'text-purple-600', soft: 'bg-purple-50 dark:bg-purple-950/40' },
  bhajan: { label: 'Bhajan', icon: Music, dot: 'bg-rose-500', ring: 'ring-rose-500', text: 'text-rose-600', soft: 'bg-rose-50 dark:bg-rose-950/40' },
  katha: { label: 'Katha-Varta', icon: Headphones, dot: 'bg-violet-500', ring: 'ring-violet-500', text: 'text-violet-600', soft: 'bg-violet-50 dark:bg-violet-950/40' },
};
const TYPE_KEYS = ['seva', 'bhajan', 'katha'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ── Searchable devotee picker (whose home was visited) — merged from Seva ──────
function DevoteePicker({ value, name, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const devotees = useMemo(() => dataService.getDevotees(), []);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return devotees.filter((d) => String(d.name || '').toLowerCase().includes(s) || last10(d.mobile).includes(s)).slice(0, 8);
  }, [q, devotees]);

  if (value && name) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-sm font-bold text-text-main"><User className="h-4 w-4 text-primary" /> {name}</span>
        <button onClick={() => onPick(null)} className="rounded-lg p-1 text-text-muted hover:text-red-500"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder="Search devotee by name or mobile"
        className="w-full rounded-2xl border border-border-light bg-bg-base pl-9 pr-3 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
      {open && results.length > 0 && (
        <div className="mt-1 w-full max-h-56 overflow-y-auto rounded-2xl border border-border-light bg-surface shadow-lg">
          {results.map((d) => (
            <button key={d.id} onClick={() => { onPick(d); setQ(''); setOpen(false); }}
              className="block w-full border-b border-border-light/60 px-3.5 py-2.5 text-left text-sm last:border-0 hover:bg-bg-base">
              <span className="font-bold text-text-main">{d.name}</span>
              {d.mobile ? <span className="text-xs text-text-muted"> · {d.mobile}</span> : null}
              {d.area ? <span className="text-xs text-text-muted"> · {d.area}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Add several co-sevaks who went along — merged from Seva.
function CompanionPicker({ companions, excludeIds, onAdd, onRemove }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const devotees = useMemo(() => dataService.getDevotees(), []);
  const taken = new Set([...(excludeIds || []).filter(Boolean), ...companions.map((c) => c.id)]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return devotees.filter((d) => !taken.has(d.id) && (String(d.name || '').toLowerCase().includes(s) || last10(d.mobile).includes(s))).slice(0, 8);
    // eslint-disable-next-line
  }, [q, devotees, companions]);

  return (
    <div>
      {companions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {companions.map((c) => (
            <span key={c.id} className="flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-700 dark:bg-purple-950/50">
              {c.name}
              <button onClick={() => onRemove(c.id)} className="text-purple-500 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder="Add devotees who came along"
          className="w-full rounded-2xl border border-border-light bg-bg-base pl-9 pr-3 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
        {open && results.length > 0 && (
          <div className="mt-1 w-full max-h-56 overflow-y-auto rounded-2xl border border-border-light bg-surface shadow-lg">
            {results.map((d) => (
              <button key={d.id} onClick={() => { onAdd(d); setQ(''); }}
                className="block w-full border-b border-border-light/60 px-3.5 py-2.5 text-left text-sm last:border-0 hover:bg-bg-base">
                <span className="font-bold text-text-main">{d.name}</span>
                {d.area ? <span className="text-xs text-text-muted"> · {d.area}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CalendarPage({ user }) {
  const isStaff = user?.role === 'Admin' || user?.role === 'Sevak';
  const me = useMemo(() => {
    const list = dataService.getDevotees();
    let d = user?.devoteeId ? list.find((x) => x.id === user.devoteeId) : null;
    if (!d && user?.mobile) d = list.find((x) => last10(x.mobile) === last10(user.mobile));
    return d || null;
  }, [user]);
  const devoteeId = me?.id || user?.devoteeId || user?.mobile || '';
  const karyakartaName = me?.name || user?.name || '';
  const karyakartaMobile = me?.mobile || user?.mobile || '';

  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [swadhyay, setSwadhyay] = useState([]);
  const [seva, setSeva] = useState([]);
  const [plans, setPlans] = useState([]);
  const [openDay, setOpenDay] = useState(null); // ISO date string

  const reloadPlans = () => dataService.getPlans(devoteeId).then((p) => setPlans(p || []));
  const reloadSeva = () => dataService.getSeva({ karyakartaId: devoteeId }).then((r) => setSeva(r || []));
  const reloadSwadhyay = () => dataService.getMySwadhyay(devoteeId).then((r) => setSwadhyay(r || []));
  useEffect(() => {
    if (!devoteeId) return;
    reloadSwadhyay();
    reloadSeva();
    reloadPlans();
    // eslint-disable-next-line
  }, [devoteeId]);

  // Live-sync: when a Swadhyay entry is saved (in the Swadhyay module or anywhere)
  // or the app does a background refresh, re-read so the Calendar reflects it
  // without needing to reopen the page.
  useEffect(() => {
    if (!devoteeId) return;
    const onSwadhyay = () => reloadSwadhyay();
    const onRefresh = () => { reloadSwadhyay(); reloadSeva(); reloadPlans(); };
    window.addEventListener('ac-swadhyay-saved', onSwadhyay);
    window.addEventListener('ac-data-refreshed', onRefresh);
    return () => {
      window.removeEventListener('ac-swadhyay-saved', onSwadhyay);
      window.removeEventListener('ac-data-refreshed', onRefresh);
    };
    // eslint-disable-next-line
  }, [devoteeId]);

  // date -> { done:Set, planned:Set, bhajanMin, kathaMin, sevaCount, plans:[], sevaList:[] }
  const byDate = useMemo(() => {
    const m = {};
    const get = (d) => (m[d] || (m[d] = { done: new Set(), planned: new Set(), bhajanMin: 0, kathaMin: 0, sevaCount: 0, plans: [], sevaList: [], swadhyayList: [] }));
    swadhyay.forEach((s) => {
      const e = get(s.date);
      e.bhajanMin += +s.bhajanMin || 0;
      e.kathaMin += (+s.listenMin || 0) + (+s.readMin || 0);
      if ((+s.bhajanMin || 0) > 0) e.done.add('bhajan');
      if (((+s.listenMin || 0) + (+s.readMin || 0)) > 0) e.done.add('katha');
      e.swadhyayList.push(s);
    });
    seva.forEach((s) => { const e = get(s.date); e.sevaCount++; e.done.add('seva'); e.sevaList.push(s); });
    plans.forEach((p) => { const e = get(p.date); e.plans.push(p); if (p.status === 'done') e.done.add(p.type); else e.planned.add(p.type); });
    return m;
  }, [swadhyay, seva, plans]);

  // Build the month grid.
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = first.getDay();
    const out = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(iso(new Date(year, month, d)));
    return out;
  }, [year, month]);

  // Month summary counts.
  const summary = useMemo(() => {
    const s = { seva: 0, bhajan: 0, katha: 0, planned: 0, sevaVisits: 0 };
    cells.filter(Boolean).forEach((d) => {
      const e = byDate[d]; if (!e) return;
      TYPE_KEYS.forEach((t) => { if (e.done.has(t)) s[t]++; });
      s.planned += e.planned.size;
      s.sevaVisits += e.sevaCount;
    });
    return s;
  }, [cells, byDate]);

  const shiftMonth = (delta) => setCursor(new Date(year, month + delta, 1));
  const goToday = () => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#FF862A]/10 text-[#FF862A]"><CalendarDays className="h-5 w-5" /></span>
          <h1 className="text-xl font-black text-text-main">{monthLabel}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => shiftMonth(-1)} className="grid h-9 w-9 place-items-center rounded-xl border border-border-light bg-surface text-text-main hover:border-primary"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={goToday} className="rounded-xl border border-border-light bg-surface px-3 py-2 text-xs font-bold text-text-main hover:border-primary">Today</button>
          <button onClick={() => shiftMonth(1)} className="grid h-9 w-9 place-items-center rounded-xl border border-border-light bg-surface text-text-main hover:border-primary"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {TYPE_KEYS.map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted">
            <span className={`h-2.5 w-2.5 rounded-full ${TYPES[t].dot}`} /> {TYPES[t].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-text-muted bg-transparent" /> Planned
        </span>
      </div>

      {/* Calendar grid */}
      <div className="mt-4 rounded-3xl border border-border-light bg-surface p-3 shadow-xs">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w, i) => <div key={i} className="py-1 text-center text-[11px] font-black text-text-muted">{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const e = byDate[d];
            const isToday = d === todayISO();
            const dayNum = +d.slice(8, 10);
            return (
              <button key={i} onClick={() => setOpenDay(d)}
                className={`relative flex aspect-square flex-col items-center justify-start rounded-xl p-1 transition-colors hover:bg-bg-base ${isToday ? 'bg-primary/10 ring-1 ring-primary' : ''}`}>
                <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-text-main'}`}>{dayNum}</span>
                {e && (
                  <span className="mt-auto mb-0.5 flex items-center gap-0.5">
                    {TYPE_KEYS.map((t) => {
                      if (e.done.has(t)) return <span key={t} className={`h-1.5 w-1.5 rounded-full ${TYPES[t].dot}`} />;
                      if (e.planned.has(t)) return <span key={t} className={`h-1.5 w-1.5 rounded-full bg-transparent ring-[1.5px] ${TYPES[t].ring}`} />;
                      return null;
                    })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Month summary */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TYPE_KEYS.map((t) => {
          const Icon = TYPES[t].icon;
          const value = t === 'seva' ? summary.sevaVisits : summary[t];
          const unit = t === 'seva' ? 'visits this month' : 'days this month';
          return (
            <div key={t} className={`rounded-2xl border border-border-light ${TYPES[t].soft} p-3`}>
              <div className="flex items-center gap-1.5"><Icon className={`h-4 w-4 ${TYPES[t].text}`} /><span className="text-[11px] font-bold text-text-muted">{TYPES[t].label}</span></div>
              <p className="mt-1 text-2xl font-black text-text-main">{value}</p>
              <p className="text-[10px] font-semibold text-text-muted">{unit}</p>
            </div>
          );
        })}
        <div className="rounded-2xl border border-dashed border-border-light bg-bg-base p-3">
          <div className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-text-muted" /><span className="text-[11px] font-bold text-text-muted">Planned</span></div>
          <p className="mt-1 text-2xl font-black text-text-main">{summary.planned}</p>
          <p className="text-[10px] font-semibold text-text-muted">upcoming / to do</p>
        </div>
      </div>

      {openDay && (
        <DaySheet
          date={openDay}
          data={byDate[openDay]}
          devoteeId={devoteeId}
          isStaff={isStaff}
          karyakartaName={karyakartaName}
          karyakartaMobile={karyakartaMobile}
          onClose={() => setOpenDay(null)}
          onChanged={reloadPlans}
          onChangedSeva={reloadSeva}
        />
      )}
    </div>
  );
}

// Bottom sheet for a single day: done activities, logged Seva (+ full Seva logging
// for staff — merged from the Seva module), plans, and quick-add.
function DaySheet({ date, data, devoteeId, isStaff, karyakartaName, karyakartaMobile, onClose, onChanged, onChangedSeva }) {
  const [type, setType] = useState('seva');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(''); // 'planned' | 'done'
  const [justSaved, setJustSaved] = useState('');
  const isPast = date < todayISO();
  const dLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const plans = (data?.plans || []);
  const sevaList = (data?.sevaList || []);

  // ── Full Seva logging (merged from the Seva module) ──────────────────────────
  const emptySeva = { id: '', fromTime: '', toTime: '', category: '', work: '', visitedId: '', visitedName: '', companions: [] };
  const [sevaForm, setSevaForm] = useState(emptySeva);
  const [sevaOpen, setSevaOpen] = useState(false);
  const [sevaSaving, setSevaSaving] = useState(false);
  const [sevaSaved, setSevaSaved] = useState(false);
  const setS = (k, v) => setSevaForm((f) => ({ ...f, [k]: v }));

  const flashSaved = (what) => { setJustSaved(what); setTimeout(() => setJustSaved(''), 2200); };

  const add = async (status) => {
    setBusy(true); setPending(status);
    try {
      await dataService.savePlan({ devoteeId, date, type, note: note.trim(), status });
      setNote(''); await onChanged();
      flashSaved(status);
    } catch (e) { alertError('Could not save', e.message || 'Try again.'); }
    finally { setBusy(false); setPending(''); }
  };
  const toggleDone = async (p) => { setBusy(true); try { await dataService.savePlan({ ...p, status: p.status === 'done' ? 'planned' : 'done' }); await onChanged(); } finally { setBusy(false); } };
  const del = async (p) => { setBusy(true); try { await dataService.deletePlan(p.id); await onChanged(); } finally { setBusy(false); } };

  const saveSeva = async () => {
    if (!sevaForm.visitedId) { alertError('Whose home?', 'Pick the devotee whose home you visited.'); return; }
    if (!sevaForm.work.trim()) { alertError('What did you do?', 'Describe the seva you did.'); return; }
    setSevaSaving(true);
    try {
      await dataService.saveSeva({
        ...sevaForm, date,
        companionsJson: JSON.stringify(sevaForm.companions || []),
        karyakartaId: devoteeId, karyakartaName, karyakartaMobile,
      });
      setSevaSaved(true); setSevaForm(emptySeva);
      await onChangedSeva();
      setTimeout(() => { setSevaSaved(false); setSevaOpen(false); }, 1600);
    } catch (e) { alertError('Could not save', e.message || 'Try again.'); }
    finally { setSevaSaving(false); }
  };

  const editSeva = (s) => {
    let comps = [];
    try { comps = JSON.parse(s.companionsJson || '[]'); } catch (e) { comps = []; }
    setSevaForm({
      id: s.id, fromTime: s.fromTime || '', toTime: s.toTime || '',
      category: s.category || '', work: s.work || '',
      visitedId: s.visitedId || '', visitedName: s.visitedName || '',
      companions: Array.isArray(comps) ? comps : [],
    });
    setSevaOpen(true);
  };

  const delSeva = async (s) => {
    const res = await Swal.fire({
      icon: 'warning', title: 'Delete this seva entry?',
      html: `<div style="text-align:left;font-size:14px"><b>${(s.visitedName || 'Seva').replace(/</g, '&lt;')}</b><br>${fmtTimeRange(s.fromTime, s.toTime) || ''}</div>`,
      showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#dc2626', cancelButtonText: 'Cancel',
      customClass: { popup: 'rounded-3xl font-sans', confirmButton: 'rounded-2xl px-6 py-2.5 font-bold', cancelButton: 'rounded-2xl px-6 py-2.5 font-bold' },
    });
    if (!res.isConfirmed) return;
    try { await dataService.deleteSeva(s.id); await onChangedSeva(); }
    catch (e) { alertError('Could not delete', e.message || 'Try again.'); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 backdrop-blur-[1px] sm:items-center" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
          <h2 className="text-base font-black text-text-main">{dLabel}</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {/* Done summary chips */}
          {data && (data.done.size > 0) && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {data.bhajanMin > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 dark:bg-rose-950/40">🎵 Bhajan {data.bhajanMin}m</span>}
              {data.kathaMin > 0 && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-600 dark:bg-violet-950/40">🎧 Katha {data.kathaMin}m</span>}
              {data.sevaCount > 0 && <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:bg-purple-950/40">🤝 {data.sevaCount} seva</span>}
            </div>
          )}

          {/* Seva done this day — with the visited devotee, karyakarta and companions */}
          {sevaList.length > 0 && (
            <div className="mb-3 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Seva done this day</p>
              {sevaList.map((s) => {
                let comps = [];
                try { comps = JSON.parse(s.companionsJson || '[]'); } catch (e) { /* ignore */ }
                const time = fmtTimeRange(s.fromTime, s.toTime);
                return (
                  <div key={s.id} className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 dark:border-purple-900 dark:bg-purple-950/30">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                      <p className="min-w-0 flex-1 truncate text-sm font-bold text-text-main">{s.visitedName || s.category || 'Seva'}</p>
                      {s.category && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">{s.category}</span>}
                      {(isStaff || String(s.karyakartaId) === String(devoteeId)) && (
                        <>
                          <button onClick={() => editSeva(s)} className="shrink-0 rounded-lg p-1 text-text-muted hover:text-primary" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => delSeva(s)} className="shrink-0 rounded-lg p-1 text-text-muted hover:text-red-500" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                    {time && <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-text-muted"><Clock className="h-3 w-3" /> {time}</p>}
                    {s.work && <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-text-main/90">{s.work}</p>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.karyakartaName && <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/60 dark:text-purple-200">👤 {s.karyakartaName}</span>}
                      {comps.map((c) => (
                        <span key={c.id || c.name} className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/60 dark:text-purple-200">🤝 {c.name}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Plans list */}
          {plans.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {plans.map((p) => {
                const T = TYPES[p.type] || {};
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl border border-border-light bg-bg-base px-3 py-2">
                    <button onClick={() => toggleDone(p)} disabled={busy}
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${p.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border-light text-transparent'}`}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold ${p.status === 'done' ? 'text-emerald-600' : 'text-text-main'}`}>{T.label || p.type}</p>
                      {p.note && <p className="truncate text-[11px] text-text-muted">{p.note}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${p.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{p.status === 'done' ? 'DONE' : 'PLANNED'}</span>
                    <button onClick={() => del(p)} disabled={busy} className="shrink-0 rounded-lg p-1 text-text-muted hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Log Seva (staff) — the full Seva module, merged in ──────────────── */}
          {isStaff && (
            <div className="mb-3">
              {!sevaOpen ? (
                <button onClick={() => { setSevaForm(emptySeva); setSevaOpen(true); }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#9333ea] py-3 text-sm font-black text-white shadow-md transition-transform active:scale-[0.99]">
                  <HeartHandshake className="h-4 w-4" /> Log a Seva visit
                </button>
              ) : (
                <div className="space-y-3 rounded-2xl border border-purple-200 bg-purple-50/60 p-3 dark:border-purple-900 dark:bg-purple-950/20">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-main"><HeartHandshake className="h-4 w-4 text-[#7c3aed]" /> {sevaForm.id ? 'Edit Seva' : 'Log Seva'}</p>
                    <button onClick={() => { setSevaOpen(false); setSevaForm(emptySeva); }} className="rounded-lg p-1 text-text-muted hover:text-red-500"><X className="h-4 w-4" /></button>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Whose home did you visit?</label>
                    <DevoteePicker value={sevaForm.visitedId} name={sevaForm.visitedName} onPick={(d) => { setS('visitedId', d?.id || ''); setS('visitedName', d?.name || ''); }} />
                  </div>

                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted"><Users className="h-3.5 w-3.5" /> Who went with you? (optional)</label>
                    <CompanionPicker
                      companions={sevaForm.companions}
                      excludeIds={[devoteeId, sevaForm.visitedId]}
                      onAdd={(d) => { if (!sevaForm.companions.some((c) => c.id === d.id)) setS('companions', [...sevaForm.companions, { id: d.id, name: d.name }]); }}
                      onRemove={(id) => setS('companions', sevaForm.companions.filter((c) => c.id !== id))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-text-muted">From</label>
                      <input type="time" value={sevaForm.fromTime} onChange={(e) => setS('fromTime', e.target.value)}
                        className="w-full rounded-xl border border-border-light bg-bg-base px-2.5 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-text-muted">To</label>
                      <input type="time" value={sevaForm.toTime} onChange={(e) => setS('toTime', e.target.value)}
                        className="w-full rounded-xl border border-border-light bg-bg-base px-2.5 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Type of seva</label>
                    <div className="flex flex-wrap gap-1.5">
                      {SEVA_CATEGORIES.map((c) => (
                        <button key={c} onClick={() => setS('category', sevaForm.category === c ? '' : c)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${sevaForm.category === c ? 'border-primary bg-primary text-white' : 'border-border-light bg-bg-base text-text-muted'}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-text-muted">What did you do?</label>
                    <textarea value={sevaForm.work} onChange={(e) => setS('work', e.target.value)} rows={2} placeholder="e.g. Ghar sabha, gift, invited for Yuva Sabha…"
                      className="w-full rounded-xl border border-border-light bg-bg-base px-3 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
                  </div>

                  <button onClick={saveSeva} disabled={sevaSaving}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white shadow-md transition-all active:scale-[0.99] disabled:opacity-60 ${sevaSaved ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#7c3aed] to-[#9333ea]'}`}>
                    {sevaSaved ? <><Check className="h-5 w-5" /> Seva saved!</> : sevaSaving ? 'Saving…' : <><Check className="h-4 w-4" /> {sevaForm.id ? 'Update Seva' : 'Save Seva'}</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick plan / mark done */}
          <div className="rounded-2xl border border-border-light bg-bg-base p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">Plan / mark an activity</p>
            <div className="mb-2 flex gap-1.5">
              {TYPE_KEYS.map((t) => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${type === t ? `${TYPES[t].dot} text-white` : `${TYPES[t].soft} ${TYPES[t].text}`}`}>
                  {TYPES[t].label}
                </button>
              ))}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. at Nikunjbhai's home"
              className="mb-2 w-full rounded-xl border border-border-light bg-surface px-3 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
            <div className="flex gap-2">
              <button onClick={() => add('planned')} disabled={busy}
                className="flex-1 rounded-xl border border-primary bg-surface py-2.5 text-sm font-bold text-primary transition-colors disabled:opacity-60">
                {pending === 'planned' ? <><span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent align-[-2px]" />Saving…</>
                  : justSaved === 'planned' ? <><Check className="mr-1 inline h-4 w-4" />Planned!</>
                  : <><Plus className="mr-1 inline h-4 w-4" />Plan it</>}
              </button>
              {isPast || date === todayISO() ? (
                <button onClick={() => add('done')} disabled={busy}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-60">
                  {pending === 'done' ? <><span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent align-[-2px]" />Saving…</>
                    : justSaved === 'done' ? <><Check className="mr-1 inline h-4 w-4" />Marked done!</>
                    : <><Check className="mr-1 inline h-4 w-4" />Mark done</>}
                </button>
              ) : null}
            </div>
            {justSaved && (
              <div className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Check className="h-3.5 w-3.5" /> Saved to {dLabel.split(',')[0]} — it's in your list above.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
