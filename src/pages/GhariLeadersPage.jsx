import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Cookie, IndianRupee, RefreshCw, Plus, Pencil, Trash2, X, Check,
  Search, ArrowRightLeft, ChevronDown, ChevronRight, UserCog, Upload,
  Image as ImageIcon, Download, Share2, Split as SplitIcon, Target,
} from 'lucide-react';
import {
  getLeaders, loadCached, refresh, saveBuyer, transferBuyers, removeBuyer, getGrouped, getGrandTotals, importBuyers, splitBuyer, getTargets, saveTargets,
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
  // Build a DENSE header array — sheet_to_json can hand back a sparse row (holes
  // for blank cells), and .map() skips holes, leaving `undefined` that crashes
  // findIndex's `h.includes(...)`. Index-filling avoids that.
  const hraw = rows[hi] || [];
  const head = [];
  for (let c = 0; c < hraw.length; c++) {
    head[c] = String(hraw[c] == null ? '' : hraw[c]).replace(/\s+/g, ' ').trim().toLowerCase();
  }
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

// ── Summary share image ──────────────────────────────────────────────────────
// Renders a Leaderboard-style PNG — SN · Leader · Target (kg) · Done · Percentage
// — stamped with the date + time it was generated. `rows` = leaders in roster
// order, each { name, target, done }.
async function renderSummaryImage(rows, stamp) {
  const S = 2;                 // supersample for crisp text
  const W = 860;
  const headerH = 84, barH = 8, statH = 84, colH = 38, rowH = 50, footerH = 46;
  const GREEN = '#1B5E20', GREEN2 = '#2E7D32', LIME = '#43A047';
  const BLUE = '#1976D2', PURPLE = '#7E57C2';
  const fmt = (n) => (+(num(n).toFixed(2))).toLocaleString('en-IN');
  const pctOf = (done, target) => (num(target) > 0 ? (num(done) / num(target)) * 100 : 0);
  const fmtPct = (p) => p.toFixed(2) + '%';

  const totTarget = rows.reduce((s, r) => s + num(r.target), 0);
  const totDone = rows.reduce((s, r) => s + num(r.done), 0);
  const overall = pctOf(totDone, totTarget);

  const H = headerH + barH + statH + colH + rows.length * rowH + footerH + 6;
  const canvas = document.createElement('canvas');
  canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S); ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = GREEN; ctx.fillRect(0, 0, W, headerH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff'; ctx.font = '800 23px Inter, system-ui, sans-serif';
  ctx.fillText('🌸 Chandni Padvo — Ghari Seva', W / 2, 30);
  ctx.fillStyle = '#C8E6C9'; ctx.font = '600 14px Inter, system-ui, sans-serif';
  ctx.fillText('Adajan — Distribution progress', W / 2, 52);
  ctx.fillStyle = '#A5D6A7'; ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.fillText(stamp, W / 2, 70);

  // lime bar
  ctx.fillStyle = LIME; ctx.fillRect(0, headerH, W, barH);

  // Stat row (4 cells)
  const sy = headerH + barH;
  const cells = [
    { big: String(rows.length), label: 'KARYAKARTAS', color: BLUE },
    { big: fmt(totTarget), label: 'TOTAL TARGET', color: PURPLE },
    { big: fmt(totDone), label: 'DONE', color: GREEN2 },
    { big: fmtPct(overall), label: 'OVERALL', color: LIME },
  ];
  const cw = W / 4;
  cells.forEach((c, i) => {
    const cx = cw * i + cw / 2;
    ctx.fillStyle = c.color; ctx.font = '800 25px Inter, system-ui, sans-serif';
    ctx.fillText(c.big, cx, sy + 34);
    ctx.fillStyle = '#9E9E9E'; ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.fillText(c.label, cx, sy + 62);
  });

  // Column geometry: SN | Leader | Target | Done | Percentage
  const snW = 56, nameColW = 300;
  const restW = W - snW - nameColW;
  const tW = restW * 0.3, dW = restW * 0.26, pW = restW * 0.44;
  const xSN = snW / 2, xName = snW + 14;
  const xT = snW + nameColW + tW / 2;
  const xD = snW + nameColW + tW + dW / 2;
  const xP = snW + nameColW + tW + dW + pW / 2;

  // Column header
  const cy = sy + statH;
  ctx.fillStyle = GREEN; ctx.fillRect(0, cy, W, colH);
  ctx.fillStyle = '#ffffff'; ctx.font = '800 15px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('SN', xSN, cy + colH / 2);
  ctx.textAlign = 'left'; ctx.fillText('Leader', xName, cy + colH / 2);
  ctx.textAlign = 'center';
  ctx.fillText('Target (Kg)', xT, cy + colH / 2);
  ctx.fillText('Done', xD, cy + colH / 2);
  ctx.fillText('Percentage', xP, cy + colH / 2);

  // Body rows
  let ry = cy + colH;
  rows.forEach((r, i) => {
    const p = pctOf(r.done, r.target);
    ctx.fillStyle = i % 2 ? '#F7F9F7' : '#FFFFFF'; ctx.fillRect(0, ry, W, rowH);
    ctx.fillStyle = p === 0 ? '#FFF8E1' : '#E8F5E9'; ctx.fillRect(snW + nameColW + tW + dW, ry, pW, rowH);
    const midY = ry + rowH / 2;
    ctx.fillStyle = '#607D8B'; ctx.textAlign = 'center'; ctx.font = '700 15px Inter, system-ui, sans-serif';
    ctx.fillText(String(i + 1), xSN, midY);
    ctx.fillStyle = '#1B2A20'; ctx.textAlign = 'left'; ctx.font = '700 16px Inter, system-ui, sans-serif';
    let nm = String(r.name || '');
    while (ctx.measureText(nm).width > nameColW - 18 && nm.length > 4) nm = nm.slice(0, -2);
    if (nm !== r.name) nm = nm.replace(/\s*$/, '') + '…';
    ctx.fillText(nm, xName, midY);
    ctx.fillStyle = '#37474F'; ctx.textAlign = 'center'; ctx.font = '700 16px Inter, system-ui, sans-serif';
    ctx.fillText(num(r.target) ? fmt(r.target) : '—', xT, midY);
    ctx.fillText(fmt(r.done), xD, midY);
    ctx.fillStyle = p === 0 ? '#E65100' : '#1B5E20'; ctx.font = '800 16px Inter, system-ui, sans-serif';
    ctx.fillText(fmtPct(p), xP, midY);
    ctx.strokeStyle = '#ECEFF1'; ctx.beginPath(); ctx.moveTo(0, ry + rowH); ctx.lineTo(W, ry + rowH); ctx.stroke();
    ry += rowH;
  });

  // Footer TOTAL
  ctx.fillStyle = GREEN2; ctx.fillRect(0, ry, W, footerH);
  ctx.fillStyle = '#ffffff'; ctx.font = '800 16px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('TOTAL', (snW + nameColW) / 2, ry + footerH / 2);
  ctx.fillText(fmt(totTarget), xT, ry + footerH / 2);
  ctx.fillText(fmt(totDone), xD, ry + footerH / 2);
  ctx.fillText(fmtPct(overall), xP, ry + footerH / 2);

  return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png', 0.95));
}

function downloadBlob_(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export default function GhariLeadersPage({ user, refreshing }) {
  const canWrite = isAdminRole(user) || isSevakRole(user);
  const actor = user?.name || user?.mobile || '';

  const [snap, setSnap] = useState(() => loadCached());
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({});       // leaderId -> true when collapsed
  const [selected, setSelected] = useState({});          // buyerId -> true
  const [editing, setEditing] = useState(null);          // buyer obj or {} (new) or null
  const [splitting, setSplitting] = useState(null);      // buyer obj being split, or null
  const [transferTo, setTransferTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const [summaryUrl, setSummaryUrl] = useState(null);
  const [summaryStamp, setSummaryStamp] = useState('');
  const [summaryBusy, setSummaryBusy] = useState(false);
  const summaryBlobRef = useRef(null);
  const [showTargets, setShowTargets] = useState(false);

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

  async function openSummary() {
    setSummaryBusy(true);
    try {
      const lnum = (id) => (Number(String(id).replace('LDR-', '')) || 999);
      const ordered = (snap.groups || [])
        .filter((g) => g.leader.id || g.items.length)
        .slice().sort((a, b) => lnum(a.leader.id) - lnum(b.leader.id));
      const rows = ordered.map((g) => ({ name: g.leader.name, target: g.target, done: g.kg }));
      const stamp = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const blob = await renderSummaryImage(rows, stamp);
      if (!blob) { alertError('Could not create image', 'Please try again.'); return; }
      summaryBlobRef.current = blob;
      setSummaryUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
      setSummaryStamp(stamp);
    } catch (e) { alertError('Summary failed', e.message); }
    finally { setSummaryBusy(false); }
  }

  function closeSummary() {
    setSummaryUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
  }

  function summaryName() {
    return 'Mandal_Leaders_' + summaryStamp.replace(/[^\w]+/g, '_').replace(/_+$/, '');
  }

  async function shareSummary() {
    const blob = summaryBlobRef.current;
    if (!blob) return;
    const file = new File([blob], `${summaryName()}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Adajan Mandal — Ghari Seva' }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    downloadBlob_(blob, summaryName());
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
          <button onClick={openSummary} disabled={summaryBusy}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border-light text-text-main font-medium hover:bg-surface-hover disabled:opacity-50"
            title="Summary image">
            <ImageIcon className="h-4 w-4" /> {summaryBusy ? '…' : 'Summary'}
          </button>
          {canWrite && (
            <>
              <button onClick={() => setShowTargets(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border-light text-text-main font-medium hover:bg-surface-hover"
                title="Set per-leader targets">
                <Target className="h-4 w-4" /> Targets
              </button>
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
                          <button onClick={() => setSplitting(b)} aria-label="Split across leaders" title="Split across leaders"
                            className="grid place-items-center h-8 w-8 rounded-md text-text-muted hover:bg-surface-hover">
                            <SplitIcon className="h-4 w-4" />
                          </button>
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

      {splitting && (
        <SplitModal buyer={splitting} leaders={leaders} actor={actor}
          onClose={() => setSplitting(null)}
          onSaved={() => { setSplitting(null); reload(); }} />
      )}

      {showTargets && (
        <TargetsModal leaders={leaders} groups={groups} actor={actor}
          onClose={() => setShowTargets(false)}
          onSaved={() => { setShowTargets(false); reload(); }} />
      )}

      {summaryUrl && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeSummary}>
          <div className="w-full max-w-lg bg-surface rounded-2xl shadow-2xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-border-light">
              <span className="font-semibold text-text-main">Summary · {summaryStamp}</span>
              <button onClick={closeSummary} aria-label="Close"
                className="grid place-items-center h-8 w-8 rounded-md text-text-muted hover:bg-surface-hover">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-3 overflow-auto">
              <img src={summaryUrl} alt="Mandal leaders summary"
                className="w-full rounded-lg border border-border-light" />
            </div>
            <div className="p-3 flex gap-2 border-t border-border-light">
              <button onClick={() => downloadBlob_(summaryBlobRef.current, summaryName())}
                className="flex-1 h-11 rounded-xl bg-primary text-white font-medium inline-flex items-center justify-center gap-1.5">
                <Download className="h-4 w-4" /> Download
              </button>
              <button onClick={shareSummary}
                className="h-11 px-4 rounded-xl border border-border-light text-text-main font-medium inline-flex items-center justify-center gap-1.5">
                <Share2 className="h-4 w-4" /> Share
              </button>
            </div>
          </div>
        </div>,
        document.body,
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

function SplitModal({ buyer, leaders, actor, onClose, onSaved }) {
  const totKg = num(buyer.ghariKg), totOrd = num(buyer.orders), totAmt = num(buyer.amount);
  const [parts, setParts] = useState([
    { leaderId: buyer.leaderId || '', ghariKg: '', orders: '', amount: '' },
    { leaderId: '', ghariKg: '', orders: '', amount: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const setPart = (i, key, val) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, [key]: val } : p)));
  const addPart = () => setParts((ps) => (ps.length >= 8 ? ps : [...ps, { leaderId: '', ghariKg: '', orders: '', amount: '' }]));
  const removePart = (i) => setParts((ps) => (ps.length <= 2 ? ps : ps.filter((_, j) => j !== i)));

  function splitEqually() {
    const n = parts.length;
    const kgEach = +(totKg / n).toFixed(2);
    const amEach = Math.floor(totAmt / n);
    const odEach = Math.floor(totOrd / n);
    setParts((ps) => ps.map((p, i) => (i === n - 1
      ? { ...p, ghariKg: String(+(totKg - kgEach * (n - 1)).toFixed(2)), amount: String(totAmt - amEach * (n - 1)), orders: String(totOrd - odEach * (n - 1)) }
      : { ...p, ghariKg: String(kgEach), amount: String(amEach), orders: String(odEach) })));
  }

  const sumKg = parts.reduce((s, p) => s + num(p.ghariKg), 0);
  const sumAmt = parts.reduce((s, p) => s + num(p.amount), 0);
  const remKg = +(totKg - sumKg).toFixed(2);
  const remAmt = totAmt - sumAmt;

  async function save() {
    const chosen = parts.filter((p) => p.leaderId);
    if (chosen.length < 2) { alertError('Pick leaders', 'Choose a leader for at least two parts.'); return; }
    const ids = chosen.map((p) => p.leaderId);
    if (new Set(ids).size !== ids.length) { alertError('Duplicate leader', 'Each part must go to a different leader.'); return; }
    const ok = await confirmDialog({
      title: `Split ${buyer.buyer}?`,
      text: `This replaces the buyer with ${chosen.length} parts, one per leader. The original single entry is removed.`,
      confirmText: 'Split', icon: 'question',
    });
    if (!ok) return;
    setSaving(true);
    try { await splitBuyer(buyer.id, parts, actor); onSaved(); }
    catch (e) { alertError('Split failed', e.message); setSaving(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border-light sticky top-0 bg-surface">
          <div className="min-w-0">
            <h2 className="font-semibold text-text-main truncate">Split {buyer.buyer}</h2>
            <p className="text-xs text-text-muted">{fmtKg(totKg)} kg · {totOrd} orders · {fmtRs(totAmt)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid place-items-center h-8 w-8 rounded-md text-text-muted hover:bg-surface-hover">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <button onClick={splitEqually}
            className="w-full h-9 rounded-lg border border-border-light text-text-main text-sm font-medium hover:bg-surface-hover">
            Split equally across {parts.length}
          </button>

          {parts.map((p, i) => (
            <div key={i} className="rounded-xl border border-border-light p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted w-10 shrink-0">Part {i + 1}</span>
                <select value={p.leaderId} onChange={(e) => setPart(i, 'leaderId', e.target.value)} className="inp flex-1">
                  <option value="">Choose leader…</option>
                  {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {parts.length > 2 && (
                  <button onClick={() => removePart(i)} aria-label="Remove part"
                    className="grid place-items-center h-8 w-8 rounded-md text-text-muted hover:bg-surface-hover shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block"><span className="block text-[11px] text-text-muted mb-0.5">Kg</span>
                  <input value={p.ghariKg} onChange={(e) => setPart(i, 'ghariKg', e.target.value)} inputMode="decimal" className="inp" /></label>
                <label className="block"><span className="block text-[11px] text-text-muted mb-0.5">Orders</span>
                  <input value={p.orders} onChange={(e) => setPart(i, 'orders', e.target.value)} inputMode="numeric" className="inp" /></label>
                <label className="block"><span className="block text-[11px] text-text-muted mb-0.5">Amount ₹</span>
                  <input value={p.amount} onChange={(e) => setPart(i, 'amount', e.target.value)} inputMode="numeric" className="inp" /></label>
              </div>
            </div>
          ))}

          <button onClick={addPart} disabled={parts.length >= 8}
            className="w-full h-9 rounded-lg border border-dashed border-border-light text-text-muted text-sm hover:bg-surface-hover disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
            <Plus className="h-4 w-4" /> Add leader
          </button>

          <div className="rounded-xl bg-bg-base p-3 text-sm">
            <div className="flex justify-between"><span className="text-text-muted">Assigned kg</span>
              <span className="text-text-main">{fmtKg(sumKg)} / {fmtKg(totKg)}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Remaining kg</span>
              <span className={remKg === 0 ? 'text-text-main' : 'text-primary font-medium'}>{fmtKg(remKg)}</span></div>
            <div className="flex justify-between mt-1"><span className="text-text-muted">Assigned amount</span>
              <span className="text-text-main">{fmtRs(sumAmt)} / {fmtRs(totAmt)}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Remaining amount</span>
              <span className={remAmt === 0 ? 'text-text-main' : 'text-primary font-medium'}>{fmtRs(remAmt)}</span></div>
          </div>
          <p className="text-[11px] text-text-muted">Parts don't have to add up exactly — but matching the totals keeps the summary correct.</p>
        </div>

        <div className="p-4 flex gap-2 border-t border-border-light sticky bottom-0 bg-surface">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border-light text-text-main font-medium">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-11 rounded-xl bg-primary text-white font-medium disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
            <SplitIcon className="h-4 w-4" /> {saving ? 'Splitting…' : 'Split'}
          </button>
        </div>
        <style>{`.inp{width:100%;height:40px;padding:0 10px;border-radius:10px;border:1px solid var(--border-light);background:var(--surface);color:var(--text-main);outline:none}.inp:focus{box-shadow:0 0 0 2px color-mix(in srgb, var(--primary) 40%, transparent)}`}</style>
      </div>
    </div>,
    document.body,
  );
}

function TargetsModal({ leaders, groups, actor, onClose, onSaved }) {
  // Done (kg) per leader, for a live percentage preview while typing targets.
  const doneBy = {};
  (groups || []).forEach((g) => { if (g.leader.id) doneBy[g.leader.id] = g.kg; });
  const [vals, setVals] = useState(() => {
    const t = getTargets(); const o = {};
    leaders.forEach((l) => { o[l.id] = t[l.id] != null ? String(t[l.id]) : ''; });
    return o;
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const map = {};
      leaders.forEach((l) => { map[l.id] = num(vals[l.id]); });
      await saveTargets(map, actor);
      onSaved();
    } catch (e) { alertError('Could not save targets', e.message); setSaving(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border-light">
          <div>
            <h2 className="font-semibold text-text-main">Leader targets (kg)</h2>
            <p className="text-xs text-text-muted">Done is auto-calculated from buyers</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid place-items-center h-8 w-8 rounded-md text-text-muted hover:bg-surface-hover">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-3 overflow-y-auto space-y-1.5">
          {leaders.map((l) => {
            const done = num(doneBy[l.id]);
            const tgt = num(vals[l.id]);
            const p = tgt > 0 ? (done / tgt) * 100 : 0;
            return (
              <div key={l.id} className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-sm text-text-main truncate">{l.name}</span>
                <span className="text-xs text-text-muted w-20 text-right shrink-0">{fmtKg(done)} done</span>
                <input value={vals[l.id]} onChange={(e) => setVals((v) => ({ ...v, [l.id]: e.target.value }))}
                  inputMode="decimal" placeholder="target"
                  className="w-20 h-9 px-2 rounded-lg border border-border-light bg-surface text-text-main text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/40 shrink-0" />
                <span className="text-xs w-12 text-right shrink-0 text-text-muted">{tgt > 0 ? p.toFixed(0) + '%' : '—'}</span>
              </div>
            );
          })}
        </div>
        <div className="p-4 flex gap-2 border-t border-border-light">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border-light text-text-main font-medium">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-11 rounded-xl bg-primary text-white font-medium disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
            <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Save targets'}
          </button>
        </div>
      </div>
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
