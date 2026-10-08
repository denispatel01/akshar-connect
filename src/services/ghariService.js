// ===========================================================================
// Akshar Connect — Ghari Seva service (OFFLINE-FIRST, MONEY-SAFE)
// ---------------------------------------------------------------------------
// A self-contained accounting ledger for the annual Ghari (Chandi Padvo) seva.
// Design goals, in order of priority:
//
//   1. NEVER LOSE A WRITE. Every save lands in localStorage synchronously AND in
//      a durable "outbox" queue that survives reloads. A background sync engine
//      drains the queue to the Apps Script backend with retries, and removes an
//      op only after the server acknowledges it. If the phone is offline (or the
//      app is closed the instant after a save) the order is still safe locally
//      and syncs later — because this is real money.
//   2. IDEMPOTENT SYNC. Order/product ids are client-generated and stable, and
//      the backend upserts by id/sku, so replaying an op whose ack was lost can
//      never create a duplicate row.
//   3. PRICE INTEGRITY. Each order line snapshots the unit price at the moment of
//      sale, so later editing the catalog price never silently rewrites history.
//   4. INSTANT, OFFLINE READS. All reads come from the in-memory/localStorage
//      cache; the network is only ever a background refresh.
//
// The module reuses dataService's deployed /exec backend + devotee cache.
// ===========================================================================

import { dataService, backendApi, backendOnline } from './dataService';

// ── Storage keys ────────────────────────────────────────────────────────────
const ORDERS_KEY   = 'ac_ghari_orders_v1';
const PRODUCTS_KEY  = 'ac_ghari_products_v1';
const OUTBOX_KEY    = 'ac_ghari_outbox_v1';
const META_KEY      = 'ac_ghari_meta_v1';

// ── Categories (revenue buckets, mirror the old spreadsheet) ─────────────────
export const GHARI_CATEGORIES = {
  ghee:   { key: 'ghee',   label: 'With Ghee',    short: 'Ghee',      amtCol: 'withGheeAmt',    color: '#E56F18' },
  noghee: { key: 'noghee', label: 'Without Ghee', short: 'No-Ghee',   amtCol: 'withoutGheeAmt', color: '#CA8A04' },
  sf:     { key: 'sf',     label: 'Sugar Free',   short: 'Sugar Free', amtCol: 'sugarFreeAmt',  color: '#0D9488' },
  bhusu:  { key: 'bhusu',  label: 'Bhusu',        short: 'Bhusu',     amtCol: 'bhusuAmt',       color: '#7C3AED' },
};

// Default catalog — derived from the 2025 seva account sheet. 1kg = 2 × 500gm.
// Prices are EDITABLE in Settings (they change year to year); these are only the
// first-run seed. `sku` is a stable key and must never change once orders exist.
export const DEFAULT_PRODUCTS = [
  { sku: 'GHEE_500',   name: 'Ghari (Ghee Wali)',     size: '500 gm', category: 'ghee',   unitPrice: 420, sortOrder: 1,  active: true },
  { sku: 'GHEE_1000',  name: 'Ghari (Ghee Wali)',     size: '1 kg',   category: 'ghee',   unitPrice: 840, sortOrder: 2,  active: true },
  { sku: 'NOGHEE_500', name: 'Ghari (Ghee Vagar ni)', size: '500 gm', category: 'noghee', unitPrice: 420, sortOrder: 3,  active: true },
  { sku: 'NOGHEE_1000',name: 'Ghari (Ghee Vagar ni)', size: '1 kg',   category: 'noghee', unitPrice: 840, sortOrder: 4,  active: true },
  { sku: 'SF_500',     name: 'Ghari (Sugar Free)',    size: '500 gm', category: 'sf',     unitPrice: 440, sortOrder: 5,  active: true },
  { sku: 'SF_1000',    name: 'Ghari (Sugar Free)',    size: '1 kg',   category: 'sf',     unitPrice: 880, sortOrder: 6,  active: true },
  { sku: 'BHUSU_500',  name: 'Bhusu',                 size: '500 gm', category: 'bhusu',  unitPrice: 140, sortOrder: 7,  active: true },
  { sku: 'BHUSU_1000', name: 'Bhusu',                 size: '1 kg',   category: 'bhusu',  unitPrice: 280, sortOrder: 8,  active: true },
];

export const PAYMENT_TYPES = ['Cash', 'G-Pay', 'Pending'];

// ── Small persistence helpers (every read/write is try/caught) ───────────────
function readJSON_(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function writeJSON_(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

// ── In-memory cache (hydrated synchronously on first use) ────────────────────
let MEM = { orders: null, products: null, meta: null };
let flushing = false;
let inited = false;

function nowISO_() { return new Date().toISOString(); }
function num_(v) { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
function bool_(v) { return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1'; }

// Default season = current calendar year (Ghari seva is at Sharad Purnima, Oct).
function defaultSeason_() { return String(new Date().getFullYear()); }

function meta_() {
  if (!MEM.meta) MEM.meta = readJSON_(META_KEY, { season: defaultSeason_() });
  if (!MEM.meta.season) MEM.meta.season = defaultSeason_();
  return MEM.meta;
}

function products_() {
  if (!MEM.products) {
    let p = readJSON_(PRODUCTS_KEY, null);
    // Seed the default catalog only on the VERY first run (key absent). Once the
    // admin has edited the catalog — even down to an empty list — we respect it
    // and never silently re-add deleted items.
    if (p == null || !Array.isArray(p)) { p = DEFAULT_PRODUCTS.map(x => ({ ...x })); writeJSON_(PRODUCTS_KEY, p); }
    MEM.products = p.map(normalizeProduct_);
  }
  return MEM.products;
}
function orders_() {
  if (!MEM.orders) MEM.orders = (readJSON_(ORDERS_KEY, []) || []).map(normalizeOrder_);
  return MEM.orders;
}
function outbox_() { return readJSON_(OUTBOX_KEY, []) || []; }
function setOutbox_(arr) { writeJSON_(OUTBOX_KEY, arr); }

function saveProductsLocal_() { writeJSON_(PRODUCTS_KEY, MEM.products); }
function saveOrdersLocal_() { writeJSON_(ORDERS_KEY, MEM.orders); }
function saveMetaLocal_() { writeJSON_(META_KEY, MEM.meta); }

function emit_(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ } }

// ── Normalizers (coerce sheet strings → typed objects) ───────────────────────
function normalizeProduct_(p) {
  return {
    sku: String(p.sku || '').trim(),
    name: String(p.name || '').trim(),
    size: String(p.size || '').trim(),
    category: GHARI_CATEGORIES[p.category] ? p.category : 'ghee',
    unitPrice: num_(p.unitPrice),
    sortOrder: num_(p.sortOrder),
    active: p.active === undefined ? true : bool_(p.active),
  };
}
function normalizeOrder_(o) {
  let items = o.items;
  if (!items) { try { items = JSON.parse(o.itemsJson || '[]'); } catch { items = []; } }
  items = (items || []).map(it => ({
    sku: String(it.sku || ''), name: String(it.name || ''), size: String(it.size || ''),
    category: it.category || 'ghee', qty: num_(it.qty), unitPrice: num_(it.unitPrice),
  })).filter(it => it.qty > 0);
  const totals = computeTotals(items);
  return {
    id: String(o.id || ''),
    season: String(o.season || defaultSeason_()),
    customerName: String(o.customerName || '').trim(),
    devoteeId: String(o.devoteeId || ''),
    karyakarta: String(o.karyakarta || '').trim(),
    karyakartaId: String(o.karyakartaId || ''),
    items,
    total: totals.total,
    delivered: bool_(o.delivered),
    paymentReceived: o.paymentReceived === '' || o.paymentReceived == null ? 0 : num_(o.paymentReceived),
    paymentType: String(o.paymentType || '').trim(),
    status: (String(o.status || 'active').toLowerCase() === 'void') ? 'void' : 'active',
    remarks: String(o.remarks || '').trim(),
    createdBy: String(o.createdBy || ''), createdOn: String(o.createdOn || ''),
    updatedBy: String(o.updatedBy || ''), updatedOn: String(o.updatedOn || ''),
  };
}

// ── Money math (the single source of truth for every total) ──────────────────
export function computeTotals(items) {
  const by = { ghee: 0, noghee: 0, sf: 0, bhusu: 0 };
  let total = 0, boxes = 0;
  (items || []).forEach(it => {
    const line = num_(it.qty) * num_(it.unitPrice);
    total += line; boxes += num_(it.qty);
    if (by[it.category] === undefined) by[it.category] = 0;
    by[it.category] += line;
  });
  return { total, boxes, byCategory: by };
}
function itemsSummary_(items) {
  return (items || []).filter(i => i.qty > 0)
    .map(i => `${i.qty}× ${i.name} ${i.size}`.trim()).join(', ');
}

// Build the flattened backend row from a typed order (keeps the Sheet readable).
function toBackendRow_(o) {
  const t = computeTotals(o.items);
  return {
    id: o.id, season: o.season, customerName: o.customerName, devoteeId: o.devoteeId,
    karyakarta: o.karyakarta, karyakartaId: o.karyakartaId,
    itemsJson: JSON.stringify(o.items || []), itemsSummary: itemsSummary_(o.items),
    total: t.total, withGheeAmt: t.byCategory.ghee, withoutGheeAmt: t.byCategory.noghee,
    sugarFreeAmt: t.byCategory.sf, bhusuAmt: t.byCategory.bhusu,
    delivered: !!o.delivered, paymentReceived: num_(o.paymentReceived),
    balance: t.total - num_(o.paymentReceived), paymentType: o.paymentType,
    status: o.status || 'active', remarks: o.remarks,
    createdBy: o.createdBy, createdOn: o.createdOn, updatedBy: o.updatedBy, updatedOn: o.updatedOn,
  };
}

// ── Durable outbox ───────────────────────────────────────────────────────────
// Each op is { opId, action, payload, tries, queuedAt }. We KEEP an op until the
// server acks it; a failed flush leaves it in place to retry on the next trigger.
// For orders/products we only ever need the LATEST state of a given id, so collapse
// duplicate pending ops for the same key into one (saves requests, same result).
function enqueueUpsert_(action, keyField, row) {
  const box = outbox_().filter(op => !(op.action === action && op.payload?.row?.[keyField] === row[keyField]));
  box.push({ opId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, action, payload: { row }, tries: 0, queuedAt: nowISO_() });
  setOutbox_(box);
}
// Queue a delete, first dropping any pending upsert/delete for the same key (no
// point syncing a row we're about to remove). Payload is just the key.
function enqueueDelete_(action, upsertAction, keyField, keyVal) {
  const box = outbox_().filter(op => {
    const k = op.payload?.row?.[keyField] ?? op.payload?.[keyField];
    return !((op.action === action || op.action === upsertAction) && k === keyVal);
  });
  box.push({ opId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, action, payload: { [keyField]: keyVal }, tries: 0, queuedAt: nowISO_() });
  setOutbox_(box);
}

async function flush() {
  if (flushing) return;
  if (!backendOnline() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  let box = outbox_();
  if (!box.length) return;
  flushing = true;
  try {
    // Process FIFO; stop at the first failure so order is preserved and we don't
    // hammer a struggling backend. Remaining ops retry on the next trigger.
    while (box.length) {
      const op = box[0];
      try {
        await backendApi(op.action, op.payload);
        box = outbox_(); box.shift(); setOutbox_(box);       // re-read (page may have queued more)
        emit_('ac-ghari-synced', { pending: box.length });
      } catch (e) {
        op.tries = (op.tries || 0) + 1;
        box = outbox_(); if (box[0]) { box[0].tries = op.tries; setOutbox_(box); }
        break; // keep the op; try again later
      }
    }
  } finally {
    flushing = false;
    emit_('ac-ghari-synced', { pending: outbox_().length });
  }
}

// ── Pull the latest from the backend, merging in un-synced local work ────────
async function syncDown() {
  if (!backendOnline() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { ok: false, offline: true };
  let res;
  try { res = await backendApi('ghariBootstrap', {}); } catch (e) { return { ok: false, error: e.message }; }
  const serverProducts = (res.products || []).map(normalizeProduct_);
  const serverOrders = (res.orders || []).map(normalizeOrder_);

  // Ids that still have pending local ops → KEEP the local copy (it's newer /
  // not yet on the server). Everything else takes the server's version.
  const box = outbox_();
  const pendingOrderIds = new Set(box.filter(o => o.action === 'ghariUpsertOrder' || o.action === 'ghariDeleteOrder').map(o => o.payload?.row?.id ?? o.payload?.id));
  const pendingProductSkus = new Set(box.filter(o => o.action === 'ghariUpsertProduct' || o.action === 'ghariDeleteProduct').map(o => o.payload?.row?.sku ?? o.payload?.sku));

  if (serverProducts.length) {
    const localBySku = {}; products_().forEach(p => { localBySku[p.sku] = p; });
    const merged = serverProducts.filter(p => !pendingProductSkus.has(p.sku));
    pendingProductSkus.forEach(sku => { if (localBySku[sku]) merged.push(localBySku[sku]); });
    MEM.products = merged.map(normalizeProduct_); saveProductsLocal_();
  }
  const localById = {}; orders_().forEach(o => { localById[o.id] = o; });
  const mergedOrders = serverOrders.filter(o => !pendingOrderIds.has(o.id));
  pendingOrderIds.forEach(id => { if (localById[id]) mergedOrders.push(localById[id]); });
  MEM.orders = mergedOrders.map(normalizeOrder_); saveOrdersLocal_();

  MEM.meta = { ...meta_(), lastSyncDown: nowISO_() }; saveMetaLocal_();
  emit_('ac-ghari-synced', { pending: outbox_().length, refreshed: true });
  return { ok: true };
}

// ── One-time init: hydrate, listen for connectivity, kick a background sync ───
function init() {
  if (inited) return;
  inited = true;
  products_(); orders_(); meta_();            // hydrate synchronously
  try {
    window.addEventListener('online', () => { flush().then(syncDown); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
  } catch { /* non-browser */ }
  // Drain anything left from a previous session, then pull fresh — background.
  flush().then(syncDown).catch(() => {});
}

// ── Devotee lookup for autocomplete (reuse the cached directory) ─────────────
function norm_(s) { return String(s || '').toLowerCase().trim(); }
function searchDevotees(query, limit = 8) {
  const q = norm_(query);
  if (!q) return [];
  const digits = q.replace(/\D/g, '');
  const list = dataService.getDevotees() || [];
  const out = [];
  for (const d of list) {
    const name = norm_(d.name);
    const words = name.split(/\s+/);
    const nameHit = words.some(w => w.startsWith(q)) || name.startsWith(q);
    const mobileHit = digits && String(d.mobile || '').replace(/\D/g, '').includes(digits);
    if (nameHit || mobileHit) out.push(d);
    if (out.length >= limit * 3) break;
  }
  // Prefer name-start matches, then shorter names.
  out.sort((a, b) => {
    const an = norm_(a.name).startsWith(q) ? 0 : 1, bn = norm_(b.name).startsWith(q) ? 0 : 1;
    if (an !== bn) return an - bn;
    return norm_(a.name).length - norm_(b.name).length;
  });
  return out.slice(0, limit);
}

// ===========================================================================
// Public API
// ===========================================================================
export const ghariService = {
  init,
  flush,
  syncDown,

  // ---- Reads (instant, offline) ----
  getSeason: () => meta_().season,
  setSeason: (season) => { MEM.meta = { ...meta_(), season: String(season) }; saveMetaLocal_(); emit_('ac-ghari-changed'); return MEM.meta.season; },
  getSeasons: () => {
    const set = new Set(orders_().map(o => o.season).filter(Boolean));
    set.add(meta_().season);
    return [...set].sort((a, b) => Number(b) - Number(a));
  },

  getProducts: () => products_().slice().sort((a, b) => a.sortOrder - b.sortOrder),
  getActiveProducts: () => products_().filter(p => p.active).sort((a, b) => a.sortOrder - b.sortOrder),

  // All non-void orders for a season (newest first). Pass {includeVoid:true} for trash.
  getOrders: (season, { includeVoid = false } = {}) => {
    const s = season || meta_().season;
    return orders_()
      .filter(o => o.season === s && (includeVoid || o.status !== 'void'))
      .sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn)));
  },
  getOrderById: (id) => orders_().find(o => o.id === id) || null,

  pendingCount: () => outbox_().length,
  isOnline: () => backendOnline() && (typeof navigator === 'undefined' || navigator.onLine !== false),
  hasBackend: () => backendOnline(),

  searchDevotees,
  computeTotals,

  // ---- Writes (optimistic + durable) ----
  // Create or update an order. Returns the saved order immediately; the write is
  // already safe in localStorage + the outbox before this returns.
  saveOrder: (input) => {
    const actor = dataService.currentActor();
    const now = nowISO_();
    const existingIdx = input.id ? orders_().findIndex(o => o.id === input.id) : -1;
    const prev = existingIdx >= 0 ? MEM.orders[existingIdx] : null;
    const season = input.season || meta_().season;
    const id = input.id || `GHO-${season}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const items = (input.items || []).filter(i => num_(i.qty) > 0).map(i => ({
      sku: i.sku, name: i.name, size: i.size, category: i.category,
      qty: num_(i.qty), unitPrice: num_(i.unitPrice),
    }));
    const order = normalizeOrder_({
      ...(prev || {}),
      id, season,
      customerName: input.customerName ?? prev?.customerName ?? '',
      devoteeId: input.devoteeId ?? prev?.devoteeId ?? '',
      karyakarta: input.karyakarta ?? prev?.karyakarta ?? '',
      karyakartaId: input.karyakartaId ?? prev?.karyakartaId ?? '',
      items,
      delivered: input.delivered ?? prev?.delivered ?? false,
      paymentReceived: input.paymentReceived ?? prev?.paymentReceived ?? 0,
      paymentType: input.paymentType ?? prev?.paymentType ?? '',
      status: input.status ?? prev?.status ?? 'active',
      remarks: input.remarks ?? prev?.remarks ?? '',
      createdBy: prev?.createdBy || actor, createdOn: prev?.createdOn || now,
      updatedBy: actor, updatedOn: now,
    });
    if (existingIdx >= 0) MEM.orders[existingIdx] = order; else MEM.orders.unshift(order);
    saveOrdersLocal_();
    enqueueUpsert_('ghariUpsertOrder', 'id', toBackendRow_(order));
    emit_('ac-ghari-changed');
    flush();
    try { dataService.logActivity('ghari-order', order.customerName, `${prev ? 'updated' : 'added'} ghari order for ${order.customerName} (₹${order.total})`); } catch { /* ignore */ }
    return order;
  },

  // Soft-delete (void) an order — never hard-deleted (money is recoverable).
  voidOrder: (id) => {
    const o = ghariService.getOrderById(id);
    if (!o) return null;
    const saved = ghariService.saveOrder({ ...o, status: 'void' });
    try { dataService.logActivity('ghari-void', o.customerName, `voided ghari order for ${o.customerName} (₹${o.total})`); } catch { /* ignore */ }
    return saved;
  },
  restoreOrder: (id) => {
    const o = ghariService.getOrderById(id);
    if (!o) return null;
    return ghariService.saveOrder({ ...o, status: 'active' });
  },

  // Quick field toggles used by the list (delivered / payment), still durable.
  setDelivered: (id, delivered) => {
    const o = ghariService.getOrderById(id); if (!o) return null;
    return ghariService.saveOrder({ ...o, delivered: !!delivered });
  },
  markPaid: (id, paymentType) => {
    const o = ghariService.getOrderById(id); if (!o) return null;
    return ghariService.saveOrder({ ...o, paymentReceived: o.total, paymentType: paymentType || o.paymentType || 'Cash' });
  },

  // ---- Catalog (add / edit prices / hide / delete) ----
  // Create a new item (no sku) or update an existing one. A new item gets a
  // stable generated sku and is placed at the end of the list.
  saveProduct: (p) => {
    const existing = p.sku ? products_().find(x => x.sku === p.sku) : null;
    const sku = p.sku || `ITEM_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`.toUpperCase();
    const maxSort = products_().reduce((m, x) => Math.max(m, x.sortOrder || 0), 0);
    const prod = normalizeProduct_({ sortOrder: existing ? existing.sortOrder : maxSort + 1, active: true, ...p, sku });
    const idx = products_().findIndex(x => x.sku === sku);
    if (idx >= 0) MEM.products[idx] = prod; else MEM.products.push(prod);
    saveProductsLocal_();
    enqueueUpsert_('ghariUpsertProduct', 'sku', prod);
    emit_('ac-ghari-changed');
    flush();
    return prod;
  },

  // Permanently remove a catalog item. Safe for history: every past order keeps
  // its own snapshot of the item (name/size/price), so totals never change.
  deleteProduct: (sku) => {
    MEM.products = products_().filter(p => p.sku !== sku);
    saveProductsLocal_();
    enqueueDelete_('ghariDeleteProduct', 'ghariUpsertProduct', 'sku', sku);
    emit_('ac-ghari-changed');
    flush();
  },

  // Re-add any missing default items (used by the "restore defaults" action when
  // the catalog has been emptied). Existing items and their prices are untouched.
  restoreDefaults: () => {
    const have = new Set(products_().map(p => p.sku));
    DEFAULT_PRODUCTS.forEach(d => { if (!have.has(d.sku)) ghariService.saveProduct({ ...d }); });
    return ghariService.getProducts();
  },

  // ---- Reporting ----
  buildReport: (season) => {
    const s = season || meta_().season;
    const list = ghariService.getOrders(s);
    const prods = ghariService.getProducts();
    const r = {
      season: s, orderCount: list.length,
      revenue: 0, received: 0, outstanding: 0,
      boxes: 0, delivered: 0, pending: 0,
      cash: 0, gpay: 0, unpaid: 0,
      byCategory: { ghee: 0, noghee: 0, sf: 0, bhusu: 0 },
      bySku: {}, byKaryakarta: {},
    };
    prods.forEach(p => { r.bySku[p.sku] = { name: p.name, size: p.size, qty: 0, amount: 0 }; });
    list.forEach(o => {
      const t = computeTotals(o.items);
      r.revenue += t.total; r.boxes += t.boxes;
      r.received += num_(o.paymentReceived);
      const bal = t.total - num_(o.paymentReceived);
      if (bal > 0) r.outstanding += bal;
      if (o.delivered) r.delivered++; else r.pending++;
      const pt = norm_(o.paymentType);
      if (num_(o.paymentReceived) <= 0) r.unpaid += t.total;
      else if (pt === 'g-pay' || pt === 'gpay') r.gpay += num_(o.paymentReceived);
      else if (pt === 'cash') r.cash += num_(o.paymentReceived);
      Object.keys(r.byCategory).forEach(k => { r.byCategory[k] += t.byCategory[k] || 0; });
      o.items.forEach(it => {
        if (!r.bySku[it.sku]) r.bySku[it.sku] = { name: it.name, size: it.size, qty: 0, amount: 0 };
        r.bySku[it.sku].qty += it.qty; r.bySku[it.sku].amount += it.qty * it.unitPrice;
      });
      const kk = o.karyakarta || '—';
      if (!r.byKaryakarta[kk]) r.byKaryakarta[kk] = { orders: 0, boxes: 0, amount: 0, received: 0 };
      r.byKaryakarta[kk].orders++; r.byKaryakarta[kk].boxes += t.boxes;
      r.byKaryakarta[kk].amount += t.total; r.byKaryakarta[kk].received += num_(o.paymentReceived);
    });
    return r;
  },

  // ---- Export the season ledger to a real .xlsx ----
  exportXlsx: async (season) => {
    const s = season || meta_().season;
    const list = ghariService.getOrders(s);
    const prods = ghariService.getActiveProducts();
    const XLSX = await import('xlsx');
    const header = ['SN', 'Customer', 'Karyakarta', ...prods.map(p => `${p.name} ${p.size}`),
      'Total', 'Delivered', 'Paid', 'Payment Type', 'Balance', 'Remarks'];
    const rows = list.map((o, i) => {
      const byKey = {}; o.items.forEach(it => { byKey[it.sku] = (byKey[it.sku] || 0) + it.qty; });
      const t = computeTotals(o.items);
      return [i + 1, o.customerName, o.karyakarta, ...prods.map(p => byKey[p.sku] || ''),
        t.total, o.delivered ? 'Yes' : 'No', num_(o.paymentReceived), o.paymentType,
        t.total - num_(o.paymentReceived), o.remarks];
    });
    // Totals row
    const r = ghariService.buildReport(s);
    const totalsRow = ['', 'TOTAL', '', ...prods.map(p => (r.bySku[p.sku]?.qty) || 0),
      r.revenue, `${r.delivered} del`, r.received, '', r.outstanding, ''];
    const aoa = [header, ...rows, [], totalsRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Ghari ${s}`);
    XLSX.writeFile(wb, `Ghari_Seva_${s}.xlsx`);
  },
};
