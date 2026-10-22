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

let MEM = readCache_() || { leaders: null, buyers: [] };
if (!Array.isArray(MEM.buyers)) MEM.buyers = [];

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
  const groups = leaders.map((l) => {
    const items = byLeader.get(l.id).slice().sort((a, b) => b.ghariKg - a.ghariKg || b.amount - a.amount);
    return { leader: l, items, ...totals_(items) };
  });
  groups.sort((a, b) => b.kg - a.kg || b.amount - a.amount);
  if (noLeader.length) {
    const items = noLeader.slice().sort((a, b) => b.ghariKg - a.ghariKg);
    groups.push({ leader: { id: '', name: 'No leader', sortOrder: 999 }, items, ...totals_(items) });
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
