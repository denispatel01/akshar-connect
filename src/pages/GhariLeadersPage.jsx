import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Cookie, IndianRupee, RefreshCw, Plus, Pencil, Trash2, X, Check,
  Search, ArrowRightLeft, ChevronDown, ChevronRight, UserCog, Upload,
} from 'lucide-react';
import {
  getLeaders, loadCached, refresh, saveBuyer, transferBuyers, removeBuyer, getGrouped, getGrandTotals, importBuyers,
} from '../services/ghariLeadersService';
import { isAdminRole, isSevakRole } from '../utils/navItems';
import { alertError, alertSuccess, confirmDialog } from '../utils/sweetAlert';

// Parse Pravin kaka's "GHARI SALES" workbook on the client and aggregate per buyer.
// Robust to layout drift: it finds the header row by the "Total Ghari" column rather
// than assuming fixed positions, then sums kg / amount and counts orders per name.
async function parseWorkbook(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('That file has no sheets.');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    if ((rows[i] || []).some((c) => /total ghari/i.test(String(c)))) { hi = i; break; }
  }
  if (hi < 0) throw new Error('Could not find a "Total Ghari" column — is this the right file?');
  const head = rows[hi].map((c) => String(c == null ? '' : c).replace(/\s+/g, ' ').trim().toLowerCase());
  const nameCol = head.findIndex((h) => h === 'name' || h.startsWith('name'));
  const ghariCol = head.findIndex((h) => h.includes('total ghari'));
  const amtCol = head.findIndex((h) => h.includes('overall total'));
  if (nameCol < 0 || ghariCol < 0) throw new Error('Missing the Name or Total Ghari column.');
  const agg = {};
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const name = String(r[nameCol] == null ? '' : r[nameCol]).trim();
    if (!name || /^cancel/i.test(name)) continue;
    const kg = Number(r[ghariCol]) || 0;
    const amt = amtCol >= 0 ? (Number(r[amtCol]) || 0) : 0;
    if (!agg[name]) agg[name] = { buyer: name, ghariKg: 0, orders: 0, amount: 0 };
    agg[name].ghariKg += kg; agg[name].amount += amt; agg[name].orders += 1;
  }
  return Object.values(agg);
}

// ── helpers ──────────────────────────────────────────────────────────────────
const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const fmtKg = (n) => (+(num(n).toFixed(2))).toLocaleString('en-IN');
const fmtRs = (n) => '₹' + num(n).toLocaleString('en-IN');

// A fixed, high-contrast, colour-blind-safe accent palette (no red/green pair).
// Colour is NEVER the only signal — every leader also shows an initials badge and
// its full name — so this is purely a quick visual anchor per leader.
const ACCENTS = [
  '#2563EB', '#D97706', '#7C3AED', '#0891B2', '#DB2777', '#4338CA',
  '#B45309', '#0D9488', '#9333EA', '#C2410C', '#1D4ED8', '#A16207',
  '#6D28D9', '#047857', '#BE185D', '#5B21B6', '#92400E',
];
const accentFor = (leaderId) => {
  const m = String(leaderId || '').match(/(\d+)/);
  const i = m ? (parseInt(m[1], 10) - 1) : 0;
  return ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length] || '#6B7280';
};
const initials = (name) => String(name || '?').replace(/[^A-Za-z ]/g, '').trim().split(/\s+/)
  .slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export default function GhariLeadersPage({ user, refreshing }) {
  const canWrite = isAdminRole(user) || isSevakRole(user);
  const actor = user?.name || user?.mobile || '';

  const [snap, setSnap] = useState(() => loadCached());
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({});       // leaderId -> true when collapsed
  const [selected, setSelected] = useState({});          // buyerId -> true
  const [editing, setEditing] = useState(null);          // buyer obj or {} (new) or null
  const [transferTo, setTransferTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const reload = useCallback(() => {
    setSnap({ leaders: getLeaders(), groups: getGrouped(), totals: getGrandTotals() });
  }, []);

  useEffect(() => {
    let alive = true;
    refresh().then(() => { if (alive) reload(); });
    const on = () => reload();
    window.addEventListener('ac-ghari-leaders-changed', on);
    return () => { alive = false; window.removeEventListener('ac-ghari-leaders-changed', on); };
  }, [reload]);

  useEffect(() => { if (refreshing) refresh().then(reload); }, [refreshing, reload]);

  const leaders = snap.leaders || [];
  const groups = snap.groups || [];
  const totals = snap.totals || { buyers: 0, kg: 0, amount: 0 };

  // Filter buyers by name (keeps a leader section visible only if it has a match).
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((b) => String(b.buyer).toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, q]);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const selCount = selectedIds.length;

  const toggleSel = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const clearSel = () => { setSelected({}); setTransferTo(''); };

  async function doTransfer() {
    if (!transferTo || !selCount) return;
    const leadName = leaders.find((l) => l.id === transferTo)?.name || 'leader';
    const ok = await confirmDialog({
      title: `Transfer ${selCount} buyer${selCount > 1 ? 's' : ''}?`,
      text: `Move the selected buyer${selCount > 1 ? 's' : ''} to ${leadName}.`,
      confirmText: 'Transfer', icon: 'question',
    });
    if (!ok) return;
    setBusy(true);
    try { await transferBuyers(selectedIds, transferTo, actor); clearSel(); reload(); }
    catch (e) { alertError('Transfer failed', e.message); }
    finally { setBusy(false); }
  }

  async function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const parsed = await parseWorkbook(file);
      if (!parsed.length) { alertError('Nothing to import', 'No buyer rows were found in that file.'); return; }
      const ok = await confirmDialog({
        title: 'Import from Excel?',
        text: `${parsed.length} buyers found. New buyers are added without a leader (tag them after); existing buyers keep their leader and get refreshed totals.`,
        confirmText: 'Import', icon: 'question',
      });
      if (!ok) return;
      const res = await importBuyers(parsed, actor);
      reload();
      alertSuccess('Imported', `${res.added} added, ${res.updated} updated.`);
    } catch (err) { alertError('Import failed', err.message); }
    finally { setImporting(false); }
  }

  async function doDelete(b) {
    const ok = await confirmDialog({
      title: 'Remove buyer?', text: `Remove "${b.buyer}" from the leaders list. This does not touch any Ghari order.`,
      confirmText: 'Remove', danger: true,
    });
    if (!ok) return;
    try { await removeBuyer(b.id, actor); reload(); }
    catch (e) { alertError('Could not remove', e.message); }
  }

  return (
    <div className="w-full mx-auto max-w-[1600px] px-4 py-5 sm:px-6 space-y-5 pb-28">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary/15 text-primary shrink-0">
            <UserCog className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-text-main leading-tight">Mandal Leaders</h1>
            <p className="text-xs text-text-muted">Which buyer comes under which leader</p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => refresh().then(reload)}
            className="grid place-items-center h-9 w-9 rounded-lg border border-border-light text-text-muted hover:bg-surface-hover"
            title="Refresh" aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
          {canWrite && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onImportFile} />
              <button onClick={() => fileRef.current && fileRef.current.click()} disabled={importing}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border-light text-text-main font-medium hover:bg-surface-hover disabled:opacity-50"
                title="Import Pravin kaka's Excel">
                <Upload className="h-4 w-4" /> {importing ? 'Importing…' : 'Import'}
              </button>
              <button onClick={() => setEditing({})}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover">
                <Plus className="h-4 w-4" /> Add buyer
              </button>
            </>
          )}
        </div>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Buyers" value={totals.buyers} />
        <StatCard icon={<Cookie className="h-4 w-4" />} label="Total Ghari" value={`${fmtKg(totals.kg)} kg`} />
        <StatCard icon={<IndianRupee className="h-4 w-4" />} label="Amount" value={fmtRs(totals.amount)} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search buyer…"
          className="w-full h-10 pl-9 pr-9 rounded-xl border border-border-light bg-surface text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40" />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear"
            className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-7 w-7 rounded-md text-text-muted hover:bg-surface-hover">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Leader groups */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-text-muted">
            <Users className="mx-auto h-8 w-8 mb-2 opacity-60" />
            <p>No buyers{q ? ' match your search' : ' yet'}.</p>
          </div>
        )}
        {filtered.map((g) => {
          const accent = accentFor(g.leader.id);
          const isCollapsed = collapsed[g.leader.id];
          return (
            <section key={g.leader.id || 'none'} className="rounded-2xl border border-border-light bg-surface overflow-hidden">
              {/* Leader header */}
              <button onClick={() => setCollapsed((c) => ({ ...c, [g.leader.id]: !c[g.leader.id] }))}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-hover"
                style={{ borderLeft: `5px solid ${accent}` }}>
                <span className="grid place-items-center h-9 w-9 rounded-lg text-white text-xs font-semibold shrink-0"
                  style={{ background: accent }}>{g.leader.id ? initials(g.leader.name) : '—'}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-text-main truncate">{g.leader.name}</div>
                  <div className="text-xs text-text-muted">
                    {g.buyers} buyer{g.buyers !== 1 ? 's' : ''} · {fmtKg(g.kg)} kg · {fmtRs(g.amount)}
                  </div>
                </div>
                {isCollapsed ? <ChevronRight className="h-5 w-5 text-text-muted shrink-0" />
                  : <ChevronDown className="h-5 w-5 text-text-muted shrink-0" />}
              </button>

              {/* Buyers */}
              {!isCollapsed && (
                <ul className="divide-y divide-border-light">
                  {g.items.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
                      {canWrite && (
                        <input type="checkbox" checked={!!selected[b.id]} onChange={() => toggleSel(b.id)}
                          className="h-4 w-4 accent-primary shrink-0" aria-label={`Select ${b.buyer}`} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-text-main truncate">{b.buyer}</div>
                        <div className="text-xs text-text-muted">
                          {fmtKg(b.ghariKg)} kg · {b.orders} order{b.orders !== 1 ? 's' : ''} · {fmtRs(b.amount)}
                        </div>
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setEditing(b)} aria-label="Edit"
                            className="grid place-items-center h-8 w-8 rounded-md text-text-muted hover:bg-surface-hover">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => doDelete(b)} aria-label="Remove"
                            className="grid place-items-center h-8 w-8 rounded-md text-text-muted hover:bg-surface-hover">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {/* Transfer action bar (sticky above the app's bottom nav) */}
      {canWrite && selCount > 0 && (
        <div className="fixed left-0 right-0 bottom-16 z-30 px-3 sm:px-6">
          <div className="mx-auto max-w-[1600px] rounded-2xl border border-border-light bg-surface shadow-lg p-2.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-main shrink-0">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              {selCount} selected
            </span>
            <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}
              className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-border-light bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="">Transfer to…</option>
              {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={doTransfer} disabled={!transferTo || busy}
              className="h-9 px-3 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 shrink-0">
              Move
            </button>
            <button onClick={clearSel} aria-label="Clear selection"
              className="grid place-items-center h-9 w-9 rounded-lg text-text-muted hover:bg-surface-hover shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {editing !== null && (
        <BuyerModal buyer={editing} leaders={leaders} actor={actor}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="rounded-xl bg-surface border border-border-light p-3">
      <div className="flex items-center gap-1.5 text-text-muted text-xs">{icon}<span>{label}</span></div>
      <div className="mt-1 text-base sm:text-lg font-semibold text-text-main truncate">{value}</div>
    </div>
  );
}

function BuyerModal({ buyer, leaders, actor, onClose, onSaved }) {
  const isNew = !buyer.id;
  const [buyerName, setBuyerName] = useState(buyer.buyer || '');
  const [leaderId, setLeaderId] = useState(buyer.leaderId || '');
  const [ghariKg, setGhariKg] = useState(buyer.ghariKg != null ? String(buyer.ghariKg) : '');
  const [orders, setOrders] = useState(buyer.orders != null ? String(buyer.orders) : '');
  const [amount, setAmount] = useState(buyer.amount != null ? String(buyer.amount) : '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!buyerName.trim()) { alertError('Name needed', 'Enter the buyer name.'); return; }
    setSaving(true);
    try {
      await saveBuyer({ id: buyer.id, buyer: buyerName, leaderId, ghariKg, orders, amount }, actor);
      onSaved();
    } catch (e) { alertError('Could not save', e.message); setSaving(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border-light sticky top-0 bg-surface">
          <h2 className="font-semibold text-text-main">{isNew ? 'Add buyer' : 'Edit buyer'}</h2>
          <button onClick={onClose} aria-label="Close"
            className="grid place-items-center h-8 w-8 rounded-md text-text-muted hover:bg-surface-hover">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Buyer name">
            <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} autoFocus
              className="inp" placeholder="e.g. Rameshbhai Modi" />
          </Field>
          <Field label="Leader">
            <select value={leaderId} onChange={(e) => setLeaderId(e.target.value)} className="inp">
              <option value="">— No leader —</option>
              {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Ghari (kg)">
              <input value={ghariKg} onChange={(e) => setGhariKg(e.target.value)} inputMode="decimal" className="inp" />
            </Field>
            <Field label="Orders">
              <input value={orders} onChange={(e) => setOrders(e.target.value)} inputMode="numeric" className="inp" />
            </Field>
            <Field label="Amount ₹">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="inp" />
            </Field>
          </div>
        </div>
        <div className="p-4 flex gap-2 border-t border-border-light sticky bottom-0 bg-surface">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border-light text-text-main font-medium">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-11 rounded-xl bg-primary text-white font-medium disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <style>{`.inp{width:100%;height:42px;padding:0 10px;border-radius:10px;border:1px solid var(--border-light);background:var(--surface);color:var(--text-main);outline:none}.inp:focus{box-shadow:0 0 0 2px color-mix(in srgb, var(--primary) 40%, transparent)}`}</style>
    </div>,
    document.body,
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
