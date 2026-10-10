import React, { useEffect, useMemo, useState } from 'react';
import { Music, Headphones, BookOpen, Check, Flame, Minus, Plus, Sparkles } from 'lucide-react';
import { dataService } from '../services/dataService';
import { alertError } from '../utils/sweetAlert';

const todayISO = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);

// The three practices — each with its own colour, icon and Gujarati subtitle.
const PRACTICES = [
  { key: 'bhajanMin', label: 'Bhajan', sub: 'ભજન', icon: Music, from: 'from-rose-500', to: 'to-orange-500', ring: 'ring-rose-200', text: 'text-rose-600', soft: 'bg-rose-50 dark:bg-rose-950/40' },
  { key: 'listenMin', label: 'Shravan', sub: 'શ્રવણ · listening', icon: Headphones, from: 'from-violet-500', to: 'to-fuchsia-500', ring: 'ring-violet-200', text: 'text-violet-600', soft: 'bg-violet-50 dark:bg-violet-950/40' },
  { key: 'readMin', label: 'Vachan', sub: 'વાંચન · reading', icon: BookOpen, from: 'from-emerald-500', to: 'to-teal-500', ring: 'ring-emerald-200', text: 'text-emerald-600', soft: 'bg-emerald-50 dark:bg-emerald-950/40' },
];

const QUICK = [10, 15, 20, 30, 45, 60];
const TIME_SLOTS = ['Early Morning', 'Morning', 'Afternoon', 'Evening', 'Night'];

const fmtMin = (m) => {
  m = Number(m) || 0;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

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

  const date = todayISO();
  const [form, setForm] = useState({ bhajanMin: 0, bhajanTime: '', listenMin: 0, readMin: 0 });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    dataService.getMySwadhyay(devoteeId).then((rows) => {
      if (!alive) return;
      setHistory(rows || []);
      const today = (rows || []).find((r) => r.date === date);
      if (today) setForm({ bhajanMin: +today.bhajanMin || 0, bhajanTime: today.bhajanTime || '', listenMin: +today.listenMin || 0, readMin: +today.readMin || 0 });
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [devoteeId, date]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };
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
    setSaving(true);
    try {
      await dataService.saveSwadhyay({ devoteeId, mobile: myMobile, name: myName, date, ...form });
      setSaved(true);
      // refresh history so streak/week reflect the save
      dataService.getMySwadhyay(devoteeId).then((rows) => setHistory(rows || []));
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { alertError('Could not save', e.message || 'Try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 pb-28">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#001F3D] via-[#06325c] to-[#0a4a7a] p-6 text-white shadow-lg">
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-[#FF862A]/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/70">
            <Sparkles className="h-3.5 w-3.5 text-[#FF862A]" /> My Swadhyay · {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
          </div>
          <div className="mt-2 flex items-end gap-3">
            <p className="text-5xl font-black leading-none">{fmtMin(totalToday)}</p>
            <p className="mb-1 text-sm font-semibold text-white/70">today</p>
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

      {loading ? (
        <p className="mt-6 text-center text-sm text-text-muted">Loading…</p>
      ) : (
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
                  <div className={`text-right ${p.text}`}>
                    <span className="text-2xl font-black">{val}</span>
                    <span className="text-xs font-bold"> min</span>
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
            <p className="text-[11px] font-semibold text-text-muted">Today's total</p>
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
