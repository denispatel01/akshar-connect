// ===========================================================================
// Akshar Connect — Ghari Leaders service (buyer → leader assignment)
// ---------------------------------------------------------------------------
// A standalone organising layer over the annual Ghari seva: every buyer is
// mapped to one of the mandal's 17 FIXED leaders, with an editable snapshot of
// their season totals (kg / orders / amount). This is NOT the money ledger — it
// never reads or writes GhariOrders. It was seeded once from the final
// "GHARI SALES 2026" workbook and is maintained here by add / edit / transfer.
//
// Data model (backend collections):
//   MandalLeaders : fixed roster   { id, name, sortOrder, active }   (shared)
//   GhariBuyers   : one per buyer  { id, buyer, leaderId, leaderName,
//                                     ghariKg, orders, amount, updatedBy, updatedOn }
//
// Reuses dataService's deployed /exec backend via backendApi. Reads come from a
// localStorage cache for instant, offline-tolerant loads; the network is a
// background refresh. Writes go straight to the backend and update the cache.
// ===========================================================================

import { backendApi, backendOnline } from './dataService';
import { DEFAULT_MANDAL_LEADERS } from './leaderboardService';

const CACHE_KEY = 'ac_ghari_leaders_v1';

// ── Fixed roster fallback (offline / backend not deployed yet) ───────────────
// Mirrors the backend seed order so leader ids (LDR-1..17) line up.
export const FIXED_LEADERS = DEFAULT_MANDAL_LEADERS.map((name, i) => ({
  id: `LDR-${i + 1}`, name, sortOrder: i + 1, active: true,
}));

// ── Persistence helpers (every read/write try/caught) ────────────────────────
function readCache_() {
  try { const v = localStorage.getItem(CACHE_KEY); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
function writeCache_(state) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch { /* quota */ }
}

let MEM = readCache_() || { leaders: null, buyers: [], targets: {} };
if (!Array.isArray(MEM.buyers)) MEM.buyers = [];
if (!MEM.targets || typeof MEM.targets !== 'object') MEM.targets = {};

function num_(v) { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
function uid_() { return 'GBY-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
function nowISO_() { return new Date().toISOString(); }

function emitChanged_() { try { window.dispatchEvent(new CustomEvent('ac-ghari-leaders-changed')); } catch { /* SSR */ } }
function persist_() { writeCache_(MEM); emitChanged_(); }

// ── Reads ────────────────────────────────────────────────────────────────────

/** The 17 fixed leaders (from cache, else the built-in fallback). */
export function getLeaders() {
  const l = MEM.leaders && MEM.leaders.length ? MEM.leaders : FIXED_LEADERS;
  return l.slice().sort((a, b) => (num_(a.sortOrder) - num_(b.sortOrder)));
}

/** Per-leader Target (kg) as a map { leaderId: number }. */
export function getTargets() {
  const t = MEM.targets || {};
  const out = {};
  Object.keys(t).forEach((k) => { out[k] = num_(t[k]); });
  return out;
}

/** All buyer mappings (from cache). Normalized numbers. */
export function getBuyers() {
  return (MEM.buyers || []).map((b) => ({
    ...b,
    ghariKg: num_(b.ghariKg),
    orders: num_(b.orders),
    amount: num_(b.amount),
  }));
}

/**
 * Buyers grouped under each leader, leaders ordered by total kg (desc), buyers
 * within a leader by kg (desc). Leaders with no buyers are still returned (empty).
 * A trailing `{ leaderId: '', ... }` group collects any buyer with no leader.
 */
export function getGrouped() {
  const leaders = getLeaders();
  const buyers = getBuyers();
  const byLeader = new Map();
  leaders.forEach((l) => byLeader.set(l.id, []));
  const noLeader = [];
  buyers.forEach((b) => {
    if (b.leaderId && byLeader.has(b.leaderId)) byLeader.get(b.leaderId).push(b);
    else noLeader.push(b);
  });
  const targets = getTargets();
  const groups = leaders.map((l) => {
    const items = byLeader.get(l.id).slice().sort((a, b) => b.ghariKg - a.ghariKg || b.amount - a.amount);
    const t = totals_(items);
    const target = num_(targets[l.id]);
    const pct = target > 0 ? (t.kg / target) * 100 : 0;
    return { leader: l, items, ...t, target, pct };
  });
  groups.sort((a, b) => b.kg - a.kg || b.amount - a.amount);
  if (noLeader.length) {
    const items = noLeader.slice().sort((a, b) => b.ghariKg - a.ghariKg);
    groups.push({ leader: { id: '', name: 'No leader', sortOrder: 999 }, items, ...totals_(items), target: 0, pct: 0 });
  }
  return groups;
}

function totals_(items) {
  return items.reduce((acc, b) => {
    acc.kg += b.ghariKg; acc.orders += b.orders; acc.amount += b.amount; acc.buyers += 1;
    return acc;
  }, { kg: 0, orders: 0, amount: 0, buyers: 0 });
}

/** Grand totals across every buyer. */
export function getGrandTotals() {
  return totals_(getBuyers());
}

// ── Load / refresh ────────────────────────────────────────────────────────────

/** Instant cached snapshot for first paint. */
export function loadCached() {
  return { leaders: getLeaders(), groups: getGrouped(), totals: getGrandTotals() };
}

/** Background refresh from the backend; updates the cache and fires the change event. */
export async function refresh() {
  if (!backendOnline()) return loadCached();
  try {
    const res = await backendApi('getGhariBuyers', {});
    if (res && res.ok) {
      MEM.leaders = Array.isArray(res.leaders) ? res.leaders : MEM.leaders;
      MEM.buyers = Array.isArray(res.buyers) ? res.buyers : [];
      if (Array.isArray(res.targets)) {
        const m = {};
        res.targets.forEach((t) => { if (t && t.leaderId) m[t.leaderId] = num_(t.target); });
        MEM.targets = m;
      }
      persist_();
    }
  } catch (err) { console.warn('getGhariBuyers failed:', err.message); }
  return loadCached();
}

// ── Writes ────────────────────────────────────────────────────────────────────

function upsertLocal_(row) {
  const i = (MEM.buyers || []).findIndex((b) => String(b.id) === String(row.id));
  if (i >= 0) MEM.buyers[i] = { ...MEM.buyers[i], ...row };
  else MEM.buyers = [...(MEM.buyers || []), row];
}

function leaderName_(leaderId) {
  const l = getLeaders().find((x) => String(x.id) === String(leaderId));
  return l ? l.name : '';
}

/**
 * Add or edit one buyer. `data` = { id?, buyer, leaderId, ghariKg, orders, amount }.
 * Optimistically updates the cache, then saves to the backend.
 */
export async function saveBuyer(data, actor = '') {
  const row = {
    id: data.id || uid_(),
    buyer: String(data.buyer || '').trim(),
    leaderId: data.leaderId || '',
    leaderName: leaderName_(data.leaderId),
    ghariKg: num_(data.ghariKg),
    orders: num_(data.orders),
    amount: num_(data.amount),
    updatedBy: actor || 'app',
    updatedOn: nowISO_(),
  };
  if (!row.buyer) throw new Error('Buyer name is required.');
  upsertLocal_(row);
  persist_();
  if (backendOnline()) {
    try { await backendApi('saveGhariBuyer', { row, mail: false }); }
    catch (err) { console.warn('saveGhariBuyer failed:', err.message); }
  }
  return row;
}

/**
 * Transfer / bulk reassign: move every buyer in `ids` to `leaderId` in one call.
 * Optimistic local update, single backend round-trip.
 */
export async function transferBuyers(ids, leaderId, actor = '') {
  const set = new Set(ids.map(String));
  const name = leaderName_(leaderId);
  const rows = [];
  (MEM.buyers || []).forEach((b) => {
    if (set.has(String(b.id))) {
      const row = { ...b, leaderId, leaderName: name, updatedBy: actor || 'app', updatedOn: nowISO_() };
      upsertLocal_(row);
      rows.push(row);
    }
  });
  if (!rows.length) return 0;
  persist_();
  if (backendOnline()) {
    try { await backendApi('bulkSaveGhariBuyers', { rows, actor, mail: false }); }
    catch (err) { console.warn('bulkSaveGhariBuyers failed:', err.message); }
  }
  return rows.length;
}

// ── Import (merge Pravin kaka's latest workbook) ──────────────────────────────
// Match key for reconciling an imported buyer against an existing one: trimmed,
// collapsed whitespace, upper-cased (so "Bharatbhai  Panchhigar" == "BHARATBHAI PANCHHIGAR").
function normName_(s) { return String(s || '').trim().replace(/\s+/g, ' ').toUpperCase(); }

/**
 * Merge an aggregated buyer list (parsed from the Excel on the client) into the
 * current mapping. Existing buyers (matched by name) get their kg/orders/amount
 * refreshed but KEEP their leader; buyers not seen before are added UNASSIGNED
 * (no leader) for the user to tag. Returns { added, updated, total }.
 */
export async function importBuyers(parsed, actor = '') {
  const existing = getBuyers();
  const byName = new Map(existing.map((b) => [normName_(b.buyer), b]));
  const rows = [];
  let added = 0, updated = 0;
  (parsed || []).forEach((p) => {
    const name = String(p.buyer || '').trim();
    if (!name) return;
    const ex = byName.get(normName_(name));
    if (ex) {
      rows.push({ ...ex, ghariKg: num_(p.ghariKg), orders: num_(p.orders), amount: num_(p.amount),
        updatedBy: actor || 'import', updatedOn: nowISO_() });
      updated += 1;
    } else {
      rows.push({ id: uid_(), buyer: name, leaderId: '', leaderName: '',
        ghariKg: num_(p.ghariKg), orders: num_(p.orders), amount: num_(p.amount),
        updatedBy: actor || 'import', updatedOn: nowISO_() });
      added += 1;
    }
  });
  if (!rows.length) return { added: 0, updated: 0, total: 0 };
  rows.forEach(upsertLocal_);
  persist_();
  if (backendOnline()) {
    try { await backendApi('bulkSaveGhariBuyers', { rows, actor, mail: false }); }
    catch (err) { console.warn('import bulkSaveGhariBuyers failed:', err.message); }
  }
  return { added, updated, total: rows.length };
}

/**
 * Save per-leader targets. `map` = { leaderId: kg }. Optimistic local update,
 * single backend round-trip.
 */
export async function saveTargets(map, actor = '') {
  const next = { ...(MEM.targets || {}) };
  Object.keys(map || {}).forEach((k) => { next[k] = num_(map[k]); });
  MEM.targets = next;
  persist_();
  const rows = Object.keys(next).map((leaderId) => ({ leaderId, target: num_(next[leaderId]) }));
  if (backendOnline()) {
    try { await backendApi('saveGhariLeaderTargets', { rows, actor, mail: false }); }
    catch (err) { console.warn('saveGhariLeaderTargets failed:', err.message); }
  }
  return next;
}

/**
 * Split one buyer across several leaders. The original buyer row is replaced by
 * one row PER part, named "<buyer> (<leader>)" so each part counts under its
 * leader (and stays distinct). `parts` = [{ leaderId, ghariKg, orders, amount }].
 */
export async function splitBuyer(buyerId, parts, actor = '') {
  const orig = getBuyers().find((b) => String(b.id) === String(buyerId));
  if (!orig) throw new Error('Buyer not found.');
  const rows = (parts || []).filter((p) => p.leaderId).map((p) => ({
    id: uid_(),
    buyer: `${orig.buyer} (${leaderName_(p.leaderId)})`,
    leaderId: p.leaderId,
    leaderName: leaderName_(p.leaderId),
    ghariKg: num_(p.ghariKg),
    orders: num_(p.orders),
    amount: num_(p.amount),
    updatedBy: actor || 'app',
    updatedOn: nowISO_(),
  }));
  if (rows.length < 2) throw new Error('Pick a leader for at least two parts.');
  MEM.buyers = (MEM.buyers || []).filter((b) => String(b.id) !== String(buyerId));
  rows.forEach(upsertLocal_);
  persist_();
  if (backendOnline()) {
    try { await backendApi('bulkSaveGhariBuyers', { rows, actor, mail: false }); }
    catch (err) { console.warn('split bulkSave failed:', err.message); }
    try { await backendApi('removeGhariBuyer', { id: buyerId, buyer: orig.buyer, actor, mail: false }); }
    catch (err) { console.warn('split remove original failed:', err.message); }
  }
  return rows.length;
}

/** Delete one buyer mapping. */
export async function removeBuyer(id, actor = '') {
  const b = (MEM.buyers || []).find((x) => String(x.id) === String(id));
  MEM.buyers = (MEM.buyers || []).filter((x) => String(x.id) !== String(id));
  persist_();
  if (backendOnline()) {
    try { await backendApi('removeGhariBuyer', { id, buyer: b && b.buyer, actor, mail: false }); }
    catch (err) { console.warn('removeGhariBuyer failed:', err.message); }
  }
}
