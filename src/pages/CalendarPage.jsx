import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Plus, Check, Trash2, Music, Headphones, HeartHandshake, CalendarDays } from 'lucide-react';
import { dataService } from '../services/dataService';
import { alertError } from '../utils/sweetAlert';

const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);
const iso = (d) => d.toLocaleDateString('en-CA');
const todayISO = () => iso(new Date());

// Activity types shown on the calendar.
const TYPES = {
  seva: { label: 'Seva', icon: HeartHandshake, dot: 'bg-purple-500', ring: 'ring-purple-500', text: 'text-purple-600', soft: 'bg-purple-50 dark:bg-purple-950/40' },
  bhajan: { label: 'Bhajan', icon: Music, dot: 'bg-rose-500', ring: 'ring-rose-500', text: 'text-rose-600', soft: 'bg-rose-50 dark:bg-rose-950/40' },
  katha: { label: 'Katha-Varta', icon: Headphones, dot: 'bg-violet-500', ring: 'ring-violet-500', text: 'text-violet-600', soft: 'bg-violet-50 dark:bg-violet-950/40' },
};
const TYPE_KEYS = ['seva', 'bhajan', 'katha'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarPage({ user }) {
  const me = useMemo(() => {
    const list = dataService.getDevotees();
    let d = user?.devoteeId ? list.find((x) => x.id === user.devoteeId) : null;
    if (!d && user?.mobile) d = list.find((x) => last10(x.mobile) === last10(user.mobile));
    return d || null;
  }, [user]);
  const devoteeId = me?.id || user?.devoteeId || user?.mobile || '';

  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [swadhyay, setSwadhyay] = useState([]);
  const [seva, setSeva] = useState([]);
  const [plans, setPlans] = useState([]);
  const [openDay, setOpenDay] = useState(null); // ISO date string

  const reloadPlans = () => dataService.getPlans(devoteeId).then((p) => setPlans(p || []));
  useEffect(() => {
    if (!devoteeId) return;
    dataService.getMySwadhyay(devoteeId).then((r) => setSwadhyay(r || []));
    dataService.getSeva({ karyakartaId: devoteeId }).then((r) => setSeva(r || []));
    reloadPlans();
    // eslint-disable-next-line
  }, [devoteeId]);

  // date -> { done:Set, planned:Set, bhajanMin, kathaMin, sevaCount, plans:[] }
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
    const s = { seva: 0, bhajan: 0, katha: 0, planned: 0 };
    cells.filter(Boolean).forEach((d) => {
      const e = byDate[d]; if (!e) return;
      TYPE_KEYS.forEach((t) => { if (e.done.has(t)) s[t]++; });
      s.planned += e.planned.size;
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
          return (
            <div key={t} className={`rounded-2xl border border-border-light ${TYPES[t].soft} p-3`}>
              <div className="flex items-center gap-1.5"><Icon className={`h-4 w-4 ${TYPES[t].text}`} /><span className="text-[11px] font-bold text-text-muted">{TYPES[t].label}</span></div>
              <p className="mt-1 text-2xl font-black text-text-main">{summary[t]}</p>
              <p className="text-[10px] font-semibold text-text-muted">days this month</p>
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
        <DaySheet date={openDay} data={byDate[openDay]} devoteeId={devoteeId} onClose={() => setOpenDay(null)} onChanged={reloadPlans} />
      )}
    </div>
  );
}

// Bottom sheet for a single day: shows done activities, plans, and quick-add.
function DaySheet({ date, data, devoteeId, onClose, onChanged }) {
  const [type, setType] = useState('seva');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(''); // which add button is in flight: 'planned' | 'done'
  const [justSaved, setJustSaved] = useState(''); // 'planned' | 'done' — transient confirmation
  const isPast = date < todayISO();
  const dLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const plans = (data?.plans || []);
  const sevaList = (data?.sevaList || []);

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

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 backdrop-blur-[1px] sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl bg-surface p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black text-text-main">{dLabel}</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
        </div>

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
              const time = [s.fromTime, s.toTime].filter(Boolean).join('–');
              return (
                <div key={s.id} className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 dark:border-purple-900 dark:bg-purple-950/30">
                  <div className="flex items-center gap-1.5">
                    <HeartHandshake className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-text-main">{s.visitedName || s.category || 'Seva'}</p>
                    {time && <span className="shrink-0 text-[10px] font-semibold text-text-muted">{time}</span>}
                  </div>
                  {s.work && <p className="mt-0.5 text-[11px] text-text-muted">{s.work}</p>}
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

        {/* Add */}
        <div className="rounded-2xl border border-border-light bg-bg-base p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">Add activity</p>
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
    </div>,
    document.body
  );
}
