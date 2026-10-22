import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Minus, Search, X, Check, Trash2, Download, RefreshCw, Settings as SettingsIcon,
  Package, Truck, Wallet, ArrowLeft, User, Users, AlertCircle, CloudOff, Cloud, Eye, EyeOff, Pencil, MessageCircle, Phone, ChevronDown, ShoppingCart, Camera, Calendar, CalendarPlus, History, RotateCcw, Boxes, BarChart3, UserPlus,
} from 'lucide-react';
import { ghariService, GHARI_CATEGORIES } from '../services/ghariService';
import { dataService } from '../services/dataService';
import { alertError, confirmDialog } from '../utils/sweetAlert';
import { isAdminRole, isSevakRole } from '../utils/navItems';
import AutoTextarea from '../components/AutoTextarea';

const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
// One-decimal kilograms, e.g. 5, 2.5 — the team talks in kg of Ghari, not only ₹.
const fmtKg = (n) => (+(Number(n) || 0).toFixed(1)).toLocaleString('en-IN');
// Size string → kg (e.g. "500 gm" → 0.5, "1 kg" → 1, "250gm" → 0.25). Mirrors the
// backend/ghariService sizeToKg_ so weight breakdowns match everywhere.
const sizeKg_ = (size) => { const m = String(size || '').toLowerCase().match(/([\d.]+)\s*(kg|gm|g|gram)?/); if (!m) return 0; const n = parseFloat(m[1]); if (isNaN(n)) return 0; return /kg/.test(m[2] || '') ? n : n / 1000; };
// Clean a product name for display: "Ghari (Ghee Wali)" → "Ghee Wali".
const cleanName_ = (name) => String(name || '').replace('Ghari ', '').replace(/[()]/g, '').trim() || 'Item';
// Bhusu comes in PACKETS, Ghari in BOXES — so label counts by item type.
const unitWord_ = (category, n) => (category === 'bhusu') ? (Math.abs(n) === 1 ? 'packet' : 'packets') : (Math.abs(n) === 1 ? 'box' : 'boxes');
// Rupee value of a purchase: the amount typed on it if any, else auto-calculated
// from the catalog price (Σ qty × item unitPrice in Settings). `priceBySku` maps
// sku → unitPrice. Keeps the row amount and the Total cost card in agreement.
const purchaseValue_ = (purchase, priceBySku = {}) => {
  const amt = Number(purchase.amount || 0);
  if (amt > 0) return amt;
  return (purchase.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(priceBySku[it.sku]) || 0), 0);
};
// Delivery state of an order: 'delivered' | 'partial' | 'pending'.
const orderDelState_ = (o) => {
  const tot = (o.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const db = Number(o.deliveredBoxes || 0);
  if (o.delivered || (tot > 0 && db >= tot)) return 'delivered';
  return db > 0 ? 'partial' : 'pending';
};
// Payment state of an order: 'paid' | 'partial' | 'unpaid'.
const orderPayState_ = (o) => {
  const rec = Number(o.paymentReceived || 0);
  if (rec <= 0) return 'unpaid';
  return (Number(o.total || 0) - rec) > 0 ? 'partial' : 'paid';
};
// Split an items array into Ghari boxes vs Bhusu packets, and format "X boxes · Y packets".
const splitUnits_ = (items) => { let box = 0, pkt = 0; (items || []).forEach(it => { const q = Number(it.qty) || 0; if ((it.category || '') === 'bhusu') pkt += q; else box += q; }); return { box, pkt }; };
const unitsText_ = (items) => { const { box, pkt } = splitUnits_(items); const p = []; if (box) p.push(`${box} ${unitWord_('ghee', box)}`); if (pkt) p.push(`${pkt} ${unitWord_('bhusu', pkt)}`); return p.join(' · ') || '0'; };
// Single unit word for a combined count: "box(es)" for Ghari-only, "packet(s)" for
// Bhusu-only, "item(s)" when an order mixes both (one number can't be split).
const mixUnitWord_ = (items, n) => { const { box, pkt } = splitUnits_(items); if (box && pkt) return Math.abs(n) === 1 ? 'item' : 'items'; if (pkt) return unitWord_('bhusu', n); return unitWord_('ghee', n); };

// Proper (title) case — capitalizes the first letter of each word as you type,
// so the text always reads in proper case no matter how it was entered.
const toProperCase = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
// Proper-case a NAME however it was typed — lowercases first so ALL-CAPS ("RAVI")
// and all-lowercase ("ravi") both become "Ravi".
const properName = (s) => String(s || '').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ───────────────────────── Sync / connectivity strip ────────────────────────
function SyncStrip() {
  const [pending, setPending] = useState(ghariService.pendingCount());
  const [online, setOnline] = useState(ghariService.isOnline());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onSync = () => { setPending(ghariService.pendingCount()); setOnline(ghariService.isOnline()); };
    const onNet = () => setOnline(ghariService.isOnline());
    window.addEventListener('ac-ghari-synced', onSync);
    window.addEventListener('ac-ghari-changed', onSync);
    window.addEventListener('online', onNet); window.addEventListener('offline', onNet);
    const t = setInterval(onSync, 4000);
    return () => { window.removeEventListener('ac-ghari-synced', onSync); window.removeEventListener('ac-ghari-changed', onSync); window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet); clearInterval(t); };
  }, []);
  const syncNow = async () => { setBusy(true); try { await ghariService.flush(); await ghariService.syncDown(); } finally { setBusy(false); setPending(ghariService.pendingCount()); } };

  const synced = pending === 0;
  return (
    <button onClick={syncNow} disabled={busy}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
        !online ? 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300'
        : synced ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300'
        : 'border-orange-200 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-300'}`}>
      {!online ? <CloudOff className="h-3.5 w-3.5" /> : synced ? <Cloud className="h-3.5 w-3.5" /> : <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />}
      {!online ? 'Offline — saved on device' : synced ? 'All saved' : `${pending} to sync`}
    </button>
  );
}

// ───────────────────────── Devotee autocomplete picker ──────────────────────
function DevoteePicker({ value, onPick, onText, placeholder, icon: Icon = User, accent = 'orange', inputRef, onCommit }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const boxRef = useRef(null);
  useEffect(() => { setQ(value || ''); }, [value]);
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  // Proper-case as you type — "anand uncle" → "Anand Uncle" — so names read
  // correctly without anyone fixing capitals by hand. (Search is case-insensitive,
  // so this never affects matching.)
  const change = (raw) => { const text = toProperCase(raw); setQ(text); onText?.(text); setResults(ghariService.searchDevotees(text)); setOpen(true); };
  const pick = (d) => { setQ(d.name); onPick?.(d); setOpen(false); onCommit?.(); };
  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && results.length) { pick(results[0]); }   // take the top suggestion
      else { setOpen(false); onCommit?.(); }                 // free text → just advance
    } else if (e.key === 'Escape') { setOpen(false); }
  };
  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2.5 focus-within:border-primary transition-colors">
        <Icon className="h-4 w-4 shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          value={q} onChange={(e) => change(e.target.value)} onKeyDown={onKeyDown}
          onFocus={() => { if (q) { setResults(ghariService.searchDevotees(q)); setOpen(true); } }}
          placeholder={placeholder} className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
        {q && <button type="button" onClick={() => { change(''); onPick?.(null); }} className="text-text-muted hover:text-text-main"><X className="h-4 w-4" /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-2xl border border-border-light bg-surface shadow-xl">
          {results.map((d) => (
            <button key={d.id || `h:${d.name}`} type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(d)}
              className="flex w-full items-center gap-3 border-b border-border-light px-3 py-2.5 text-left last:border-0 hover:bg-bg-base">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: accent === 'orange' ? '#FF9D52' : '#0D9488' }}>{d.name?.[0] || '?'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-text-main">{d.name}</span>
                <span className="block truncate text-[11px] text-text-muted">{d._history ? '↩︎ Previous order' : [d.area, d.mobile].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Product stepper card ─────────────────────────────
// Append an alpha byte to a #RRGGBB colour (a in 0..1) → a translucent tint.
const tint = (hex, a) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

// Compact, tap-to-add product tile. An UNSELECTED tile is tiny (just name + size +
// price) so the whole catalog fits on one screen with no scrolling — tap it to add
// the first box. Only tiles with a quantity expand to show the −/＋ stepper, a
// type-in count and the +10/+50 bulk buttons. Built for fast, repeated entry.
function ProductCard({ product, qty, onChange }) {
  const cat = GHARI_CATEGORIES[product.category];
  const color = cat?.color || '#E56F18';
  const active = qty > 0;
  const qtyRef = useRef(null);
  // Shorter label — drop the "Ghari " prefix and any ( ) so names stay on one line.
  const label = product.name.replace(/^Ghari\s+/i, '').replace(/[()]/g, '').trim();
  // Picking a product adds one and focuses the quantity so you can type the count.
  const pick = () => { onChange(qty + 1); setTimeout(() => { try { qtyRef.current?.focus(); qtyRef.current?.select(); } catch { /* ignore */ } }, 0); };
  return (
    <div className="relative overflow-hidden rounded-xl border-2 transition-all"
      style={{
        background: active ? (cat?.bgActive || tint(color, 0.22)) : (cat?.bg || tint(color, 0.11)),
        borderColor: active ? color : tint(color, 0.5),
        boxShadow: active ? `0 3px 10px ${tint(color, 0.3)}` : 'none',
      }}>
      <div className="absolute left-0 top-0 h-full w-1" style={{ background: color }} />
      {/* The whole tile is one big tap target → add a box. */}
      <button onClick={pick} className="block w-full px-2 py-1.5 pl-2.5 text-left">
        <div className="flex items-start justify-between gap-1">
          <span className="text-[12px] font-extrabold leading-tight text-text-main">{label}</span>
          {active && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-black text-white">{qty}</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="rounded bg-bg-base px-1 py-0.5 text-[9px] font-bold text-text-muted">{product.size}</span>
          <span className="text-[10px] font-bold" style={{ color: cat?.color }}>{rupee(product.unitPrice)}</span>
        </div>
      </button>
      {/* Stepper + bulk only once selected — keeps unselected tiles tiny. */}
      {active && (
        <div className="px-1.5 pb-1.5">
          <div className="flex items-center justify-between gap-1">
            <button onClick={() => onChange(Math.max(0, qty - 1))}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface text-text-main active:scale-95">
              <Minus className="h-4 w-4" />
            </button>
            <input ref={qtyRef} inputMode="numeric" value={qty || 0} data-no-clear="true"
              onFocus={(e) => e.target.select()}
              onChange={(e) => onChange(Math.max(0, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0))}
              className="min-w-0 w-10 rounded-lg bg-white/70 py-0.5 text-center text-base font-black text-primary outline-none" />
            <button onClick={pick}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow active:scale-95">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1 flex gap-1">
            {[10, 50].map(n => <button key={n} onClick={() => onChange(qty + n)} className="flex-1 rounded-md bg-white/50 py-0.5 text-[10px] font-black text-text-muted active:scale-95">+{n}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Order form (new + edit) ──────────────────────────
function OrderForm({ initialOrder, onSaved, onCancel, embedded, onManageItems, onDelete, readOnly }) {
  // Show active items; if the admin has (accidentally) hidden them all, fall back
  // to showing every item so entry is never blocked by an empty grid.
  const products = useMemo(() => {
    const active = ghariService.getActiveProducts();
    return active.length ? active : ghariService.getProducts();
  }, []);
  const bySku = useMemo(() => Object.fromEntries(products.map(p => [p.sku, p])), [products]);
  const isEdit = !!initialOrder;

  const [cart, setCart] = useState(() => {
    const c = {}; (initialOrder?.items || []).forEach(it => { c[it.sku] = (c[it.sku] || 0) + it.qty; }); return c;
  });
  const [orderNo, setOrderNo] = useState(initialOrder?.orderNo || '');
  const [customerName, setCustomerName] = useState(initialOrder?.customerName || '');
  const [customerMobile, setCustomerMobile] = useState(initialOrder?.customerMobile || '');
  // Mobile is hidden by default (most orders don't need it). It appears only when
  // the admin chooses to add one, or when editing an order that already has one.
  const [showMobile, setShowMobile] = useState(!!initialOrder?.customerMobile);
  const [devoteeId, setDevoteeId] = useState(initialOrder?.devoteeId || '');
  const [karyakarta, setKaryakarta] = useState(initialOrder?.karyakarta || '');
  const [karyakartaId, setKaryakartaId] = useState(initialOrder?.karyakartaId || '');
  const customerRef = useRef(null);
  const karyakartaRef = useRef(null);
  const mobileRef = useRef(null);
  const [delivered, setDelivered] = useState(initialOrder?.delivered || false);
  // Delivery date is hidden by default (most orders don't need one). It appears
  // only when the admin chooses to add it, or when editing an order that has one.
  const [deliveryDate, setDeliveryDate] = useState(initialOrder?.deliveryDate || '');
  const [showDeliveryDate, setShowDeliveryDate] = useState(!!initialOrder?.deliveryDate);
  const [paymentType, setPaymentType] = useState(initialOrder?.paymentType || '');
  const [remarks, setRemarks] = useState(initialOrder?.remarks || '');
  const [payEdited, setPayEdited] = useState(isEdit);
  const [paymentReceived, setPaymentReceived] = useState(initialOrder?.paymentReceived ?? 0);
  const [review, setReview] = useState(null); // {addAnother} while showing the confirm-order preview

  // Optional "split order" — one order holding several named recipients, each with
  // their own items (e.g. Order #43 via Ashvinbhai → Ketanbhai 500g, Atulbhai 1kg,
  // Nayanbhai 1kg). Default OFF: a plain single-customer order behaves exactly as
  // before. Each recipient is { key, name, mobile, devoteeId, cart }.
  const newRecipient = () => ({ key: Math.random().toString(36).slice(2, 9), name: '', mobile: '', devoteeId: '', cart: {} });
  const [split, setSplit] = useState(() => (initialOrder?.subOrders?.length || 0) > 0);
  const [recipients, setRecipients] = useState(() =>
    (initialOrder?.subOrders || []).map(so => {
      const c = {}; (so.items || []).forEach(it => { c[it.sku] = (c[it.sku] || 0) + it.qty; });
      return { key: Math.random().toString(36).slice(2, 9), name: so.name || '', mobile: so.mobile || '', devoteeId: so.devoteeId || '', cart: c };
    })
  );

  // Snapshot of the order's original items, so editing an order whose product was
  // later deactivated/deleted (missing from the active catalog) never drops those
  // lines — which previously left `items` empty and made "Review & save" silently
  // refuse (the "Add items" guard tripped even though the order had items).
  const origBySku = useMemo(() => {
    const m = {}; (initialOrder?.items || []).forEach(it => { m[it.sku] = it; }); return m;
  }, [initialOrder]);

  const cartToItems = (c) => Object.entries(c).filter(([, q]) => q > 0).map(([sku, qty]) => {
    const p = bySku[sku] || origBySku[sku];
    return p ? { sku, name: p.name, size: p.size, category: p.category, qty, unitPrice: p.unitPrice } : null;
  }).filter(Boolean);
  const mergeLines = (arr) => {
    const by = {}; const order = [];
    arr.forEach(it => { const k = it.sku + '|' + it.unitPrice; if (!by[k]) { by[k] = { ...it }; order.push(k); } else by[k].qty += it.qty; });
    return order.map(k => by[k]);
  };

  // Recipients that actually have items, shaped for the service (name + items[]).
  const subPayload = useMemo(() => recipients
    .map(so => ({ name: properName(so.name), mobile: String(so.mobile || '').replace(/\D/g, ''), devoteeId: so.devoteeId || '', items: cartToItems(so.cart) }))
    .filter(so => so.items.length > 0), [recipients, bySku, origBySku]);

  // The flattened aggregate every total/packing/stock reader works on.
  const items = useMemo(() => split ? mergeLines(subPayload.flatMap(s => s.items)) : cartToItems(cart),
    [split, subPayload, cart, bySku, origBySku]);
  const totals = useMemo(() => ghariService.computeTotals(items), [items]);
  const paid = payEdited ? Number(paymentReceived || 0) : totals.total;
  const balance = totals.total - paid;

  const setQty = (sku, qty) => setCart(c => ({ ...c, [sku]: qty }));
  const setRecipientQty = (key, sku, qty) => setRecipients(rs => rs.map(r => r.key === key ? { ...r, cart: { ...r.cart, [sku]: qty } } : r));
  const patchRecipient = (key, patch) => setRecipients(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  const addRecipient = () => setRecipients(rs => [...rs, newRecipient()]);
  const removeRecipient = (key) => setRecipients(rs => rs.filter(r => r.key !== key));
  // Turn splitting on: seed the first recipient from the current single cart (named
  // after the customer, if any). Turn it off: flatten all recipients back into the
  // single cart so nothing is lost.
  const enableSplit = () => {
    setRecipients(rs => rs.length ? rs : [{ ...newRecipient(), name: customerName || '', cart: { ...cart } }, newRecipient()]);
    setSplit(true);
  };
  const disableSplit = () => {
    const merged = {}; recipients.forEach(r => Object.entries(r.cart).forEach(([sku, q]) => { if (q > 0) merged[sku] = (merged[sku] || 0) + q; }));
    if (Object.keys(merged).length) setCart(c => { const n = { ...c }; Object.entries(merged).forEach(([sku, q]) => { n[sku] = (n[sku] || 0) + q; }); return n; });
    setSplit(false);
  };
  const reset = () => { setCart({}); setSplit(false); setRecipients([]); setOrderNo(''); setCustomerName(''); setCustomerMobile(''); setShowMobile(false); setDevoteeId(''); setKaryakarta(''); setKaryakartaId(''); setDelivered(false); setDeliveryDate(''); setShowDeliveryDate(false); setPaymentType(''); setRemarks(''); setPayEdited(false); setPaymentReceived(0); };

  // Review-before-save: validate, then show a preview so the user can confirm the
  // exact order (items hard to re-check by scrolling up past many product cards).
  const validate = () => {
    if (split) {
      if (!subPayload.length) { alertError('Add recipients', 'Please add at least one recipient with items.'); return false; }
      if (recipients.some(r => cartToItems(r.cart).length > 0 && !r.name.trim())) { alertError('Recipient name needed', 'Please name every recipient that has items.'); return false; }
      return true;
    }
    if (!items.length) { alertError('Add items', 'Please add at least one item to the order.'); return false; }
    if (!customerName.trim()) { alertError('Customer name needed', 'Please enter or pick a customer name.'); return false; }
    return true;
  };
  const requestSave = (addAnother) => { if (validate()) setReview({ addAnother }); };

  const save = (addAnother) => {
    if (!validate()) return;
    setReview(null);
    // In split mode the top name is an optional group label / reference; fall back to
    // the first recipient so the order is never nameless in lists and reports.
    const topName = properName(customerName) || (split ? (subPayload[0]?.name || 'Multiple recipients') : '');
    const order = ghariService.saveOrder({
      id: initialOrder?.id, season: initialOrder?.season,
      orderNo: String(orderNo || '').replace(/\D/g, ''),
      // Names are always stored in proper case, however they were typed.
      customerName: topName, customerMobile: String(customerMobile || '').replace(/\D/g, ''), devoteeId,
      karyakarta: properName(karyakarta), karyakartaId,
      subOrders: split ? subPayload : [],
      // The full editor's delivered toggle is all-or-nothing; keep the partial box
      // count in step with it (partial counts are set from the Delivery panel).
      items, delivered, deliveredBoxes: delivered ? totals.boxes : 0, deliveryDate,
      paymentReceived: paid, paymentType: paymentType || (paid > 0 ? 'Cash' : 'Pending'),
      remarks: remarks.trim(), status: initialOrder?.status || 'active',
    });
    onSaved?.(order, addAnother);
    // In the entry (embedded) form, clear and jump back to the top with the
    // customer field focused so the next order can be typed immediately.
    if (embedded) {
      reset();
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { window.scrollTo(0, 0); }
      setTimeout(() => { try { customerRef.current?.focus(); } catch { /* ignore */ } }, 60);
    }
  };

  return (
    <fieldset disabled={readOnly} className="space-y-2.5 m-0 min-w-0 border-0 p-0">
      {readOnly && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          👁️ View only — Sevaks can see orders but cannot edit or delete.
        </div>
      )}
      {/* People */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-[11px] font-black uppercase tracking-wide text-text-muted">{split ? 'Group / label (optional)' : 'Customer'}</label>
            <div className="flex items-center gap-1 rounded-lg border border-border-light bg-surface px-2 py-0.5" title="Order number — editable">
              <span className="text-[10px] font-black text-text-muted">#</span>
              <input inputMode="numeric" value={orderNo} data-no-clear="true"
                onChange={(e) => setOrderNo(e.target.value.replace(/\D/g, ''))}
                placeholder="Auto"
                className="w-12 bg-transparent text-xs font-black text-primary outline-none placeholder:font-semibold placeholder:text-text-muted" />
            </div>
          </div>
          <DevoteePicker value={customerName} placeholder={split ? 'e.g. a group / family label' : 'Search devotee or type name'}
            inputRef={customerRef} onCommit={() => karyakartaRef.current?.focus()}
            onText={(t) => { setCustomerName(t); setDevoteeId(''); }}
            onPick={(d) => { if (d) { setCustomerName(d.name); setDevoteeId(d.id); if (d.mobile) { setCustomerMobile(String(d.mobile)); setShowMobile(true); } } else { setCustomerName(''); setDevoteeId(''); setCustomerMobile(''); } }} />
          {showMobile ? (
            <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2 focus-within:border-primary">
              <Phone className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <input ref={mobileRef} inputMode="numeric" value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value.replace(/[^\d]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
                placeholder="Mobile (for WhatsApp follow-up)" maxLength={13}
                className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
              <button type="button" onClick={() => { setCustomerMobile(''); setShowMobile(false); }} title="Remove mobile" className="shrink-0 text-text-muted hover:text-text-main"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button type="button" onClick={() => { setShowMobile(true); setTimeout(() => { try { mobileRef.current?.focus(); } catch { /* ignore */ } }, 0); }}
              className="mt-1.5 flex items-center gap-1.5 rounded-xl border border-dashed border-border-light bg-surface px-3 py-1.5 text-[11px] font-bold text-text-muted hover:border-primary hover:text-primary">
              <Phone className="h-3.5 w-3.5" /> Add mobile number
            </button>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Karyakarta / Reference</label>
          <DevoteePicker value={karyakarta} icon={Users} accent="teal" placeholder="Who brought this order"
            inputRef={karyakartaRef} onCommit={() => mobileRef.current?.focus()}
            onText={(t) => { setKaryakarta(t); setKaryakartaId(''); }}
            onPick={(d) => { if (d) { setKaryakarta(d.name); setKaryakartaId(d.id); } else { setKaryakarta(''); setKaryakartaId(''); } }} />
        </div>
      </div>

      {/* Products */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="block text-[11px] font-black uppercase tracking-wide text-text-muted">{split ? 'Recipients — split order' : 'Items — tap to add'}</label>
          {products.length > 0 && !readOnly && (
            split ? (
              <button type="button" onClick={disableSplit} className="flex items-center gap-1 rounded-lg border border-border-light bg-surface px-2 py-1 text-[11px] font-bold text-text-muted hover:text-primary">
                <X className="h-3.5 w-3.5" /> Single customer
              </button>
            ) : (
              <button type="button" onClick={enableSplit} className="flex items-center gap-1 rounded-lg border border-dashed border-primary/50 bg-surface px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/5">
                <Users className="h-3.5 w-3.5" /> Split / add recipients
              </button>
            )
          )}
        </div>
        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-light bg-surface py-8 text-center">
            <Package className="mx-auto mb-2 h-9 w-9 text-text-muted" />
            <p className="text-sm font-bold text-text-muted">No items in the catalog</p>
            <button onClick={() => (onManageItems ? onManageItems() : ghariService.restoreDefaults())} className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white">Add items in Settings</button>
          </div>
        ) : split ? (
          <div className="space-y-2.5">
            {recipients.map((r, idx) => {
              const rTotals = ghariService.computeTotals(cartToItems(r.cart));
              return (
                <div key={r.key} className="rounded-2xl border border-border-light bg-surface p-2.5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-black text-primary">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <DevoteePicker value={r.name} placeholder="Recipient name"
                        onText={(t) => patchRecipient(r.key, { name: t, devoteeId: '' })}
                        onPick={(d) => { if (d) patchRecipient(r.key, { name: d.name, devoteeId: d.id, mobile: d.mobile ? String(d.mobile) : r.mobile }); else patchRecipient(r.key, { name: '', devoteeId: '' }); }} />
                    </div>
                    <button type="button" onClick={() => removeRecipient(r.key)} title="Remove recipient" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-500 dark:bg-rose-950 dark:border-rose-900"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                    {products.map(p => <ProductCard key={p.sku} product={p} qty={r.cart[p.sku] || 0} onChange={(q) => setRecipientQty(r.key, p.sku, q)} />)}
                  </div>
                  {rTotals.boxes > 0 && (
                    <div className="mt-2 text-right text-[12px] font-bold text-text-muted">{unitsText_(cartToItems(r.cart))} · <span className="text-text-main">{rupee(rTotals.total)}</span></div>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={addRecipient} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border-light bg-surface py-2.5 text-[12px] font-bold text-text-muted hover:border-primary hover:text-primary">
              <Plus className="h-4 w-4" /> Add recipient
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {products.map(p => <ProductCard key={p.sku} product={p} qty={cart[p.sku] || 0} onChange={(q) => setQty(p.sku, q)} />)}
          </div>
        )}
      </div>

      {/* Payment + delivery */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-2xl border border-border-light bg-surface p-3">
          <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-text-muted">Payment</label>
          <div className="mb-2.5 flex gap-1.5">
            {['Cash', 'G-Pay', 'Pending'].map(pt => (
              <button key={pt} onClick={() => { setPaymentType(pt); if (pt === 'Pending') { setPayEdited(true); setPaymentReceived(0); } else if (!payEdited || paid === 0) { setPayEdited(false); } }}
                className={`flex-1 rounded-xl border py-2 text-xs font-bold transition-colors ${paymentType === pt ? 'border-primary bg-primary text-white' : 'border-border-light bg-bg-base text-text-muted'}`}>{pt}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-text-muted">Received</span>
            <div className="flex flex-1 items-center gap-1 rounded-xl border border-border-light bg-bg-base px-2.5 py-1.5">
              <span className="text-sm font-black text-text-main">₹</span>
              <input inputMode="numeric" value={payEdited ? paymentReceived : totals.total}
                onChange={(e) => { setPayEdited(true); setPaymentReceived(e.target.value.replace(/[^\d]/g, '')); }}
                className="w-full bg-transparent text-right text-sm font-black text-text-main outline-none" />
            </div>
            <button onClick={() => { setPayEdited(false); }} title="Full amount"
              className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Full</button>
          </div>
          {balance > 0 && <p className="mt-1.5 text-[11px] font-bold text-rose-600">Balance due: {rupee(balance)}</p>}
        </div>
        <button onClick={() => setDelivered(d => !d)}
          className={`flex items-center justify-center gap-2.5 rounded-2xl border-2 p-3 text-sm font-black transition-all ${delivered ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'border-border-light bg-surface text-text-muted'}`}>
          <Truck className="h-5 w-5" />
          {delivered ? 'Delivered ✓' : 'Mark delivered'}
        </button>
      </div>

      {/* Delivery date — hidden by default; added only when the admin wants it.
          Two reminder emails (evening before + on the day, 8 PM) are sent for it. */}
      {showDeliveryDate ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2 focus-within:border-primary">
          <Calendar className="h-4 w-4 shrink-0 text-text-muted" />
          <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-text-muted">Delivery date</span>
          <input type="date" value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="w-full bg-transparent text-sm font-semibold text-text-main outline-none" />
          <button type="button" onClick={() => { setDeliveryDate(''); setShowDeliveryDate(false); }} title="Remove delivery date" className="shrink-0 text-text-muted hover:text-text-main"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => setShowDeliveryDate(true)}
          className="flex items-center gap-1.5 rounded-xl border border-dashed border-border-light bg-surface px-3 py-1.5 text-[11px] font-bold text-text-muted hover:border-primary hover:text-primary">
          <Calendar className="h-3.5 w-3.5" /> Add delivery date
        </button>
      )}

      <AutoTextarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (optional)" minRows={1}
        className="w-full rounded-2xl border border-border-light bg-surface px-3 py-2.5 text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted focus:border-primary" />

      {/* Category mini-breakdown */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.values(GHARI_CATEGORIES).map(c => totals.byCategory[c.key] > 0 && (
            <span key={c.key} className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: c.color }}>{c.short}: {rupee(totals.byCategory[c.key])}</span>
          ))}
        </div>
      )}

      {/* Sticky action bar — always pinned to the bottom so Save/Delete are never
          cut off. In the entry form it floats above the app's bottom nav; inside
          the full-screen editor (which covers the nav) it pins to bottom:0. */}
      {!readOnly && (
      <div className={`sticky z-20 ${embedded ? 'bottom-[76px] md:bottom-3' : 'bottom-0'} flex items-center gap-2 rounded-2xl border border-border-light bg-surface/95 p-2.5 shadow-lg backdrop-blur`}>
        <div className="pl-1">
          <div className="text-[10px] font-bold uppercase text-text-muted">{unitsText_(items)}</div>
          <div className="text-2xl font-black leading-none text-text-main">{rupee(totals.total)}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onDelete && <button onClick={onDelete} title="Delete order" className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 dark:bg-rose-950 dark:border-rose-900"><Trash2 className="h-4 w-4" /></button>}
          {onCancel && <button onClick={onCancel} className="rounded-xl border border-border-light px-3 py-2.5 text-sm font-bold text-text-muted">Cancel</button>}
          {!isEdit && <button onClick={() => requestSave(true)} className="rounded-xl border-2 border-primary px-3 py-2.5 text-sm font-black text-primary">Save & new</button>}
          <button onClick={() => requestSave(false)} className="rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-5 py-2.5 text-sm font-black text-white shadow-md active:scale-95">{isEdit ? 'Review & save' : 'Review & save'}</button>
        </div>
      </div>
      )}
      {/* Spacer so the last content clears the sticky bar + bottom nav */}
      {embedded && <div className="h-4" />}

      {/* Confirm-order preview — one place to check everything before saving. */}
      {review && createPortal(
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setReview(null)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-black text-text-main"><ShoppingCart className="h-4 w-4 text-primary" /> Confirm order</h3>
              <button onClick={() => setReview(null)} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
              <div className="rounded-2xl bg-bg-base px-3 py-2">
                <p className="text-sm font-black text-text-main">{customerName || (split ? `${subPayload.length} recipients` : '(no name)')}</p>
                <p className="text-[11px] font-semibold text-text-muted">{[customerMobile && `📱 ${customerMobile}`, karyakarta && `via ${karyakarta}`].filter(Boolean).join(' · ') || 'No mobile / karyakarta'}</p>
              </div>
              {split ? (
                <div className="space-y-2">
                  {subPayload.map((so, i) => {
                    const st = ghariService.computeTotals(so.items);
                    return (
                      <div key={i} className="overflow-hidden rounded-2xl border border-border-light">
                        <div className="flex items-center justify-between gap-2 bg-bg-base px-3 py-1.5">
                          <span className="truncate text-[12px] font-black text-text-main">{i + 1}. {so.name}</span>
                          <span className="shrink-0 text-[11px] font-bold text-text-muted">{unitsText_(so.items)} · {rupee(st.total)}</span>
                        </div>
                        {so.items.map(it => (
                          <div key={it.sku} className="flex items-center justify-between gap-2 border-t border-border-light px-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-text-main">{it.name.replace('Ghari ', '')} <span className="text-text-muted">{it.size}</span></span>
                            <span className="shrink-0 text-right">
                              <span className="block text-[12px] font-semibold text-text-muted">{it.qty} × {rupee(it.unitPrice)}</span>
                              {ghariService.sizeKg(it.size) > 0 && <span className="block text-[11px] font-bold text-primary">{fmtKg(it.qty * ghariService.sizeKg(it.size))} kg</span>}
                            </span>
                            <span className="shrink-0 w-20 text-right text-[13px] font-black text-text-main">{rupee(it.qty * it.unitPrice)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border-light">
                  {items.map(it => (
                    <div key={it.sku} className="flex items-center justify-between gap-2 border-b border-border-light px-3 py-2 last:border-0">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-text-main">{it.name.replace('Ghari ', '')} <span className="text-text-muted">{it.size}</span></span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[12px] font-semibold text-text-muted">{it.qty} × {rupee(it.unitPrice)}</span>
                        {ghariService.sizeKg(it.size) > 0 && <span className="block text-[11px] font-bold text-primary">{fmtKg(it.qty * ghariService.sizeKg(it.size))} kg</span>}
                      </span>
                      <span className="shrink-0 w-20 text-right text-[13px] font-black text-text-main">{rupee(it.qty * it.unitPrice)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {Object.values(GHARI_CATEGORIES).map(c => totals.byCategory[c.key] > 0 && (
                  <span key={c.key} className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: c.color }}>{c.short}: {rupee(totals.byCategory[c.key])}</span>
                ))}
              </div>
              <div className="space-y-1 rounded-2xl bg-bg-base px-3 py-2.5 text-sm">
                <div className="flex justify-between"><span className="font-semibold text-text-muted">{unitsText_(items)} · Total</span><span className="font-black text-text-main">{rupee(totals.total)}</span></div>
                <div className="flex justify-between"><span className="font-semibold text-text-muted">Payment · {paymentType || (paid > 0 ? 'Cash' : 'Pending')}</span><span className="font-bold text-emerald-600">{rupee(paid)} received</span></div>
                {balance > 0 && <div className="flex justify-between"><span className="font-semibold text-rose-600">Balance due</span><span className="font-black text-rose-600">{rupee(balance)}</span></div>}
                <div className="flex justify-between"><span className="font-semibold text-text-muted">Delivery</span><span className="font-bold text-text-main">{delivered ? 'Delivered ✓' : 'Not yet'}</span></div>
                {deliveryDate && <div className="flex justify-between"><span className="font-semibold text-text-muted">Delivery date</span><span className="font-bold text-text-main">{deliveryDate}</span></div>}
                {remarks.trim() && <div className="pt-1 text-[12px] text-text-muted">📝 {remarks.trim()}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border-light p-3">
              <button onClick={() => setReview(null)} className="flex-1 rounded-xl border border-border-light py-2.5 text-sm font-bold text-text-muted">Edit order</button>
              <button onClick={() => save(review.addAnother)} className="flex-[1.4] rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] py-2.5 text-sm font-black text-white shadow-md active:scale-95">Confirm &amp; save {rupee(totals.total)}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </fieldset>
  );
}

// A compact control to set/clear a planned delivery date inline (no full editor).
// Shows the date once set; tapping opens a native date picker. Used per-order and
// per-karyakarta (bulk). Delivery-only write, allowed for any viewer.
function DeliveryDateButton({ value, onPick, title, setLabel = 'Set date', emphasise = false }) {
  const date = value || '';
  const label = date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : setLabel;
  return (
    <div className={`relative flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2 text-[11px] font-black ${date
      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
      : emphasise
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-border-light bg-surface text-text-muted'}`}>
      {date ? <Calendar className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />}
      {label && <span>{label}</span>}
      {/* Transparent native date input overlaid on the whole chip: a tap lands on
          it directly, so the OS date picker opens reliably (incl. Android WebView). */}
      <input type="date" value={date}
        title={title || (date ? `Delivery date: ${date} — tap to change` : 'Set delivery date')}
        onChange={(e) => onPick(e.target.value)}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* native focus still opens it */ } }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </div>
  );
}

// One karyakarta's undelivered orders, grouped for the delivery-planning flow:
// a header that sets ONE date for the whole group (call them, stamp all orders),
// with each order still settable on its own below. Collapsible.
function KaryakartaDeliveryGroup({ season, groupKey, name, orders, onOpen }) {
  const [open, setOpen] = useState(true);
  // Delivery-planning view: only the undelivered orders (the ones still needing a
  // date). Delivered orders are done and not shown here.
  const undelivered = orders.filter(o => !o.delivered);
  if (undelivered.length === 0) return null;
  // Shared date shown on the header: the common date if every undelivered order
  // already shares one, otherwise blank (mixed / none).
  const dates = new Set(undelivered.map(o => (o.deliveryDate || '').trim()));
  const shared = dates.size === 1 ? [...dates][0] : '';
  let ghariKg = 0, bhusuKg = 0;
  undelivered.forEach(o => { const k = ghariService.orderKg(o); ghariKg += k.ghariKg; bhusuKg += k.bhusuKg; });
  return (
    <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
      <div className="flex items-center gap-2 border-b border-border-light bg-bg-base px-3 py-2.5">
        <button onClick={() => setOpen(o => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-text-main">{name || '(no karyakarta)'}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black">
              <span className="text-text-muted">{undelivered.length} to deliver</span>
              {ghariKg > 0 && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(ghariKg)} kg</span>}
              {bhusuKg > 0 && <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-950 dark:text-purple-300">{fmtKg(bhusuKg)} kg Bhusu</span>}
            </div>
          </div>
        </button>
        <DeliveryDateButton value={shared} emphasise setLabel="Set for all"
          title={shared ? `All ${undelivered.length} undelivered orders: ${shared} — tap to change` : `Set one delivery date for all ${undelivered.length} undelivered orders`}
          onPick={(d) => ghariService.setDeliveryDateForKaryakarta(season, groupKey, d)} />
      </div>
      {open && (
        <div>
          {undelivered.map(o => <OrderRow key={o.id} order={o} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

// A readable label for a delivery date — "Today" / "Tomorrow" / "Wed, 22 Oct".
function deliveryDateLabel_(iso) {
  if (!iso) return 'No delivery date';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  const nice = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
  if (diff === 0) return `Today · ${nice}`;
  if (diff === 1) return `Tomorrow · ${nice}`;
  if (diff === -1) return `Yesterday · ${nice}`;
  return nice;
}

// Group a list of orders by karyakarta (stable key), sorted by name. Direct-to-
// devotee orders (no karyakarta) fall into a "Direct" bucket shown last.
function groupByKaryakarta_(list) {
  const map = new Map();
  list.forEach(o => {
    const key = ghariService.orderKaryakartaKey(o);
    if (!map.has(key)) map.set(key, { key, name: (o.karyakarta || '').trim() || 'Direct (no karyakarta)', orders: [] });
    map.get(key).orders.push(o);
  });
  return [...map.values()].sort((a, b) => {
    const da = a.name.startsWith('Direct'), db = b.name.startsWith('Direct');
    if (da !== db) return da ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

// One karyakarta's orders within a delivery date — collapsed by default, tap to
// expand its orders. Shows a Ghari-kg summary so the load is visible when closed.
function KaryakartaSubGroup({ group, onOpen }) {
  const [open, setOpen] = useState(false);
  let gKg = 0; group.orders.forEach(o => { gKg += ghariService.orderKg(o).ghariKg; });
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-1.5 bg-bg-base px-3 py-2 text-left">
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
        <Users className="h-3 w-3 shrink-0 text-teal-600" />
        <span className="truncate text-[11px] font-black text-teal-700 dark:text-teal-300">{group.name}</span>
        <span className="text-[10px] font-bold text-text-muted">· {group.orders.length} order{group.orders.length === 1 ? '' : 's'}</span>
        {gKg > 0 && <span className="ml-auto shrink-0 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-black text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(gKg)} kg</span>}
      </button>
      {open && group.orders.map(o => <OrderRow key={o.id} order={o} onOpen={onOpen} />)}
    </div>
  );
}

// Delivery-planning overview: a date-wise bar chart of how many undelivered orders
// are due on each date (soonest first), plus a "No delivery date" bucket for orders
// still unscheduled. Each bar expands to the orders due that day. Collapsible.
function DeliverySchedule({ season, orders, onOpen }) {
  const [open, setOpen] = useState(false);
  const [openDate, setOpenDate] = useState(null);
  const groups = useMemo(() => {
    const dated = new Map(); // iso -> orders[]
    const undated = [];
    orders.forEach(o => {
      if (o.delivered) return;
      const d = (o.deliveryDate || '').trim();
      if (d) { if (!dated.has(d)) dated.set(d, []); dated.get(d).push(o); }
      else undated.push(o);
    });
    const rows = [...dated.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
      .map(([iso, list]) => ({ key: iso, iso, label: deliveryDateLabel_(iso), orders: list }));
    if (undated.length) rows.push({ key: '__none__', iso: '', label: 'No delivery date', orders: undated });
    return rows;
  }, [orders]);

  const totalPending = groups.reduce((s, g) => s + g.orders.length, 0);
  const scheduled = groups.filter(g => g.iso).reduce((s, g) => s + g.orders.length, 0);
  const undatedCount = totalPending - scheduled;
  const maxCount = Math.max(1, ...groups.map(g => g.orders.length));
  if (totalPending === 0) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-border-light bg-surface">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 text-sm font-black text-text-main">Delivery schedule</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">{scheduled} scheduled</span>
        {undatedCount > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:bg-amber-950 dark:text-amber-300">{undatedCount} no date</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="border-t border-border-light p-3">
          <div className="space-y-1.5">
            {groups.map(g => {
              const isNone = !g.iso;
              const expanded = openDate === g.key;
              const pct = Math.round((g.orders.length / maxCount) * 100);
              let gKg = 0; g.orders.forEach(o => { gKg += ghariService.orderKg(o).ghariKg; });
              return (
                <div key={g.key} className="rounded-xl border border-border-light">
                  <button onClick={() => setOpenDate(expanded ? null : g.key)}
                    className={`flex w-full items-center gap-2 px-2.5 py-2 text-left ${isNone ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${expanded ? '' : '-rotate-90'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-[12px] font-black ${isNone ? 'text-amber-700 dark:text-amber-300' : 'text-text-main'}`}>{g.label}</span>
                        <span className="shrink-0 text-[12px] font-black text-text-main">{g.orders.length} order{g.orders.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg-base">
                        <div className={`h-full rounded-full ${isNone ? 'bg-amber-400' : 'bg-gradient-to-r from-[#FF9D52] to-[#E56F18]'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {gKg > 0 && <span className="shrink-0 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-black text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(gKg)} kg</span>}
                  </button>
                  {expanded && (
                    <div className="border-t border-border-light">
                      {groupByKaryakarta_(g.orders).map(kk => (
                        <KaryakartaSubGroup key={kk.key} group={kk} onOpen={onOpen} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Order row (list) ─────────────────────────────────
function OrderRow({ order, onOpen }) {
  const bal = order.total - Number(order.paymentReceived || 0);
  const paidState = Number(order.paymentReceived || 0) <= 0 ? 'unpaid' : bal > 0 ? 'partial' : 'paid';
  const summary = order.items.map(i => `${i.qty}× ${i.name.replace('Ghari ', '')} ${i.size}`).join(', ');
  const kg = ghariService.orderKg(order);
  const wa = ghariService.whatsappLink(order);
  // LIGHT status cards, colour-blind friendly: a soft tinted background + a BOLD
  // saturated left accent bar + a clear text label, so the three states are easy to
  // tell apart by the bar & label, not by a faint background hue — and never by red.
  //   not delivered        → amber  (still to deliver)
  //   delivered, not paid  → blue   (delivered, payment pending)
  //   delivered & paid     → green  (done)
  const status = !order.delivered ? 'pending' : paidState === 'paid' ? 'paid' : 'unpaid';
  const THEME = {
    pending: { bar: '#F59E0B', bg: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20' },
    unpaid:  { bar: '#0EA5E9', bg: 'bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/10 dark:hover:bg-sky-500/20' },
    paid:    { bar: '#10B981', bg: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20' },
  }[status];
  return (
    <div className={`flex items-center gap-2 border-b border-border-light px-3 py-3 transition-colors last:border-0 ${THEME.bg}`}
      style={{ borderLeft: `5px solid ${THEME.bar}` }}>
      <button onClick={() => onOpen(order)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {order.orderNo && (
              <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-black text-primary">#{order.orderNo}</span>
            )}
            <span className="truncate text-sm font-extrabold text-text-main">{order.customerName || '(no name)'}</span>
            {order.subOrders?.length > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-black text-primary"><Users className="h-2.5 w-2.5" />{order.subOrders.length}</span>
            )}
            {order.delivered ? (
              <Truck className="h-3.5 w-3.5 shrink-0" style={{ color: THEME.bar }} />
            ) : Number(order.deliveredBoxes || 0) > 0 && (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                {order.deliveredBoxes}/{order.totalBoxes ?? order.items.reduce((s, i) => s + Number(i.qty || 0), 0)}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-text-muted">{summary}</div>
          {(kg.ghariKg > 0 || kg.bhusuKg > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px] font-black">
              {kg.ghariKg > 0 && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(kg.ghariKg)} kg Ghari</span>}
              {kg.bhusuKg > 0 && <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-950 dark:text-purple-300">{fmtKg(kg.bhusuKg)} kg Bhusu</span>}
            </div>
          )}
          <div className="flex flex-wrap gap-x-2 text-[10px] font-semibold">
            {order.karyakarta && <span className="truncate text-teal-600">via {order.karyakarta}</span>}
            {order.createdBy && <span className="truncate text-text-muted">· by {String(order.createdBy).replace(/\s*\(.*\)$/, '')}</span>}
          </div>
        </div>
      </button>
      <div className="shrink-0 text-right">
        <div className="text-sm font-black text-text-main">{rupee(order.total)}</div>
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${
          paidState === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : paidState === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
          : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'}`}>
          {paidState === 'paid' ? `Paid${order.paymentType ? ' · ' + order.paymentType : ''}` : paidState === 'partial' ? `Due ${rupee(bal)}` : 'Unpaid'}
        </span>
      </div>
      {!order.delivered && (
        <DeliveryDateButton value={order.deliveryDate || ''} setLabel=""
          onPick={(d) => ghariService.setDeliveryDate(order.id, d)} />
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp follow-up"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 active:scale-95">
          <MessageCircle className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

// ───────────────────────── Report view ──────────────────────────────────────
function StatTile({ label, value, sub, color = '#E56F18', icon: Icon }) {
  return (
    <div className="rounded-2xl border border-border-light bg-surface p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
        {Icon && <Icon className="h-3.5 w-3.5" style={{ color }} />}{label}
      </div>
      <div className="mt-1 text-xl font-black text-text-main">{value}</div>
      {sub && <div className="text-[11px] font-semibold text-text-muted">{sub}</div>}
    </div>
  );
}
// Compact, scannable karyakarta row (works even with dozens of people); tap to
// expand the FULL order list (every customer + what they ordered + ₹/balance),
// and export just this karyakarta to PDF / Excel.
function KaryakartaCard({ name, d, season, cardKey }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const due = d.amount - d.received;
  // Load this karyakarta's actual orders only when expanded (newest first).
  const orders = useMemo(
    () => (open ? ghariService.ordersByKaryakarta(season, [cardKey]).slice().sort((a, b) => (Number(b.orderNo) || 0) - (Number(a.orderNo) || 0)) : []),
    [open, season, cardKey]
  );
  const exportOne = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'pdf') await ghariService.exportKaryakartaPdf(season, [cardKey], name);
      else await ghariService.exportKaryakartaXlsx(season, [cardKey], name);
    } catch (e) { alertError('Export failed', e.message); }
    finally { setBusy(''); }
  };
  return (
    <div className="overflow-hidden rounded-xl border border-border-light bg-bg-base">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 p-2.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-black text-text-main">{name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {d.ghariKg > 0 && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: '#EA580C' }}>Ghari {fmtKg(d.ghariKg)} kg</span>}
            {d.bhusuKg > 0 && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: '#9333EA' }}>Bhusu {fmtKg(d.bhusuKg)} kg</span>}
            <span className="text-[10px] font-semibold text-text-muted">{d.orders} order{d.orders === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-black text-text-main">{rupee(d.amount)}</div>
          <div className={`text-[10px] font-bold ${due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{due > 0 ? `${rupee(due)} due` : 'Paid ✓'}</div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border-light px-2.5 py-2">
          {/* Every order for this karyakarta — customer name + items + ₹ + balance. */}
          <div className="divide-y divide-border-light">
            {orders.map(o => {
              const bal = Number(o.total || 0) - Number(o.paymentReceived || 0);
              const items = (o.items || []).map(i => `${i.qty}× ${i.name.replace('Ghari ', '').replace(/[()]/g, '')} ${i.size}`).join(', ');
              return (
                <div key={o.id} className="flex items-start gap-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {o.orderNo && <span className="shrink-0 rounded bg-surface px-1 font-mono text-[9px] font-black text-text-muted">#{o.orderNo}</span>}
                      <span className="truncate text-[12px] font-bold text-text-main">{o.customerName || '(no name)'}</span>
                      {o.delivered && <Truck className="h-3 w-3 shrink-0 text-emerald-500" />}
                    </div>
                    <div className="truncate text-[10px] text-text-muted">{items}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[12px] font-black text-text-main">{rupee(o.total)}</div>
                    {bal > 0 && <div className="text-[9px] font-bold text-rose-600">{rupee(bal)} due</div>}
                  </div>
                </div>
              );
            })}
            {orders.length === 0 && <p className="py-2 text-[11px] text-text-muted">No orders.</p>}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-border-light pt-2">
            <span className="flex-1 text-[10px] font-semibold text-text-muted">Received {rupee(d.received)} of {rupee(d.amount)}</span>
            <button onClick={() => exportOne('pdf')} disabled={!!busy}
              className="flex items-center gap-1 rounded-lg bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-2.5 py-1 text-[10px] font-black text-white shadow-sm disabled:opacity-50">
              <Download className="h-3 w-3" /> {busy === 'pdf' ? '…' : 'PDF'}
            </button>
            <button onClick={() => exportOne('xlsx')} disabled={!!busy}
              className="flex items-center gap-1 rounded-lg border-2 border-primary bg-primary/5 px-2.5 py-1 text-[10px] font-black text-primary disabled:opacity-50">
              <Download className="h-3 w-3" /> {busy === 'xlsx' ? '…' : 'Excel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// One row in "Boxes to prepare" — tap to reveal which customers need those boxes
// (and how many each), so the packing team can split a batch by customer.
function BoxItemRow({ product, qty, customers }) {
  const [open, setOpen] = useState(false);
  const custList = useMemo(
    () => Object.entries(customers || {}).sort((a, b) => b[1] - a[1]),
    [customers]
  );
  const name = product.name.replace('Ghari ', '').replace(/[()]/g, '');
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-bg-base">
        <span className="flex items-center gap-1.5 text-sm font-bold text-text-main">
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
          {name} <span className="rounded bg-bg-base px-1.5 py-0.5 text-[10px] font-black text-text-muted">{product.size}</span>
        </span>
        <span className="shrink-0 font-black text-text-main"><span className="text-lg">{qty}</span> <span className="text-[11px] font-bold text-text-muted">{unitWord_(product.category, qty)}</span></span>
      </button>
      {open && (
        <div className="border-t border-border-light bg-bg-base/50 px-3 py-2">
          {custList.length === 0 ? (
            <p className="text-[11px] text-text-muted">No customer breakdown.</p>
          ) : (
            <div className="space-y-1">
              {custList.map(([cust, q]) => (
                <div key={cust} className="flex items-center justify-between text-[11px]">
                  <span className="truncate font-semibold text-text-main">{cust}</span>
                  <span className="shrink-0 font-black text-text-muted">{q} {unitWord_(product.category, q)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Pick one or more karyakartas, then export just their orders to PDF / Excel —
// so (e.g.) an out-of-town team can get a shareable list of the devotees those
// karyakartas took Ghari orders from, and follow up.
function KaryakartaExportModal({ season, onClose }) {
  const people = useMemo(() => ghariService.karyakartaList(season), [season]);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? people.filter(p => p.name.toLowerCase().includes(t)) : people;
  }, [people, q]);
  const toggle = (key) => setPicked(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const allShownPicked = shown.length > 0 && shown.every(p => picked.has(p.key));
  const toggleAll = () => setPicked(prev => {
    const n = new Set(prev);
    if (allShownPicked) shown.forEach(p => n.delete(p.key)); else shown.forEach(p => n.add(p.key));
    return n;
  });
  const keys = [...picked];
  const label = keys.length === 1 ? (people.find(p => p.key === keys[0])?.name || '') : `${keys.length}_karyakartas`;
  const doExport = async (kind) => {
    if (!keys.length) { alertError('Pick karyakartas', 'Select at least one karyakarta to export.'); return; }
    setBusy(kind);
    try {
      if (kind === 'pdf') await ghariService.exportKaryakartaPdf(season, keys, label);
      else await ghariService.exportKaryakartaXlsx(season, keys, label);
    } catch (e) { alertError('Export failed', e.message); }
    finally { setBusy(''); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-text-main"><Users className="h-4 w-4 text-primary" /> Export by karyakarta</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b border-border-light p-3">
          <div className="flex items-center gap-2 rounded-xl border border-border-light bg-bg-base px-3 py-2">
            <Search className="h-4 w-4 text-text-muted" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search karyakarta…" className="w-full bg-transparent text-sm font-semibold text-text-main outline-none" />
            {q && <button onClick={() => setQ('')}><X className="h-4 w-4 text-text-muted" /></button>}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button onClick={toggleAll} className="text-[11px] font-black text-primary">{allShownPicked ? 'Clear all' : 'Select all'}</button>
            <span className="text-[11px] font-bold text-text-muted">{picked.size} selected</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {shown.length === 0 && <p className="py-8 text-center text-xs text-text-muted">No karyakartas{q ? ` match “${q}”` : ' yet'}.</p>}
          {shown.map(p => {
            const on = picked.has(p.key);
            return (
              <button key={p.key} onClick={() => toggle(p.key)}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${on ? 'border-primary bg-primary/5' : 'border-border-light bg-surface'}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-primary bg-primary text-white' : 'border-border-light'}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-text-main">{p.name}</span>
                  <span className="block truncate text-[11px] font-semibold text-text-muted">{p.orders} order{p.orders === 1 ? '' : 's'} · {fmtKg(p.ghariKg)} kg Ghari{p.bhusuKg > 0 ? ` · ${fmtKg(p.bhusuKg)} kg Bhusu` : ''} · {rupee(p.amount)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-border-light p-3">
          <button onClick={() => doExport('pdf')} disabled={!!busy || !picked.size}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] py-2.5 text-sm font-black text-white shadow-md disabled:opacity-50">
            <Download className="h-4 w-4" /> {busy === 'pdf' ? 'Preparing…' : 'PDF'}
          </button>
          <button onClick={() => doExport('xlsx')} disabled={!!busy || !picked.size}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-primary bg-primary/5 py-2.5 text-sm font-black text-primary disabled:opacity-50">
            <Download className="h-4 w-4" /> {busy === 'xlsx' ? 'Preparing…' : 'Excel'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Stock reconciliation in KG — collapsed to just Ghari vs Bhusu (bought/sold/left),
// each expandable to its breakdown: Ghari → With Ghee / Without Ghee / Sugar Free,
// Bhusu → by size. Kept simple so the big picture reads at a glance.
function StockReconCard({ r }) {
  const [open, setOpen] = useState({});
  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const prods = ghariService.getProducts();
  const bySkuProd = {}; prods.forEach(p => { bySkuProd[p.sku] = p; });
  const skus = new Set([...Object.keys(r.purchased || {}), ...Object.keys(r.bySku || {})]);
  const catOrder = Object.keys(GHARI_CATEGORIES);

  const ghariByName = {}; const bhusuBySize = {};
  const gT = { b: 0, s: 0 }, bT = { b: 0, s: 0 };
  skus.forEach(sku => {
    const p = bySkuProd[sku] || { name: sku, size: '', category: 'ghee' };
    const boughtBoxes = Number(r.purchased?.[sku]) || 0;
    const soldBoxes = Number(r.bySku?.[sku]?.qty) || 0;
    if (!boughtBoxes && !soldBoxes) return;
    const kgPer = sizeKg_(p.size);
    const bKg = boughtBoxes * kgPer, sKg = soldBoxes * kgPer;
    if (p.category === 'bhusu') {
      bT.b += bKg; bT.s += sKg;
      const g = bhusuBySize[p.size] || (bhusuBySize[p.size] = { label: p.size || '—', sort: kgPer, b: 0, s: 0 });
      g.b += bKg; g.s += sKg;
    } else {
      gT.b += bKg; gT.s += sKg;
      const g = ghariByName[p.name] || (ghariByName[p.name] = { label: cleanName_(p.name), sort: catOrder.indexOf(p.category), b: 0, s: 0 });
      g.b += bKg; g.s += sKg;
    }
  });
  const ghariChildren = Object.values(ghariByName).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  const bhusuChildren = Object.values(bhusuBySize).sort((a, b) => a.sort - b.sort);
  const hasGhari = gT.b || gT.s, hasBhusu = bT.b || bT.s;
  if (!hasGhari && !hasBhusu) return null;
  const grand = { b: gT.b + bT.b, s: gT.s + bT.s };

  const kgVal = (n) => <>{fmtKg(n)}<span className="text-[9px] font-semibold text-text-muted">kg</span></>;
  const cells = (b, s, strong) => {
    const left = b - s;
    return (
      <>
        <span className={`w-16 shrink-0 text-right ${strong ? 'font-black' : 'font-bold'} text-emerald-600`}>{kgVal(b)}</span>
        <span className={`w-16 shrink-0 text-right ${strong ? 'font-black' : 'font-bold'} text-rose-600`}>{kgVal(s)}</span>
        <span className={`w-16 shrink-0 text-right font-black ${left < -0.05 ? 'text-red-600' : Math.abs(left) < 0.05 ? 'text-amber-600' : 'text-text-main'}`}>{kgVal(left)}</span>
      </>
    );
  };
  const group = (k, label, total, color, children, childWord) => {
    const isOpen = !!open[k];
    return (
      <div className="overflow-hidden rounded-xl border border-border-light">
        <button onClick={() => toggle(k)} className="flex w-full items-center gap-1 px-2.5 py-2 text-left">
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className="min-w-0 flex-1 truncate text-sm font-black" style={{ color }}>{label}</span>
          {cells(total.b, total.s, true)}
        </button>
        {isOpen && (
          <div className="border-t border-border-light bg-bg-base/50 px-2.5 py-1.5">
            {children.length ? children.map((c, i) => (
              <div key={i} className="flex items-center gap-1 py-0.5 text-[11px]">
                <span className="min-w-0 flex-1 truncate pl-5 font-semibold text-text-muted">{c.label}</span>
                {cells(c.b, c.s)}
              </div>
            )) : <p className="pl-5 text-[11px] text-text-muted">No {childWord}.</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-border-light bg-surface p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-black text-text-main"><BarChart3 className="h-4 w-4 text-primary" /> Stock — bought vs sold <span className="font-bold text-text-muted">(kg)</span></h3>
      <div className="flex items-center gap-1 border-b border-border-light pb-1 pl-8 text-[9px] font-black uppercase tracking-wide text-text-muted">
        <span className="min-w-0 flex-1">Item</span>
        <span className="w-16 shrink-0 text-right">Bought</span>
        <span className="w-16 shrink-0 text-right">Sold</span>
        <span className="w-16 shrink-0 text-right">Left</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {hasGhari ? group('ghari', 'Ghari', gT, '#EA580C', ghariChildren, 'Ghari items') : null}
        {hasBhusu ? group('bhusu', 'Bhusu', bT, '#9333EA', bhusuChildren, 'Bhusu sizes') : null}
      </div>
      <div className="mt-1.5 flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs text-white">
        <span className="min-w-0 flex-1 truncate font-black">TOTAL</span>
        <span className="w-16 shrink-0 text-right font-black">{fmtKg(grand.b)}<span className="text-[9px] font-semibold text-white/70">kg</span></span>
        <span className="w-16 shrink-0 text-right font-black">{fmtKg(grand.s)}<span className="text-[9px] font-semibold text-white/70">kg</span></span>
        <span className="w-16 shrink-0 text-right font-black">{fmtKg(grand.b - grand.s)}<span className="text-[9px] font-semibold text-white/70">kg</span></span>
      </div>
      <p className="mt-2 text-[10px] font-semibold text-text-muted">All in kg · Bought = purchased · Sold = ordered · Left = bought − sold. Tap Ghari / Bhusu for the breakdown.{r.purchaseCost > 0 ? ` · Margin ${rupee(r.revenue - r.purchaseCost)}` : ''}</p>
    </div>
  );
}

function ReportView({ season }) {
  const r = useMemo(() => ghariService.buildReport(season), [season]);
  const [exportKk, setExportKk] = useState(false);
  // The two big lists collapse so the report isn't a long scroll (default open).
  const [openKk, setOpenKk] = useState(true);
  const [openCust, setOpenCust] = useState(true);
  const kkList = Object.entries(r.byKaryakarta).sort((a, b) => b[1].amount - a[1].amount);
  const custList = useMemo(() => Object.values(r.byCustomer || {}).sort((a, b) => b.amount - a.amount), [r]);
  const [custQ, setCustQ] = useState('');
  const custShown = useMemo(() => {
    const q = custQ.trim().toLowerCase();
    return q ? custList.filter(c => c.name.toLowerCase().includes(q) || String(c.karyakarta || '').toLowerCase().includes(q)) : custList;
  }, [custList, custQ]);
  const kg1 = (n) => (+(n || 0).toFixed(1)).toLocaleString('en-IN');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Revenue" value={rupee(r.revenue)} sub={`${r.orderCount} orders`} icon={Wallet} />
        <StatTile label="Received" value={rupee(r.received)} color="#0D9488" icon={Check} />
        <StatTile label="Outstanding" value={rupee(r.outstanding)} sub="to collect" color="#EA580C" icon={Wallet} />
        <StatTile label="Delivery" value={`${r.delivered}/${r.orderCount}`} sub={`${r.pending} pending`} color="#2563EB" icon={Truck} />
        <StatTile label="Cash" value={rupee(r.cash)} color="#16A34A" />
        <StatTile label="G-Pay" value={rupee(r.gpay)} color="#2563EB" />
        <StatTile label="Unpaid" value={rupee(r.unpaid)} color="#E11D48" />
      </div>

      {/* At a glance — derived ratios (read-only) so the key insights are one tap away. */}
      {/* Stock — bought vs sold vs left: detailed per size/product + Ghari/Bhusu + total. */}
      <StockReconCard r={r} />

      {/* Weight sold — the quick answer to "how many kg of Ghari / Bhusu did we sell?" */}
      {r.totalKg > 0 && (
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <h3 className="mb-3 text-sm font-black text-text-main">Weight sold</h3>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl p-3 text-center" style={{ background: tint('#EA580C', 0.12) }}>
              <div className="text-2xl font-black text-text-main">{(+r.ghariKg.toFixed(1)).toLocaleString('en-IN')}<span className="text-sm font-bold text-text-muted"> kg</span></div>
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#EA580C' }}>Ghari</div>
            </div>
            <div className="rounded-2xl p-3 text-center" style={{ background: tint('#9333EA', 0.12) }}>
              <div className="text-2xl font-black text-text-main">{(+r.bhusuKg.toFixed(1)).toLocaleString('en-IN')}<span className="text-sm font-bold text-text-muted"> kg</span></div>
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#9333EA' }}>Bhusu</div>
            </div>
            <div className="rounded-2xl p-3 text-center" style={{ background: tint('#0D9488', 0.12) }}>
              <div className="text-2xl font-black text-text-main">{(+r.totalKg.toFixed(1)).toLocaleString('en-IN')}<span className="text-sm font-bold text-text-muted"> kg</span></div>
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#0D9488' }}>Total</div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.values(GHARI_CATEGORIES).map(c => r.kgByCategory[c.key] > 0 && (
              <span key={c.key} className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: c.color }}>{c.short}: {(+r.kgByCategory[c.key].toFixed(1)).toLocaleString('en-IN')} kg</span>
            ))}
          </div>
        </div>
      )}

      {/* Boxes to prepare — the operational packing list: which item + how many
          boxes. No ₹ here (money lives in the tiles above). */}
      <div className="rounded-2xl border border-border-light bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-black text-text-main">Boxes to prepare</h3>
          <span className="text-[11px] font-bold text-text-muted">{(() => { const s = ghariService.getProducts().reduce((a, p) => { const q = r.bySku[p.sku]?.qty || 0; if (p.category === 'bhusu') a.pkt += q; else a.box += q; return a; }, { box: 0, pkt: 0 }); return [s.box ? `${s.box} boxes` : '', s.pkt ? `${s.pkt} packets` : ''].filter(Boolean).join(' · ') || '0'; })()} total</span>
        </div>
        <div className="space-y-2.5">
          {Object.values(GHARI_CATEGORIES).map(c => {
            const items = ghariService.getProducts().filter(p => p.category === c.key).map(p => ({ p, d: r.bySku[p.sku] })).filter(x => x.d && x.d.qty > 0);
            if (!items.length) return null;
            const catBoxes = items.reduce((s, x) => s + x.d.qty, 0);
            return (
              <div key={c.key} className="overflow-hidden rounded-xl border" style={{ borderColor: tint(c.color, 0.4) }}>
                <div className="flex items-center justify-between px-3 py-1.5" style={{ background: tint(c.color, 0.12) }}>
                  <span className="flex items-center gap-1.5 text-[11px] font-black" style={{ color: c.color }}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.label}
                  </span>
                  <span className="text-[11px] font-black" style={{ color: c.color }}>{catBoxes} {unitWord_(c.key, catBoxes)}</span>
                </div>
                <div className="divide-y divide-border-light">
                  {items.map(({ p, d }) => (
                    <BoxItemRow key={p.sku} product={p} qty={d.qty} customers={r.custBySku[p.sku]} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {kkList.length > 0 && (
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <button onClick={() => setOpenKk(o => !o)} className="flex w-full items-center gap-2 text-left">
            <h3 className="flex-1 text-sm font-black text-text-main">By karyakarta <span className="font-bold text-text-muted">· {kkList.length}</span></h3>
            <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${openKk ? 'rotate-180' : ''}`} />
          </button>
          {openKk && (
            <>
              <p className="mb-3 mt-1 text-[11px] text-text-muted">Collection per person — tap a row to see every order with names, and export that person to PDF / Excel. Use the button below for several or all karyakartas at once.</p>
              <div className="space-y-2">
                {kkList.map(([key, d]) => <KaryakartaCard key={key} name={d.name || key} d={d} season={season} cardKey={key} />)}
              </div>
            </>
          )}
        </div>
      )}

      {custList.length > 0 && (
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <button onClick={() => setOpenCust(o => !o)} className="flex w-full items-center gap-2 text-left">
            <h3 className="flex-1 text-sm font-black text-text-main">By customer <span className="font-bold text-text-muted">· {custList.length}</span></h3>
            <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${openCust ? 'rotate-180' : ''}`} />
          </button>
          {openCust && (<>
          <p className="mb-3 mt-1 text-[11px] text-text-muted">Total Ghari &amp; Bhusu each person ordered this season (all their orders added up).</p>
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-border-light bg-bg-base px-3 py-2">
            <Search className="h-4 w-4 text-text-muted" />
            <input value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder="Search a customer…"
              className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
            {custQ && <button onClick={() => setCustQ('')}><X className="h-4 w-4 text-text-muted" /></button>}
          </div>
          <div className="divide-y divide-border-light">
            {custShown.map((c, i) => {
              const bal = c.amount - c.received;
              return (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-text-main">{c.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {c.ghariKg > 0 && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: '#EA580C' }}>Ghari {kg1(c.ghariKg)} kg</span>}
                      {c.bhusuKg > 0 && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: '#9333EA' }}>Bhusu {kg1(c.bhusuKg)} kg</span>}
                      <span className="rounded-full bg-bg-base px-2 py-0.5 text-[10px] font-bold text-text-muted">{c.orders} order{c.orders === 1 ? '' : 's'}</span>
                      {c.karyakarta && <span className="truncate rounded-full bg-bg-base px-2 py-0.5 text-[10px] font-semibold text-teal-600">via {c.karyakarta}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-text-main">{rupee(c.amount)}</p>
                    {bal > 0 && <p className="text-[10px] font-bold text-rose-600">{rupee(bal)} due</p>}
                  </div>
                </div>
              );
            })}
            {custShown.length === 0 && <p className="py-4 text-center text-xs text-text-muted">No customers match “{custQ}”.</p>}
          </div>
          </>)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button onClick={() => ghariService.exportReportPdf(season).catch(e => alertError('Export failed', e.message))} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] py-3 text-sm font-black text-white shadow-md">
          <Download className="h-4 w-4" /> Report PDF
        </button>
        <button onClick={() => ghariService.exportXlsx(season)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-primary/5 py-3 text-sm font-black text-primary">
          <Download className="h-4 w-4" /> Excel ledger
        </button>
      </div>

      {/* Share just one or a few karyakartas' orders — e.g. for an out-of-town
          team to follow up with the devotees who order Ghari every year. */}
      <button onClick={() => setExportKk(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border-light bg-surface py-3 text-sm font-black text-text-main">
        <Users className="h-4 w-4 text-primary" /> Export orders by karyakarta (PDF / Excel)
      </button>
      {exportKk && <KaryakartaExportModal season={season} onClose={() => setExportKk(false)} />}
    </div>
  );
}

// ───────────────────────── Catalog item editor row ──────────────────────────
function ItemRow({ product, onSave, onDelete }) {
  const cat = GHARI_CATEGORIES[product.category];
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [size, setSize] = useState(product.size);
  const [category, setCategory] = useState(product.category);
  const [price, setPrice] = useState(String(product.unitPrice));
  const [cost, setCost] = useState(product.costPrice ? String(product.costPrice) : '');

  const commit = () => {
    onSave({ ...product, name: name.trim() || product.name, size: size.trim(), category, unitPrice: Number(price.replace(/[^\d]/g, '')) || 0, costPrice: Number(cost.replace(/[^\d]/g, '')) || 0 });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-xl border border-primary bg-primary/5 p-2.5 space-y-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Item name"
          className="w-full rounded-lg border border-border-light bg-surface px-2.5 py-1.5 text-sm font-bold text-text-main outline-none focus:border-primary" />
        <div className="flex gap-1.5">
          <input value={size} onChange={e => setSize(e.target.value)} placeholder="Size e.g. 500 gm"
            className="w-28 rounded-lg border border-border-light bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-main outline-none focus:border-primary" />
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="flex-1 rounded-lg border border-border-light bg-surface px-2 py-1.5 text-xs font-semibold text-text-main outline-none focus:border-primary">
            {Object.values(GHARI_CATEGORIES).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div className="flex gap-1.5">
          <div className="flex flex-1 items-center gap-1 rounded-lg border border-border-light bg-surface px-2">
            <span className="shrink-0 text-[10px] font-black uppercase text-text-muted">Sell ₹</span>
            <input inputMode="numeric" value={price} onChange={e => setPrice(e.target.value.replace(/[^\d]/g, ''))} placeholder="0"
              className="w-full bg-transparent text-right text-xs font-black text-text-main outline-none" />
          </div>
          <div className="flex flex-1 items-center gap-1 rounded-lg border border-border-light bg-surface px-2">
            <span className="shrink-0 text-[10px] font-black uppercase text-text-muted">Cost ₹</span>
            <input inputMode="numeric" value={cost} onChange={e => setCost(e.target.value.replace(/[^\d]/g, ''))} placeholder="0"
              className="w-full bg-transparent text-right text-xs font-black text-text-main outline-none" />
          </div>
        </div>
        <div className="flex justify-end gap-1.5">
          <button onClick={() => setEditing(false)} className="rounded-lg border border-border-light px-3 py-1.5 text-xs font-bold text-text-muted">Cancel</button>
          <button onClick={commit} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-white">Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 rounded-xl border p-2 ${product.active ? 'border-border-light' : 'border-dashed border-border-light opacity-60'}`}>
      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: cat?.color }} />
      <button onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-bold text-text-main">{product.name} <span className="text-text-muted">· {product.size}</span></span>
        <span className="text-[10px] font-semibold text-text-muted">{cat?.label} · Sell ₹{product.unitPrice}{product.costPrice ? ` · Cost ₹${product.costPrice}` : ''}{!product.active && ' · hidden'}</span>
      </button>
      <button onClick={() => setEditing(true)} title="Edit" className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-base text-text-muted hover:text-primary">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => onSave({ ...product, active: !product.active })} title={product.active ? 'Showing — tap to hide' : 'Hidden — tap to show'}
        className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-bold ${product.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-bg-base text-text-muted'}`}>
        {product.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{product.active ? 'Shown' : 'Hidden'}
      </button>
      <button onClick={() => onDelete(product)} title="Delete item" className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ───────────────────────── Add-item form ────────────────────────────────────
function AddItemForm({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [category, setCategory] = useState('ghee');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const add = () => {
    if (!name.trim()) { alertError('Name needed', 'Please enter the item name.'); return; }
    onAdd({ name: name.trim(), size: size.trim(), category, unitPrice: Number(price.replace(/[^\d]/g, '')) || 0, costPrice: Number(cost.replace(/[^\d]/g, '')) || 0 });
    onClose();
  };
  return (
    <div className="rounded-xl border-2 border-primary bg-primary/5 p-2.5 space-y-2">
      <input value={name} onChange={e => setName(toProperCase(e.target.value))} placeholder="New item name e.g. Ghari (Ghee Wali)" autoFocus
        className="w-full rounded-lg border border-border-light bg-surface px-2.5 py-1.5 text-sm font-bold text-text-main outline-none focus:border-primary" />
      <div className="flex gap-1.5">
        <input value={size} onChange={e => setSize(e.target.value)} placeholder="Size e.g. 1 kg"
          className="w-28 rounded-lg border border-border-light bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-main outline-none focus:border-primary" />
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="flex-1 rounded-lg border border-border-light bg-surface px-2 py-1.5 text-xs font-semibold text-text-main outline-none focus:border-primary">
          {Object.values(GHARI_CATEGORIES).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div className="flex gap-1.5">
        <div className="flex flex-1 items-center gap-1 rounded-lg border border-border-light bg-surface px-2 py-1.5">
          <span className="shrink-0 text-[10px] font-black uppercase text-text-muted">Sell ₹</span>
          <input inputMode="numeric" value={price} onChange={e => setPrice(e.target.value.replace(/[^\d]/g, ''))} placeholder="0"
            className="w-full bg-transparent text-right text-xs font-black text-text-main outline-none" />
        </div>
        <div className="flex flex-1 items-center gap-1 rounded-lg border border-border-light bg-surface px-2 py-1.5">
          <span className="shrink-0 text-[10px] font-black uppercase text-text-muted">Cost ₹</span>
          <input inputMode="numeric" value={cost} onChange={e => setCost(e.target.value.replace(/[^\d]/g, ''))} placeholder="0"
            className="w-full bg-transparent text-right text-xs font-black text-text-main outline-none" />
        </div>
      </div>
      <div className="flex justify-end gap-1.5">
        <button onClick={onClose} className="rounded-lg border border-border-light px-3 py-1.5 text-xs font-bold text-text-muted">Cancel</button>
        <button onClick={add} className="rounded-lg bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-3 py-1.5 text-xs font-black text-white">Add item</button>
      </div>
    </div>
  );
}

// ───────────────────────── Settings view ────────────────────────────────────
function SettingsView({ season, onSeason }) {
  const [products, setProducts] = useState(ghariService.getProducts());
  const [newSeason, setNewSeason] = useState('');
  const [adding, setAdding] = useState(false);
  const refresh = () => setProducts(ghariService.getProducts());

  const save = (p) => { ghariService.saveProduct(p); refresh(); };
  const del = async (p) => {
    if (!(await confirmDialog({ title: 'Delete product?', text: `Delete "${p.name} ${p.size}"? Past orders keep their own saved copy, so totals won't change.`, confirmText: 'Delete', danger: true }))) return;
    ghariService.deleteProduct(p.sku); refresh();
  };
  const add = (p) => { ghariService.saveProduct(p); refresh(); };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border-light bg-surface p-4">
        <h3 className="mb-2 text-sm font-black text-text-main">Season</h3>
        <div className="flex flex-wrap gap-1.5">
          {ghariService.getSeasons().map(s => (
            <button key={s} onClick={() => onSeason(s)} className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${s === season ? 'border-primary bg-primary text-white' : 'border-border-light bg-bg-base text-text-muted'}`}>{s}</button>
          ))}
          <div className="flex items-center gap-1">
            <input value={newSeason} onChange={e => setNewSeason(e.target.value.replace(/[^\d]/g, ''))} placeholder="Year" maxLength={4}
              className="w-16 rounded-xl border border-border-light bg-bg-base px-2 py-1.5 text-xs font-bold text-text-main outline-none" />
            <button onClick={() => { if (newSeason.length === 4) { onSeason(newSeason); setNewSeason(''); } }} className="rounded-xl bg-primary px-2.5 py-1.5 text-xs font-bold text-white">Add</button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border-light bg-surface p-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-black text-text-main">Items & prices</h3>
          {!adding && <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-3 py-1.5 text-xs font-black text-white"><Plus className="h-3.5 w-3.5" /> Add item</button>}
        </div>
        <p className="mb-3 text-[11px] text-text-muted">Tap an item to edit its name, size, category or price. <b>Shown/Hidden</b> controls what appears on the order screen — hidden items aren't deleted. Each order keeps the price it was sold at.</p>
        <div className="space-y-2">
          {adding && <AddItemForm onAdd={add} onClose={() => setAdding(false)} />}
          {products.length === 0 && !adding && (
            <div className="rounded-xl border border-dashed border-border-light py-6 text-center">
              <p className="text-xs font-bold text-text-muted">No items yet</p>
              <button onClick={() => { ghariService.restoreDefaults(); refresh(); }} className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-white">Restore default items</button>
            </div>
          )}
          {products.map(p => <ItemRow key={p.sku} product={p} onSave={save} onDelete={del} />)}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <AlertCircle className="mb-1 inline h-3.5 w-3.5" /> Every order is saved on this device first, so entry keeps working with no internet. When you're back online it syncs to the cloud automatically — the badge at the top shows what's left to sync.
      </div>
    </div>
  );
}

// ───────────────────────── Audit history + revert ───────────────────────────
const GHARI_FIELD_LABELS = {
  customerName: 'Customer', customerMobile: 'Mobile', karyakarta: 'Karyakarta',
  itemsSummary: 'Items', total: 'Total ₹', withGheeAmt: 'With-ghee ₹', withoutGheeAmt: 'No-ghee ₹',
  sugarFreeAmt: 'Sugar-free ₹', bhusuAmt: 'Bhusu ₹', delivered: 'Delivered', paymentReceived: 'Paid ₹',
  balance: 'Balance ₹', paymentType: 'Payment type', status: 'Status', remarks: 'Remarks',
  season: 'Season', boxes: 'Boxes', amount: 'Amount ₹', supplier: 'Supplier', date: 'Date', name: 'Name',
  size: 'Size', unitPrice: 'Unit price ₹', active: 'Active', sortOrder: 'Order', category: 'Category',
};
const ghariFieldLabel = (f) => GHARI_FIELD_LABELS[f] || f;
const ghariVal = (v) => {
  if (v === true || v === 'true') return 'Yes';
  if (v === false || v === 'false') return 'No';
  const s = String(v == null ? '' : v);
  return s === '' ? '—' : (s.length > 60 ? s.slice(0, 60) + '…' : s);
};
const ACTION_STYLE = {
  create: { label: 'Created', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  update: { label: 'Edited', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  void: { label: 'Deleted (void)', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  delete: { label: 'Removed', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  revert: { label: 'Reverted', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' },
};

function GhariHistoryModal({ entityId, title = 'Change history', onClose, onReverted }) {
  const [logs, setLogs] = useState(null);
  const [busy, setBusy] = useState('');
  const actor = (dataService.getCurrentSession() || {}).name || '';

  const load = () => ghariService.getLog({ entityId }).then((l) => setLogs(l || []));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entityId]);

  const revert = async (log) => {
    if (!(await confirmDialog({ title: 'Revert this change?', text: 'The current values will be replaced with the values BEFORE this change (and this revert is itself logged).', confirmText: 'Revert' }))) return;
    setBusy(log.id);
    try {
      await ghariService.revert(log.id, actor);
      await load();
      onReverted?.();
    } catch (e) { alertError('Could not revert', e.message); }
    finally { setBusy(''); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-border-light px-5 py-4">
          <span className="flex items-center gap-2 text-base font-black text-text-main"><History className="h-5 w-5 text-[#E56F18]" /> {title}</span>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-4 py-3">
          {logs === null && <p className="py-8 text-center text-sm text-text-muted">Loading history…</p>}
          {logs && logs.length === 0 && <p className="py-8 text-center text-sm text-text-muted">No changes recorded yet.</p>}
          <div className="space-y-2">
            {(logs || []).map((log) => {
              let changes = []; try { changes = JSON.parse(log.changesJson || '[]'); } catch (e) {}
              changes = changes.filter((c) => c.field !== 'itemsJson');
              const st = ACTION_STYLE[log.action] || { label: log.action, cls: 'bg-slate-100 text-slate-700' };
              const canRevert = log.action !== 'create' && !!log.beforeJson;
              return (
                <div key={log.id} className="rounded-2xl border border-border-light bg-bg-base p-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${st.cls}`}>{st.label}</span>
                    <span className="text-[11px] font-semibold text-text-muted">{new Date(log.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                    {log.actor && <span className="truncate text-[11px] text-text-muted">· {log.actor}</span>}
                  </div>
                  {changes.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {changes.map((c, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[12px]">
                          <span className="shrink-0 font-bold text-text-main">{ghariFieldLabel(c.field)}:</span>
                          <span className="text-rose-500 line-through">{ghariVal(c.before)}</span>
                          <span className="text-text-muted">→</span>
                          <span className="font-semibold text-emerald-600">{ghariVal(c.after)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {log.action === 'create' && <p className="mt-1 text-[11px] text-text-muted">Order first created.</p>}
                  {canRevert && (
                    <button onClick={() => revert(log)} disabled={busy === log.id}
                      className="mt-2 flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700 disabled:opacity-50 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300">
                      <RotateCcw className="h-3.5 w-3.5" /> {busy === log.id ? 'Reverting…' : 'Revert to before this change'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ───────────────────────── Module-wide activity log ─────────────────────────
// Every Ghari change (orders, purchases, catalog) across all seasons in one list —
// newest first, searchable by customer / karyakarta / supplier / who made it, with
// the exact before→after of each change and a revert on past edits.
// Which of the 3 log sections a log entry belongs to:
//  • 'delivery' — delivery / payment quick marks (action 'delivery')
//  • 'stock'    — advance-stock issues/edits
//  • 'orders'   — order add/edit/delete (+ purchase/product catalog edits)
function ghariLogSection_(log) {
  if (log.action === 'delivery') return 'delivery';
  if (log.entity === 'stock') return 'stock';
  return 'orders';
}
const GHARI_LOG_SECTIONS = [
  { id: 'orders', label: 'Add / edit', icon: Package },
  { id: 'stock', label: 'Advance stock', icon: Boxes },
  { id: 'delivery', label: 'Delivery / paid', icon: Truck },
];

// selfOnly: limit to the current user's OWN actions (Sevaks see only what they did,
// not every devotee's changes). Admins (selfOnly=false) see everyone's.
function GhariLogView({ flash, selfOnly = false }) {
  const [logs, setLogs] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [section, setSection] = useState('orders');
  const actor = (dataService.getCurrentSession() || {}).name || '';
  const myLabel = String(dataService.currentActor() || '').toLowerCase();
  const myName = String(actor || '').toLowerCase();

  const load = () => { setLogs(null); ghariService.getLog({ limit: 500, actor: selfOnly ? dataService.currentActor() : '' }).then((l) => setLogs(l || [])); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const parse_ = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
  const metaOf = (log) => {
    const row = parse_(log.afterJson) || {};
    const prev = parse_(log.beforeJson) || {};
    const r = Object.keys(row).length ? row : prev;
    if (log.entity === 'stock') return { title: r.karyakarta || 'Advance stock', sub: r.itemsSummary ? '' : '', extra: r.season || '' };
    if (log.entity === 'purchase') return { title: r.supplier || 'Purchase', sub: r.date || '', extra: '' };
    if (log.entity === 'product') return { title: [r.name, r.size].filter(Boolean).join(' ') || 'Item', sub: '', extra: '' };
    return { title: r.customerName || 'Order', sub: r.karyakarta ? `via ${r.karyakarta}` : '', extra: r.season || '' };
  };
  const isMine = (log) => {
    const a = String(log.actor || '').toLowerCase();
    return !!a && (a === myLabel || (!!myName && a.includes(myName)));
  };

  // Per-section counts (after the self-only filter) so the tabs show how many.
  const visible = useMemo(() => (logs || []).filter((log) => (selfOnly ? isMine(log) : true)), [logs, selfOnly, myLabel, myName]);
  const counts = useMemo(() => {
    const c = { orders: 0, stock: 0, delivery: 0 };
    visible.forEach((log) => { c[ghariLogSection_(log)]++; });
    return c;
  }, [visible]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return visible.filter((log) => {
      if (ghariLogSection_(log) !== section) return false;
      if (!t) return true;
      const m = metaOf(log);
      return [m.title, m.sub, log.actor, log.entity, log.action].join(' ').toLowerCase().includes(t);
    });
    // eslint-disable-next-line
  }, [visible, q, section]);

  const revert = async (log) => {
    if (!(await confirmDialog({ title: 'Revert this change?', text: 'The current values will be replaced with the values BEFORE this change (and this revert is itself logged).', confirmText: 'Revert' }))) return;
    setBusy(log.id);
    try { await ghariService.revert(log.id, actor); load(); flash?.('Change reverted ✓'); }
    catch (e) { alertError('Could not revert', e.message); }
    finally { setBusy(''); }
  };

  return (
    <div className="space-y-3">
      {selfOnly && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          👤 Showing only your own actions.
        </div>
      )}
      {/* Three sections so an admin can read the log at a glance. */}
      <div className="flex gap-1 rounded-2xl border border-border-light bg-surface p-1">
        {GHARI_LOG_SECTIONS.map((sec) => (
          <button key={sec.id} onClick={() => setSection(sec.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-black transition-all ${section === sec.id ? 'bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow' : 'text-text-muted hover:bg-bg-base'}`}>
            <sec.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{sec.label}</span>
            <span className={`rounded-full px-1.5 text-[10px] font-black ${section === sec.id ? 'bg-white/25' : 'bg-bg-base'}`}>{counts[sec.id]}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2">
        <Search className="h-4 w-4 text-text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, karyakarta, supplier or who changed it"
          className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
        {q && <button onClick={() => setQ('')}><X className="h-4 w-4 text-text-muted" /></button>}
        <button onClick={load} title="Refresh" className="shrink-0 text-text-muted hover:text-primary"><RefreshCw className={`h-4 w-4 ${logs === null ? 'animate-spin' : ''}`} /></button>
      </div>

      {logs === null && <p className="py-10 text-center text-sm text-text-muted">Loading history…</p>}
      {logs && shown.length === 0 && <p className="py-10 text-center text-sm text-text-muted">{q ? `No changes match “${q}”.` : (selfOnly ? 'You have no actions in this section yet.' : 'Nothing recorded in this section yet.')}</p>}

      <div className="space-y-2">
        {shown.map((log) => {
          let changes = []; try { changes = JSON.parse(log.changesJson || '[]'); } catch (e) {}
          changes = changes.filter((c) => c.field !== 'itemsJson');
          const st = ACTION_STYLE[log.action] || { label: log.action, cls: 'bg-slate-100 text-slate-700' };
          const m = metaOf(log);
          const canRevert = !selfOnly && log.action !== 'create' && !!log.beforeJson;
          return (
            <div key={log.id} className="rounded-2xl border border-border-light bg-surface p-3">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${st.cls}`}>{st.label}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-black text-text-main">{m.title}
                  {m.sub && <span className="ml-1 text-[11px] font-semibold text-teal-600">{m.sub}</span>}</span>
                <span className="shrink-0 rounded-md bg-bg-base px-1.5 py-0.5 text-[9px] font-bold uppercase text-text-muted">{log.entity}{m.extra ? ' · ' + m.extra : ''}</span>
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-text-muted">
                {new Date(log.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{log.actor ? ` · ${log.actor}` : ''}
              </div>
              {changes.length > 0 && (
                <div className="mt-2 space-y-1">
                  {changes.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[12px]">
                      <span className="shrink-0 font-bold text-text-main">{ghariFieldLabel(c.field)}:</span>
                      <span className="text-rose-500 line-through">{ghariVal(c.before)}</span>
                      <span className="text-text-muted">→</span>
                      <span className="font-semibold text-emerald-600">{ghariVal(c.after)}</span>
                    </div>
                  ))}
                </div>
              )}
              {log.action === 'create' && <p className="mt-1 text-[11px] text-text-muted">First created.</p>}
              {canRevert && (
                <button onClick={() => revert(log)} disabled={busy === log.id}
                  className="mt-2 flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700 disabled:opacity-50 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300">
                  <RotateCcw className="h-3.5 w-3.5" /> {busy === log.id ? 'Reverting…' : 'Revert to before this change'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── Edit modal ───────────────────────────────────────
// ───────────────────────── Delivery panel (partial / full) ──────────────────
// Lets ANY viewer (Karyakarta / Sevak / devotee) record how many of an order's
// boxes have actually been delivered — all, none, or a partial count (e.g. 2 of 4
// delivered, 2 remaining). This is a delivery-only write; it never touches items
// or payment, so it is offered even when the rest of the order is view-only.
function DeliveryPanel({ order, canDeliver, onSaved }) {
  const totalBoxes = order.totalBoxes ?? order.items.reduce((s, i) => s + Number(i.qty || 0), 0);
  const [count, setCount] = useState(Math.max(0, Math.min(totalBoxes, Number(order.deliveredBoxes || 0))));
  const remaining = Math.max(0, totalBoxes - count);
  const full = totalBoxes > 0 && count >= totalBoxes;
  const commit = (n) => {
    const v = Math.max(0, Math.min(totalBoxes, Math.round(n)));
    setCount(v);
    ghariService.markDelivery(order.id, v);
    onSaved?.();
  };
  return (
    <div className={`mb-3 rounded-2xl border-2 p-3 ${full ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40' : count > 0 ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40' : 'border-border-light bg-surface'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-text-muted">
          <Truck className="h-3.5 w-3.5" /> Delivery
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${full ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : count > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'bg-bg-base text-text-muted'}`}>
          {full ? 'Delivered ✓' : count > 0 ? `Partial · ${remaining} left` : 'Not delivered'}
        </span>
      </div>
      {!canDeliver ? (
        <p className="text-[12px] font-bold text-text-muted">{count}/{totalBoxes} {mixUnitWord_(order.items, totalBoxes)} delivered.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => commit(count - 1)} disabled={count <= 0}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-light bg-surface text-text-main active:scale-95 disabled:opacity-40">
              <Minus className="h-5 w-5" />
            </button>
            <div className="text-center">
              <div className="text-2xl font-black leading-none text-text-main">{count}<span className="text-base font-bold text-text-muted"> / {totalBoxes}</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{mixUnitWord_(order.items, count)} delivered</div>
            </div>
            <button onClick={() => commit(count + 1)} disabled={count >= totalBoxes}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#34D399] to-[#059669] text-white shadow active:scale-95 disabled:opacity-40">
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => commit(0)}
              className={`flex-1 rounded-xl border py-2 text-xs font-black ${count === 0 ? 'border-border-light bg-bg-base text-text-muted' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'}`}>None</button>
            <button onClick={() => commit(totalBoxes)}
              className={`flex-1 rounded-xl border py-2 text-xs font-black ${full ? 'border-emerald-400 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}`}>All delivered</button>
          </div>
          {remaining > 0 && count > 0 && (
            <p className="mt-2 text-center text-[11px] font-bold text-amber-700 dark:text-amber-300">{remaining} {mixUnitWord_(order.items, remaining)} still to deliver</p>
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────── Payment panel (quick mark paid) ──────────────────
// Lets any viewer (Karyakarta / Sevak / devotee) record payment on an order —
// full Cash or G-Pay, or reset to pending — without full edit rights. Payment-only
// write (never items/customer), mirroring the Delivery panel.
function PaymentPanel({ order, canDeliver }) {
  const total = Number(order.total || 0);
  const [paid, setPaid] = useState(Number(order.paymentReceived || 0));
  const [ptype, setPtype] = useState(order.paymentType || '');
  const balance = Math.max(0, total - paid);
  const fullyPaid = total > 0 && paid >= total;
  const commit = (type) => {
    ghariService.markPaid(order.id, type);
    if (type === 'Pending') { setPaid(0); setPtype('Pending'); }
    else { setPaid(total); setPtype(type); }
  };
  return (
    <div className={`mb-3 rounded-2xl border-2 p-3 ${fullyPaid ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40' : paid > 0 ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40' : 'border-border-light bg-surface'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-text-muted">
          <Wallet className="h-3.5 w-3.5" /> Payment
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${fullyPaid ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : paid > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'bg-bg-base text-text-muted'}`}>
          {fullyPaid ? `Paid${ptype ? ' · ' + ptype : ''}` : paid > 0 ? `Due ${rupee(balance)}` : 'Unpaid'}
        </span>
      </div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-bold text-text-muted">Total {rupee(total)}</span>
        <span className="text-[11px] font-bold text-text-muted">Received {rupee(paid)}</span>
      </div>
      {!canDeliver ? (
        <p className="text-[12px] font-bold text-text-muted">{fullyPaid ? `Paid${ptype ? ' (' + ptype + ')' : ''}.` : `${rupee(balance)} due.`}</p>
      ) : (
        <div className="flex gap-1.5">
          <button onClick={() => commit('Cash')}
            className={`flex-1 rounded-xl border py-2 text-xs font-black ${fullyPaid && ptype === 'Cash' ? 'border-emerald-400 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}`}>Paid · Cash</button>
          <button onClick={() => commit('G-Pay')}
            className={`flex-1 rounded-xl border py-2 text-xs font-black ${fullyPaid && ptype === 'G-Pay' ? 'border-blue-400 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'}`}>Paid · G-Pay</button>
          {paid > 0 && (
            <button onClick={() => commit('Pending')}
              className="shrink-0 rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-black text-text-muted">Pending</button>
          )}
        </div>
      )}
    </div>
  );
}

function EditModal({ order, onClose, onSaved, canEdit = true, canDeliver = false }) {
  const [showHistory, setShowHistory] = useState(false);
  const [challanBusy, setChallanBusy] = useState(false);
  const wa = ghariService.whatsappLink(order);
  const challan = async () => {
    if (challanBusy) return;
    setChallanBusy(true);
    try { await ghariService.orderChallanPdf(order, { share: true }); }
    catch (e) { alertError('Challan failed', e?.message || 'Could not generate the challan.'); }
    finally { setChallanBusy(false); }
  };
  const del = async () => {
    if (!(await confirmDialog({ title: 'Delete order?', text: `Delete this order for ${order.customerName || 'this customer'}? It will be removed from totals (recoverable by an admin if needed).`, confirmText: 'Delete', danger: true }))) return;
    ghariService.voidOrder(order.id); onSaved?.();
  };
  // Rendered through a portal on document.body so it sits ABOVE the app's fixed
  // bottom nav (which otherwise overlapped the Save/Delete bar).
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-bg-base">
      <div className="flex shrink-0 items-center justify-between border-b border-border-light bg-surface px-4 py-3">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-bold text-text-muted"><ArrowLeft className="h-4 w-4" /> Back</button>
        <span className="flex items-center gap-2 text-sm font-black text-text-main">
          {canEdit ? 'Edit order' : 'View order'}
          {order?.orderNo && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-black text-primary">#{order.orderNo}</span>}
        </span>
        <div className="flex items-center gap-3">
          <button onClick={challan} disabled={challanBusy} className="flex items-center gap-1 text-xs font-bold text-text-muted hover:text-primary disabled:opacity-50" title="Delivery challan (PDF)">
            <Download className="h-4 w-4" /> {challanBusy ? '…' : 'Challan'}
          </button>
          <button onClick={() => setShowHistory(true)} className="flex items-center gap-1 text-xs font-bold text-text-muted hover:text-primary" title="Change history">
            <History className="h-4 w-4" /> History
          </button>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-emerald-600"><MessageCircle className="h-4 w-4" /> WA</a>}
        </div>
      </div>
      {showHistory && (
        <GhariHistoryModal entityId={order.id} title={`History · ${order.customerName || 'order'}`}
          onClose={() => setShowHistory(false)} onReverted={() => onSaved?.()} />
      )}
      <div className="flex-1 overflow-y-auto p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {(order.createdBy || order.updatedBy) && (
          <div className="mb-3 rounded-xl border border-border-light bg-surface px-3 py-2 text-[11px] font-semibold text-text-muted">
            {order.createdBy && <span>Added by <b className="text-text-main">{order.createdBy}</b>{order.createdOn ? ` · ${new Date(order.createdOn).toLocaleDateString('en-IN')}` : ''}</span>}
            {order.updatedBy && order.updatedBy !== order.createdBy && <span className="block">Last edited by <b className="text-text-main">{order.updatedBy}</b></span>}
          </div>
        )}
        {canDeliver && <DeliveryPanel order={order} canDeliver={canDeliver} />}
        {canDeliver && !canEdit && <PaymentPanel order={order} canDeliver={canDeliver} />}
        <OrderForm initialOrder={order} onCancel={onClose} onDelete={canEdit ? del : undefined} onSaved={() => onSaved?.()} readOnly={!canEdit} />
      </div>
    </div>,
    document.body
  );
}

// ───────────────────────── Purchases (procurement) ──────────────────────────
// Downscale a picked image to a reasonable JPEG data URI before upload/storage.
function downscaleImage_(file, maxDim = 1400, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height > width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        try { resolve(canvas.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
// Read any file (e.g. a PDF challan) as a data URL, untouched.
function fileToDataUrl_(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
// Is this challan value a PDF (either a freshly-picked data URI or a stored URL)?
const isPdfChallan_ = (s) => {
  const v = String(s || '');
  return v.indexOf('data:application/pdf') === 0 || /\.pdf($|[?#])/i.test(v);
};
// ── Challan photo: open / download as image / download as PDF ─────────────────
function openChallan_(src) { try { window.open(src, '_blank', 'noopener'); } catch { /* ignore */ } }
// Convert a challan (Drive URL or data URI) to a JPEG data URL via canvas, so we
// can save it even when it's hosted remotely (falls back to opening it).
async function challanDataUrl_(src) {
  if (String(src).indexOf('data:') === 0) return src;
  return await new Promise((res, rej) => {
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => { try { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); res(c.toDataURL('image/jpeg', 0.92)); } catch (e) { rej(e); } };
    i.onerror = rej; i.src = src;
  });
}
async function downloadChallanImage_(src, name) {
  try { const d = await challanDataUrl_(src); const a = document.createElement('a'); a.href = d; a.download = `${name || 'challan'}.jpg`; document.body.appendChild(a); a.click(); a.remove(); }
  catch { openChallan_(src); }
}
async function downloadChallanPdf_(src, name) {
  try {
    const d = await challanDataUrl_(src);
    const { jsPDF } = await import('jspdf');
    const img = await new Promise((res, rej) => { const im = new window.Image(); im.onload = () => res(im); im.onerror = rej; im.src = d; });
    const landscape = img.width >= img.height;
    const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth(), phh = doc.internal.pageSize.getHeight();
    const ratio = Math.min((pw - 40) / img.width, (phh - 40) / img.height);
    const w = img.width * ratio, h = img.height * ratio;
    doc.addImage(d, 'JPEG', (pw - w) / 2, 20, w, h);
    doc.save(`${name || 'challan'}.pdf`);
  } catch { openChallan_(src); }
}

const toLocalInput_ = (iso) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d.getTime())) return ''; const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocalInput_ = (v) => { if (!v) return new Date().toISOString(); const d = new Date(v); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); };
const fmtDate_ = (iso) => { const d = new Date(iso); if (isNaN(d.getTime())) return ''; return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

// Simple colored quantity card for buying (no selling price shown).
function BuyCard({ product, qty, onChange }) {
  const cat = GHARI_CATEGORIES[product.category]; const color = cat?.color || '#EA580C'; const active = qty > 0;
  const qtyRef = useRef(null);
  const pick = () => { onChange(qty + 1); setTimeout(() => { try { qtyRef.current?.focus(); qtyRef.current?.select(); } catch { /* ignore */ } }, 0); };
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 p-3 transition-all"
      style={{ background: active ? (cat?.bgActive || tint(color, 0.22)) : (cat?.bg || tint(color, 0.11)), borderColor: active ? color : tint(color, 0.5) }}>
      <div className="absolute right-0 top-0 h-full w-1.5" style={{ background: color }} />
      <button onClick={pick} className="block w-full text-left">
        <span className="text-[13px] font-extrabold leading-tight text-text-main">{product.name.replace('Ghari ', '').replace(/[()]/g, '')}</span>
        <span className="mt-0.5 block"><span className="rounded-md bg-bg-base px-1.5 py-0.5 text-[10px] font-bold text-text-muted">{product.size}</span></span>
      </button>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <button onClick={() => onChange(Math.max(0, qty - 1))} disabled={!qty} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-light bg-surface text-text-main disabled:opacity-30 active:scale-95"><Minus className="h-4 w-4" /></button>
        <input ref={qtyRef} inputMode="numeric" value={qty || 0}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0))}
          className="min-w-0 w-12 rounded-lg bg-white/60 py-1 text-center text-lg font-black text-text-main outline-none" />
        <button onClick={pick} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow active:scale-95" style={{ background: color }}><Plus className="h-4 w-4" /></button>
      </div>
      <div className="mt-1.5 flex gap-1">
        {[10, 50].map(n => <button key={n} onClick={() => onChange(qty + n)} className="flex-1 rounded-lg bg-white/50 py-1 text-[10px] font-black text-text-muted active:scale-95">+{n}</button>)}
      </div>
    </div>
  );
}

function PurchaseForm({ initialPurchase, onSaved, onCancel, onDelete, readOnly }) {
  const products = useMemo(() => { const a = ghariService.getActiveProducts(); return a.length ? a : ghariService.getProducts(); }, []);
  const bySku = useMemo(() => Object.fromEntries(products.map(p => [p.sku, p])), [products]);
  // Quick-pick chips of suppliers used before (most recent first, deduped).
  const recentSuppliers = useMemo(() => {
    const seen = []; const out = [];
    [...ghariService.getPurchases(ghariService.getSeason()), ...ghariService.getPurchases(String(Number(ghariService.getSeason()) - 1))]
      .forEach(p => { const s = (p.supplier || '').trim(); const k = s.toLowerCase(); if (s && !seen.includes(k)) { seen.push(k); out.push(s); } });
    return out.slice(0, 6);
  }, []);
  const isEdit = !!initialPurchase;
  const [cart, setCart] = useState(() => { const c = {}; (initialPurchase?.items || []).forEach(it => { c[it.sku] = (c[it.sku] || 0) + it.qty; }); return c; });
  const [supplier, setSupplier] = useState(initialPurchase?.supplier || '');
  const [date, setDate] = useState(toLocalInput_(initialPurchase?.date) || toLocalInput_(new Date().toISOString()));
  const [amount, setAmount] = useState(initialPurchase?.amount ? String(initialPurchase.amount) : '');
  const [remarks, setRemarks] = useState(initialPurchase?.remarks || '');
  const [challan, setChallan] = useState(initialPurchase?.challan || '');
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => Object.entries(cart).filter(([, q]) => q > 0).map(([sku, qty]) => { const p = bySku[sku]; return p ? { sku, name: p.name, size: p.size, category: p.category, qty } : null; }).filter(Boolean), [cart, bySku]);
  const boxes = items.reduce((s, i) => s + i.qty, 0);
  const setQty = (sku, qty) => setCart(c => ({ ...c, [sku]: qty }));

  // Auto cost = Σ qty × item cost price (set per item in Settings). The amount field
  // auto-fills from this as you add items, UNLESS the user types their own figure
  // (then it's left alone). "Use auto" restores the calculated total.
  const autoAmount = useMemo(() => Math.round(items.reduce((s, it) => s + it.qty * (Number(bySku[it.sku]?.costPrice) || 0), 0)), [items, bySku]);
  const [amountTouched, setAmountTouched] = useState(!!initialPurchase?.amount);
  useEffect(() => { if (!amountTouched) setAmount(autoAmount ? String(autoAmount) : ''); }, [autoAmount, amountTouched]);

  const pickChallan = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      // PDFs are stored as-is; images are downscaled to keep them light.
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) setChallan(await fileToDataUrl_(f));
      else setChallan(await downscaleImage_(f));
    } catch { alertError('File error', 'Could not read that file. Try another one.'); }
    e.target.value = '';
  };

  const save = async () => {
    if (!items.length) { alertError('Add items', 'Add at least one item you bought.'); return; }
    if (!supplier.trim()) { alertError('Supplier needed', 'Enter the person/shop you bought from.'); return; }
    setBusy(true);
    try {
      const pu = await ghariService.savePurchase({ id: initialPurchase?.id, season: initialPurchase?.season, date: fromLocalInput_(date), supplier: properName(supplier), items, amount: Number(String(amount).replace(/[^\d]/g, '')) || 0, challan, remarks: remarks.trim(), status: initialPurchase?.status || 'active' });
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* ignore */ }
      onSaved?.(pu);
    } finally { setBusy(false); }
  };

  return (
    <fieldset disabled={readOnly} className="space-y-4 m-0 min-w-0 border-0 p-0">
      {readOnly && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          👁️ View only — Sevaks can see purchases but cannot edit or delete.
        </div>
      )}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Bought from (supplier)</label>
          <DevoteePicker value={supplier} icon={User} placeholder="Person / shop name"
            onText={(t) => setSupplier(t)} onPick={(d) => setSupplier(d ? d.name : '')} />
          {recentSuppliers.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {recentSuppliers.map(s => (
                <button key={s} type="button" onClick={() => setSupplier(s)} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${supplier === s ? 'border-primary bg-primary text-white' : 'border-border-light bg-bg-base text-text-muted'}`}>{s}</button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Date &amp; time</label>
          <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2.5 focus-within:border-primary">
            <Calendar className="h-4 w-4 shrink-0 text-text-muted" />
            <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-text-main outline-none" />
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-text-muted">Items bought — tap to add</label>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {products.map(p => <BuyCard key={p.sku} product={p} qty={cart[p.sku] || 0} onChange={q => setQty(p.sku, q)} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center justify-between text-[11px] font-black uppercase tracking-wide text-text-muted">
            <span>Total cost</span>
            {autoAmount > 0 && amountTouched && (
              <button type="button" onClick={() => { setAmountTouched(false); setAmount(String(autoAmount)); }} className="normal-case text-[10px] font-bold text-primary">Use auto ₹{autoAmount.toLocaleString('en-IN')}</button>
            )}
          </label>
          <div className="flex items-center gap-1 rounded-2xl border border-border-light bg-surface px-3 py-2.5">
            <span className="text-sm font-black text-text-main">₹</span>
            <input inputMode="numeric" value={amount} onChange={e => { setAmountTouched(true); setAmount(e.target.value.replace(/[^\d]/g, '')); }} placeholder="0" className="w-full bg-transparent text-sm font-black text-text-main outline-none" />
          </div>
          <p className="mt-1 text-[10px] font-semibold text-text-muted">{autoAmount > 0 ? (amountTouched ? `Auto from item cost: ₹${autoAmount.toLocaleString('en-IN')}` : 'Auto-calculated from item cost prices — type to override.') : 'Set a Cost ₹ on each item in Settings to auto-calculate this.'}</p>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Challan / bill (photo or PDF)</label>
          {challan ? (
            <div className="overflow-hidden rounded-2xl border border-border-light">
              {isPdfChallan_(challan)
                ? <button type="button" onClick={() => openChallan_(challan)} className="flex w-full items-center justify-center gap-2 bg-bg-base py-8 text-sm font-bold text-text-main"><Package className="h-6 w-6 text-primary" /> PDF challan — tap to open</button>
                : <button type="button" onClick={() => openChallan_(challan)} className="block w-full"><img src={challan} alt="challan" className="max-h-44 w-full object-contain bg-bg-base" /></button>}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border-light p-2">
                <button type="button" onClick={() => openChallan_(challan)} className="rounded-lg bg-bg-base px-2.5 py-1.5 text-[11px] font-bold text-text-main">Open</button>
                {!isPdfChallan_(challan) && <>
                  <button type="button" onClick={() => downloadChallanImage_(challan, `Challan_${supplier || 'bill'}`)} className="rounded-lg bg-bg-base px-2.5 py-1.5 text-[11px] font-bold text-text-main">⬇ Image</button>
                  <button type="button" onClick={() => downloadChallanPdf_(challan, `Challan_${supplier || 'bill'}`)} className="rounded-lg bg-bg-base px-2.5 py-1.5 text-[11px] font-bold text-text-main">⬇ PDF</button>
                </>}
                <label className="cursor-pointer rounded-lg bg-bg-base px-2.5 py-1.5 text-[11px] font-bold text-text-main">Replace<input type="file" accept="image/*,application/pdf" onChange={pickChallan} className="hidden" /></label>
                <button type="button" onClick={() => setChallan('')} className="ml-auto rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-rose-600">Remove</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border-light bg-surface py-3.5 text-xs font-bold text-text-muted">
                <Camera className="h-4 w-4" /> Scan / Camera
                <input type="file" accept="image/*" capture="environment" onChange={pickChallan} className="hidden" />
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border-light bg-surface py-3.5 text-xs font-bold text-text-muted">
                <Download className="h-4 w-4 rotate-180" /> Photo or PDF
                <input type="file" accept="image/*,application/pdf" onChange={pickChallan} className="hidden" />
              </label>
            </div>
          )}
        </div>
      </div>

      <AutoTextarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Remarks (optional)" minRows={1}
        className="w-full rounded-2xl border border-border-light bg-surface px-3 py-2.5 text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted focus:border-primary" />

      {!readOnly && (
      <div className="sticky bottom-0 z-20 flex items-center gap-2 rounded-2xl border border-border-light bg-surface/95 p-2.5 shadow-lg backdrop-blur">
        <div className="pl-1">
          <div className="text-[10px] font-bold uppercase text-text-muted">{unitsText_(items)} bought</div>
          <div className="text-xl font-black leading-none text-text-main">{amount ? rupee(amount) : '—'}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onDelete && <button onClick={onDelete} title="Delete purchase" className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 dark:bg-rose-950 dark:border-rose-900"><Trash2 className="h-4 w-4" /></button>}
          {onCancel && <button onClick={onCancel} className="rounded-xl border border-border-light px-3 py-2.5 text-sm font-bold text-text-muted">Cancel</button>}
          <button onClick={save} disabled={busy} className="rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-5 py-2.5 text-sm font-black text-white shadow-md active:scale-95 disabled:opacity-60">{busy ? 'Saving…' : (isEdit ? 'Save' : 'Save purchase')}</button>
        </div>
      </div>
      )}
    </fieldset>
  );
}

function PurchaseRow({ purchase, onOpen, priceBySku }) {
  const summary = purchase.items.map(i => `${i.qty}× ${i.name.replace('Ghari ', '').replace(/[()]/g, '')} ${i.size}`).join(', ');
  const value = purchaseValue_(purchase, priceBySku);
  const photoPending = String(purchase.challan || '').indexOf('data:') === 0; // not yet on Drive
  // Ghari vs Bhusu weight in this purchase (ghee/noghee/sf = Ghari, bhusu = Bhusu).
  const kg = ghariService.orderKg(purchase);
  return (
    <button onClick={() => onOpen(purchase)} className="flex w-full items-center gap-3 border-b border-border-light px-3 py-3 text-left last:border-0 hover:bg-bg-base">
      <div className="relative shrink-0">
        {purchase.challan
          ? (isPdfChallan_(purchase.challan)
              ? <span className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-bg-base text-[8px] font-black text-primary"><Package className="h-5 w-5" />PDF</span>
              : <img src={purchase.challan} alt="" className="h-12 w-12 rounded-lg object-cover" />)
          : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg-base text-text-muted"><ShoppingCart className="h-5 w-5" /></span>}
        {photoPending && <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1 text-[8px] font-black text-white" title="Challan not uploaded to Drive yet">⏳</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-extrabold text-text-main">{purchase.supplier || '(supplier)'}</div>
        <div className="truncate text-[11px] text-text-muted">{summary}</div>
        <div className="truncate text-[10px] font-semibold text-text-muted">{fmtDate_(purchase.date)} · {unitsText_(purchase.items)}{photoPending ? ' · photo not synced' : ''}</div>
        {(kg.ghariKg > 0 || kg.bhusuKg > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-bold">
            {kg.ghariKg > 0 && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(kg.ghariKg)} kg Ghari</span>}
            {kg.bhusuKg > 0 && <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-950 dark:text-purple-300">{fmtKg(kg.bhusuKg)} kg Bhusu</span>}
          </div>
        )}
      </div>
      {value > 0 && <div className="shrink-0 text-right"><div className="text-sm font-black text-text-main">{rupee(value)}</div>{!(purchase.amount > 0) && <div className="text-[9px] font-bold text-text-muted">est.</div>}</div>}
    </button>
  );
}

function PurchaseEditModal({ purchase, onClose, onSaved, canEdit = true }) {
  const del = (purchase && canEdit) ? async () => {
    if (!(await confirmDialog({ title: 'Delete purchase?', text: `Delete this purchase from ${purchase.supplier || 'this supplier'}?`, confirmText: 'Delete', danger: true }))) return;
    ghariService.voidPurchase(purchase.id); onSaved?.();
  } : null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-bg-base">
      <div className="flex shrink-0 items-center justify-between border-b border-border-light bg-surface px-4 py-3">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-bold text-text-muted"><ArrowLeft className="h-4 w-4" /> Back</button>
        <span className="text-sm font-black text-text-main">{purchase ? (canEdit ? 'Edit purchase' : 'View purchase') : 'New purchase'}</span>
        <span className="w-12" />
      </div>
      <div className="flex-1 overflow-y-auto p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <PurchaseForm initialPurchase={purchase} onCancel={onClose} onDelete={del} onSaved={() => onSaved?.()} readOnly={!canEdit} />
      </div>
    </div>,
    document.body
  );
}

function PurchasesView({ season, canEdit = true }) {
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openName, setOpenName] = useState({}); // which product rows are expanded
  useEffect(() => { const h = () => setTick(t => t + 1); window.addEventListener('ac-ghari-changed', h); window.addEventListener('ac-ghari-synced', h); return () => { window.removeEventListener('ac-ghari-changed', h); window.removeEventListener('ac-ghari-synced', h); }; }, []);
  const list = useMemo(() => ghariService.getPurchases(season), [season, tick]);
  // sku → catalog price, so purchases with no typed amount still show a value
  // (Σ qty × unitPrice). A typed amount always wins over the estimate.
  const priceBySku = useMemo(() => Object.fromEntries(ghariService.getProducts().map(p => [p.sku, p.unitPrice])), [tick]);
  const totalCost = list.reduce((s, p) => s + purchaseValue_(p, priceBySku), 0);
  // Whether any shown total is an estimate (no amount was typed on that purchase)
  // — surfaced on the Total cost card so the figure isn't mistaken for actuals.
  const anyEstimated = list.some(p => !(Number(p.amount) > 0) && purchaseValue_(p, priceBySku) > 0);
  // Grand total Ghari vs Bhusu weight across every purchase this season.
  const totalKg = list.reduce((a, p) => { const k = ghariService.orderKg(p); return { ghariKg: a.ghariKg + k.ghariKg, bhusuKg: a.bhusuKg + k.bhusuKg }; }, { ghariKg: 0, bhusuKg: 0 });
  // Per-product breakdown (Ghee Wali, Ghee Vagar ni, …) with per-size boxes + kg,
  // aggregated from every purchase's line items. Sorted in catalog-category order.
  const catOrder = Object.keys(GHARI_CATEGORIES); // ghee, noghee, sf, bhusu
  const breakdown = useMemo(() => {
    const byName = {};
    list.forEach(p => (p.items || []).forEach(it => {
      const name = it.name || 'Item'; const size = it.size || '';
      const boxes = Number(it.qty) || 0; if (boxes <= 0) return;
      const kg = boxes * sizeKg_(size);
      let g = byName[name];
      if (!g) { g = { name, category: it.category || 'ghee', boxes: 0, kg: 0, sizes: {} }; byName[name] = g; }
      g.boxes += boxes; g.kg += kg;
      let s = g.sizes[size];
      if (!s) { s = { size, boxes: 0, kg: 0 }; g.sizes[size] = s; }
      s.boxes += boxes; s.kg += kg;
    }));
    return Object.values(byName)
      .map(g => ({ ...g, sizeList: Object.values(g.sizes).sort((a, b) => sizeKg_(a.size) - sizeKg_(b.size)) }))
      .sort((a, b) => (catOrder.indexOf(a.category) - catOrder.indexOf(b.category)) || a.name.localeCompare(b.name));
  }, [list]);
  return (
    <div>
      {/* No combined "boxes bought" — Ghari (boxes) and Bhusu (packets) are different
          items; the per-item split lives in the "Total bought" breakdown below. */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border-light bg-surface p-3"><div className="text-[11px] font-bold uppercase text-text-muted">Purchases</div><div className="text-xl font-black text-text-main">{list.length}</div></div>
        <div className="rounded-2xl border border-border-light bg-surface p-3"><div className="text-[11px] font-bold uppercase text-text-muted">Total cost</div><div className="text-xl font-black text-text-main">{totalCost ? rupee(totalCost) : '—'}</div>{totalCost > 0 && anyEstimated && <div className="text-[9px] font-bold text-text-muted">incl. estimates</div>}</div>
      </div>
      {/* Total bought — overall Ghari/Bhusu, then a per-product breakdown you can
          expand to see each size's box count + kg (ghee/sugar-free = Ghari, bhusu = Bhusu). */}
      {(totalKg.ghariKg > 0 || totalKg.bhusuKg > 0) && (
        <div className="mb-3 rounded-2xl border border-border-light bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total bought</span>
            {totalKg.ghariKg > 0 && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[12px] font-black text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(totalKg.ghariKg)} kg Ghari</span>}
            {totalKg.bhusuKg > 0 && <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[12px] font-black text-purple-700 dark:bg-purple-950 dark:text-purple-300">{fmtKg(totalKg.bhusuKg)} kg Bhusu</span>}
          </div>
          {breakdown.length > 0 && (
            <div className="mt-2.5 divide-y divide-border-light border-t border-border-light">
              {breakdown.map(g => {
                const color = GHARI_CATEGORIES[g.category]?.color || '#EA580C';
                const isOpen = !!openName[g.name];
                const multi = g.sizeList.length > 1;
                return (
                  <div key={g.name}>
                    <button onClick={() => multi && setOpenName(o => ({ ...o, [g.name]: !o[g.name] }))}
                      className={`flex w-full items-center gap-2 py-2 text-left ${multi ? '' : 'cursor-default'}`}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-text-main">{cleanName_(g.name)}</span>
                      <span className="shrink-0 text-[12px] font-black text-text-main">{g.boxes} {unitWord_(g.category, g.boxes)}</span>
                      <span className="shrink-0 text-[11px] font-bold text-text-muted">· {fmtKg(g.kg)} kg</span>
                      {multi && <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                    </button>
                    {multi && isOpen && (
                      <div className="pb-2 pl-5">
                        {g.sizeList.map(s => (
                          <div key={s.size} className="flex items-center gap-2 py-1 text-[12px]">
                            <span className="min-w-0 flex-1 truncate font-semibold text-text-muted">{s.size}</span>
                            <span className="shrink-0 font-bold text-text-main">{s.boxes} {unitWord_(g.category, s.boxes)}</span>
                            <span className="shrink-0 font-semibold text-text-muted">· {fmtKg(s.kg)} kg</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {canEdit && <button onClick={() => setAdding(true)} className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] py-3 text-sm font-black text-white shadow-md"><Plus className="h-4 w-4" /> Add purchase</button>}
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-light bg-surface py-12 text-center">
          <ShoppingCart className="mx-auto mb-2 h-10 w-10 text-text-muted" />
          <p className="text-sm font-bold text-text-muted">No purchases recorded for {season}</p>
          <p className="mt-1 text-[11px] text-text-muted">Record boxes you bought, the supplier, and the challan photo.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
          {list.map(p => <PurchaseRow key={p.id} purchase={p} onOpen={setEditing} priceBySku={priceBySku} />)}
        </div>
      )}
      {adding && <PurchaseEditModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setTick(t => t + 1); }} />}
      {editing && <PurchaseEditModal purchase={editing} canEdit={canEdit} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setTick(t => t + 1); }} />}
    </div>
  );
}

// ───────────────────────── Trash (voided orders) ────────────────────────────
// Deleting an order soft-voids it (money is recoverable) and its permanent order
// number is kept — which is why the active list shows gaps (e.g. #6, #7 missing).
// This view surfaces those voided orders, who voided them and when, with Restore.
function TrashView({ season, onRestored, flash }) {
  const [tick, setTick] = useState(0);
  const voided = useMemo(
    () => ghariService.getOrders(season, { includeVoid: true }).filter(o => o.status === 'void'),
    [season, tick]
  );
  const restore = async (o) => {
    if (!(await confirmDialog({ title: 'Restore order?', text: `Restore order #${o.orderNo} for ${o.customerName}? It will reappear in the active orders list.`, confirmText: 'Restore' }))) return;
    ghariService.restoreOrder(o.id);
    setTick(t => t + 1);
    onRestored?.();
    flash?.(`Order #${o.orderNo} restored ✓`);
  };
  if (!voided.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border-light bg-surface py-12 text-center">
        <RotateCcw className="mx-auto mb-2 h-10 w-10 text-text-muted" />
        <p className="text-sm font-bold text-text-muted">No voided orders</p>
        <p className="mt-1 text-[11px] text-text-muted">Deleted orders appear here and can be restored. Order numbers are never reused, so a deleted order leaves a gap in the list.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        🗑️ {voided.length} voided order{voided.length === 1 ? '' : 's'} this season. They keep their number (so the active list skips it) and are excluded from totals. Restore any deleted by mistake.
      </p>
      <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
        {voided.map(o => {
          const summary = o.items.map(i => `${i.qty}× ${i.name.replace('Ghari ', '')} ${i.size}`).join(', ');
          const when = String(o.updatedOn || o.createdOn || '').slice(0, 10);
          const who = String(o.updatedBy || o.createdBy || '').replace(/\s*\(.*\)$/, '');
          return (
            <div key={o.id} className="flex items-center gap-2 border-b border-border-light px-3 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-md bg-rose-100 px-1.5 py-0.5 font-mono text-[11px] font-black text-rose-700 dark:bg-rose-950 dark:text-rose-300">#{o.orderNo}</span>
                  <span className="truncate text-sm font-extrabold text-text-main line-through decoration-rose-400">{o.customerName || '(no name)'}</span>
                </div>
                <div className="truncate text-[11px] text-text-muted">{summary}</div>
                <div className="text-[10px] font-semibold text-text-muted">Voided{when ? ` ${when}` : ''}{who ? ` · by ${who}` : ''} · {rupee(o.total)}</div>
              </div>
              <button onClick={() => restore(o)}
                className="flex shrink-0 items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── Advance stock (consignment) ──────────────────────
// Ghari handed to a Karyakarta IN ADVANCE. They deliver from it as orders come in,
// without checking back. This view lets an Admin issue stock and see, per person,
// what was issued vs delivered vs still in-hand — so holdings are always reconciled.
function StockIssueForm({ season, initialStock, onSaved, onCancel }) {
  const isEdit = !!initialStock;
  const products = useMemo(() => {
    const active = ghariService.getActiveProducts();
    return active.length ? active : ghariService.getProducts();
  }, []);
  // When editing, keep a snapshot of the issue's own items so a line whose product
  // was later deactivated/removed from the catalog is still shown and editable.
  const origBySku = useMemo(() => {
    const m = {}; (initialStock?.items || []).forEach(it => { m[it.sku] = it; }); return m;
  }, [initialStock]);
  const [cart, setCart] = useState(() => {
    const c = {}; (initialStock?.items || []).forEach(it => { c[it.sku] = (c[it.sku] || 0) + Number(it.qty || 0); }); return c;
  });
  const [karyakarta, setKaryakarta] = useState(initialStock?.karyakarta || '');
  const [karyakartaId, setKaryakartaId] = useState(initialStock?.karyakartaId || '');
  const [date, setDate] = useState(() => String(initialStock?.date || new Date().toISOString()).slice(0, 10));
  const [remarks, setRemarks] = useState(initialStock?.remarks || '');
  const kkRef = useRef(null);
  const items = useMemo(() => Object.entries(cart).filter(([, q]) => q > 0).map(([sku, qty]) => {
    const p = products.find(x => x.sku === sku) || origBySku[sku];
    return p ? { sku, name: p.name, size: p.size, category: p.category, qty } : null;
  }).filter(Boolean), [cart, products, origBySku]);
  const boxes = items.reduce((s, it) => s + it.qty, 0);
  const setQty = (sku, qty) => setCart(c => ({ ...c, [sku]: qty }));
  const save = () => {
    if (!karyakarta.trim()) { alertError('Karyakarta needed', 'Pick or type who received the stock.'); return; }
    if (!items.length) { alertError('Add items', 'Add at least one item to issue.'); return; }
    ghariService.saveStock({ id: initialStock?.id, season: initialStock?.season || season, status: initialStock?.status, karyakarta, karyakartaId, date, items, remarks });
    onSaved?.();
  };
  return (
    <div className="space-y-2.5 rounded-2xl border border-border-light bg-surface p-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-black text-text-main"><Boxes className="h-4 w-4 text-primary" /> {isEdit ? 'Edit advance stock' : 'Issue advance stock'}</h3>
        {onCancel && <button onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-lg text-text-muted hover:bg-bg-base"><X className="h-4 w-4" /></button>}
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Karyakarta</label>
        <DevoteePicker value={karyakarta} icon={Users} accent="teal" placeholder="Who is holding this stock" inputRef={kkRef}
          onText={(t) => { setKaryakarta(t); setKaryakartaId(''); }}
          onPick={(d) => { if (d) { setKaryakarta(d.name); setKaryakartaId(d.id); } else { setKaryakarta(''); setKaryakartaId(''); } }} />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-text-muted">Items — tap to add</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {products.map(p => <ProductCard key={p.sku} product={p} qty={cart[p.sku] || 0} onChange={(q) => setQty(p.sku, q)} />)}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-bg-base px-3 py-2">
        <Calendar className="h-4 w-4 shrink-0 text-text-muted" />
        <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-text-muted">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-text-main outline-none" />
      </div>
      <AutoTextarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (optional)" minRows={1}
        className="w-full rounded-2xl border border-border-light bg-surface px-3 py-2.5 text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted focus:border-primary" />
      <div className="flex items-center gap-2">
        <div className="pl-1 text-[11px] font-black uppercase text-text-muted">{unitsText_(items)}</div>
        <button onClick={save} className="ml-auto rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-5 py-2.5 text-sm font-black text-white shadow-md active:scale-95">{isEdit ? 'Save changes' : 'Issue stock'}</button>
      </div>
    </div>
  );
}

// One Karyakarta's holding — issued vs delivered vs in-hand, per item, with a kg
// summary. Negative in-hand (delivered more than issued) is flagged for reconciling.
function StockBalanceCard({ bal, season }) {
  const [open, setOpen] = useState(false);
  const anyShort = bal.lines.some(l => l.inHand < 0);
  // Download a "Stock in Hand" challan for this karyakarta — the items they still
  // hold (issued − delivered), so it can be shared/printed like a Recent-issues one.
  const downloadInHand = async (e) => {
    e.stopPropagation();
    const items = bal.lines.filter(l => l.inHand !== 0).map(l => ({ name: l.name, size: l.size, category: l.category, qty: l.inHand }));
    if (!items.length) { alertError('Nothing in hand', `${bal.name} has no stock in hand to put on a challan.`); return; }
    const stock = { karyakarta: bal.name, karyakartaId: bal.karyakartaId, season, date: new Date().toISOString(), items };
    try { await ghariService.stockChallanPdf(stock, { share: true, title: 'Ghari Seva — Stock in Hand', subtitle: 'Stock in hand (issued − delivered)', recipientLabel: 'Held by' }); }
    catch (err) { alertError('Challan failed', err?.message || ''); }
  };
  return (
    <div className="overflow-hidden rounded-xl border border-border-light bg-bg-base">
      <div className="flex w-full items-center gap-2 p-2.5">
        <button onClick={() => setOpen(o => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-black text-text-main">{bal.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-text-muted">
              <span>Issued {bal.issuedBoxes}</span><span>·</span><span>Delivered {bal.deliveredBoxes}</span>
              {bal.ghariKg !== 0 && <span className="rounded-full px-1.5 py-0.5 font-bold text-white" style={{ background: '#EA580C' }}>Ghari {fmtKg(bal.ghariKg)} kg</span>}
              {bal.bhusuKg !== 0 && <span className="rounded-full px-1.5 py-0.5 font-bold text-white" style={{ background: '#9333EA' }}>Bhusu {fmtKg(bal.bhusuKg)} kg</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={`text-lg font-black leading-none ${bal.inHandBoxes < 0 ? 'text-rose-600' : bal.inHandBoxes === 0 ? 'text-text-muted' : 'text-emerald-600'}`}>{bal.inHandBoxes}</div>
            <div className="text-[9px] font-bold uppercase tracking-wide text-text-muted">in hand</div>
          </div>
        </button>
        <button onClick={downloadInHand} title="Stock-in-hand challan (PDF)"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-light bg-surface text-text-muted hover:border-primary hover:text-primary">
          <Download className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setOpen(o => !o)} className="shrink-0 text-text-muted" title={open ? 'Collapse' : 'Expand'}>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {anyShort && !open && <div className="border-t border-rose-100 bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">Delivered more than issued — reconcile</div>}
      {open && (
        <div className="border-t border-border-light px-2.5 py-2">
          {bal.lines.map(l => (
            <div key={l.sku} className="flex items-center justify-between py-0.5 text-[11px]">
              <span className="truncate font-bold text-text-main">{l.name.replace('Ghari ', '').replace(/[()]/g, '')} <span className="text-text-muted">{l.size}</span></span>
              <span className="shrink-0 font-black text-text-muted">
                <span className="text-emerald-600">{l.issued} in</span> · <span className="text-rose-600">{l.delivered} out</span> · <span className={l.inHand < 0 ? 'text-red-600' : l.inHand === 0 ? 'text-amber-600' : 'text-text-main'}>{l.inHand} left</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StockView({ season, canEdit = true }) {
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // the stock issue being edited
  const balances = useMemo(() => ghariService.buildStockBalances(season), [season, tick]);
  const issues = useMemo(() => ghariService.getStocks(season), [season, tick]);
  const summary = useMemo(() => ghariService.buildStockSummary(season), [season, tick]);
  const refresh = () => setTick(t => t + 1);
  const voidIssue = async (st) => {
    if (!(await confirmDialog({ title: 'Remove this issue?', text: `Remove the stock issued to ${st.karyakarta || 'this karyakarta'} (${unitsText_(st.items)})? Their in-hand balance will adjust.`, confirmText: 'Remove', danger: true }))) return;
    ghariService.voidStock(st.id); refresh();
  };
  return (
    <div className="space-y-3">
      {/* Distributed vs at-home summary — what I've handed to karyakartas, and what
          I'm still holding (purchased − distributed). */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-text-muted"><Truck className="h-3.5 w-3.5 text-rose-500" /> Distributed</div>
          <div className="mt-1 text-lg font-black text-text-main leading-tight">{summary.distributed.box} <span className="text-xs font-bold text-text-muted">boxes</span> · {summary.distributed.pkt} <span className="text-xs font-bold text-text-muted">packets</span></div>
          <div className="text-[11px] font-bold text-text-muted">{fmtKg(summary.distributed.ghariKg)} kg Ghari · {fmtKg(summary.distributed.bhusuKg)} kg Bhusu</div>
        </div>
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-text-muted"><Package className="h-3.5 w-3.5 text-emerald-500" /> At home</div>
          <div className={`mt-1 text-lg font-black leading-tight ${(summary.atHome.box < 0 || summary.atHome.pkt < 0) ? 'text-red-600' : 'text-text-main'}`}>{summary.atHome.box} <span className="text-xs font-bold text-text-muted">boxes</span> · {summary.atHome.pkt} <span className="text-xs font-bold text-text-muted">packets</span></div>
          <div className="text-[11px] font-bold text-text-muted">{fmtKg(summary.atHome.ghariKg)} kg Ghari · {fmtKg(summary.atHome.bhusuKg)} kg Bhusu</div>
        </div>
      </div>
      <p className="px-1 text-[10px] font-semibold text-text-muted">At home = bought − distributed (Ghari in boxes, Bhusu in packets).</p>

      {canEdit && (editing ? (
        <StockIssueForm season={season} initialStock={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      ) : adding ? (
        <StockIssueForm season={season} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />
      ) : (
        <button onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] py-3 text-sm font-black text-white shadow-md"><Plus className="h-4 w-4" /> Issue advance stock</button>
      ))}

      <div className="rounded-2xl border border-border-light bg-surface p-4">
        <h3 className="mb-3 text-sm font-black text-text-main">Stock in hand — by Karyakarta</h3>
        {balances.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-muted">No advance stock issued yet. Use “Issue advance stock” above.</p>
        ) : (
          <div className="space-y-2">
            {balances.map(b => <StockBalanceCard key={b.key} bal={b} season={season} />)}
          </div>
        )}
      </div>

      {issues.length > 0 && (
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <h3 className="mb-3 text-sm font-black text-text-main">Recent issues</h3>
          <div className="divide-y divide-border-light">
            {issues.map(st => {
              const kg = ghariService.orderKg(st); // Ghari vs Bhusu weight in this issue
              return (
              <div key={st.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black text-text-main">{st.karyakarta || '—'}</div>
                  <div className="truncate text-[11px] text-text-muted">{(st.items || []).map(i => `${i.qty}× ${i.name.replace('Ghari ', '')} ${i.size}`).join(', ')}</div>
                  <div className="text-[10px] font-semibold text-text-muted">{st.date ? new Date(st.date).toLocaleDateString('en-IN') : ''}{st.remarks ? ` · ${st.remarks}` : ''}{st.createdBy ? ` · by ${String(st.createdBy).replace(/\s*\(.*\)$/, '')}` : ''}</div>
                  {(kg.ghariKg > 0 || kg.bhusuKg > 0) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-bold">
                      {kg.ghariKg > 0 && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(kg.ghariKg)} kg Ghari</span>}
                      {kg.bhusuKg > 0 && <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-950 dark:text-purple-300">{fmtKg(kg.bhusuKg)} kg Bhusu</span>}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-sm font-black text-text-main">{st.boxes}</span>
                <button onClick={async () => { try { await ghariService.stockChallanPdf(st, { share: true }); } catch (e) { alertError('Challan failed', e?.message || ''); } }} title="Stock challan (PDF)" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-light bg-bg-base text-text-muted hover:border-primary hover:text-primary"><Download className="h-3.5 w-3.5" /></button>
                {canEdit && <button onClick={() => { setAdding(false); setEditing(st); try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* ignore */ } }} title="Edit issue" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-light bg-bg-base text-text-muted hover:border-primary hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>}
                {canEdit && <button onClick={() => voidIssue(st)} title="Remove issue" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
              ); })}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Call list (confirm with karyakartas) ─────────────
// A dedicated screen for the "ring every karyakarta and confirm their order"
// flow. You filter orders down (by customer, by karyakarta, by product type),
// hand-pick the exact orders that belong to that person — because some orders
// are entered by the admin under a karyakarta's name without the karyakarta
// knowing — then read a live dashboard computed ONLY from the ticked orders:
// total Ghari/Bhusu weight, box counts per size, and the delivery / payment
// state of each selected order. Selection-driven, nothing is written here.
const LIST_CAP = 200; // max order rows rendered at once — keeps mobile smooth
// ───────────────────────── Ghari follow-up (tagged, not ordered) ─────────────
// Devotees who carry the "Ghaari Seva" tag but have NOT placed a Ghari order this
// season — the outreach list. Call / WhatsApp each to invite them to order.
function GhariFollowupView({ season }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick(t => t + 1);
    window.addEventListener('ac-ghari-changed', on);
    window.addEventListener('ac-ghari-synced', on);
    window.addEventListener('ac-data-refreshed', on);
    return () => { window.removeEventListener('ac-ghari-changed', on); window.removeEventListener('ac-ghari-synced', on); window.removeEventListener('ac-data-refreshed', on); };
  }, []);
  const [q, setQ] = useState('');
  const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);

  // Everyone who already placed (or is a named recipient on) a Ghari order this season.
  const buyers = useMemo(() => {
    const ids = new Set(), mobs = new Set();
    (ghariService.getOrders(season) || []).forEach(o => {
      if (o.devoteeId) ids.add(String(o.devoteeId));
      const m = last10(o.customerMobile); if (m) mobs.add(m);
      (o.subOrders || []).forEach(so => { if (so.devoteeId) ids.add(String(so.devoteeId)); const sm = last10(so.mobile); if (sm) mobs.add(sm); });
    });
    return { ids, mobs };
  }, [season, tick]);

  const tagged = useMemo(() => {
    const seen = new Set();
    return (dataService.getDevotees() || []).filter(d => {
      if (!(d.tags || []).includes('ghaari-seva')) return false;
      if (seen.has(d.id)) return false; seen.add(d.id);
      return true;
    });
  }, [tick]);

  const pending = useMemo(() => {
    const list = tagged.filter(d => {
      if (d.id && buyers.ids.has(String(d.id))) return false;
      const m = last10(d.mobile), w = last10(d.whatsapp);
      if (m && buyers.mobs.has(m)) return false;
      if (w && buyers.mobs.has(w)) return false;
      return true;
    });
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, '');
    const f = s ? list.filter(d => (d.name || '').toLowerCase().includes(s) || (d.area || '').toLowerCase().includes(s) || (digits && last10(d.mobile).includes(digits))) : list;
    return f.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [tagged, buyers, q]);

  const telHref = (d) => { const n = last10(d.mobile || d.whatsapp); return n ? `tel:+91${n}` : null; };
  const waHref = (d) => { const n = last10(d.whatsapp || d.mobile); if (!n) return null; const txt = encodeURIComponent(`Jai Swaminarayan ${d.firstName || d.name || ''} 🙏\nGhari Seva no laabh levaa maate aapno Ghari order aapva namra vinanti. 🙏`); return `https://wa.me/91${n}?text=${txt}`; };

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border-light bg-surface p-3"><div className="text-[11px] font-bold uppercase text-text-muted">Ghari-tagged</div><div className="text-xl font-black text-text-main">{tagged.length}</div></div>
        <div className="rounded-2xl border border-border-light bg-surface p-3"><div className="text-[11px] font-bold uppercase text-text-muted">Yet to order</div><div className="text-xl font-black text-[#EA580C]">{pending.length}</div></div>
      </div>
      <div className="mb-3 flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2.5">
        <Search className="h-4 w-4 text-text-muted" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, mobile or area…" className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
        {q && <button onClick={() => setQ('')}><X className="h-4 w-4 text-text-muted" /></button>}
      </div>
      {pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-light bg-surface py-12 text-center">
          <UserPlus className="mx-auto mb-2 h-10 w-10 text-text-muted" />
          <p className="text-sm font-bold text-text-muted">{tagged.length ? 'Everyone tagged for Ghaari Seva has ordered 🎉' : 'No devotees carry the “Ghaari Seva” tag yet.'}</p>
          <p className="mt-1 text-[11px] text-text-muted">This list shows devotees with the “Ghaari Seva” tag who haven't placed a Ghari order this season.</p>
        </div>
      ) : (
        <div className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border-light bg-surface">
          {pending.map(d => {
            const tel = telHref(d), wa = waHref(d);
            return (
              <div key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">{String(d.name || 'U')[0]}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-text-main">{d.name || '—'}</p>
                  <p className="truncate text-[11px] text-text-muted">{[d.area, last10(d.mobile)].filter(Boolean).join(' · ') || 'No contact on file'}</p>
                </div>
                {tel && <a href={tel} title="Call" className="flex h-9 items-center gap-1 rounded-xl bg-sky-50 px-2.5 text-xs font-black text-sky-700 dark:bg-sky-950 dark:text-sky-300"><Phone className="h-3.5 w-3.5" /> Call</a>}
                {wa && <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp" className="flex h-9 items-center gap-1 rounded-xl bg-emerald-50 px-2.5 text-xs font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><MessageCircle className="h-3.5 w-3.5" /> WA</a>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CallListView({ season }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick(t => t + 1);
    window.addEventListener('ac-ghari-changed', on);
    window.addEventListener('ac-ghari-synced', on);
    return () => { window.removeEventListener('ac-ghari-changed', on); window.removeEventListener('ac-ghari-synced', on); };
  }, []);

  const [custQ, setCustQ] = useState('');
  const [kkKey, setKkKey] = useState('all');         // 'all' or a karyakarta key
  const [delFilter, setDelFilter] = useState('all');  // all | pending | partial | delivered
  const [payFilter, setPayFilter] = useState('all');  // all | unpaid | partial | paid
  const [picked, setPicked] = useState(() => new Set()); // order ids selected for the dashboard

  // Clear the selection whenever the karyakarta (or season) changes, so the
  // dashboard never mixes ticks from two different people.
  useEffect(() => { setPicked(new Set()); }, [kkKey, season]);

  const allOrders = useMemo(() => ghariService.getOrders(season), [season, tick]);
  const kkOptions = useMemo(() => {
    try { return ghariService.karyakartaList(season); } catch { return []; }
  }, [season, tick]);

  // The filtered list the checkboxes act on.
  const filtered = useMemo(() => {
    const q = custQ.trim().toLowerCase();
    return allOrders.filter(o => {
      if (kkKey !== 'all' && ghariService.orderKaryakartaKey(o) !== kkKey) return false;
      if (q && !(o.customerName || '').toLowerCase().includes(q)) return false;
      if (delFilter !== 'all' && orderDelState_(o) !== delFilter) return false;
      if (payFilter !== 'all' && orderPayState_(o) !== payFilter) return false;
      return true;
    });
  }, [allOrders, custQ, kkKey, delFilter, payFilter]);

  // The dashboard counts only ticked orders that are still visible under the
  // current filters — so a hidden order never leaks into the summary.
  const selected = useMemo(() => filtered.filter(o => picked.has(o.id)), [filtered, picked]);
  const allShownPicked = filtered.length > 0 && filtered.every(o => picked.has(o.id));

  const toggleOne = (id) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setPicked(prev => {
    const n = new Set(prev);
    if (allShownPicked) { filtered.forEach(o => n.delete(o.id)); }
    else { filtered.forEach(o => n.add(o.id)); }
    return n;
  });
  const clearPicked = () => setPicked(new Set());

  // Dashboard aggregates across the ticked orders only.
  const dash = useMemo(() => {
    let ghariKg = 0, bhusuKg = 0, total = 0, paid = 0;
    let deliveredN = 0, partialN = 0, pendingN = 0;
    let paidN = 0, partPaidN = 0, unpaidN = 0;
    const ghariSizes = {}; // size label -> qty (boxes)
    const bhusuSizes = {}; // size label -> qty (packets)
    const catOrder = Object.keys(GHARI_CATEGORIES); // ghee, noghee, sf, bhusu
    // Pending (still-to-deliver) quantities, kept per karyakarta + sku so we can
    // net each karyakarta's advance stock in hand against their own pending.
    const pendByKk = {}; // kkKey -> { sku -> { name, category, size, qty } }
    const nameByKk = {}; // kkKey -> karyakarta display name (for name-based stock fallback)
    const selKk = new Set(); // every karyakarta key present in the selection
    selected.forEach(o => {
      const kg = ghariService.orderKg(o);
      ghariKg += kg.ghariKg; bhusuKg += kg.bhusuKg;
      total += Number(o.total || 0);
      const rec = Number(o.paymentReceived || 0);
      paid += rec;
      const items = o.items || [];
      const tot = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
      const db = Number(o.deliveredBoxes || 0);
      const kkKey = ghariService.orderKaryakartaKey(o);
      nameByKk[kkKey] = o.karyakarta || nameByKk[kkKey] || '';
      selKk.add(kkKey);
      // Boxes already delivered on this order (all if marked delivered, else the
      // partial count), allocated across items in order — matches stock reconciliation.
      let deliveredBoxes = (o.delivered || (tot > 0 && db >= tot)) ? tot : Math.max(0, Math.min(tot, Math.round(db)));
      items.forEach(it => {
        const q = Number(it.qty) || 0; if (!q) return;
        const label = (it.size || '').trim() || '—';
        if (it.category === 'bhusu') bhusuSizes[label] = (bhusuSizes[label] || 0) + q;
        else ghariSizes[label] = (ghariSizes[label] || 0) + q;
        // pending portion of this line
        const deliv = Math.min(q, deliveredBoxes); deliveredBoxes -= deliv;
        const pend = q - deliv; if (pend <= 0) return;
        const bucket = (pendByKk[kkKey] = pendByKk[kkKey] || {});
        const row = (bucket[it.sku] = bucket[it.sku] || { name: cleanName_(it.name), category: it.category || 'ghee', size: label, qty: 0 });
        row.qty += pend;
      });
      // delivery status
      if (o.delivered || (tot > 0 && db >= tot)) deliveredN++;
      else if (db > 0) partialN++;
      else pendingN++;
      // payment status
      const bal = Number(o.total || 0) - rec;
      if (rec <= 0) unpaidN++;
      else if (bal > 0) partPaidN++;
      else paidN++;
    });

    // Advance stock each karyakarta is still holding (issued − delivered), per sku.
    // We deduct it from their own pending, since those boxes are already with them.
    // Indexed by the stock key AND by normalized name, because a karyakarta's stock
    // issue and their orders don't always carry the same id (one may be name-only),
    // which would otherwise leave the advance unmatched.
    const inHandByKey = {}, inHandByName = {};
    const balByKey = {}, balByName = {}; // full balance row (issued/delivered/inHand)
    const normName = (n) => (n || '').trim().toLowerCase();
    try {
      ghariService.buildStockBalances(season).forEach(r => {
        const m = {}; r.lines.forEach(l => { if (l.inHand > 0) m[l.sku] = l.inHand; });
        inHandByKey[r.key] = m;
        balByKey[r.key] = r;
        const nk = normName(r.name);
        if (nk) {
          const t = inHandByName[nk] || (inHandByName[nk] = {}); Object.entries(m).forEach(([sku, q]) => { t[sku] = (t[sku] || 0) + q; });
          if (!balByName[nk]) balByName[nk] = r;
        }
      });
    } catch { /* ignore — show gross pending if balances unavailable */ }

    // Per-product breakdown: ordered (pending) vs advance in hand vs still needed.
    // Netting is per karyakarta (one person's stock never covers another's), then
    // the rows are summed per product (sku) across the selected karyakartas.
    const rows = {}; // sku -> { name, category, size, pending, inHand, needed }
    const prodMeta = {}; try { ghariService.getProducts().forEach(p => { prodMeta[p.sku] = p; }); } catch { /* ignore */ }
    const ensureRow = (sku, meta) => (rows[sku] = rows[sku] || { sku, name: cleanName_(meta.name), category: meta.category || 'ghee', size: (meta.size || '').trim() || '—', pending: 0, inHand: 0, needed: 0 });
    Object.entries(pendByKk).forEach(([kkKey, bySku]) => {
      // Prefer an exact key match; fall back to matching by name.
      const src = inHandByKey[kkKey] || inHandByName[normName(nameByKk[kkKey])] || {};
      const hand = { ...src };
      Object.entries(bySku).forEach(([sku, info]) => {
        const avail = hand[sku] || 0;
        const pend = info.qty;
        const used = Math.min(avail, pend);
        const need = pend - used;
        const row = ensureRow(sku, info);
        row.pending += pend; row.inHand += avail; row.needed += need;
        hand[sku] = Math.max(0, avail - used); // leftover advance (not ordered)
      });
      // Advance stock the karyakarta holds for products with NO pending order.
      Object.entries(hand).forEach(([sku, left]) => {
        if (left <= 0 || (bySku[sku])) return;
        const row = ensureRow(sku, prodMeta[sku] || { name: sku, size: '', category: 'ghee' });
        row.inHand += left; // pending stays 0, needed stays 0
      });
    });
    const giveRows = Object.values(rows)
      .sort((a, b) => (catOrder.indexOf(a.category) - catOrder.indexOf(b.category)) || a.name.localeCompare(b.name) || sizeKg_(a.size) - sizeKg_(b.size));
    const totalNeeded = giveRows.reduce((s, r) => s + r.needed, 0);

    // When exactly one karyakarta is in the selection, surface their advance-stock
    // reconciliation (Issued / Delivered / In-hand). This is where "Nirdoshbhai
    // took 5 boxes" shows up — and it exposes a data issue (e.g. In-hand 0 because
    // the delivered count already equals the issued, so nothing is credited).
    let advStock = null;
    if (selKk.size === 1) {
      const kk = [...selKk][0];
      const row = balByKey[kk] || balByName[normName(nameByKk[kk])] || null;
      if (row) {
        const lines = (row.lines || []).filter(l => l.issued > 0).map(l => ({
          name: cleanName_(l.name), category: l.category || 'ghee', size: (l.size || '').trim() || '—',
          issued: l.issued, delivered: l.delivered, inHand: l.inHand,
        })).sort((a, b) => (catOrder.indexOf(a.category) - catOrder.indexOf(b.category)) || a.name.localeCompare(b.name) || sizeKg_(a.size) - sizeKg_(b.size));
        if (lines.length) advStock = { name: nameByKk[kk] || row.name || '', lines };
      }
    }

    // Sort size labels by their kg weight so 250gm < 500gm < 1kg reads naturally.
    const sortSizes = (obj) => Object.entries(obj).sort((a, b) => sizeKg_(a[0]) - sizeKg_(b[0]));
    return {
      ghariKg, bhusuKg, total, paid, bal: total - paid,
      deliveredN, partialN, pendingN, paidN, partPaidN, unpaidN,
      ghariSizes: sortSizes(ghariSizes), bhusuSizes: sortSizes(bhusuSizes),
      giveRows, totalNeeded, advStock,
    };
  }, [selected]);

  return (
    <div>
      {/* Filters */}
      <div className="mb-3 space-y-2">
        {/* Customer search */}
        <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2">
          <Search className="h-4 w-4 text-text-muted" />
          <input value={custQ} onChange={e => setCustQ(e.target.value)} placeholder="Search customer name"
            className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
          {custQ && <button onClick={() => setCustQ('')}><X className="h-4 w-4 text-text-muted" /></button>}
        </div>
        {/* Karyakarta — own row so the dropdown has full width */}
        <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2">
          <Users className="h-4 w-4 shrink-0 text-text-muted" />
          <select value={kkKey} onChange={e => setKkKey(e.target.value)}
            className="w-full bg-transparent text-sm font-bold text-text-main outline-none">
            <option value="all">All karyakartas</option>
            {kkOptions.map(k => <option key={k.key} value={k.key}>{k.name}</option>)}
          </select>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
        </div>
        {/* Delivery status filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-wide text-text-muted">Delivery</span>
          {[['all', 'All'], ['pending', 'Pending'], ['partial', 'Partial'], ['delivered', 'Delivered']].map(([id, label]) => (
            <button key={id} onClick={() => setDelFilter(id)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${delFilter === id ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-muted'}`}>{label}</button>
          ))}
        </div>
        {/* Payment status filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-wide text-text-muted">Payment</span>
          {[['all', 'All'], ['unpaid', 'Unpaid'], ['partial', 'Part-paid'], ['paid', 'Paid']].map(([id, label]) => (
            <button key={id} onClick={() => setPayFilter(id)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${payFilter === id ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-muted'}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Dashboard — selected orders only */}
      <div className="mb-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-black text-text-main">
            <BarChart3 className="h-4 w-4 text-primary" />
            Selected: {selected.length} order{selected.length === 1 ? '' : 's'}
          </div>
          {picked.size > 0 && <button onClick={clearPicked} className="text-[11px] font-black text-primary">Clear</button>}
        </div>
        {selected.length === 0 ? (
          <p className="py-2 text-center text-[12px] font-bold text-text-muted">Tick orders below to build the summary.</p>
        ) : (
          <div className="space-y-2.5">
            {/* Weight */}
            <div className="flex flex-wrap gap-1.5">
              {dash.ghariKg > 0 && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-black text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(dash.ghariKg)} kg Ghari</span>}
              {dash.bhusuKg > 0 && <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-black text-purple-700 dark:bg-purple-950 dark:text-purple-300">{fmtKg(dash.bhusuKg)} kg Bhusu</span>}
            </div>
            {/* Boxes by size */}
            {dash.ghariSizes.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-text-muted">Ghari boxes ordered (total)</div>
                <div className="flex flex-wrap gap-1.5">
                  {dash.ghariSizes.map(([size, qty]) => (
                    <span key={size} className="rounded-lg border border-orange-200 bg-surface px-2 py-1 text-[11px] font-black text-text-main dark:border-orange-900">{size}: <span className="text-orange-600 dark:text-orange-300">{qty}</span></span>
                  ))}
                </div>
              </div>
            )}
            {dash.bhusuSizes.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-text-muted">Bhusu packets ordered (total)</div>
                <div className="flex flex-wrap gap-1.5">
                  {dash.bhusuSizes.map(([size, qty]) => (
                    <span key={size} className="rounded-lg border border-purple-200 bg-surface px-2 py-1 text-[11px] font-black text-text-main dark:border-purple-900">{size}: <span className="text-purple-600 dark:text-purple-300">{qty}</span></span>
                  ))}
                </div>
              </div>
            )}
            {/* Stock to give — per product: how much is ordered (pending), how
                much advance stock the karyakarta already holds, and the remaining
                stock you still need to give (highlighted). The call-confirm figure. */}
            {dash.giveRows.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">📦 Stock to give</div>
                {/* Column header */}
                <div className="flex items-center gap-1 px-1 pb-1 text-[9px] font-black uppercase tracking-wide text-text-muted">
                  <span className="flex-1">Item</span>
                  <span className="w-12 text-center">Pending</span>
                  <span className="w-12 text-center">In hand</span>
                  <span className="w-14 text-center">Needed</span>
                </div>
                <div className="space-y-1">
                  {dash.giveRows.map(r => (
                    <div key={r.sku} className="flex items-center gap-1 rounded-lg border border-border-light bg-surface px-2 py-1.5">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-black text-text-main">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: GHARI_CATEGORIES[r.category]?.color || '#EA580C' }} />
                        <span className="truncate">{r.category === 'bhusu' ? 'Bhusu' : r.name} {r.size}</span>
                      </span>
                      <span className="w-12 text-center text-[12px] font-bold text-text-muted">{r.pending}</span>
                      <span className="w-12 text-center text-[12px] font-bold text-emerald-600 dark:text-emerald-400">{r.inHand}</span>
                      <span className={`w-14 rounded-md px-1 py-0.5 text-center text-[12px] font-black ${r.needed > 0 ? 'bg-amber-300 text-amber-900 dark:bg-amber-500 dark:text-amber-950' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>{r.needed > 0 ? r.needed : '✓'}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 text-[10px] font-bold text-text-muted">
                  Pending = still-undelivered boxes (delivered orders excluded, so this is less than the total ordered above) · In hand = advance stock they already hold · <span className="text-amber-700 dark:text-amber-300">Needed</span> = stock you still need to give.
                  {dash.totalNeeded === 0 && ' Everything is covered by advance stock in hand.'}
                </div>
              </div>
            )}
            {/* Advance stock issued to this karyakarta (shown when one person is
                selected). Issued = handed to them as advance · Delivered = of that,
                given to customers · In hand = still with them. If In hand is 0 while
                Issued > 0, the orders they fulfilled from it are marked delivered. */}
            {dash.advStock && (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-2.5 dark:border-teal-900 dark:bg-teal-950/30">
                <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-teal-700 dark:text-teal-300">🚚 Advance stock issued — {dash.advStock.name}</div>
                <div className="flex items-center gap-1 px-1 pb-1 text-[9px] font-black uppercase tracking-wide text-text-muted">
                  <span className="flex-1">Item</span>
                  <span className="w-12 text-center">Issued</span>
                  <span className="w-14 text-center">Delivered</span>
                  <span className="w-12 text-center">In hand</span>
                </div>
                <div className="space-y-1">
                  {dash.advStock.lines.map((l, i) => (
                    <div key={i} className="flex items-center gap-1 rounded-lg border border-border-light bg-surface px-2 py-1.5">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-black text-text-main">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: GHARI_CATEGORIES[l.category]?.color || '#0D9488' }} />
                        <span className="truncate">{l.category === 'bhusu' ? 'Bhusu' : l.name} {l.size}</span>
                      </span>
                      <span className="w-12 text-center text-[12px] font-bold text-text-main">{l.issued}</span>
                      <span className="w-14 text-center text-[12px] font-bold text-text-muted">{l.delivered}</span>
                      <span className="w-12 text-center text-[12px] font-black text-teal-600 dark:text-teal-300">{l.inHand}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Status + money */}
            <div className="flex flex-wrap gap-1.5 text-[10px] font-black">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Delivered {dash.deliveredN}</span>
              {dash.partialN > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Partial {dash.partialN}</span>}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Pending {dash.pendingN}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Paid {dash.paidN}</span>
              {dash.partPaidN > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Part-paid {dash.partPaidN}</span>}
              {dash.unpaidN > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700 dark:bg-rose-950 dark:text-rose-300">Unpaid {dash.unpaidN}</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border-light pt-2 text-[12px] font-black text-text-main">
              <span>Total {rupee(dash.total)}</span>
              <span className="text-emerald-600">Paid {rupee(dash.paid)}</span>
              {dash.bal > 0 && <span className="text-rose-600">Due {rupee(dash.bal)}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Select-all bar */}
      <div className="mb-2 flex items-center justify-between px-1">
        <button onClick={toggleAll} disabled={filtered.length === 0} className="flex items-center gap-1.5 text-[12px] font-black text-primary disabled:opacity-40">
          <span className={`grid h-4 w-4 place-items-center rounded border ${allShownPicked ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface'}`}>{allShownPicked && <Check className="h-3 w-3" />}</span>
          {allShownPicked ? 'Clear all' : 'Select all'}
        </button>
        <span className="text-[11px] font-bold text-text-muted">{filtered.length} shown</span>
      </div>

      {/* Order list with checkboxes. Capped so a season with hundreds of orders
          never freezes a phone rendering them all at once — narrow with the
          karyakarta / search filters (the normal call-list flow) to see the rest. */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-light bg-surface py-10 text-center">
          <Package className="mx-auto mb-2 h-10 w-10 text-text-muted" />
          <p className="text-sm font-bold text-text-muted">No orders match these filters</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
          {filtered.slice(0, LIST_CAP).map(o => {
            const on = picked.has(o.id);
            const rec = Number(o.paymentReceived || 0);
            const bal = Number(o.total || 0) - rec;
            const paidState = rec <= 0 ? 'unpaid' : bal > 0 ? 'partial' : 'paid';
            const tot = (o.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
            const db = Number(o.deliveredBoxes || 0);
            const delState = (o.delivered || (tot > 0 && db >= tot)) ? 'delivered' : db > 0 ? 'partial' : 'pending';
            const kg = ghariService.orderKg(o);
            return (
              <button key={o.id} onClick={() => toggleOne(o.id)}
                className={`flex w-full items-center gap-2.5 border-b border-border-light px-3 py-2.5 text-left last:border-0 ${on ? 'bg-primary/5' : ''}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface'}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-black text-text-main">{o.customerName || '—'}</span>
                    <span className="shrink-0 text-[10px] font-bold text-text-muted">#{o.orderNo}</span>
                  </div>
                  <div className="truncate text-[11px] font-bold text-text-muted">{o.karyakarta || '—'}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] font-bold">
                    {kg.ghariKg > 0 && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(kg.ghariKg)} kg</span>}
                    {kg.bhusuKg > 0 && <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-950 dark:text-purple-300">{fmtKg(kg.bhusuKg)} kg</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${delState === 'delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : delState === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{delState === 'delivered' ? 'Delivered' : delState === 'partial' ? `${db}/${tot}` : 'Pending'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${paidState === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : paidState === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>{paidState === 'paid' ? 'Paid' : paidState === 'partial' ? `Due ${rupee(bal)}` : 'Unpaid'}</span>
                </div>
              </button>
            );
          })}
          {filtered.length > LIST_CAP && (
            <div className="border-t border-border-light bg-bg-base px-3 py-2.5 text-center text-[11px] font-bold text-text-muted">
              Showing first {LIST_CAP} of {filtered.length}. Pick a karyakarta or search a customer to narrow down.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Main page ────────────────────────────────────────
export default function GhariPage({ user }) {
  // Add/edit (create, edit, delete orders) = Admins, PLUS any specific user an Admin
  // has granted Ghari edit access to (the `ghari` module, toggled per-user in
  // Admin → Users). Everyone else — Sevaks/devotees/karyakartas without the grant —
  // is view-only for the order and can ONLY mark delivery/payment (see canDeliver).
  // Mirrors the backend ghariCanWrite_.
  // Mirror the backend ghariCanWrite_ EXACTLY: write = Admin role, OR the literal
  // 'ghari' grant in the user's `modules`. We must NOT use dataService.hasModule here
  // — it treats every Sevak as having 'ghari' (so they can VIEW the module), which
  // would wrongly show Sevaks the edit UI even though the backend rejects their
  // writes. Sevaks are view-only (they still get stock view + challan below).
  const ghariModuleGranted = String(user?.modules || '')
    .split(/[,|]/).map(s => s.trim().toLowerCase()).includes('ghari');
  const canEdit = isAdminRole(user) || ghariModuleGranted;
  // Delivery is a lighter right than editing: anyone who can open Ghari Seva
  // (Karyakartas, Sevaks, devotees) may mark an order delivered or partially
  // delivered, even though they cannot change items or payment. The page is only
  // reachable by users with Ghari access, so every viewer here qualifies.
  const canDeliver = true;
  // The Log is visible to Admins (everyone's actions) and Sevaks (their own only).
  const isSevak = isSevakRole(user);
  const canSeeLog = canEdit || isSevak;
  // Sevaks may VIEW the advance-stock screen (what's issued, what's at home) and
  // download challans, but cannot issue / edit / remove stock. Admins/ghari-module
  // users get full write access. (Write is still enforced server-side.)
  const canSeeStock = canEdit || isSevak;
  const [tab, setTab] = useState(canEdit ? 'entry' : 'orders');
  const [season, setSeasonState] = useState(ghariService.getSeason());
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | undelivered | unpaid
  const [groupBy, setGroupBy] = useState('none'); // none | kk (karyakarta-wise)
  const [toast, setToast] = useState('');

  useEffect(() => { ghariService.init(); ghariService.syncDown().then(() => setTick(t => t + 1)); }, []);
  useEffect(() => {
    const onChange = () => setTick(t => t + 1);
    // A write the backend rejected (e.g. permission) — tell the user WHY instead of
    // letting the edit silently revert on the next sync.
    const onError = (e) => alertError('Could not save to the server', e?.detail?.message || 'The change was rejected by the backend and has been undone.');
    window.addEventListener('ac-ghari-changed', onChange);
    window.addEventListener('ac-ghari-synced', onChange);
    window.addEventListener('ac-ghari-error', onError);
    return () => { window.removeEventListener('ac-ghari-changed', onChange); window.removeEventListener('ac-ghari-synced', onChange); window.removeEventListener('ac-ghari-error', onError); };
  }, []);

  const setSeason = (s) => {
    ghariService.setSeason(s); setSeasonState(s); setTick(t => t + 1);
    // Pull that season on demand (scoped) — other years aren't fetched until picked.
    ghariService.syncDown(s).then(() => setTick(t => t + 1)).catch(() => {});
  };
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  const orders = useMemo(() => {
    let list = ghariService.getOrders(season);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(o => o.customerName.toLowerCase().includes(q) || o.karyakarta.toLowerCase().includes(q));
    if (filter === 'undelivered') list = list.filter(o => !o.delivered);
    if (filter === 'delivered') list = list.filter(o => o.delivered);
    if (filter === 'unpaid') list = list.filter(o => (o.total - Number(o.paymentReceived || 0)) > 0);
    if (filter === 'paid') list = list.filter(o => Number(o.paymentReceived || 0) > 0 && (o.total - Number(o.paymentReceived || 0)) <= 0);
    // Only the Undelivered tab sorts by delivery date (soonest first, undated last)
    // — it's the delivery-planning view. Every other tab keeps getOrders' default
    // latest-first (order-no descending) order. A stable sort keeps undated rows
    // in that latest-first order among themselves.
    if (filter === 'undelivered') {
      list = list.slice().sort((a, b) => {
        const da = (a.deliveryDate || '').trim();
        const db = (b.deliveryDate || '').trim();
        if (da && db) return da < db ? -1 : da > db ? 1 : 0;
        if (da) return -1;
        if (db) return 1;
        return 0;
      });
    }
    return list;
  }, [season, search, filter, tick]);

  // Total Ghari & Bhusu weight across the currently filtered/searched orders —
  // shown next to the order count. Reuses the same per-order kg split used on each
  // row (ghariService.orderKg), so it never diverges from the badges below.
  const orderTotals = useMemo(() => {
    let ghariKg = 0, bhusuKg = 0;
    orders.forEach(o => { const k = ghariService.orderKg(o); ghariKg += k.ghariKg; bhusuKg += k.bhusuKg; });
    return { ghariKg, bhusuKg };
  }, [orders]);

  // Karyakarta-wise grouping for the delivery-planning flow. Built from the same
  // filtered/searched/sorted `orders`. Groups with any undelivered order (the ones
  // still needing a date) come first; within that, earliest shared delivery date
  // first, then undated; fully-delivered groups sink to the bottom.
  const karyakartaGroups = useMemo(() => {
    const nameByKey = {};
    try { ghariService.karyakartaList(season).forEach(k => { nameByKey[k.key] = k.name; }); } catch { /* ignore */ }
    const map = new Map();
    orders.forEach(o => {
      const key = ghariService.orderKaryakartaKey(o);
      if (!map.has(key)) map.set(key, { key, name: nameByKey[key] || o.karyakarta || '—', orders: [] });
      map.get(key).orders.push(o);
    });
    const groups = [...map.values()].map(g => {
      const undelivered = g.orders.filter(o => !o.delivered);
      const dates = undelivered.map(o => (o.deliveryDate || '').trim()).filter(Boolean).sort();
      return { ...g, pending: undelivered.length, soonest: dates[0] || '' };
    });
    groups.sort((a, b) => {
      if (!!a.pending !== !!b.pending) return a.pending ? -1 : 1; // groups still to deliver first
      const da = a.soonest, db = b.soonest;
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (da !== db) return da ? -1 : 1; // dated before undated
      return a.name.localeCompare(b.name);
    });
    return groups;
  }, [orders, season]);

  if (!dataService.hasModule(user, 'ghari')) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Package className="mx-auto mb-3 h-12 w-12 text-text-muted" />
        <h2 className="text-lg font-black text-text-main">Ghari Seva</h2>
        <p className="mt-1 text-sm text-text-muted">You don't have access to this module. Ask an Admin to grant you Ghari Seva access.</p>
      </div>
    );
  }

  const TABS = [
    ...(canEdit ? [{ id: 'entry', label: 'Sell', icon: Plus }] : []),
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'calllist', label: 'Call list', icon: Phone },
    { id: 'ghariFollowup', label: 'Follow-up', icon: UserPlus },
    { id: 'purchases', label: 'Buy', icon: ShoppingCart },
    { id: 'report', label: 'Insights', icon: BarChart3 },
    ...(canSeeStock ? [{ id: 'stock', label: 'Stock', icon: Boxes }] : []),
    ...(canSeeLog ? [{ id: 'log', label: 'Log', icon: History }] : []),
    ...(canEdit ? [{ id: 'trash', label: 'Trash', icon: RotateCcw }] : []),
    ...(canEdit ? [{ id: 'settings', label: 'Settings', icon: SettingsIcon }] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-5">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-text-main">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow">🪔</span>
            Ghari Seva <span className="text-base font-bold text-text-muted">{season}</span>
          </h1>
        </div>
        <SyncStrip />
      </div>

      {/* Sub-nav */}
      <div className="mb-4 flex gap-1 rounded-2xl border border-border-light bg-surface p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition-all ${tab === t.id ? 'bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow' : 'text-text-muted hover:bg-bg-base'}`}>
            <t.icon className="h-4 w-4" /> <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {toast && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-lg">{toast}</div>
      )}

      {tab === 'entry' && (
        <OrderForm embedded onManageItems={() => setTab('settings')} onSaved={(o, again) => flash(again ? `Saved ✓ ${o.customerName} — add next` : `Order saved ✓ ${rupee(o.total)}`)} />
      )}

      {tab === 'orders' && (
        <div>
          <div className="mb-2.5 flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2">
            <Search className="h-4 w-4 text-text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer or karyakarta"
              className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
            {search && <button onClick={() => setSearch('')}><X className="h-4 w-4 text-text-muted" /></button>}
          </div>
          <DeliverySchedule season={season} orders={ghariService.getOrders(season)} onOpen={setEditing} />
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {[['all', 'All'], ['undelivered', 'Undelivered'], ['delivered', 'Delivered'], ['unpaid', 'Unpaid'], ['paid', 'Paid']].map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${filter === id ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-muted'}`}>{label}</button>
            ))}
            <button onClick={() => setGroupBy(g => g === 'kk' ? 'none' : 'kk')}
              title="Group orders by karyakarta — set one delivery date for all their orders"
              className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-black ${groupBy === 'kk' ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-muted'}`}>
              <Users className="h-3.5 w-3.5" /> Karyakarta-wise
            </button>
            {canEdit && (
              <button onClick={async () => { try { await ghariService.printableOrderSheet(season); } catch (e) { alertError('Could not create sheet', e?.message || ''); } }}
                className="ml-auto flex items-center gap-1 rounded-full border border-border-light bg-surface px-3 py-1.5 text-[11px] font-black text-text-muted hover:border-primary hover:text-primary" title="Printable blank order sheet (PDF)">
                <Download className="h-3.5 w-3.5" /> Print sheet
              </button>
            )}
            <div className={`${canEdit ? '' : 'ml-auto '}flex flex-wrap items-center gap-1.5 self-center`}>
              <span className="text-[11px] font-bold text-text-muted">{orders.length} order{orders.length === 1 ? '' : 's'}</span>
              {orderTotals.ghariKg > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(orderTotals.ghariKg)} kg Ghari</span>
              )}
              {orderTotals.bhusuKg > 0 && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-700 dark:bg-purple-950 dark:text-purple-300">{fmtKg(orderTotals.bhusuKg)} kg Bhusu</span>
              )}
            </div>
          </div>
          {orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-light bg-surface py-12 text-center">
              <Package className="mx-auto mb-2 h-10 w-10 text-text-muted" />
              <p className="text-sm font-bold text-text-muted">No orders yet</p>
              <button onClick={() => setTab('entry')} className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white">+ New order</button>
            </div>
          ) : groupBy === 'kk' ? (
            <div className="space-y-2.5">
              {karyakartaGroups.filter(g => g.pending > 0).map(g => (
                <KaryakartaDeliveryGroup key={g.key} season={season} groupKey={g.key} name={g.name} orders={g.orders} onOpen={setEditing} />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
              {orders.map(o => <OrderRow key={o.id} order={o} onOpen={setEditing} />)}
            </div>
          )}
        </div>
      )}

      {tab === 'calllist' && <CallListView key={tick} season={season} />}
      {tab === 'ghariFollowup' && <GhariFollowupView key={tick} season={season} />}
      {tab === 'purchases' && <PurchasesView key={tick} season={season} canEdit={canEdit} />}
      {tab === 'report' && <ReportView key={tick} season={season} />}
      {tab === 'stock' && canSeeStock && <StockView key={tick} season={season} canEdit={canEdit} />}
      {tab === 'log' && canSeeLog && <GhariLogView key={tick} flash={flash} selfOnly={!canEdit} />}
      {tab === 'trash' && canEdit && <TrashView key={tick} season={season} flash={flash} onRestored={() => setTick(t => t + 1)} />}
      {tab === 'settings' && canEdit && <SettingsView season={season} onSeason={setSeason} />}

      {editing && <EditModal order={editing} canEdit={canEdit} canDeliver={canDeliver} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setTick(t => t + 1); flash(canEdit ? 'Order updated ✓' : ''); }} />}
    </div>
  );
}
