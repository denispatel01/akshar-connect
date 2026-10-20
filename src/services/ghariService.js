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
import { scoreMatch, devoteeSearchText } from '../utils/search';

// ── Storage keys ────────────────────────────────────────────────────────────
const ORDERS_KEY   = 'ac_ghari_orders_v1';
const PRODUCTS_KEY  = 'ac_ghari_products_v1';
const PURCHASES_KEY = 'ac_ghari_purchases_v1';
const STOCK_KEY     = 'ac_ghari_stock_v1';
const OUTBOX_KEY    = 'ac_ghari_outbox_v1';
const META_KEY      = 'ac_ghari_meta_v1';

// ── Categories (revenue buckets, mirror the old spreadsheet) ─────────────────
// Four maximally-distinct hues so the cards are impossible to confuse:
// Ghee Wali = orange, Ghee Vagar-ni = blue, Sugar Free = green, Bhusu = purple.
export const GHARI_CATEGORIES = {
  ghee:   { key: 'ghee',   label: 'With Ghee',    short: 'Ghee',       amtCol: 'withGheeAmt',    color: '#EA580C' },
  // Ghee Vagar-ni: light-cyan card (#E0F7FA) with a deep-cyan accent/text for contrast.
  noghee: { key: 'noghee', label: 'Without Ghee', short: 'No-Ghee',    amtCol: 'withoutGheeAmt', color: '#0E7490', bg: '#E0F7FA', bgActive: '#B2EBF2' },
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
let MEM = { orders: null, products: null, purchases: null, stocks: null, meta: null };
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
function stocks_() {
  if (!MEM.stocks) MEM.stocks = (readJSON_(STOCK_KEY, []) || []).map(normalizeStock_);
  return MEM.stocks;
}
function saveStocksLocal_() { writeJSON_(STOCK_KEY, MEM.stocks); }
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
    unitPrice: num_(p.unitPrice),   // selling price (₹ per box/packet)
    costPrice: num_(p.costPrice),   // purchase cost (₹ per box/packet) — auto-totals purchases
    sortOrder: num_(p.sortOrder),
    active: p.active === undefined ? true : bool_(p.active),
  };
}
// A short, human-friendly order number for talking/texting about an order
// ("order #12, Ramesh bhai"). It is a per-season sequence (#1, #2, …) assigned once
// when the order is created and then STORED on the order (and synced to the sheet),
// so it is permanent — it never changes afterwards. The next number for a season is
// one past the highest already used (void orders keep their number, so voiding one
// never renumbers the others).
function nextOrderNo_(season) {
  let max = 0;
  orders_().forEach(o => { if (o.season === season) { const n = Number(o.orderNo) || 0; if (n > max) max = n; } });
  return max + 1;
}

// Give any order still missing a number a permanent one, locally — so numbers show
// immediately (even offline) before the backend backfill has run. Deterministic:
// per season, number the un-numbered orders in creation order (createdOn, then id),
// continuing after the current max — the same rule the Apps Script backfill uses, so
// the two agree and a later sync won't shift anything. Idempotent.
function backfillOrderNosLocal_() {
  const bySeason = {};
  orders_().forEach(o => { (bySeason[o.season] = bySeason[o.season] || []).push(o); });
  let changed = false;
  Object.keys(bySeason).forEach(season => {
    const list = bySeason[season];
    let max = 0;
    list.forEach(o => { const n = Number(o.orderNo) || 0; if (n > max) max = n; });
    list.filter(o => !(Number(o.orderNo) > 0))
      .sort((a, b) => {
        const c = String(a.createdOn).localeCompare(String(b.createdOn));
        return c !== 0 ? c : String(a.id).localeCompare(String(b.id));
      })
      .forEach(o => { o.orderNo = ++max; changed = true; });
  });
  if (changed) saveOrdersLocal_();
}

// Coerce a raw item list (or an itemsJson string) into typed, qty>0 lines.
function normOrderItems_(raw, jsonStr) {
  let items = raw;
  if (!items) { try { items = JSON.parse(jsonStr || '[]'); } catch { items = []; } }
  return (items || []).map(it => ({
    sku: String(it.sku || ''), name: String(it.name || ''), size: String(it.size || ''),
    category: it.category || 'ghee', qty: num_(it.qty), unitPrice: num_(it.unitPrice),
  })).filter(it => it.qty > 0);
}
// Merge identical (sku + unitPrice) lines, summing qty — so the flattened aggregate
// of several sub-orders reads like an ordinary single order's item list.
function mergeItems_(items) {
  const by = {}; const order = [];
  (items || []).forEach(it => {
    const k = it.sku + '|' + it.unitPrice;
    if (!by[k]) { by[k] = { ...it }; order.push(k); } else by[k].qty += num_(it.qty);
  });
  return order.map(k => by[k]);
}

function normalizeOrder_(o) {
  // Optional named recipients (sub-orders). When present, the order's top-level
  // `items` is the FLATTENED aggregate of all sub-order items, so every existing
  // reader (totals, packing, stock, delivery, report rollups) keeps working on a
  // plain items[] exactly as before. A plain order has no sub-orders and is untouched.
  let subOrders = o.subOrders;
  if (!subOrders && o.subOrdersJson != null) { try { subOrders = JSON.parse(o.subOrdersJson || '[]'); } catch { subOrders = []; } }
  subOrders = (subOrders || []).map(so => ({
    name: String(so.name || '').trim(),
    mobile: String(so.mobile || '').replace(/\D/g, ''),
    devoteeId: String(so.devoteeId || ''),
    items: normOrderItems_(so.items, so.itemsJson),
  })).filter(so => so.items.length > 0);
  let items;
  if (subOrders.length) items = mergeItems_(subOrders.flatMap(so => so.items));
  else items = normOrderItems_(o.items, o.itemsJson);
  const totals = computeTotals(items);
  // Partial delivery: how many of the order's boxes have actually been handed over.
  // `delivered` stays the simple "fully delivered?" flag the rest of the app reads;
  // `deliveredBoxes` carries the partial count (e.g. 2 of 4). We reconcile the two so
  // legacy rows (delivered=true, no count) and crafted rows can never disagree.
  const totalBoxes = totals.boxes;
  let deliveredBoxes = num_(o.deliveredBoxes);
  let delivered = bool_(o.delivered);
  if (delivered && !deliveredBoxes) deliveredBoxes = totalBoxes;       // legacy fully-delivered row
  deliveredBoxes = Math.max(0, Math.min(totalBoxes, Math.round(deliveredBoxes)));
  // The flag is always derived from the count when there are boxes to deliver.
  if (totalBoxes > 0) delivered = deliveredBoxes >= totalBoxes;
  return {
    id: String(o.id || ''),
    orderNo: (o.orderNo === '' || o.orderNo == null) ? '' : (Number(o.orderNo) || ''),
    season: String(o.season || defaultSeason_()),
    customerName: String(o.customerName || '').trim(),
    customerMobile: String(o.customerMobile || '').replace(/\D/g, ''),
    devoteeId: String(o.devoteeId || ''),
    karyakarta: String(o.karyakarta || '').trim(),
    karyakartaId: String(o.karyakartaId || ''),
    items,
    subOrders,
    total: totals.total,
    totalBoxes,
    delivered,
    deliveredBoxes,
    deliveryDate: String(o.deliveryDate || '').trim(),
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

// A stock issue — Ghari handed to a Karyakarta IN ADVANCE, before any order. The
// Karyakarta then delivers from this holding as orders come in (deducted via their
// delivered orders — see deliveredItemsOf_/buildStockBalances). Positive qty = given
// out; a correction/return is recorded as a separate issue with its own items.
function normalizeStock_(st) {
  let items = st.items;
  if (!items) { try { items = JSON.parse(st.itemsJson || '[]'); } catch { items = []; } }
  items = (items || []).map(it => ({
    sku: String(it.sku || ''), name: String(it.name || ''), size: String(it.size || ''),
    category: it.category || 'ghee', qty: num_(it.qty),
  })).filter(it => it.qty !== 0);
  const boxes = items.reduce((s, it) => s + it.qty, 0);
  return {
    id: String(st.id || ''),
    season: String(st.season || defaultSeason_()),
    date: String(st.date || ''),
    karyakarta: String(st.karyakarta || '').trim(),
    karyakartaId: String(st.karyakartaId || ''),
    items, boxes,
    remarks: String(st.remarks || '').trim(),
    status: (String(st.status || 'active').toLowerCase() === 'void') ? 'void' : 'active',
    createdBy: String(st.createdBy || ''), createdOn: String(st.createdOn || ''),
    updatedBy: String(st.updatedBy || ''), updatedOn: String(st.updatedOn || ''),
  };
}
function toBackendRowStock_(st) {
  return {
    id: st.id, season: st.season, date: st.date,
    karyakarta: st.karyakarta, karyakartaId: st.karyakartaId,
    itemsJson: JSON.stringify(st.items || []),
    itemsSummary: (st.items || []).map(i => `${i.qty}× ${i.name} ${i.size}`).join(', '),
    boxes: (st.items || []).reduce((s, i) => s + num_(i.qty), 0),
    remarks: st.remarks || '', status: st.status || 'active',
    createdBy: st.createdBy, createdOn: st.createdOn, updatedBy: st.updatedBy, updatedOn: st.updatedOn,
  };
}

// Payload for the lightweight `ghariMarkDelivery` action (delivery + payment only —
// never items/customer). It always carries the order's CURRENT delivery AND payment
// state, so when the outbox collapses several quick marks on one order into the
// latest op, no field is ever lost (a "mark paid" never wipes a pending delivery
// mark, and vice-versa). Authorized for any known user; admins edit via the full form.
function quickUpdatePayload_(order, actor, now) {
  const received = num_(order.paymentReceived);
  return {
    id: order.id, season: order.season,
    delivered: !!order.delivered, deliveredBoxes: num_(order.deliveredBoxes), deliveryDate: order.deliveryDate || '',
    paymentReceived: received, paymentType: order.paymentType || '', balance: num_(order.total) - received,
    updatedBy: actor, updatedOn: now,
  };
}

// Parse a product size label ("500 gm", "1 kg", "250gm") into kilograms.
function sizeToKg_(size) {
  const m = String(size || '').toLowerCase().match(/([\d.]+)\s*(kg|gm|g\b|gram)?/);
  if (!m) return 0;
  const n = parseFloat(m[1]); if (isNaN(n)) return 0;
  return /kg/.test(m[2] || '') ? n : n / 1000; // default to grams when unit missing
}

// Stable grouping key for an order's karyakarta — prefers the devotee id so the
// same person entered under different name spellings collapses to one group;
// falls back to the lowercased name. MUST match buildReport's kkKey so the
// "by karyakarta" report and the per-karyakarta export agree.
function orderKaryakartaKey_(o) {
  const kkId = String(o.karyakartaId || '').trim();
  const kkName = (o.karyakarta || '').trim();
  return kkId ? ('id:' + kkId) : (kkName ? ('nm:' + kkName.toLowerCase()) : '—');
}
// Kilograms of Ghari vs Bhusu in one order.
function orderKg_(o) {
  let g = 0, b = 0;
  (o.items || []).forEach(it => { const kg = num_(it.qty) * sizeToKg_(it.size); if (it.category === 'bhusu') b += kg; else g += kg; });
  return { ghariKg: g, bhusuKg: b };
}

// How many boxes of each sku an order has actually been delivered. A fully-delivered
// order contributes every item's qty. A partially-delivered order (deliveredBoxes = n
// of total) allocates those n boxes across its items in item order — deterministic, so
// stock reconciliation is stable. Used to deduct a Karyakarta's advance holding.
function deliveredItemsOf_(o) {
  const out = {};
  const items = o.items || [];
  if (o.delivered) { items.forEach(it => { out[it.sku] = (out[it.sku] || 0) + num_(it.qty); }); return out; }
  let n = Math.max(0, Math.min(computeTotals(items).boxes, Math.round(num_(o.deliveredBoxes))));
  for (const it of items) {
    if (n <= 0) break;
    const take = Math.min(num_(it.qty), n);
    if (take > 0) { out[it.sku] = (out[it.sku] || 0) + take; n -= take; }
  }
  return out;
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
    id: o.id, orderNo: o.orderNo || '', season: o.season, customerName: o.customerName, customerMobile: o.customerMobile || '',
    devoteeId: o.devoteeId, karyakarta: o.karyakarta, karyakartaId: o.karyakartaId,
    itemsJson: JSON.stringify(o.items || []), itemsSummary: itemsSummary_(o.items),
    subOrdersJson: JSON.stringify(o.subOrders || []),
    total: t.total, withGheeAmt: t.byCategory.ghee, withoutGheeAmt: t.byCategory.noghee,
    sugarFreeAmt: t.byCategory.sf, bhusuAmt: t.byCategory.bhusu,
    delivered: !!o.delivered, deliveredBoxes: num_(o.deliveredBoxes), deliveryDate: o.deliveryDate || '', paymentReceived: num_(o.paymentReceived),
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
  // even if a pre-sync edit arrives — so the order still emails once.
  const prior = box.find(op => op.action === action && op.payload?.row?.[keyField] === row[keyField]);
  const notify = !!extra.notify || !!(prior && prior.payload && prior.payload.notify);
  // An unsynced new order stays an INSERT even if edited/voided before it syncs
  // (the server will see its first write as an insert).
  const act = (prior && prior.payload && prior.payload.act === 'INSERT') ? 'INSERT' : (extra.act || (prior && prior.payload && prior.payload.act));
  const next = box.filter(op => !(op.action === action && op.payload?.row?.[keyField] === row[keyField]));
  const payload = { row };
  if (notify) { payload.notify = true; if (act) payload.act = act; }
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
  const box = outbox_();
  if (!box.length) return;
  flushing = true;
  try {
    // Attempt EVERY op independently — one bad op must never block the rest of the
    // queue (that's why "to sync" used to never clear). Succeeded ops are removed;
    // failed ops are kept (with the error) to retry on the next trigger.
    const succeeded = new Set();
    const meta = {}; // opId -> { tries, lastError }
    for (const op of box) {
      let payload = op.payload;
      // A purchase captured offline still carries its challan as a base64 photo.
      // On sync, upload it to Drive FIRST and send only the small URL. If the
      // upload doesn't succeed, KEEP the op and retry next time — never drop the
      // photo and never push a huge base64 blob into a Sheet cell.
      if (op.action === 'ghariUpsertPurchase' && String(payload?.row?.challan || '').indexOf('data:') === 0) {
        let url = null;
        try { url = await dataService.uploadChallan(payload.row.challan, payload.row.id); } catch { url = null; }
        if (url && url.indexOf('data:') !== 0) {
          payload = { ...payload, row: { ...payload.row, challan: url } };
          const idx = purchases_().findIndex(p => p.id === payload.row.id);
          if (idx >= 0) { MEM.purchases[idx] = { ...MEM.purchases[idx], challan: url }; savePurchasesLocal_(); }
        } else {
          // Photo not uploaded yet — keep this purchase pending so it (and its
          // challan) sync together once Drive upload works. Other ops still flush.
          meta[op.opId] = { tries: (op.tries || 0) + 1, lastError: 'challan upload pending' };
          emit_('ac-ghari-synced', { pending: outbox_().filter(o => !succeeded.has(o.opId)).length });
          continue;
        }
      }
      try {
        await backendApi(op.action, payload);
        succeeded.add(op.opId);
      } catch (e) {
        const msg = String((e && e.message) || e);
        // A permission rejection ("Not allowed — Ghari Seva is view-only…") will
        // NEVER succeed on retry, and leaving it queued makes the local edit look
        // saved while syncDown silently reverts it. So surface it to the user and
        // drop the op, so the revert is visible and explained rather than silent.
        if (/not allowed/i.test(msg)) {
          succeeded.add(op.opId); // stop retrying this doomed op
          emit_('ac-ghari-error', { message: msg, action: op.action });
        } else {
          meta[op.opId] = { tries: (op.tries || 0) + 1, lastError: msg };
        }
      }
      emit_('ac-ghari-synced', { pending: outbox_().filter(o => !succeeded.has(o.opId)).length });
    }
    // Keep failures + anything queued during the flush; drop only what succeeded.
    const now = outbox_().filter(o => !succeeded.has(o.opId)).map(o => meta[o.opId] ? { ...o, ...meta[o.opId] } : o);
    setOutbox_(now);
  } finally {
    flushing = false;
    emit_('ac-ghari-synced', { pending: outbox_().length });
  }
}

// ── Pull the latest from the backend, merging in un-synced local work ────────
async function syncDown(season) {
  if (!backendOnline() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { ok: false, offline: true };
  // Scope the pull to one season so other years are never fetched/scanned. Orders
  // and purchases of OTHER seasons already in the local cache are preserved below.
  const scope = String(season || meta_().season || '');
  let res;
  try { res = await backendApi('ghariBootstrap', { season: scope }); } catch (e) { return { ok: false, error: e.message }; }
  const serverProducts = (res.products || []).map(normalizeProduct_);
  const serverOrders = (res.orders || []).map(normalizeOrder_);
  const serverPurchases = (res.purchases || []).map(normalizePurchase_);
  const serverStocks = (res.stocks || []).map(normalizeStock_);

  // Ids that still have pending local ops → KEEP the local copy (it's newer /
  // not yet on the server). Everything else takes the server's version.
  const box = outbox_();
  const pendingOrderIds = new Set(box.filter(o => o.action === 'ghariUpsertOrder' || o.action === 'ghariDeleteOrder' || o.action === 'ghariMarkDelivery').map(o => o.payload?.row?.id ?? o.payload?.id));
  const pendingProductSkus = new Set(box.filter(o => o.action === 'ghariUpsertProduct' || o.action === 'ghariDeleteProduct').map(o => o.payload?.row?.sku ?? o.payload?.sku));
  const pendingPurchaseIds = new Set(box.filter(o => o.action === 'ghariUpsertPurchase' || o.action === 'ghariDeletePurchase').map(o => o.payload?.row?.id ?? o.payload?.id));
  const pendingStockIds = new Set(box.filter(o => o.action === 'ghariUpsertStock' || o.action === 'ghariDeleteStock').map(o => o.payload?.row?.id ?? o.payload?.id));

  if (serverProducts.length) {
    const localBySku = {}; products_().forEach(p => { localBySku[p.sku] = p; });
    const merged = serverProducts.filter(p => !pendingProductSkus.has(p.sku));
    pendingProductSkus.forEach(sku => { if (localBySku[sku]) merged.push(localBySku[sku]); });
    MEM.products = merged.map(normalizeProduct_); saveProductsLocal_();
  }
  // Orders: the server is authoritative for the SCOPED season only. Rebuild the
  // cache as: server's scoped-season rows (minus any with pending local ops) +
  // every locally-cached row that is either a DIFFERENT season (keep as-is) or has
  // a pending op (keep the local, newer copy). This preserves other years' cache
  // and un-synced edits while refreshing just the season we pulled.
  const seenOrderIds = new Set();
  const mergedOrders = [];
  serverOrders.forEach(o => { if (!pendingOrderIds.has(o.id) && !seenOrderIds.has(o.id)) { seenOrderIds.add(o.id); mergedOrders.push(o); } });
  orders_().forEach(o => {
    if (seenOrderIds.has(o.id)) return;
    if (String(o.season) !== scope || pendingOrderIds.has(o.id)) { seenOrderIds.add(o.id); mergedOrders.push(o); }
  });
  MEM.orders = mergedOrders.map(normalizeOrder_); saveOrdersLocal_();
  backfillOrderNosLocal_();   // number any order the server hasn't backfilled yet

  const seenPurchaseIds = new Set();
  const mergedPurchases = [];
  serverPurchases.forEach(p => { if (!pendingPurchaseIds.has(p.id) && !seenPurchaseIds.has(p.id)) { seenPurchaseIds.add(p.id); mergedPurchases.push(p); } });
  purchases_().forEach(p => {
    if (seenPurchaseIds.has(p.id)) return;
    if (String(p.season) !== scope || pendingPurchaseIds.has(p.id)) { seenPurchaseIds.add(p.id); mergedPurchases.push(p); }
  });
  MEM.purchases = mergedPurchases.map(normalizePurchase_); savePurchasesLocal_();

  const seenStockIds = new Set();
  const mergedStocks = [];
  serverStocks.forEach(st => { if (!pendingStockIds.has(st.id) && !seenStockIds.has(st.id)) { seenStockIds.add(st.id); mergedStocks.push(st); } });
  stocks_().forEach(st => {
    if (seenStockIds.has(st.id)) return;
    if (String(st.season) !== scope || pendingStockIds.has(st.id)) { seenStockIds.add(st.id); mergedStocks.push(st); }
  });
  MEM.stocks = mergedStocks.map(normalizeStock_); saveStocksLocal_();

  // Remember the full list of seasons the server knows (small), so the season
  // switcher still shows every year even though we only cache the loaded ones.
  const seasonsList = Array.isArray(res.seasons) ? res.seasons.map(String).filter(Boolean) : (meta_().seasonsList || []);
  MEM.meta = { ...meta_(), lastSyncDown: nowISO_(), seasonsList }; saveMetaLocal_();
  emit_('ac-ghari-synced', { pending: outbox_().length, refreshed: true });
  return { ok: true };
}

// ── One-time init: hydrate, listen for connectivity, kick a background sync ───
function init() {
  if (inited) return;
  inited = true;
  products_(); orders_(); purchases_(); stocks_(); meta_();   // hydrate synchronously
  backfillOrderNosLocal_();   // ensure every cached order already shows a number
  try {
    window.addEventListener('online', () => { flush().then(() => syncDown()); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
  } catch { /* non-browser */ }
  // Drain anything left from a previous session, then pull fresh — background.
  // (() => syncDown() so flush's resolved value is NOT passed as the season arg.)
  flush().then(() => syncDown()).catch(() => {});
}

// ── Devotee lookup for autocomplete (reuse the cached directory) ─────────────
function norm_(s) { return String(s || '').toLowerCase().trim(); }
// Names (customers + karyakartas) that were typed on PAST orders but aren't in the
// devotee list — e.g. an out-of-town customer. Once a name is used on an order it
// is suggested the next time you type, so you never have to re-type a long name
// like "Vineet Bhai Desai" in full. The most recent order wins its mobile number.
function historyNameMatches_(query, excludeKeys, limit) {
  const q = norm_(query);
  if (!q || limit <= 0) return [];
  const seen = new Set(excludeKeys);
  const out = [];
  const add = (name, mobile) => {
    const nm = String(name || '').trim();
    const key = norm_(nm);
    if (!key || seen.has(key) || !key.includes(q)) return;
    seen.add(key);
    out.push({ id: '', name: nm, area: '', mobile: mobile ? String(mobile) : '', _history: true });
  };
  const recent = orders_().slice().sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn)));
  for (const o of recent) {
    if (out.length >= limit) break;
    add(o.customerName, o.customerMobile);
    add(o.karyakarta, '');
  }
  return out.slice(0, limit);
}

function searchDevotees(query, limit = 8) {
  const q = norm_(query);
  if (!q) return [];
  const list = dataService.getDevotees() || [];
  // Use the app-wide tokenized matcher (one source of truth) so a devotee is
  // found by ANY combination of their name parts — first + last even when a
  // middle name sits between them — plus mobile / DOB. Highest score first.
  const devs = list
    .map(d => ({ d, s: scoreMatch(devoteeSearchText(d), d.name || '', query) }))
    .filter(x => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.d);
  if (devs.length >= limit) return devs;
  // Fill the rest with remembered names from previous orders.
  const exclude = devs.map(d => norm_(d.name || ''));
  return devs.concat(historyNameMatches_(query, exclude, limit - devs.length));
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
    (meta_().seasonsList || []).forEach(s => { if (s) set.add(String(s)); }); // server-known years
    set.add(meta_().season);
    return [...set].sort((a, b) => Number(b) - Number(a));
  },

  getProducts: () => products_().slice().sort((a, b) => a.sortOrder - b.sortOrder),
  getActiveProducts: () => products_().filter(p => p.active).sort((a, b) => a.sortOrder - b.sortOrder),

  // All non-void orders for a season, highest order number first (last order on
  // top, first order at the bottom). Falls back to createdOn when numbers tie.
  // Pass {includeVoid:true} for trash.
  getOrders: (season, { includeVoid = false } = {}) => {
    const s = season || meta_().season;
    return orders_()
      .filter(o => o.season === s && (includeVoid || o.status !== 'void'))
      .sort((a, b) => (Number(b.orderNo) || 0) - (Number(a.orderNo) || 0)
        || String(b.createdOn).localeCompare(String(a.createdOn)));
  },
  getOrderById: (id) => orders_().find(o => o.id === id) || null,

  // Total Ghari still to be collected/delivered, in kilograms (active, undelivered
  // orders). Used for the dashboard — we report pending quantity, not money.
  pendingDeliveryKg: (season) => {
    const s = season || meta_().season;
    let kg = 0;
    orders_().forEach(o => {
      if (o.season === s && o.status !== 'void' && !o.delivered) {
        (o.items || []).forEach(it => { kg += num_(it.qty) * sizeToKg_(it.size); });
      }
    });
    return kg;
  },

  // ---- Audit log (money — full change history + revert) ----
  // Fetch change history for one entity (order/purchase) or all. Backend-only.
  getLog: async ({ entityId = '', entity = '', actor = '', limit = 300 } = {}) => {
    if (!backendOnline()) return [];
    try { const r = await backendApi('getGhariLog', { entityId, entity, actor, limit }); return (r && r.logs) || []; }
    catch { return []; }
  },
  // Revert an order/purchase/product to the "before" snapshot of a log entry.
  revert: async (logId, actor = '') => {
    if (!backendOnline()) throw new Error('You must be online to revert a change.');
    const r = await backendApi('ghariRevert', { logId, actor });
    if (!(r && r.ok)) throw new Error((r && r.error) || 'Could not revert.');
    await syncDown(); // pull the restored row back into the app
    emit_('ac-ghari-changed');
    return r.restored;
  },

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
    const orderNo = order.orderNo || '';
    const msg = [
      `Jai Swaminarayan ${order.customerName} 🙏`,
      `🪔 Ghari Seva ${order.season}`,
      orderNo ? `Order #${orderNo}` : '',
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
    // A new order gets the next permanent number for its season; an edit keeps the
    // number it was given at creation — UNLESS the user explicitly typed a new
    // order number (admins can correct/renumber an order).
    const typedNo = (input.orderNo !== undefined && input.orderNo !== null && String(input.orderNo).trim() !== '')
      ? input.orderNo : null;
    const orderNo = typedNo != null ? typedNo : (prev?.orderNo || (isNew ? nextOrderNo_(season) : ''));
    const items = (input.items || []).filter(i => num_(i.qty) > 0).map(i => ({
      sku: i.sku, name: i.name, size: i.size, category: i.category,
      qty: num_(i.qty), unitPrice: num_(i.unitPrice),
    }));
    const order = normalizeOrder_({
      ...(prev || {}),
      id, orderNo, season,
      customerName: input.customerName ?? prev?.customerName ?? '',
      customerMobile: input.customerMobile ?? prev?.customerMobile ?? '',
      devoteeId: input.devoteeId ?? prev?.devoteeId ?? '',
      karyakarta: input.karyakarta ?? prev?.karyakarta ?? '',
      karyakartaId: input.karyakartaId ?? prev?.karyakartaId ?? '',
      items,
      // Named recipients (optional). When provided, normalizeOrder_ flattens them
      // into `items`; an empty array clears a previously-split order back to single.
      subOrders: input.subOrders ?? prev?.subOrders ?? [],
      delivered: input.delivered ?? prev?.delivered ?? false,
      deliveredBoxes: input.deliveredBoxes ?? prev?.deliveredBoxes ?? (input.delivered ? undefined : 0),
      deliveryDate: input.deliveryDate ?? prev?.deliveryDate ?? '',
      paymentReceived: input.paymentReceived ?? prev?.paymentReceived ?? 0,
      paymentType: input.paymentType ?? prev?.paymentType ?? '',
      status: input.status ?? prev?.status ?? 'active',
      remarks: input.remarks ?? prev?.remarks ?? '',
      createdBy: prev?.createdBy || actor, createdOn: prev?.createdOn || now,
      updatedBy: actor, updatedOn: now,
    });
    if (existingIdx >= 0) MEM.orders[existingIdx] = order; else MEM.orders.unshift(order);
    saveOrdersLocal_();
    // Email the mandal on add / edit / delete. The server de-dups replays by
    // (id, updatedOn, act), so an offline retry never sends a duplicate.
    const act = isNew ? 'INSERT' : (order.status === 'void' ? 'DELETE' : 'UPDATE');
    enqueueUpsert_('ghariUpsertOrder', 'id', toBackendRow_(order), { notify: true, act });
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
    return ghariService.markDelivery(id, delivered ? (o.totalBoxes ?? computeTotals(o.items).boxes) : 0);
  },

  // Mark how many of an order's boxes have been delivered (partial or full). This is
  // a DELIVERY-ONLY write: it changes only the delivery fields, never items or money,
  // so it is allowed for Karyakartas/Sevaks/devotees who can see Ghari but cannot edit
  // orders. It syncs through the lightweight `ghariMarkDelivery` backend action, which
  // authorizes any known app user (unlike `ghariUpsertOrder`, which is admin-only).
  markDelivery: (id, deliveredBoxes) => {
    const idx = orders_().findIndex(o => o.id === id); if (idx < 0) return null;
    const prev = MEM.orders[idx];
    const totalBoxes = prev.totalBoxes ?? computeTotals(prev.items).boxes;
    const n = Math.max(0, Math.min(totalBoxes, Math.round(num_(deliveredBoxes))));
    const delivered = totalBoxes > 0 ? n >= totalBoxes : !!prev.delivered;
    const actor = dataService.currentActor();
    const now = nowISO_();
    const order = normalizeOrder_({ ...prev, delivered, deliveredBoxes: n, updatedBy: actor, updatedOn: now });
    MEM.orders[idx] = order; saveOrdersLocal_();
    enqueueUpsert_('ghariMarkDelivery', 'id', quickUpdatePayload_(order, actor, now));
    emit_('ac-ghari-changed');
    flush();
    try { dataService.logActivity('ghari-delivery', order.customerName, `marked ${n}/${totalBoxes} box${totalBoxes === 1 ? '' : 'es'} delivered for ${order.customerName}`); } catch { /* ignore */ }
    return order;
  },
  // Mark an order's payment — a PAYMENT-ONLY write (never items/customer), so it is
  // allowed for Karyakartas/Sevaks/devotees like marking delivery. `paymentType` is
  // 'Cash' / 'G-Pay' (records the full amount received) or 'Pending' (resets to 0).
  // Syncs via the same lightweight `ghariMarkDelivery` action (any known user).
  markPaid: (id, paymentType) => {
    const idx = orders_().findIndex(o => o.id === id); if (idx < 0) return null;
    const prev = MEM.orders[idx];
    const pending = paymentType === 'Pending';
    const paymentReceived = pending ? 0 : num_(prev.total);
    const pType = paymentType || 'Cash';
    const actor = dataService.currentActor();
    const now = nowISO_();
    const order = normalizeOrder_({ ...prev, paymentReceived, paymentType: pType, updatedBy: actor, updatedOn: now });
    MEM.orders[idx] = order; saveOrdersLocal_();
    enqueueUpsert_('ghariMarkDelivery', 'id', quickUpdatePayload_(order, actor, now));
    emit_('ac-ghari-changed');
    flush();
    try { dataService.logActivity('ghari-payment', order.customerName, `${pending ? 'marked payment pending' : `marked paid (${pType}) ₹${paymentReceived}`} for ${order.customerName}`); } catch { /* ignore */ }
    return order;
  },
  // Set (or clear) an order's planned delivery date — a DELIVERY-ONLY write, so it
  // is allowed for any known user like marking delivery/payment. `date` is a
  // 'YYYY-MM-DD' string (or '' to clear). Syncs via the lightweight
  // `ghariMarkDelivery` action. Carries the current deliveredBoxes so the backend
  // delivery branch runs and persists the date.
  setDeliveryDate: (id, date) => {
    const idx = orders_().findIndex(o => o.id === id); if (idx < 0) return null;
    const prev = MEM.orders[idx];
    const actor = dataService.currentActor();
    const now = nowISO_();
    const order = normalizeOrder_({ ...prev, deliveryDate: String(date || '').trim(), updatedBy: actor, updatedOn: now });
    MEM.orders[idx] = order; saveOrdersLocal_();
    enqueueUpsert_('ghariMarkDelivery', 'id', quickUpdatePayload_(order, actor, now));
    emit_('ac-ghari-changed');
    flush();
    try { dataService.logActivity('ghari-delivery', order.customerName, `${order.deliveryDate ? `set delivery date ${order.deliveryDate}` : 'cleared delivery date'} for ${order.customerName}`); } catch { /* ignore */ }
    return order;
  },
  // Set (or clear) the planned delivery date on EVERY undelivered order of one
  // karyakarta in one go — the day-of-delivery planning flow (call the karyakarta,
  // get their date, stamp all their orders). Delivered orders are left untouched.
  // Batches the writes: updates local state, enqueues each, and flushes once.
  setDeliveryDateForKaryakarta: (season, key, date) => {
    const d = String(date || '').trim();
    const actor = dataService.currentActor();
    const now = nowISO_();
    let count = 0, customer = '';
    orders_().forEach((o, idx) => {
      if (o.status === 'void' || o.delivered) return;
      if (orderKaryakartaKey_(o) !== key) return;
      if ((o.season || meta_().season) !== (season || meta_().season)) return;
      const order = normalizeOrder_({ ...o, deliveryDate: d, updatedBy: actor, updatedOn: now });
      MEM.orders[idx] = order;
      enqueueUpsert_('ghariMarkDelivery', 'id', quickUpdatePayload_(order, actor, now));
      count++; customer = order.karyakarta || customer;
    });
    if (!count) return 0;
    saveOrdersLocal_();
    emit_('ac-ghari-changed');
    flush();
    try { dataService.logActivity('ghari-delivery', customer, `${d ? `set delivery date ${d}` : 'cleared delivery date'} for ${count} order${count === 1 ? '' : 's'} of ${customer}`); } catch { /* ignore */ }
    return count;
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
    // Keep the challan as-is (base64 or URL) and save INSTANTLY — the Drive upload
    // happens in the background during sync (flush), so saving a purchase with a
    // photo no longer waits on the upload.
    const challan = input.challan ?? prev?.challan ?? '';
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

  // ---- Advance stock (Ghari issued to Karyakartas, deducted as they deliver) ----
  getStocks: (season, { includeVoid = false } = {}) => {
    const s = season || meta_().season;
    return stocks_()
      .filter(st => st.season === s && (includeVoid || st.status !== 'void'))
      .sort((a, b) => String(b.date || b.createdOn).localeCompare(String(a.date || a.createdOn)));
  },
  getStockById: (id) => stocks_().find(st => st.id === id) || null,

  // Record stock handed to a Karyakarta in advance. Admin-only write (mirrors the
  // backend ghariUpsertStock guard). Saves instantly, syncs in the background.
  saveStock: (input) => {
    const actor = dataService.currentActor();
    const now = nowISO_();
    const existingIdx = input.id ? stocks_().findIndex(st => st.id === input.id) : -1;
    const prev = existingIdx >= 0 ? MEM.stocks[existingIdx] : null;
    const season = input.season || meta_().season;
    const id = input.id || `GHS-${season}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const items = (input.items || []).filter(i => num_(i.qty) !== 0).map(i => ({ sku: i.sku, name: i.name, size: i.size, category: i.category, qty: num_(i.qty) }));
    const stock = normalizeStock_({
      ...(prev || {}), id, season,
      date: input.date ?? prev?.date ?? now,
      karyakarta: input.karyakarta ?? prev?.karyakarta ?? '',
      karyakartaId: input.karyakartaId ?? prev?.karyakartaId ?? '',
      items,
      remarks: input.remarks ?? prev?.remarks ?? '',
      status: input.status ?? prev?.status ?? 'active',
      createdBy: prev?.createdBy || actor, createdOn: prev?.createdOn || now,
      updatedBy: actor, updatedOn: now,
    });
    if (existingIdx >= 0) MEM.stocks[existingIdx] = stock; else MEM.stocks.unshift(stock);
    saveStocksLocal_();
    enqueueUpsert_('ghariUpsertStock', 'id', toBackendRowStock_(stock));
    emit_('ac-ghari-changed');
    flush();
    try { dataService.logActivity('ghari-stock', stock.karyakarta, `${prev ? 'updated' : 'issued'} ${stock.boxes} box${stock.boxes === 1 ? '' : 'es'} advance stock to ${stock.karyakarta || 'karyakarta'}`); } catch { /* ignore */ }
    return stock;
  },
  voidStock: (id) => {
    const st = ghariService.getStockById(id); if (!st) return null;
    return ghariService.saveStock({ ...st, status: 'void' });
  },

  // Per-Karyakarta advance-stock balances for a season: issued vs delivered (to
  // customers) vs in-hand, per sku and in kg. This is the reconciliation the admin
  // reads to see what each Karyakarta is still holding. Negative in-hand means they
  // delivered more than was issued (shortfall to reconcile).
  buildStockBalances: (season) => {
    const s = season || meta_().season;
    const prods = ghariService.getProducts();
    const bySku = {}; prods.forEach(p => { bySku[p.sku] = p; });
    const rows = {}; // key -> { key, name, karyakartaId, issued:{}, delivered:{} }
    const ensure = (key, name, kkId) => (rows[key] = rows[key] || { key, name: name || key, karyakartaId: kkId || '', issued: {}, delivered: {} });
    // Issued
    ghariService.getStocks(s).forEach(st => {
      const key = orderKaryakartaKey_(st);
      const row = ensure(key, st.karyakarta, st.karyakartaId);
      (st.items || []).forEach(it => { row.issued[it.sku] = (row.issued[it.sku] || 0) + num_(it.qty); });
    });
    // Delivered (only counts orders whose karyakarta has been issued stock)
    ghariService.getOrders(s).forEach(o => {
      const key = orderKaryakartaKey_(o);
      if (!rows[key]) return; // no advance stock issued to this karyakarta → skip
      const row = rows[key];
      const del = deliveredItemsOf_(o);
      Object.entries(del).forEach(([sku, q]) => { row.delivered[sku] = (row.delivered[sku] || 0) + q; });
    });
    // Finalize: in-hand per sku + kg/box summaries
    return Object.values(rows).map(row => {
      const skus = new Set([...Object.keys(row.issued), ...Object.keys(row.delivered)]);
      const lines = [];
      let issuedBoxes = 0, deliveredBoxes = 0, inHandBoxes = 0, ghariKg = 0, bhusuKg = 0;
      skus.forEach(sku => {
        const p = bySku[sku] || { name: sku, size: '', category: 'ghee' };
        const iss = row.issued[sku] || 0, del = row.delivered[sku] || 0, left = iss - del;
        issuedBoxes += iss; deliveredBoxes += del; inHandBoxes += left;
        const kg = left * sizeToKg_(p.size);
        if (p.category === 'bhusu') bhusuKg += kg; else ghariKg += kg;
        lines.push({ sku, name: p.name, size: p.size, category: p.category, issued: iss, delivered: del, inHand: left });
      });
      lines.sort((a, b) => (bySku[a.sku]?.sortOrder || 0) - (bySku[b.sku]?.sortOrder || 0));
      return { key: row.key, name: row.name, karyakartaId: row.karyakartaId, lines, issuedBoxes, deliveredBoxes, inHandBoxes, ghariKg, bhusuKg };
    }).sort((a, b) => b.inHandBoxes - a.inHandBoxes || a.name.localeCompare(b.name));
  },

  // Convert a pack size ("500 gm", "1 kg") to kilograms. Exposed so the UI can show
  // "4 × 500 gm = 2 kg" style weight totals without re-parsing sizes itself.
  sizeKg: (size) => sizeToKg_(size),

  // Kilograms of Ghari vs Bhusu in one order — for showing a per-order kg total.
  orderKg: (o) => orderKg_(o),
  orderKaryakartaKey: (o) => orderKaryakartaKey_(o),

  // Season-wide advance-stock summary for the admin: how much stock was bought
  // (purchased), how much has been DISTRIBUTED to karyakartas (issued), and how
  // much is still AT HOME (purchased − distributed). Boxes + kg, with a Ghari/Bhusu
  // kg split. "At home" is what the admin is still holding before handing it out.
  buildStockSummary: (season) => {
    const s = season || meta_().season;
    const prods = ghariService.getProducts();
    const bySku = {}; prods.forEach(p => { bySku[p.sku] = p; });
    // `box` = Ghari (boxes), `pkt` = Bhusu (packets) — they are different items.
    const blank = () => ({ boxes: 0, box: 0, pkt: 0, kg: 0, ghariKg: 0, bhusuKg: 0 });
    const add = (agg, sku, qty) => {
      const p = bySku[sku] || { size: '', category: 'ghee' };
      const q = num_(qty); const kg = q * sizeToKg_(p.size);
      agg.boxes += q; agg.kg += kg;
      if (p.category === 'bhusu') { agg.bhusuKg += kg; agg.pkt += q; } else { agg.ghariKg += kg; agg.box += q; }
    };
    const purchased = blank(), distributed = blank();
    ghariService.getPurchases(s).forEach(pu => (pu.items || []).forEach(it => add(purchased, it.sku, it.qty)));
    ghariService.getStocks(s).forEach(st => (st.items || []).forEach(it => add(distributed, it.sku, it.qty)));
    const atHome = {
      boxes: purchased.boxes - distributed.boxes,
      box: purchased.box - distributed.box,
      pkt: purchased.pkt - distributed.pkt,
      kg: purchased.kg - distributed.kg,
      ghariKg: purchased.ghariKg - distributed.ghariKg,
      bhusuKg: purchased.bhusuKg - distributed.bhusuKg,
    };
    return { purchased, distributed, atHome };
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
      kgByCategory: { ghee: 0, noghee: 0, sf: 0, bhusu: 0 },
      ghariKg: 0, bhusuKg: 0, totalKg: 0,
      bySku: {}, byKaryakarta: {}, byCustomer: {}, custBySku: {},
    };
    prods.forEach(p => { r.bySku[p.sku] = { name: p.name, size: p.size, qty: 0, amount: 0 }; });
    // Devotee id → canonical name, so a karyakarta stored under different name
    // strings (free-typed vs picked) but the same id collapses to one row.
    const devNameById = {};
    (dataService.getDevotees() || []).forEach(d => { if (d.id) devNameById[d.id] = d.name || ''; });
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
      // A split order attributes each line to its own named recipient; a plain
      // order is a single segment under its customerName. Used for the per-recipient
      // rollups (byCustomer, custBySku) below. Aggregates (bySku, byKaryakarta,
      // totals) always run on the flattened o.items, so they are unaffected by splits.
      const segments = (o.subOrders && o.subOrders.length)
        ? o.subOrders.map(so => ({ name: (so.name || '').trim() || '—', items: so.items }))
        : [{ name: (o.customerName || '').trim() || '—', items: o.items }];
      o.items.forEach(it => {
        if (!r.bySku[it.sku]) r.bySku[it.sku] = { name: it.name, size: it.size, qty: 0, amount: 0 };
        r.bySku[it.sku].qty += it.qty; r.bySku[it.sku].amount += it.qty * it.unitPrice;
        const kg = it.qty * sizeToKg_(it.size);
        if (r.kgByCategory[it.category] === undefined) r.kgByCategory[it.category] = 0;
        r.kgByCategory[it.category] += kg;
        r.totalKg += kg;
        if (it.category === 'bhusu') r.bhusuKg += kg; else r.ghariKg += kg;
      });
      // Group by karyakarta devotee id when known, so the same person stored
      // under different name strings merges into one row; fall back to the
      // (lowercased) name for free-typed references. `name` holds the display.
      const kkId = String(o.karyakartaId || '').trim();
      const kkName = (o.karyakarta || '').trim();
      const kkKey = kkId ? ('id:' + kkId) : (kkName ? ('nm:' + kkName.toLowerCase()) : '—');
      const kkDisplay = (kkId && devNameById[kkId]) || kkName || '—';
      if (!r.byKaryakarta[kkKey]) r.byKaryakarta[kkKey] = { name: kkDisplay, orders: 0, boxes: 0, amount: 0, received: 0, skus: {}, ghariKg: 0, bhusuKg: 0 };
      const kr = r.byKaryakarta[kkKey];
      if (kkDisplay && kkDisplay.length > (kr.name || '').length) kr.name = kkDisplay; // keep fullest variant
      kr.orders++; kr.boxes += t.boxes; kr.amount += t.total; kr.received += num_(o.paymentReceived);
      o.items.forEach(it => {
        kr.skus[it.sku] = (kr.skus[it.sku] || 0) + it.qty;
        // Track weight per karyakarta too — the team thinks in kilograms of Ghari
        // ("Digesh brought 5 kg"), not only in rupees collected.
        const kg = it.qty * sizeToKg_(it.size);
        if (it.category === 'bhusu') kr.bhusuKg += kg; else kr.ghariKg += kg;
      });
      // Per-customer running totals, per named recipient (kg of Ghari vs Bhusu,
      // boxes, amount). A split order credits each recipient with their own items;
      // the order's payment is shared across recipients in proportion to their
      // amount so per-devotee "received" still sums back to the order's payment.
      const orderReceived = num_(o.paymentReceived);
      segments.forEach(seg => {
        const st = computeTotals(seg.items);
        const cust = (seg.name || '').trim() || '—';
        const ckey = cust.toLowerCase() + '|' + String(o.karyakarta || '').toLowerCase();
        if (!r.byCustomer[ckey]) r.byCustomer[ckey] = { name: cust, karyakarta: o.karyakarta || '', orders: 0, boxes: 0, amount: 0, received: 0, ghariKg: 0, bhusuKg: 0, byCatKg: { ghee: 0, noghee: 0, sf: 0, bhusu: 0 } };
        const cr = r.byCustomer[ckey];
        const share = t.total > 0 ? (st.total / t.total) : (segments.length ? 1 / segments.length : 1);
        cr.orders++; cr.boxes += st.boxes; cr.amount += st.total; cr.received += orderReceived * share;
        seg.items.forEach(it => {
          // Per-item recipient breakdown — who needs how many boxes of each sku
          // (powers the "Boxes to prepare" drilldown). sku -> { recipient -> qty }.
          if (!r.custBySku[it.sku]) r.custBySku[it.sku] = {};
          r.custBySku[it.sku][cust] = (r.custBySku[it.sku][cust] || 0) + it.qty;
          const kg = it.qty * sizeToKg_(it.size);
          cr.byCatKg[it.category] = (cr.byCatKg[it.category] || 0) + kg;
          if (it.category === 'bhusu') cr.bhusuKg += kg; else cr.ghariKg += kg;
        });
      });
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

  // ---- Per-karyakarta export (select several karyakartas → one share file) ----
  // The list of karyakartas for a season, with their order/kg/amount totals — used
  // to populate the export picker. Highest collection first.
  karyakartaList: (season) => {
    const r = ghariService.buildReport(season || meta_().season);
    return Object.entries(r.byKaryakarta)
      .map(([key, d]) => ({ key, name: d.name || key, orders: d.orders, ghariKg: d.ghariKg || 0, bhusuKg: d.bhusuKg || 0, amount: d.amount, received: d.received }))
      .sort((a, b) => b.amount - a.amount);
  },
  // Orders belonging to the selected karyakartas (by stable key), newest first.
  ordersByKaryakarta: (season, keys) => {
    const set = new Set(keys || []);
    return ghariService.getOrders(season || meta_().season).filter(o => set.has(orderKaryakartaKey_(o)));
  },

  // Excel: one row per order, grouped by karyakarta — the list the follow-up team
  // works from (customer, mobile, what they ordered, amount, balance).
  exportKaryakartaXlsx: async (season, keys, label = '') => {
    const s = season || meta_().season;
    const kkName = {}; ghariService.karyakartaList(s).forEach(k => { kkName[k.key] = k.name; });
    const list = ghariService.ordersByKaryakarta(s, keys)
      .sort((a, b) => orderKaryakartaKey_(a).localeCompare(orderKaryakartaKey_(b)) || (Number(b.orderNo) || 0) - (Number(a.orderNo) || 0));
    const XLSX = await import('xlsx');
    const header = ['Karyakarta', '#', 'Customer', 'Mobile', 'Items', 'Ghari kg', 'Bhusu kg', 'Total', 'Paid', 'Balance', 'Delivered', 'Remarks'];
    const rows = list.map(o => {
      const t = computeTotals(o.items); const kg = orderKg_(o);
      const items = (o.items || []).map(i => `${i.qty}× ${i.name} ${i.size}`).join('; ');
      return [kkName[orderKaryakartaKey_(o)] || o.karyakarta || '—', o.orderNo || '', o.customerName, o.customerMobile || '',
        items, +kg.ghariKg.toFixed(2), +kg.bhusuKg.toFixed(2), t.total, num_(o.paymentReceived),
        t.total - num_(o.paymentReceived), o.delivered ? 'Yes' : 'No', o.remarks || ''];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ghari orders');
    XLSX.writeFile(wb, `Ghari_${s}_${(label || 'karyakartas').replace(/[^\w]+/g, '_')}.xlsx`);
  },

  // PDF: a shareable sheet grouped by karyakarta, each with their customers' order
  // details — so (e.g.) the Kolkata team can follow up with those devotees.
  exportKaryakartaPdf: async (season, keys, label = '') => {
    const s = season || meta_().season;
    const kkMeta = {}; ghariService.karyakartaList(s).forEach(k => { kkMeta[k.key] = k; });
    const list = ghariService.ordersByKaryakarta(s, keys);
    const groups = {}; // key -> orders[]
    list.forEach(o => { const k = orderKaryakartaKey_(o); (groups[k] = groups[k] || []).push(o); });
    const orderedKeys = (keys || []).filter(k => groups[k] && groups[k].length);

    let jsPDF, autoTableMod;
    try { [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]); }
    catch (e) {
      try { if (!sessionStorage.getItem('ac-pdf-reloaded')) { sessionStorage.setItem('ac-pdf-reloaded', '1'); location.reload(); } } catch { /* ignore */ }
      throw new Error('The app was updated in the background. Reloading — please tap export again.');
    }
    const autoTable = autoTableMod.default || autoTableMod.autoTable;
    const ORANGE = [229, 111, 24], DARK = [38, 48, 59], STRIPE = [252, 241, 231];
    const rs = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN');
    const kg1 = (n) => (+(Number(n) || 0).toFixed(1)).toLocaleString('en-IN');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const now = new Date();
    const when = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    doc.setFillColor(...ORANGE); doc.rect(0, 0, pageW, 92, 'F');
    doc.setFillColor(255, 157, 82); doc.rect(0, 92, pageW, 4, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.setFontSize(9); doc.text('AKSHAR CONNECT', 40, 32);
    doc.setFontSize(18); doc.text('Ghari Orders by Karyakarta', 40, 58);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(255, 235, 220);
    doc.text(`Season ${s}${label ? ' · ' + label : ''}`, 40, 78);
    doc.setFontSize(9); doc.text(`Generated: ${when}`, pageW - 40, 32, { align: 'right' });

    const footer = () => {
      const h = doc.internal.pageSize.getHeight(), w = doc.internal.pageSize.getWidth();
      doc.setFontSize(8); doc.setTextColor(150, 160, 175);
      doc.text('Adajan Satsang Mandal · Akshar Connect', 40, h - 20);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, w - 40, h - 20, { align: 'right' });
    };

    let startY = 112;
    orderedKeys.forEach((k) => {
      const orders = groups[k].slice().sort((a, b) => (Number(b.orderNo) || 0) - (Number(a.orderNo) || 0));
      const m = kkMeta[k] || { name: orders[0]?.karyakarta || '—', ghariKg: 0, bhusuKg: 0, amount: 0, received: 0 };
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...DARK);
      doc.text(`${m.name}`, 40, startY);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 130, 145);
      doc.text(`${orders.length} order${orders.length === 1 ? '' : 's'} · Ghari ${kg1(m.ghariKg)} kg${m.bhusuKg ? ' · Bhusu ' + kg1(m.bhusuKg) + ' kg' : ''} · ${rs(m.amount)}`, 40, startY + 14);
      const body = orders.map(o => {
        const t = computeTotals(o.items); const bal = t.total - num_(o.paymentReceived);
        const items = (o.items || []).map(i => `${i.qty}x ${i.name.replace('Ghari ', '').replace(/[()]/g, '')} ${i.size}`).join(', ');
        return [o.orderNo ? '#' + o.orderNo : '', o.customerName || '—', o.customerMobile || '—', items, rs(t.total), bal > 0 ? rs(bal) : '-', o.delivered ? 'Yes' : 'No'];
      });
      autoTable(doc, {
        startY: startY + 22,
        head: [['#', 'Customer', 'Mobile', 'Items', 'Total', 'Balance', 'Delv.']],
        body,
        theme: 'striped', styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: DARK, lineColor: [235, 225, 215], lineWidth: 0.5, overflow: 'linebreak' },
        headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: STRIPE },
        columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 95 }, 2: { cellWidth: 68 }, 3: { cellWidth: 150 }, 4: { halign: 'right', cellWidth: 52 }, 5: { halign: 'right', cellWidth: 52 }, 6: { halign: 'center', cellWidth: 34 } },
        margin: { left: 40, right: 40, bottom: 44 }, didDrawPage: footer,
      });
      startY = doc.lastAutoTable.finalY + 26;
    });
    if (!orderedKeys.length) { doc.setTextColor(...DARK); doc.setFontSize(11); doc.text('No orders for the selected karyakartas.', 40, startY); }

    doc.save(`Ghari_${s}_${(label || 'karyakartas').replace(/[^\w]+/g, '_')}.pdf`);
  },

  // ---- Digital delivery challan (one order) → PDF, shareable on WhatsApp ----
  // Builds an A4 delivery note for a single order: who, what was ordered, how many
  // boxes were delivered (per item), kg, amount and balance, with a signature line.
  // When `share` is set and the device supports sharing files (the Android app and
  // most phones do), it opens the native share sheet — WhatsApp included — so the
  // admin can send the PDF straight to the devotee/karyakarta. Otherwise it downloads.
  orderChallanPdf: async (order, { share = false } = {}) => {
    const o = normalizeOrder_(order);
    const s = o.season || meta_().season;
    let jsPDF, autoTableMod;
    try { [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]); }
    catch (e) {
      try { if (!sessionStorage.getItem('ac-pdf-reloaded')) { sessionStorage.setItem('ac-pdf-reloaded', '1'); location.reload(); } } catch { /* ignore */ }
      throw new Error('The app was updated in the background. Reloading — please tap again.');
    }
    const autoTable = autoTableMod.default || autoTableMod.autoTable;
    const ORANGE = [229, 111, 24], DARK = [38, 48, 59], MUTE = [120, 130, 145], STRIPE = [252, 241, 231];
    const rs = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN');
    const kg1 = (n) => (+(Number(n) || 0).toFixed(1)).toLocaleString('en-IN');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const now = new Date();
    const when = (o.deliveryDate ? new Date(o.deliveryDate) : now).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // Header band
    doc.setFillColor(...ORANGE); doc.rect(0, 0, pageW, 92, 'F');
    doc.setFillColor(255, 157, 82); doc.rect(0, 92, pageW, 4, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.setFontSize(9); doc.text('AKSHAR CONNECT', 40, 32);
    doc.setFontSize(18); doc.text('Ghari Seva — Delivery Challan', 40, 58);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(255, 235, 220);
    doc.text(`Season ${s}${o.orderNo ? '  ·  Challan #' + o.orderNo : ''}`, 40, 78);
    doc.setFontSize(9); doc.text(`Date: ${when}`, pageW - 40, 32, { align: 'right' });

    // Order-level delivery totals (always from the flattened items).
    const delMap = deliveredItemsOf_(o);
    let delBoxes = 0, ordBoxes = 0, ghariKgDel = 0, bhusuKgDel = 0;
    (o.items || []).forEach(it => {
      const del = delMap[it.sku] || 0; ordBoxes += it.qty; delBoxes += del;
      const kg = del * sizeToKg_(it.size);
      if (it.category === 'bhusu') bhusuKgDel += kg; else ghariKgDel += kg;
    });
    const delAmount = (o.items || []).reduce((sum, it) => sum + (delMap[it.sku] || 0) * it.unitPrice, 0);
    // Nothing handed over yet → render as a PENDING challan (no all-zero
    // "Delivered" columns, which read as a mistake at first glance).
    const pending = delBoxes <= 0 && ordBoxes > 0;

    // Party block
    doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(pending ? 'To be delivered to' : 'Delivered to', 40, 122);
    doc.setFontSize(13); doc.text(o.customerName || '—', 40, 140);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE);
    const sub = [o.customerMobile ? 'Mobile: ' + o.customerMobile : '', o.karyakarta ? 'Via: ' + o.karyakarta : ''].filter(Boolean).join('   ·   ');
    if (sub) doc.text(sub, 40, 156);

    // Pending banner — makes clear up front that the zeros below are simply
    // because delivery hasn't happened yet.
    let tableStart = 172;
    if (pending) {
      doc.setFillColor(255, 243, 205); doc.roundedRect(40, 166, pageW - 80, 28, 5, 5, 'F');
      doc.setTextColor(146, 100, 10); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
      doc.text(`PENDING DELIVERY — ${ordBoxes} box(es) to deliver. Not yet delivered or paid.`, 52, 184);
      tableStart = 210;
    }

    const subs = o.subOrders || [];
    if (subs.length) {
      // Split order — one section per named recipient, listing what they ordered.
      // Delivery is tracked at the order level (summary block below).
      let y0 = tableStart;
      subs.forEach((so, idx) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...DARK);
        doc.text(`${idx + 1}. ${so.name || 'Recipient'}${so.mobile ? '  ·  ' + so.mobile : ''}`, 40, y0);
        const sBody = (so.items || []).map(it => [`${it.name.replace(/[()]/g, '')} ${it.size}`, String(it.qty), rs(it.unitPrice), rs(it.qty * it.unitPrice)]);
        autoTable(doc, {
          startY: y0 + 6,
          head: [['Item', 'Qty', 'Rate', 'Amount']], body: sBody,
          theme: 'striped', styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: DARK, lineColor: [235, 225, 215], lineWidth: 0.5, overflow: 'linebreak' },
          headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: STRIPE },
          columnStyles: { 0: { cellWidth: 250 }, 1: { halign: 'center', cellWidth: 60 }, 2: { halign: 'right', cellWidth: 95 }, 3: { halign: 'right', cellWidth: 110 } },
          margin: { left: 40, right: 40 },
        });
        y0 = doc.lastAutoTable.finalY + 16;
      });
      var y = y0 + 2;
    } else if (pending) {
      // Nothing delivered yet — show the ORDER (what's to be delivered), not a
      // column of zeros. Item | Ordered | Rate | Amount(order value).
      const body = (o.items || []).map(it => [`${it.name.replace(/[()]/g, '')} ${it.size}`, String(it.qty), rs(it.unitPrice), rs(it.qty * it.unitPrice)]);
      autoTable(doc, {
        startY: tableStart,
        head: [['Item', 'To deliver', 'Rate', 'Amount']], body,
        theme: 'striped', styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: DARK, lineColor: [235, 225, 215], lineWidth: 0.5, overflow: 'linebreak' },
        headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: STRIPE },
        columnStyles: { 0: { cellWidth: 250 }, 1: { halign: 'center', cellWidth: 70 }, 2: { halign: 'right', cellWidth: 90 }, 3: { halign: 'right', cellWidth: 105 } },
        margin: { left: 40, right: 40 },
      });
      var y = doc.lastAutoTable.finalY + 18;
    } else {
      // Single recipient — ordered vs delivered per item.
      const body = (o.items || []).map(it => {
        const del = delMap[it.sku] || 0;
        return [`${it.name.replace(/[()]/g, '')} ${it.size}`, String(it.qty), String(del), kg1(del * sizeToKg_(it.size)), rs(it.unitPrice), rs(del * it.unitPrice)];
      });
      autoTable(doc, {
        startY: tableStart,
        head: [['Item', 'Ordered', 'Delivered', 'Kg', 'Rate', 'Amount']],
        body,
        theme: 'striped', styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: DARK, lineColor: [235, 225, 215], lineWidth: 0.5, overflow: 'linebreak' },
        headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: STRIPE },
        columnStyles: { 0: { cellWidth: 190 }, 1: { halign: 'center', cellWidth: 60 }, 2: { halign: 'center', cellWidth: 66 }, 3: { halign: 'right', cellWidth: 50 }, 4: { halign: 'right', cellWidth: 60 }, 5: { halign: 'right', cellWidth: 70 } },
        margin: { left: 40, right: 40 },
      });
      var y = doc.lastAutoTable.finalY + 18;
    }
    const bal = o.total - num_(o.paymentReceived);
    const line = (label, val, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(...(bold ? DARK : MUTE)); doc.setFontSize(10); doc.text(label, pageW - 220, y); doc.setTextColor(...DARK); doc.text(val, pageW - 40, y, { align: 'right' }); y += 16; };
    if (pending) {
      // Nothing delivered — skip the all-zero delivered lines; show what's owed.
      line(`Boxes to deliver`, `${ordBoxes}`);
      line(`Order total`, rs(o.total), true);
      line(`Paid${o.paymentType ? ' (' + o.paymentType + ')' : ''}`, rs(num_(o.paymentReceived)));
      if (bal > 0) line(`Balance due`, rs(bal), true);
    } else {
      line(`Boxes delivered`, `${delBoxes} of ${ordBoxes}`);
      // Weight delivered split into its two kinds: Total Ghari and Total Bhusu.
      line(`Total Ghari`, `${kg1(ghariKgDel)} kg`);
      line(`Total Bhusu`, `${kg1(bhusuKgDel)} kg`);
      line(`Delivered value`, rs(delAmount));
      line(`Order total`, rs(o.total), true);
      line(`Paid${o.paymentType ? ' (' + o.paymentType + ')' : ''}`, rs(num_(o.paymentReceived)));
      if (bal > 0) line(`Balance due`, rs(bal), true);
    }

    // Status + signature. 0 delivered = "Pending" (nothing handed over yet);
    // some-but-not-all = "Partial"; all = "Fully delivered".
    const fullyDel = delBoxes >= ordBoxes && ordBoxes > 0;
    const statusText = fullyDel ? 'Status: Fully delivered'
      : delBoxes <= 0 ? `Status: Pending — not yet delivered (${ordBoxes} box(es) to deliver)`
      : `Status: Partial — ${ordBoxes - delBoxes} box(es) remaining`;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...(fullyDel ? [16, 122, 72] : [194, 120, 3]));
    doc.text(statusText, 40, y + 6);
    if (o.remarks) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTE); doc.text(`Remarks: ${o.remarks}`, 40, y + 22); }
    const sigY = y + 56;
    doc.setDrawColor(190, 190, 190); doc.line(40, sigY, 200, sigY); doc.line(pageW - 200, sigY, pageW - 40, sigY);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTE);
    doc.text('Received by (sign)', 40, sigY + 14); doc.text('For Adajan Satsang Mandal', pageW - 40, sigY + 14, { align: 'right' });

    // Footer
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8); doc.setTextColor(150, 160, 175);
    doc.text('Adajan Satsang Mandal · Akshar Connect · Jai Swaminarayan 🙏', 40, h - 20);

    const filename = `Challan_${s}${o.orderNo ? '_' + o.orderNo : ''}_${(o.customerName || 'order').replace(/[^\w]+/g, '_')}.pdf`;

    if (share) {
      try {
        const blob = doc.output('blob');
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Ghari Seva — Delivery Challan', text: `Ghari Seva ${s} delivery challan for ${o.customerName || ''}`.trim() });
          return { shared: true, filename };
        }
      } catch (e) { if (String(e && e.name) === 'AbortError') return { shared: false, cancelled: true, filename }; /* else fall through to download */ }
    }
    doc.save(filename);
    return { shared: false, filename };
  },

  // ---- Advance-stock challan (one issue) → PDF, shareable on WhatsApp ----
  // A handover note for stock issued to a Karyakarta in advance: recipient, each
  // item's boxes + kg, and the Ghari/Bhusu kg totals (e.g. 10 kg Ghari, 4 kg Bhusu),
  // with a signature line. No money — this is a stock handover, not a sale. Shares to
  // WhatsApp where supported, else downloads. Mirrors orderChallanPdf.
  stockChallanPdf: async (stock, { share = false, title = 'Ghari Seva — Stock Challan', subtitle = 'Advance stock issued', recipientLabel = 'Issued to' } = {}) => {
    const st = normalizeStock_(stock);
    const s = st.season || meta_().season;
    let jsPDF, autoTableMod;
    try { [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]); }
    catch (e) {
      try { if (!sessionStorage.getItem('ac-pdf-reloaded')) { sessionStorage.setItem('ac-pdf-reloaded', '1'); location.reload(); } } catch { /* ignore */ }
      throw new Error('The app was updated in the background. Reloading — please tap again.');
    }
    const autoTable = autoTableMod.default || autoTableMod.autoTable;
    const ORANGE = [229, 111, 24], DARK = [38, 48, 59], MUTE = [120, 130, 145], STRIPE = [252, 241, 231];
    const kg1 = (n) => (+(Number(n) || 0).toFixed(1)).toLocaleString('en-IN');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const when = (st.date ? new Date(st.date) : new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // Header band
    doc.setFillColor(...ORANGE); doc.rect(0, 0, pageW, 92, 'F');
    doc.setFillColor(255, 157, 82); doc.rect(0, 92, pageW, 4, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.setFontSize(9); doc.text('AKSHAR CONNECT', 40, 32);
    doc.setFontSize(18); doc.text(title, 40, 58);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(255, 235, 220);
    doc.text(`Season ${s}  ·  ${subtitle}`, 40, 78);
    doc.setFontSize(9); doc.text(`Date: ${when}`, pageW - 40, 32, { align: 'right' });

    // Recipient
    doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(recipientLabel, 40, 122);
    doc.setFontSize(13); doc.text(st.karyakarta || '—', 40, 140);

    // Items — boxes + kg
    let ghariKg = 0, bhusuKg = 0, totBoxes = 0;
    const body = (st.items || []).map(it => {
      const kg = num_(it.qty) * sizeToKg_(it.size); totBoxes += num_(it.qty);
      if (it.category === 'bhusu') bhusuKg += kg; else ghariKg += kg;
      return [`${it.name.replace(/[()]/g, '')} ${it.size}`, String(it.qty), kg1(kg)];
    });
    autoTable(doc, {
      startY: 158,
      head: [['Item', 'Boxes', 'Kg']],
      body,
      theme: 'striped', styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: DARK, lineColor: [235, 225, 215], lineWidth: 0.5, overflow: 'linebreak' },
      headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: STRIPE },
      columnStyles: { 0: { cellWidth: 320 }, 1: { halign: 'center', cellWidth: 90 }, 2: { halign: 'right', cellWidth: 105 } },
      margin: { left: 40, right: 40 },
    });

    let y = doc.lastAutoTable.finalY + 18;
    const line = (label, val, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(...(bold ? DARK : MUTE)); doc.setFontSize(11); doc.text(label, pageW - 240, y); doc.setTextColor(...DARK); doc.text(val, pageW - 40, y, { align: 'right' }); y += 18; };
    line('Total boxes', String(totBoxes), true);
    if (ghariKg > 0) line('Ghari', `${kg1(ghariKg)} kg`, true);
    if (bhusuKg > 0) line('Bhusu', `${kg1(bhusuKg)} kg`, true);

    if (st.remarks) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTE); doc.text(`Remarks: ${st.remarks}`, 40, y + 4); y += 18; }

    const sigY = y + 48;
    doc.setDrawColor(190, 190, 190); doc.line(40, sigY, 200, sigY); doc.line(pageW - 200, sigY, pageW - 40, sigY);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTE);
    doc.text('Received by (sign)', 40, sigY + 14); doc.text('For Adajan Satsang Mandal', pageW - 40, sigY + 14, { align: 'right' });

    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8); doc.setTextColor(150, 160, 175);
    doc.text('Adajan Satsang Mandal · Akshar Connect · Jai Swaminarayan 🙏', 40, h - 20);

    const filename = `StockChallan_${s}_${(st.karyakarta || 'karyakarta').replace(/[^\w]+/g, '_')}.pdf`;
    if (share) {
      try {
        const blob = doc.output('blob');
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Ghari Seva — Stock Challan', text: `Ghari Seva ${s} advance stock challan for ${st.karyakarta || ''}`.trim() });
          return { shared: true, filename };
        }
      } catch (e) { if (String(e && e.name) === 'AbortError') return { shared: false, cancelled: true, filename }; }
    }
    doc.save(filename);
    return { shared: false, filename };
  },

  // ---- Printable BLANK order sheet (take orders on paper, key in later) ----
  // A landscape A4 grid: one column per catalog item, many empty rows. The admin
  // prints it, writes the devotee's name and the box counts by hand (2 under "Ghee
  // 500g", 1 under "Ghee 1kg", …), then keys the numbers in. Makes taking orders in
  // person — where typing on the phone is slow — much faster.
  printableOrderSheet: async (season, { rows = 24 } = {}) => {
    const s = season || meta_().season;
    const prods = ghariService.getActiveProducts();
    let jsPDF, autoTableMod;
    try { [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]); }
    catch (e) {
      try { if (!sessionStorage.getItem('ac-pdf-reloaded')) { sessionStorage.setItem('ac-pdf-reloaded', '1'); location.reload(); } } catch { /* ignore */ }
      throw new Error('The app was updated in the background. Reloading — please tap again.');
    }
    const autoTable = autoTableMod.default || autoTableMod.autoTable;
    const ORANGE = [229, 111, 24], DARK = [38, 48, 59], MUTE = [120, 130, 145];

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(...ORANGE); doc.rect(0, 0, pageW, 64, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.setFontSize(9); doc.text('AKSHAR CONNECT', 36, 24);
    doc.setFontSize(16); doc.text(`Ghari Seva ${s} — Order Sheet`, 36, 48);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(255, 235, 220);
    doc.text('Karyakarta: ____________________    Date: __________', pageW - 36, 24, { align: 'right' });
    doc.text('Write the number of boxes under each item.', pageW - 36, 44, { align: 'right' });

    // One column per item. Header shows a short name + size + price so the person
    // taking the order knows the rate without looking it up.
    const shortName = (p) => `${p.name.replace('Ghari ', '').replace(/[()]/g, '').trim()}\n${p.size}\nRs${p.unitPrice}`;
    const head = [['#', 'Devotee name', 'Mobile', ...prods.map(shortName), 'Remarks']];
    const body = Array.from({ length: rows }, (_, i) => [String(i + 1), '', '', ...prods.map(() => ''), '']);

    const itemColW = Math.max(30, Math.min(48, (pageW - 72 - 24 - 150 - 70 - 110) / Math.max(1, prods.length)));
    const colStyles = { 0: { cellWidth: 24, halign: 'center' }, 1: { cellWidth: 150 }, 2: { cellWidth: 70 } };
    prods.forEach((p, i) => { colStyles[3 + i] = { cellWidth: itemColW, halign: 'center' }; });
    colStyles[3 + prods.length] = { cellWidth: 110 };

    autoTable(doc, {
      startY: 78,
      head, body,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 6, textColor: DARK, lineColor: [210, 200, 190], lineWidth: 0.5, minCellHeight: 22, valign: 'middle' },
      headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', valign: 'middle' },
      columnStyles: colStyles,
      margin: { left: 36, right: 36, bottom: 30 },
      didDrawPage: () => {
        const h = doc.internal.pageSize.getHeight();
        doc.setFontSize(8); doc.setTextColor(150, 160, 175);
        doc.text('Adajan Satsang Mandal · Akshar Connect', 36, h - 14);
      },
    });

    doc.save(`Ghari_${s}_Order_Sheet.pdf`);
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
      const kkBody = kkList.map(([key, d]) => [d.name || key, String(d.orders), rs(d.amount), rs(d.received), rs(Math.max(0, d.amount - d.received))]);
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
