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
const PURCHASES_KEY = 'ac_ghari_purchases_v1';
const OUTBOX_KEY    = 'ac_ghari_outbox_v1';
const META_KEY      = 'ac_ghari_meta_v1';

// ── Categories (revenue buckets, mirror the old spreadsheet) ─────────────────
// Four maximally-distinct hues so the cards are impossible to confuse:
// Ghee Wali = orange, Ghee Vagar-ni = blue, Sugar Free = green, Bhusu = purple.
export const GHARI_CATEGORIES = {
  ghee:   { key: 'ghee',   label: 'With Ghee',    short: 'Ghee',       amtCol: 'withGheeAmt',    color: '#EA580C' },
  noghee: { key: 'noghee', label: 'Without Ghee', short: 'No-Ghee',    amtCol: 'withoutGheeAmt', color: '#2563EB' },
  sf:     { key: 'sf',     label: 'Sugar Free',   short: 'Sugar Free', amtCol: 'sugarFreeAmt',   color: '#16A34A' },
  bhusu:  { key: 'bhusu',  label: 'Bhusu',        short: 'Bhusu',      amtCol: 'bhusuAmt',       color: '#9333EA' },
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
let MEM = { orders: null, products: null, purchases: null, meta: null };
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
function purchases_() {
  if (!MEM.purchases) MEM.purchases = (readJSON_(PURCHASES_KEY, []) || []).map(normalizePurchase_);
  return MEM.purchases;
}
function savePurchasesLocal_() { writeJSON_(PURCHASES_KEY, MEM.purchases); }
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
    customerMobile: String(o.customerMobile || '').replace(/\D/g, ''),
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

function normalizePurchase_(pu) {
  let items = pu.items;
  if (!items) { try { items = JSON.parse(pu.itemsJson || '[]'); } catch { items = []; } }
  items = (items || []).map(it => ({
    sku: String(it.sku || ''), name: String(it.name || ''), size: String(it.size || ''),
    category: it.category || 'ghee', qty: num_(it.qty),
  })).filter(it => it.qty > 0);
  const boxes = items.reduce((s, it) => s + it.qty, 0);
  return {
    id: String(pu.id || ''),
    season: String(pu.season || defaultSeason_()),
    date: String(pu.date || ''),
    supplier: String(pu.supplier || '').trim(),
    items, boxes,
    amount: pu.amount === '' || pu.amount == null ? 0 : num_(pu.amount),
    challan: String(pu.challan || ''),
    remarks: String(pu.remarks || '').trim(),
    status: (String(pu.status || 'active').toLowerCase() === 'void') ? 'void' : 'active',
    createdBy: String(pu.createdBy || ''), createdOn: String(pu.createdOn || ''),
    updatedBy: String(pu.updatedBy || ''), updatedOn: String(pu.updatedOn || ''),
  };
}
function toBackendRowPurchase_(pu) {
  return {
    id: pu.id, season: pu.season, date: pu.date, supplier: pu.supplier,
    itemsJson: JSON.stringify(pu.items || []),
    itemsSummary: (pu.items || []).map(i => `${i.qty}× ${i.name} ${i.size}`).join(', '),
    boxes: (pu.items || []).reduce((s, i) => s + num_(i.qty), 0),
    amount: num_(pu.amount), challan: pu.challan || '', remarks: pu.remarks || '',
    status: pu.status || 'active',
    createdBy: pu.createdBy, createdOn: pu.createdOn, updatedBy: pu.updatedBy, updatedOn: pu.updatedOn,
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
    id: o.id, season: o.season, customerName: o.customerName, customerMobile: o.customerMobile || '',
    devoteeId: o.devoteeId, karyakarta: o.karyakarta, karyakartaId: o.karyakartaId,
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
function enqueueUpsert_(action, keyField, row, extra = {}) {
  const box = outbox_();
  // If a pending op for this same row already asked to notify, keep that intent
  // even if a pre-sync edit arrives — so a brand-new order still emails once.
  const prior = box.find(op => op.action === action && op.payload?.row?.[keyField] === row[keyField]);
  const notify = !!extra.notify || !!(prior && prior.payload && prior.payload.notify);
  const next = box.filter(op => !(op.action === action && op.payload?.row?.[keyField] === row[keyField]));
  const payload = notify ? { row, notify: true } : { row };
  next.push({ opId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, action, payload, tries: 0, queuedAt: nowISO_() });
  setOutbox_(next);
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
  const serverPurchases = (res.purchases || []).map(normalizePurchase_);

  // Ids that still have pending local ops → KEEP the local copy (it's newer /
  // not yet on the server). Everything else takes the server's version.
  const box = outbox_();
  const pendingOrderIds = new Set(box.filter(o => o.action === 'ghariUpsertOrder' || o.action === 'ghariDeleteOrder').map(o => o.payload?.row?.id ?? o.payload?.id));
  const pendingProductSkus = new Set(box.filter(o => o.action === 'ghariUpsertProduct' || o.action === 'ghariDeleteProduct').map(o => o.payload?.row?.sku ?? o.payload?.sku));
  const pendingPurchaseIds = new Set(box.filter(o => o.action === 'ghariUpsertPurchase' || o.action === 'ghariDeletePurchase').map(o => o.payload?.row?.id ?? o.payload?.id));

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

  const localPurchaseById = {}; purchases_().forEach(p => { localPurchaseById[p.id] = p; });
  const mergedPurchases = serverPurchases.filter(p => !pendingPurchaseIds.has(p.id));
  pendingPurchaseIds.forEach(id => { if (localPurchaseById[id]) mergedPurchases.push(localPurchaseById[id]); });
  MEM.purchases = mergedPurchases.map(normalizePurchase_); savePurchasesLocal_();

  MEM.meta = { ...meta_(), lastSyncDown: nowISO_() }; saveMetaLocal_();
  emit_('ac-ghari-synced', { pending: outbox_().length, refreshed: true });
  return { ok: true };
}

// ── One-time init: hydrate, listen for connectivity, kick a background sync ───
function init() {
  if (inited) return;
  inited = true;
  products_(); orders_(); purchases_(); meta_();   // hydrate synchronously
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
    purchases_().forEach(p => { if (p.season) set.add(p.season); });
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

  // Build a WhatsApp "click to chat" link with a ready follow-up message (money,
  // delivery). Returns null when there's no usable mobile. The admin reviews the
  // pre-filled draft in WhatsApp before sending — nothing is sent automatically.
  whatsappLink: (order) => {
    const mob = String(order.customerMobile || '').replace(/\D/g, '');
    if (mob.length < 10) return null;
    const num = mob.length === 10 ? '91' + mob : mob;
    const items = (order.items || []).map(i => `• ${i.qty} × ${i.name} ${i.size}`).join('\n');
    const bal = (order.total || 0) - Number(order.paymentReceived || 0);
    const msg = [
      `Jai Swaminarayan ${order.customerName} 🙏`,
      `🪔 Ghari Seva ${order.season}`,
      items,
      `Total: ₹${order.total}`,
      bal > 0 ? `Balance due: ₹${bal}` : `Payment received ✓${order.paymentType ? ' (' + order.paymentType + ')' : ''}`,
      order.delivered ? 'Delivered ✓' : 'Delivery pending',
    ].filter(Boolean).join('\n');
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  },

  // ---- Writes (optimistic + durable) ----
  // Create or update an order. Returns the saved order immediately; the write is
  // already safe in localStorage + the outbox before this returns.
  saveOrder: (input) => {
    const actor = dataService.currentActor();
    const now = nowISO_();
    const existingIdx = input.id ? orders_().findIndex(o => o.id === input.id) : -1;
    const isNew = existingIdx < 0;
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
      customerMobile: input.customerMobile ?? prev?.customerMobile ?? '',
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
    // Ask the backend to email the mandal on a brand-new order (not on edits).
    enqueueUpsert_('ghariUpsertOrder', 'id', toBackendRow_(order), { notify: isNew });
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

  // ---- Purchases (procurement / the "buy" side) ----
  getPurchases: (season, { includeVoid = false } = {}) => {
    const s = season || meta_().season;
    return purchases_()
      .filter(p => p.season === s && (includeVoid || p.status !== 'void'))
      .sort((a, b) => String(b.date || b.createdOn).localeCompare(String(a.date || a.createdOn)));
  },
  getPurchaseById: (id) => purchases_().find(p => p.id === id) || null,

  // Create/update a purchase. Async because a freshly-picked challan photo is
  // uploaded to Drive (so the sheet keeps a URL, not a huge base64 blob); offline
  // it falls back to storing the data URI and still saves instantly after that.
  savePurchase: async (input) => {
    const actor = dataService.currentActor();
    const now = nowISO_();
    const existingIdx = input.id ? purchases_().findIndex(p => p.id === input.id) : -1;
    const prev = existingIdx >= 0 ? MEM.purchases[existingIdx] : null;
    const season = input.season || meta_().season;
    const id = input.id || `GHP-${season}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let challan = input.challan ?? prev?.challan ?? '';
    if (challan && challan.indexOf('data:') === 0) {
      try { challan = await dataService.uploadPhoto(challan, id); } catch { /* keep the data URI offline */ }
    }
    const items = (input.items || []).filter(i => num_(i.qty) > 0).map(i => ({ sku: i.sku, name: i.name, size: i.size, category: i.category, qty: num_(i.qty) }));
    const purchase = normalizePurchase_({
      ...(prev || {}), id, season,
      date: input.date ?? prev?.date ?? now,
      supplier: input.supplier ?? prev?.supplier ?? '',
      items,
      amount: input.amount ?? prev?.amount ?? 0,
      challan,
      remarks: input.remarks ?? prev?.remarks ?? '',
      status: input.status ?? prev?.status ?? 'active',
      createdBy: prev?.createdBy || actor, createdOn: prev?.createdOn || now,
      updatedBy: actor, updatedOn: now,
    });
    if (existingIdx >= 0) MEM.purchases[existingIdx] = purchase; else MEM.purchases.unshift(purchase);
    savePurchasesLocal_();
    enqueueUpsert_('ghariUpsertPurchase', 'id', toBackendRowPurchase_(purchase));
    emit_('ac-ghari-changed');
    flush();
    try { dataService.logActivity('ghari-purchase', purchase.supplier, `${prev ? 'updated' : 'added'} purchase of ${purchase.boxes} boxes from ${purchase.supplier || 'supplier'}`); } catch { /* ignore */ }
    return purchase;
  },
  voidPurchase: (id) => {
    const p = ghariService.getPurchaseById(id); if (!p) return null;
    return ghariService.savePurchase({ ...p, status: 'void' });
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
      if (!r.byKaryakarta[kk]) r.byKaryakarta[kk] = { orders: 0, boxes: 0, amount: 0, received: 0, skus: {} };
      const kr = r.byKaryakarta[kk];
      kr.orders++; kr.boxes += t.boxes; kr.amount += t.total; kr.received += num_(o.paymentReceived);
      o.items.forEach(it => { kr.skus[it.sku] = (kr.skus[it.sku] || 0) + it.qty; });
    });
    // Procurement + stock reconciliation (bought vs sold, per item).
    r.purchased = {}; r.purchasedBoxes = 0; r.purchaseCost = 0; r.purchaseCount = 0;
    prods.forEach(p => { r.purchased[p.sku] = 0; });
    ghariService.getPurchases(s).forEach(pu => {
      r.purchaseCount++; r.purchaseCost += num_(pu.amount);
      pu.items.forEach(it => { r.purchased[it.sku] = (r.purchased[it.sku] || 0) + it.qty; r.purchasedBoxes += it.qty; });
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

  // ---- Export the season summary / dashboard as a styled PDF ----
  // Lazy-loads jsPDF + autotable (shared with the Reports page) so they never
  // weigh down first load. Uses "Rs" (the ₹ glyph isn't in the PDF core font).
  exportReportPdf: async (season) => {
    const s = season || meta_().season;
    const r = ghariService.buildReport(s);
    const prods = ghariService.getProducts();
    let jsPDF, autoTableMod;
    try {
      [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    } catch (e) {
      try { if (!sessionStorage.getItem('ac-pdf-reloaded')) { sessionStorage.setItem('ac-pdf-reloaded', '1'); location.reload(); } } catch { /* ignore */ }
      throw new Error('The app was updated in the background. Reloading — please tap export again.');
    }
    const autoTable = autoTableMod.default || autoTableMod.autoTable;
    const ORANGE = [229, 111, 24], DARK = [38, 48, 59], MUTE = [120, 130, 145], STRIPE = [252, 241, 231];
    const rs = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN');
    const shortName = (p) => `${p.name.replace('Ghari ', '').replace(/[()]/g, '')} ${p.size}`;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const now = new Date();
    const when = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    // Header band
    doc.setFillColor(...ORANGE); doc.rect(0, 0, pageW, 92, 'F');
    doc.setFillColor(255, 157, 82); doc.rect(0, 92, pageW, 4, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.setFontSize(9); doc.text('AKSHAR CONNECT', 40, 32);
    doc.setFontSize(18); doc.text('Ghari Seva Report', 40, 58);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(255, 235, 220);
    doc.text(`Season ${s}`, 40, 78);
    doc.setFontSize(9); doc.text(`Generated: ${when}`, pageW - 40, 32, { align: 'right' });

    const footer = () => {
      const h = doc.internal.pageSize.getHeight(), w = doc.internal.pageSize.getWidth();
      doc.setFontSize(8); doc.setTextColor(150, 160, 175);
      doc.text('Adajan Satsang Mandal · Akshar Connect', 40, h - 20);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, w - 40, h - 20, { align: 'right' });
    };
    const heading = (txt, y) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...DARK); doc.text(txt, 40, y); return y + 8; };

    // KPI summary (two-column metric grid as a borderless table)
    const kpis = [
      ['Revenue', rs(r.revenue), 'Orders', String(r.orderCount)],
      ['Received', rs(r.received), 'Outstanding', rs(r.outstanding)],
      ['Cash', rs(r.cash), 'G-Pay', rs(r.gpay)],
      ['Unpaid', rs(r.unpaid), 'Delivered', `${r.delivered}/${r.orderCount}`],
    ];
    if (r.purchasedBoxes > 0) kpis.push(['Boxes bought', String(r.purchasedBoxes), 'Purchase cost', rs(r.purchaseCost)], ['Boxes sold', String(r.boxes), 'Margin', rs(r.revenue - r.purchaseCost)]);
    autoTable(doc, {
      startY: 112, body: kpis, theme: 'plain',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 5, textColor: DARK },
      columnStyles: { 0: { textColor: MUTE, fontStyle: 'bold', cellWidth: 110 }, 1: { fontStyle: 'bold' }, 2: { textColor: MUTE, fontStyle: 'bold', cellWidth: 110 }, 3: { fontStyle: 'bold' } },
      margin: { left: 40, right: 40 }, didDrawPage: footer,
    });

    // Boxes to prepare
    let y = heading('Boxes to prepare', doc.lastAutoTable.finalY + 26);
    const prepBody = [];
    Object.values(GHARI_CATEGORIES).forEach(c => {
      const items = prods.filter(p => p.category === c.key).map(p => ({ p, d: r.bySku[p.sku] })).filter(x => x.d && x.d.qty > 0);
      items.forEach(({ p, d }) => prepBody.push([c.label, shortName(p), String(d.qty)]));
    });
    autoTable(doc, {
      startY: y + 6, head: [['Category', 'Item', 'Boxes']], body: prepBody.length ? prepBody : [['—', 'No sales yet', '0']],
      theme: 'striped', styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: DARK, lineColor: [235, 225, 215], lineWidth: 0.5 },
      headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: STRIPE },
      columnStyles: { 2: { halign: 'center', cellWidth: 60, fontStyle: 'bold' } }, margin: { left: 40, right: 40, bottom: 44 }, didDrawPage: footer,
    });

    // Stock (if purchases)
    if (r.purchasedBoxes > 0) {
      y = heading('Stock — bought vs sold', doc.lastAutoTable.finalY + 26);
      const stockBody = prods.map(p => {
        const inB = r.purchased[p.sku] || 0, out = (r.bySku[p.sku]?.qty) || 0;
        return (inB || out) ? [shortName(p), String(inB), String(out), String(inB - out)] : null;
      }).filter(Boolean);
      autoTable(doc, {
        startY: y + 6, head: [['Item', 'Bought', 'Sold', 'Left']], body: stockBody,
        theme: 'striped', styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: DARK, lineColor: [235, 225, 215], lineWidth: 0.5 },
        headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: STRIPE },
        columnStyles: { 1: { halign: 'center', cellWidth: 60 }, 2: { halign: 'center', cellWidth: 60 }, 3: { halign: 'center', cellWidth: 60, fontStyle: 'bold' } },
        margin: { left: 40, right: 40, bottom: 44 }, didDrawPage: footer,
      });
    }

    // By karyakarta
    const kkList = Object.entries(r.byKaryakarta).sort((a, b) => b[1].amount - a[1].amount);
    if (kkList.length) {
      y = heading('By karyakarta', doc.lastAutoTable.finalY + 26);
      const kkBody = kkList.map(([name, d]) => [name, String(d.orders), rs(d.amount), rs(d.received), rs(Math.max(0, d.amount - d.received))]);
      autoTable(doc, {
        startY: y + 6, head: [['Karyakarta', 'Orders', 'Amount', 'Received', 'Due']], body: kkBody,
        theme: 'striped', styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: DARK, lineColor: [235, 225, 215], lineWidth: 0.5 },
        headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: STRIPE },
        columnStyles: { 1: { halign: 'center', cellWidth: 50 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        margin: { left: 40, right: 40, bottom: 44 }, didDrawPage: footer,
      });
    }

    doc.save(`Ghari_Seva_Report_${s}.pdf`);
  },
};
