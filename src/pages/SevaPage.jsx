import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HeartHandshake, Clock, MapPin, User, Trash2, Check, Search, X, Plus, Users } from 'lucide-react';
import { dataService } from '../services/dataService';
import { alertError } from '../utils/sweetAlert';

const todayISO = () => new Date().toLocaleDateString('en-CA');
const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);
const CATEGORIES = ['Yuva Pravrutti', 'Padhramani', 'Zoli Seva', 'Satsang Visit', 'Shravan Seva', 'Other'];

const fmtTimeRange = (f, t) => [f, t].filter(Boolean).join(' – ') || '—';
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } };

// Searchable devotee picker (whose home was visited).
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
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-border-light bg-surface shadow-xl">
          {results.map((d) => (
            <button key={d.id} onClick={() => { onPick(d); setQ(''); setOpen(false); }}
              className="block w-full px-3.5 py-2.5 text-left text-sm hover:bg-bg-base">
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

// Add several co-sevaks who went along. Shows chips + a search to add more.
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
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-border-light bg-surface shadow-xl">
            {results.map((d) => (
              <button key={d.id} onClick={() => { onAdd(d); setQ(''); }}
                className="block w-full px-3.5 py-2.5 text-left text-sm hover:bg-bg-base">
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

export default function SevaPage({ user }) {
  const me = useMemo(() => {
    const list = dataService.getDevotees();
    let d = user?.devoteeId ? list.find((x) => x.id === user.devoteeId) : null;
    if (!d && user?.mobile) d = list.find((x) => last10(x.mobile) === last10(user.mobile));
    return d || null;
  }, [user]);
  const karyakartaId = me?.id || user?.devoteeId || user?.mobile || '';
  const karyakartaName = me?.name || user?.name || '';
  const karyakartaMobile = me?.mobile || user?.mobile || '';

  const empty = { date: todayISO(), fromTime: '', toTime: '', category: '', work: '', visitedId: '', visitedName: '', companions: [] };
  const [form, setForm] = useState(empty);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = () => dataService.getSeva({ karyakartaId }).then((r) => setList(r || [])).finally(() => setLoading(false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [karyakartaId]);

  const save = async () => {
    if (!form.visitedId) { alertError('Whose home?', 'Pick the devotee whose home you visited.'); return; }
    if (!form.work.trim()) { alertError('What did you do?', 'Describe the seva you did.'); return; }
    setSaving(true);
    try {
      await dataService.saveSeva({ ...form, companionsJson: JSON.stringify(form.companions || []), karyakartaId, karyakartaName, karyakartaMobile });
      setSaved(true); setForm(empty); load();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { alertError('Could not save', e.message || 'Try again.'); }
    finally { setSaving(false); }
  };
  const del = async (s) => {
    if (!window.confirm('Delete this seva entry?')) return;
    await dataService.deleteSeva(s.id); load();
  };

  const totalThisMonth = useMemo(() => {
    const ym = todayISO().slice(0, 7);
    return list.filter((s) => String(s.date).slice(0, 7) === ym).length;
  }, [list]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#6d28d9] via-[#7c3aed] to-[#9333ea] p-6 text-white shadow-lg">
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><HeartHandshake className="h-7 w-7" /></div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">Seva Log</p>
            <p className="text-2xl font-black leading-tight">Jai Swaminarayan{karyakartaName ? ', ' + karyakartaName.split(' ')[0] : ''}</p>
            <p className="text-xs font-semibold text-white/70">{totalThisMonth} seva this month · {list.length} total</p>
          </div>
        </div>
      </div>

      {/* Add form */}
      <div className="mt-5 rounded-3xl border border-border-light bg-surface p-5 shadow-xs space-y-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-main"><Plus className="h-4 w-4 text-[#FF862A]" /> Add Seva</p>

        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Whose home did you visit?</label>
          <DevoteePicker value={form.visitedId} name={form.visitedName} onPick={(d) => { set('visitedId', d?.id || ''); set('visitedName', d?.name || ''); }} />
        </div>

        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted"><Users className="h-3.5 w-3.5" /> Who went with you? (optional)</label>
          <CompanionPicker
            companions={form.companions}
            excludeIds={[karyakartaId, form.visitedId]}
            onAdd={(d) => { if (!form.companions.some((c) => c.id === d.id)) set('companions', [...form.companions, { id: d.id, name: d.name }]); }}
            onRemove={(id) => set('companions', form.companions.filter((c) => c.id !== id))}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Date</label>
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)}
              className="w-full rounded-xl border border-border-light bg-bg-base px-2.5 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-text-muted">From</label>
            <input type="time" value={form.fromTime} onChange={(e) => set('fromTime', e.target.value)}
              className="w-full rounded-xl border border-border-light bg-bg-base px-2.5 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-text-muted">To</label>
            <input type="time" value={form.toTime} onChange={(e) => set('toTime', e.target.value)}
              className="w-full rounded-xl border border-border-light bg-bg-base px-2.5 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Type of seva</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => set('category', form.category === c ? '' : c)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${form.category === c ? 'border-primary bg-primary text-white' : 'border-border-light bg-bg-base text-text-muted'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-text-muted">What did you do?</label>
          <textarea value={form.work} onChange={(e) => set('work', e.target.value)} rows={2} placeholder="e.g. Ghar sabha, gift, invited for Yuva Sabha…"
            className="w-full rounded-xl border border-border-light bg-bg-base px-3 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
        </div>

        <button onClick={save} disabled={saving}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white shadow-lg transition-all active:scale-[0.99] disabled:opacity-60 ${saved ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#7c3aed] to-[#9333ea]'}`}>
          {saved ? <><Check className="h-5 w-5" /> Saved!</> : saving ? 'Saving…' : 'Save Seva'}
        </button>
      </div>

      {/* My seva list */}
      <div className="mt-6">
        <p className="mb-2 text-sm font-black text-text-main">My Seva History</p>
        {loading ? <p className="text-sm text-text-muted">Loading…</p>
          : list.length === 0 ? <p className="rounded-2xl border border-dashed border-border-light p-6 text-center text-sm text-text-muted">No seva logged yet. Add your first above 🙏</p>
          : (
            <div className="space-y-2">
              {list.map((s) => (
                <div key={s.id} className="rounded-2xl border border-border-light bg-surface p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-bold text-text-main"><MapPin className="h-3.5 w-3.5 text-primary" /> {s.visitedName || '—'}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-text-muted"><Clock className="h-3 w-3" /> {fmtDate(s.date)} · {fmtTimeRange(s.fromTime, s.toTime)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {s.category && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">{s.category}</span>}
                      <button onClick={() => del(s)} className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  {s.work && <p className="mt-2 whitespace-pre-wrap text-[13px] text-text-main/90">{s.work}</p>}
                  {(() => { let c = []; try { c = JSON.parse(s.companionsJson || '[]'); } catch (e) {} return c.length ? (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-purple-600"><Users className="h-3 w-3" /> with {c.map((x) => x.name).join(', ')}</p>
                  ) : null; })()}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
