import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Music, Headphones, BookOpen, Check, Flame, Minus, Plus, Sparkles, ChevronLeft, ChevronRight, BarChart3, X, Trophy } from 'lucide-react';
import { dataService } from '../services/dataService';
import { alertError } from '../utils/sweetAlert';

const todayISO = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);

// The three practices — each with its own colour, icon and Gujarati subtitle.
const PRACTICES = [
  { key: 'bhajanMin', label: 'Bhajan', sub: 'ભજન · chanting', icon: Music, from: 'from-rose-500', to: 'to-orange-500', ring: 'ring-rose-200', text: 'text-rose-600', soft: 'bg-rose-50 dark:bg-rose-950/40' },
  { key: 'listenMin', label: 'Shravan', sub: 'શ્રવણ · listening', icon: Headphones, from: 'from-violet-500', to: 'to-fuchsia-500', ring: 'ring-violet-200', text: 'text-violet-600', soft: 'bg-violet-50 dark:bg-violet-950/40' },
  { key: 'readMin', label: 'Vanchan', sub: 'વાંચન · reading', icon: BookOpen, from: 'from-emerald-500', to: 'to-teal-500', ring: 'ring-emerald-200', text: 'text-emerald-600', soft: 'bg-emerald-50 dark:bg-emerald-950/40' },
];

const QUICK = [10, 15, 20, 30, 45, 60];
const TIME_SLOTS = ['Early Morning', 'Morning', 'Afternoon', 'Evening', 'Night'];

const fmtMin = (m) => {
  m = Number(m) || 0;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

// Admin group report / leaderboard — who's consistent, streaks, weekly participation.
function SwadhyayGroupReport({ onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { dataService.getAllSwadhyay().then((e) => setRows(e || [])); }, []);

  const last7Keys = useMemo(() => {
    const out = []; for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); out.push(d.toLocaleDateString('en-CA')); } return out;
  }, []);

  const people = useMemo(() => {
    if (!rows) return [];
    const by = new Map();
    rows.forEach((r) => {
      const id = String(r.devoteeId || r.mobile || r.name);
      const tot = (+r.bhajanMin || 0) + (+r.listenMin || 0) + (+r.readMin || 0);
      if (!by.has(id)) by.set(id, { id, name: r.name || id, total: 0, days: new Set() });
      const p = by.get(id);
      if (tot > 0) { p.total += tot; p.days.add(r.date); }
    });
    const todayISO2 = new Date().toLocaleDateString('en-CA');
    const list = [...by.values()].map((p) => {
      const last7 = last7Keys.filter((k) => p.days.has(k)).length;
      // streak: consecutive days up to today
      let streak = 0; const d = new Date();
      for (;;) { const k = d.toLocaleDateString('en-CA'); if (p.days.has(k)) { streak++; d.setDate(d.getDate() - 1); } else { if (k === todayISO2) { d.setDate(d.getDate() - 1); continue; } break; } }
      return { ...p, daysCount: p.days.size, last7, streak };
    });
    return list.sort((a, b) => b.last7 - a.last7 || b.total - a.total || b.daysCount - a.daysCount);
  }, [rows, last7Keys]);

  const activeThisWeek = people.filter((p) => p.last7 > 0).length;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-bg-base">
      <div className="flex shrink-0 items-center justify-between border-b border-border-light bg-surface px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <span className="flex items-center gap-2 text-base font-black text-text-main"><BarChart3 className="h-5 w-5 text-[#FF862A]" /> Swadhyay — Group Report</span>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        {rows === null && <p className="py-10 text-center text-sm text-text-muted">Loading…</p>}
        {rows && people.length === 0 && <p className="py-10 text-center text-sm text-text-muted">No Swadhyay logged yet.</p>}
        {people.length > 0 && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border-light bg-surface p-3"><div className="text-[11px] font-bold uppercase text-text-muted">Active this week</div><div className="text-2xl font-black text-text-main">{activeThisWeek}</div></div>
              <div className="rounded-2xl border border-border-light bg-surface p-3"><div className="text-[11px] font-bold uppercase text-text-muted">People logged</div><div className="text-2xl font-black text-text-main">{people.length}</div></div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
              {people.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-border-light/60 px-3 py-2.5 last:border-0">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${i < 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-bg-base text-text-muted'}`}>{i < 3 ? <Trophy className="h-3.5 w-3.5" /> : i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-text-main">{p.name}</p>
                    <div className="mt-0.5 flex items-center gap-1">
                      {last7Keys.slice().reverse().map((k) => (
                        <span key={k} className={`h-1.5 w-4 rounded-full ${p.days.has(k) ? 'bg-emerald-500' : 'bg-bg-base border border-border-light'}`} />
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-text-main">{fmtMin(p.total)}</p>
                    <p className="text-[10px] font-semibold text-text-muted">{p.daysCount} days{p.streak > 0 ? ` · 🔥${p.streak}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-text-muted">Sorted by participation in the last 7 days. The row of bars shows this week (left = 6 days ago, right = today).</p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function SwadhyayPage({ user }) {
  const me = useMemo(() => {
    const list = dataService.getDevotees();
    let d = user?.devoteeId ? list.find((x) => x.id === user.devoteeId) : null;
    if (!d && user?.mobile) d = list.find((x) => last10(x.mobile) === last10(user.mobile));
    return d || null;
  }, [user]);
  const devoteeId = me?.id || user?.devoteeId || user?.mobile || '';
  const myName = me?.name || user?.name || '';
  const myMobile = me?.mobile || user?.mobile || '';
  const isAdmin = user?.role === 'Admin';
  const [showGroup, setShowGroup] = useState(false);

  const [date, setDate] = useState(todayISO());
  const [form, setForm] = useState({ bhajanMin: 0, bhajanTime: '', listenMin: 0, readMin: 0 });
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch the full history in the BACKGROUND — the page renders instantly and the
  // numbers fill in when the data arrives (no blocking "Loading…" screen).
  useEffect(() => {
    let alive = true;
    dataService.getMySwadhyay(devoteeId).then((rows) => { if (alive) setHistory(rows || []); });
    return () => { alive = false; };
  }, [devoteeId]);

  // Tracks whether the current form has user edits not yet persisted. Prefills
  // clear it; user edits set it; the auto-save uses it to avoid saving on load.
  const dirtyRef = useRef(false);
  const saveTimer = useRef(null);

  // Prefill the form from the selected day's saved entry (blank if none).
  // NEVER clobber in-progress edits (dirtyRef) — otherwise a background history
  // update would wipe a value the user just tapped.
  useEffect(() => {
    if (dirtyRef.current) return;
    const entry = history.find((r) => r.date === date);
    setForm(entry
      ? { bhajanMin: +entry.bhajanMin || 0, bhajanTime: entry.bhajanTime || '', listenMin: +entry.listenMin || 0, readMin: +entry.readMin || 0 }
      : { bhajanMin: 0, bhajanTime: '', listenMin: 0, readMin: 0 });
    setSaved(false);
  }, [date, history]);

  const shiftDate = (delta) => {
    const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + delta);
    const iso = d.toLocaleDateString('en-CA');
    if (iso > todayISO()) return; // no future dates
    // Flush any pending edits for the current date before switching, so nothing is lost.
    if (dirtyRef.current && devoteeId) { if (saveTimer.current) clearTimeout(saveTimer.current); save(); }
    setDate(iso);
  };
  const isToday = date === todayISO();
  const dateLabel = isToday ? 'Today' : new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  const set = (k, v) => { dirtyRef.current = true; setForm((f) => ({ ...f, [k]: v })); setSaved(false); };
  const bump = (k, delta) => set(k, Math.max(0, (Number(form[k]) || 0) + delta));

  const totalToday = (Number(form.bhajanMin) || 0) + (Number(form.listenMin) || 0) + (Number(form.readMin) || 0);

  // Streak = consecutive days up to today that have any minutes logged.
  const streak = useMemo(() => {
    const byDate = {};
    history.forEach((r) => { const t = (+r.bhajanMin || 0) + (+r.listenMin || 0) + (+r.readMin || 0); if (t > 0) byDate[r.date] = true; });
    if (totalToday > 0) byDate[date] = true;
    let n = 0; const d = new Date();
    for (;;) { const key = d.toLocaleDateString('en-CA'); if (byDate[key]) { n++; d.setDate(d.getDate() - 1); } else break; }
    return n;
  }, [history, totalToday, date]);

  // Last 7 days totals for the mini bar chart.
  const week = useMemo(() => {
    const map = {};
    history.forEach((r) => { map[r.date] = (+r.bhajanMin || 0) + (+r.listenMin || 0) + (+r.readMin || 0); });
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA');
      out.push({ key, label: d.toLocaleDateString('en-IN', { weekday: 'short' })[0], total: key === date ? totalToday : (map[key] || 0) });
    }
    return out;
  }, [history, totalToday, date]);
  const weekMax = Math.max(30, ...week.map((w) => w.total));

  const save = async () => {
    if (!devoteeId) { alertError('Not linked', 'Your account is not linked to a devotee record yet.'); return; }
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const snapshot = { ...form }, savedDate = date;
    dirtyRef.current = false; // these edits are being persisted now
    setSaving(true);
    try {
      await dataService.saveSwadhyay({ devoteeId, mobile: myMobile, name: myName, date: savedDate, ...snapshot });
      setSaved(true);
      // Merge the saved row into local history (optimistic). We do NOT refetch from
      // the server here — a just-saved row can read back stale and wipe the form.
      setHistory((prev) => {
        const others = (prev || []).filter((r) => r.date !== savedDate);
        return [...others, { devoteeId, mobile: myMobile, name: myName, date: savedDate, ...snapshot }];
      });
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { alertError('Could not save', e.message || 'Try again.'); }
    finally { setSaving(false); }
  };

  // Auto-save edits (debounced) so a tapped value is never lost by navigating away.
  useEffect(() => {
    if (!dirtyRef.current || !devoteeId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { if (dirtyRef.current) save(); }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bhajanMin, form.bhajanTime, form.listenMin, form.readMin]);

  // Keep the latest values in a ref so we can flush a pending edit on unmount
  // (e.g. the user taps 30 then immediately switches to another tab).
  const latest = useRef({});
  latest.current = { form, date, devoteeId, myMobile, myName };
  useEffect(() => () => {
    if (dirtyRef.current && latest.current.devoteeId) {
      const l = latest.current;
      try { dataService.saveSwadhyay({ devoteeId: l.devoteeId, mobile: l.myMobile, name: l.myName, date: l.date, ...l.form }); } catch (e) { /* fire-and-forget */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 pb-28">
      {showGroup && <SwadhyayGroupReport onClose={() => setShowGroup(false)} />}
      {isAdmin && (
        <button onClick={() => setShowGroup(true)}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border-light bg-surface py-2.5 text-sm font-bold text-text-main shadow-xs hover:border-primary">
          <BarChart3 className="h-4 w-4 text-[#FF862A]" /> Group report &amp; leaderboard
        </button>
      )}
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#001F3D] via-[#06325c] to-[#0a4a7a] p-6 text-white shadow-lg">
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-[#FF862A]/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/70">
              <Sparkles className="h-3.5 w-3.5 text-[#FF862A]" /> My Swadhyay
            </div>
            {/* Date switcher — log today or a previous day */}
            <div className="flex items-center gap-1 rounded-full bg-white/10 p-0.5 backdrop-blur">
              <button onClick={() => shiftDate(-1)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/15"><ChevronLeft className="h-4 w-4" /></button>
              <label className="relative px-1 text-xs font-bold">
                {dateLabel}
                <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0" title="Pick a date" />
              </label>
              <button onClick={() => shiftDate(1)} disabled={isToday}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/15 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="mt-2 flex items-end gap-3">
            <p className="text-5xl font-black leading-none">{fmtMin(totalToday)}</p>
            <p className="mb-1 text-sm font-semibold text-white/70">{isToday ? 'today' : dateLabel}</p>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold backdrop-blur">
              <Flame className={`h-3.5 w-3.5 ${streak > 0 ? 'text-orange-400' : 'text-white/50'}`} /> {streak} day streak
            </span>
          </div>
          {/* Last 7 days */}
          <div className="mt-4 flex items-end justify-between gap-1.5">
            {week.map((w, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-14 w-full items-end">
                  <div className={`w-full rounded-md ${w.total > 0 ? 'bg-[#FF862A]' : 'bg-white/15'}`}
                    style={{ height: `${Math.max(6, (w.total / weekMax) * 100)}%` }} title={`${fmtMin(w.total)}`} />
                </div>
                <span className={`text-[9px] font-bold ${w.key === date ? 'text-[#FF862A]' : 'text-white/50'}`}>{w.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(
        <div className="mt-5 space-y-4">
          {PRACTICES.map((p) => {
            const Icon = p.icon;
            const val = Number(form[p.key]) || 0;
            return (
              <div key={p.key} className="rounded-3xl border border-border-light bg-surface p-5 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${p.from} ${p.to} text-white shadow-md`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-black text-text-main leading-tight">{p.label}</p>
                    <p className="text-[11px] font-semibold text-text-muted">{p.sub}</p>
                  </div>
                  <div className={`flex items-baseline gap-1 ${p.text}`}>
                    <input type="number" inputMode="numeric" min="0" value={val}
                      onChange={(e) => set(p.key, Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
                      onFocus={(e) => e.target.select()}
                      className="w-16 rounded-lg bg-transparent text-right text-2xl font-black outline-none focus:bg-bg-base" />
                    <span className="text-xs font-bold">min</span>
                  </div>
                </div>

                {/* Stepper + quick chips */}
                <div className="mt-4 flex items-center gap-2">
                  <button onClick={() => bump(p.key, -5)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-light bg-bg-base text-text-main active:scale-95"><Minus className="h-4 w-4" /></button>
                  <div className="flex-1 overflow-x-auto">
                    <div className="flex gap-1.5">
                      {QUICK.map((q) => (
                        <button key={q} onClick={() => set(p.key, q)}
                          className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${val === q ? `bg-gradient-to-br ${p.from} ${p.to} text-white shadow` : `${p.soft} ${p.text}`}`}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => bump(p.key, 5)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-light bg-bg-base text-text-main active:scale-95"><Plus className="h-4 w-4" /></button>
                </div>

                {/* Bhajan: which time of day */}
                {p.key === 'bhajanMin' && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">Which time?</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TIME_SLOTS.map((t) => (
                        <button key={t} onClick={() => set('bhajanTime', form.bhajanTime === t ? '' : t)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${form.bhajanTime === t ? 'border-rose-500 bg-rose-500 text-white' : 'border-border-light bg-bg-base text-text-muted'}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-light bg-surface/90 p-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex-1">
            <p className="text-[11px] font-semibold text-text-muted">{isToday ? "Today's total" : dateLabel + ' total'}</p>
            <p className="text-lg font-black text-text-main leading-none">{fmtMin(totalToday)}</p>
          </div>
          <button onClick={save} disabled={saving}
            className={`flex items-center justify-center gap-2 rounded-2xl px-8 py-3.5 text-sm font-black text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-60 ${saved ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#E56F18] to-[#FF862A]'}`}>
            {saved ? <><Check className="h-5 w-5" /> Saved!</> : saving ? 'Saving…' : 'Save Swadhyay'}
          </button>
        </div>
      </div>
    </div>
  );
}
