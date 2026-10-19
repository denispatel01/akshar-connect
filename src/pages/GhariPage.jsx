import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Minus, Search, X, Check, Trash2, Download, RefreshCw, Settings as SettingsIcon,
  Package, Truck, Wallet, ArrowLeft, User, Users, AlertCircle, CloudOff, Cloud, Eye, EyeOff, Pencil, MessageCircle, Phone, ChevronDown, ShoppingCart, Camera, Calendar, History, RotateCcw, Boxes,
} from 'lucide-react';
import { ghariService, GHARI_CATEGORIES } from '../services/ghariService';
import { dataService } from '../services/dataService';
import { alertError, confirmDialog } from '../utils/sweetAlert';
import { isAdminRole, isSevakRole } from '../utils/navItems';
import AutoTextarea from '../components/AutoTextarea';

const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
// One-decimal kilograms, e.g. 5, 2.5 — the team talks in kg of Ghari, not only ₹.
const fmtKg = (n) => (+(Number(n) || 0).toFixed(1)).toLocaleString('en-IN');

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
                    <div className="mt-2 text-right text-[12px] font-bold text-text-muted">{rTotals.boxes} box{rTotals.boxes === 1 ? '' : 'es'} · <span className="text-text-main">{rupee(rTotals.total)}</span></div>
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
          <div className="text-[10px] font-bold uppercase text-text-muted">{totals.boxes} box{totals.boxes === 1 ? '' : 'es'}</div>
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
                          <span className="shrink-0 text-[11px] font-bold text-text-muted">{st.boxes} box{st.boxes === 1 ? '' : 'es'} · {rupee(st.total)}</span>
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
                <div className="flex justify-between"><span className="font-semibold text-text-muted">{totals.boxes} box{totals.boxes === 1 ? '' : 'es'} · Total</span><span className="font-black text-text-main">{rupee(totals.total)}</span></div>
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
        <span className="shrink-0 font-black text-text-main"><span className="text-lg">{qty}</span> <span className="text-[11px] font-bold text-text-muted">box{qty === 1 ? '' : 'es'}</span></span>
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
                  <span className="shrink-0 font-black text-text-muted">{q} box{q === 1 ? '' : 'es'}</span>
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
          <span className="text-[11px] font-bold text-text-muted">{r.boxes} boxes total</span>
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
                  <span className="text-[11px] font-black" style={{ color: c.color }}>{catBoxes} box{catBoxes === 1 ? '' : 'es'}</span>
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

      {/* Stock reconciliation — bought (purchases) vs sold (orders) vs remaining. */}
      {r.purchasedBoxes > 0 && (
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-black text-text-main">Stock — bought vs sold</h3>
            <span className="text-[11px] font-bold text-text-muted">{r.purchasedBoxes} bought · {r.boxes} sold</span>
          </div>
          <div className="space-y-1">
            {ghariService.getProducts().map(p => {
              const bought = r.purchased[p.sku] || 0; const sold = (r.bySku[p.sku]?.qty) || 0;
              if (!bought && !sold) return null;
              const left = bought - sold;
              const low = left <= 0; // sold everything bought (or oversold) → restock
              return (
                <div key={p.sku} className="flex items-center justify-between text-xs">
                  <span className="font-bold text-text-main">{p.name.replace('Ghari ', '').replace(/[()]/g, '')} <span className="text-text-muted">{p.size}</span>{low && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-700 dark:bg-red-950 dark:text-red-300">RESTOCK</span>}</span>
                  <span className="shrink-0 font-black text-text-muted">
                    <span className="text-emerald-600">{bought} in</span> · <span className="text-rose-600">{sold} out</span> · <span className={left < 0 ? 'text-red-600' : left === 0 ? 'text-amber-600' : 'text-text-main'}>{left} left</span>
                  </span>
                </div>
              );
            })}
          </div>
          {r.purchaseCost > 0 && <div className="mt-2 border-t border-border-light pt-2 text-[11px] font-bold text-text-muted">Purchase cost {rupee(r.purchaseCost)} · Revenue {rupee(r.revenue)} · <span className={r.revenue - r.purchaseCost >= 0 ? 'text-emerald-600' : 'text-rose-600'}>Margin {rupee(r.revenue - r.purchaseCost)}</span></div>}
        </div>
      )}

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

  const commit = () => {
    onSave({ ...product, name: name.trim() || product.name, size: size.trim(), category, unitPrice: Number(price.replace(/[^\d]/g, '')) || 0 });
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
          <div className="flex items-center gap-0.5 rounded-lg border border-border-light bg-surface px-2">
            <span className="text-xs font-black text-text-main">₹</span>
            <input inputMode="numeric" value={price} onChange={e => setPrice(e.target.value.replace(/[^\d]/g, ''))}
              className="w-14 bg-transparent text-right text-xs font-black text-text-main outline-none" />
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
        <span className="text-[10px] font-semibold text-text-muted">{cat?.label} · ₹{product.unitPrice}{!product.active && ' · hidden'}</span>
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
  const add = () => {
    if (!name.trim()) { alertError('Name needed', 'Please enter the item name.'); return; }
    onAdd({ name: name.trim(), size: size.trim(), category, unitPrice: Number(price.replace(/[^\d]/g, '')) || 0 });
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
        <div className="flex items-center gap-0.5 rounded-lg border border-border-light bg-surface px-2">
          <span className="text-xs font-black text-text-main">₹</span>
          <input inputMode="numeric" value={price} onChange={e => setPrice(e.target.value.replace(/[^\d]/g, ''))} placeholder="0"
            className="w-14 bg-transparent text-right text-xs font-black text-text-main outline-none" />
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
        <p className="text-[12px] font-bold text-text-muted">{count}/{totalBoxes} box{totalBoxes === 1 ? '' : 'es'} delivered.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => commit(count - 1)} disabled={count <= 0}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-light bg-surface text-text-main active:scale-95 disabled:opacity-40">
              <Minus className="h-5 w-5" />
            </button>
            <div className="text-center">
              <div className="text-2xl font-black leading-none text-text-main">{count}<span className="text-base font-bold text-text-muted"> / {totalBoxes}</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-text-muted">boxes delivered</div>
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
            <p className="mt-2 text-center text-[11px] font-bold text-amber-700 dark:text-amber-300">{remaining} box{remaining === 1 ? '' : 'es'} still to deliver</p>
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
          <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Total cost (optional)</label>
          <div className="flex items-center gap-1 rounded-2xl border border-border-light bg-surface px-3 py-2.5">
            <span className="text-sm font-black text-text-main">₹</span>
            <input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className="w-full bg-transparent text-sm font-black text-text-main outline-none" />
          </div>
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
          <div className="text-[10px] font-bold uppercase text-text-muted">{boxes} box{boxes === 1 ? '' : 'es'} bought</div>
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

function PurchaseRow({ purchase, onOpen }) {
  const summary = purchase.items.map(i => `${i.qty}× ${i.name.replace('Ghari ', '').replace(/[()]/g, '')} ${i.size}`).join(', ');
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
        <div className="truncate text-[10px] font-semibold text-text-muted">{fmtDate_(purchase.date)} · {purchase.boxes} box{purchase.boxes === 1 ? '' : 'es'}{photoPending ? ' · photo not synced' : ''}</div>
        {(kg.ghariKg > 0 || kg.bhusuKg > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-bold">
            {kg.ghariKg > 0 && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(kg.ghariKg)} kg Ghari</span>}
            {kg.bhusuKg > 0 && <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-950 dark:text-purple-300">{fmtKg(kg.bhusuKg)} kg Bhusu</span>}
          </div>
        )}
      </div>
      {purchase.amount > 0 && <div className="shrink-0 text-sm font-black text-text-main">{rupee(purchase.amount)}</div>}
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
  useEffect(() => { const h = () => setTick(t => t + 1); window.addEventListener('ac-ghari-changed', h); window.addEventListener('ac-ghari-synced', h); return () => { window.removeEventListener('ac-ghari-changed', h); window.removeEventListener('ac-ghari-synced', h); }; }, []);
  const list = useMemo(() => ghariService.getPurchases(season), [season, tick]);
  const totalBoxes = list.reduce((s, p) => s + p.boxes, 0);
  const totalCost = list.reduce((s, p) => s + Number(p.amount || 0), 0);
  // Grand total Ghari vs Bhusu weight across every purchase this season.
  const totalKg = list.reduce((a, p) => { const k = ghariService.orderKg(p); return { ghariKg: a.ghariKg + k.ghariKg, bhusuKg: a.bhusuKg + k.bhusuKg }; }, { ghariKg: 0, bhusuKg: 0 });
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-border-light bg-surface p-3"><div className="text-[11px] font-bold uppercase text-text-muted">Purchases</div><div className="text-xl font-black text-text-main">{list.length}</div></div>
        <div className="rounded-2xl border border-border-light bg-surface p-3"><div className="text-[11px] font-bold uppercase text-text-muted">Boxes bought</div><div className="text-xl font-black text-text-main">{totalBoxes}</div></div>
        <div className="rounded-2xl border border-border-light bg-surface p-3"><div className="text-[11px] font-bold uppercase text-text-muted">Total cost</div><div className="text-xl font-black text-text-main">{totalCost ? rupee(totalCost) : '—'}</div></div>
      </div>
      {/* Total Ghari vs Bhusu bought this season (ghee/sugar-free etc. = Ghari, bhusu = Bhusu). */}
      {(totalKg.ghariKg > 0 || totalKg.bhusuKg > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total bought</span>
          {totalKg.ghariKg > 0 && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[12px] font-black text-orange-700 dark:bg-orange-950 dark:text-orange-300">🪔 {fmtKg(totalKg.ghariKg)} kg Ghari</span>}
          {totalKg.bhusuKg > 0 && <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[12px] font-black text-purple-700 dark:bg-purple-950 dark:text-purple-300">{fmtKg(totalKg.bhusuKg)} kg Bhusu</span>}
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
          {list.map(p => <PurchaseRow key={p.id} purchase={p} onOpen={setEditing} />)}
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
        <div className="pl-1 text-[11px] font-black uppercase text-text-muted">{boxes} box{boxes === 1 ? '' : 'es'}</div>
        <button onClick={save} className="ml-auto rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-5 py-2.5 text-sm font-black text-white shadow-md active:scale-95">{isEdit ? 'Save changes' : 'Issue stock'}</button>
      </div>
    </div>
  );
}

// One Karyakarta's holding — issued vs delivered vs in-hand, per item, with a kg
// summary. Negative in-hand (delivered more than issued) is flagged for reconciling.
function StockBalanceCard({ bal }) {
  const [open, setOpen] = useState(false);
  const anyShort = bal.lines.some(l => l.inHand < 0);
  return (
    <div className="overflow-hidden rounded-xl border border-border-light bg-bg-base">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 p-2.5 text-left">
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
        <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
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
    if (!(await confirmDialog({ title: 'Remove this issue?', text: `Remove the stock issued to ${st.karyakarta || 'this karyakarta'} (${st.boxes} boxes)? Their in-hand balance will adjust.`, confirmText: 'Remove', danger: true }))) return;
    ghariService.voidStock(st.id); refresh();
  };
  return (
    <div className="space-y-3">
      {/* Distributed vs at-home summary — what I've handed to karyakartas, and what
          I'm still holding (purchased − distributed). */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-text-muted"><Truck className="h-3.5 w-3.5 text-rose-500" /> Distributed</div>
          <div className="mt-1 text-2xl font-black text-text-main">{summary.distributed.boxes}<span className="ml-1 text-xs font-bold text-text-muted">boxes</span></div>
          <div className="text-[11px] font-bold text-text-muted">{fmtKg(summary.distributed.ghariKg)} kg Ghari · {fmtKg(summary.distributed.bhusuKg)} kg Bhusu</div>
        </div>
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-text-muted"><Package className="h-3.5 w-3.5 text-emerald-500" /> At home</div>
          <div className={`mt-1 text-2xl font-black ${summary.atHome.boxes < 0 ? 'text-red-600' : 'text-text-main'}`}>{summary.atHome.boxes}<span className="ml-1 text-xs font-bold text-text-muted">boxes</span></div>
          <div className="text-[11px] font-bold text-text-muted">{fmtKg(summary.atHome.ghariKg)} kg Ghari · {fmtKg(summary.atHome.bhusuKg)} kg Bhusu</div>
        </div>
      </div>
      <p className="px-1 text-[10px] font-semibold text-text-muted">At home = bought ({summary.purchased.boxes} boxes) − distributed ({summary.distributed.boxes} boxes).</p>

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
            {balances.map(b => <StockBalanceCard key={b.key} bal={b} />)}
          </div>
        )}
      </div>

      {issues.length > 0 && (
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <h3 className="mb-3 text-sm font-black text-text-main">Recent issues</h3>
          <div className="divide-y divide-border-light">
            {issues.map(st => (
              <div key={st.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black text-text-main">{st.karyakarta || '—'}</div>
                  <div className="truncate text-[11px] text-text-muted">{(st.items || []).map(i => `${i.qty}× ${i.name.replace('Ghari ', '')} ${i.size}`).join(', ')}</div>
                  <div className="text-[10px] font-semibold text-text-muted">{st.date ? new Date(st.date).toLocaleDateString('en-IN') : ''}{st.remarks ? ` · ${st.remarks}` : ''}{st.createdBy ? ` · by ${String(st.createdBy).replace(/\s*\(.*\)$/, '')}` : ''}</div>
                </div>
                <span className="shrink-0 text-sm font-black text-text-main">{st.boxes}</span>
                <button onClick={async () => { try { await ghariService.stockChallanPdf(st, { share: true }); } catch (e) { alertError('Challan failed', e?.message || ''); } }} title="Stock challan (PDF)" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-light bg-bg-base text-text-muted hover:border-primary hover:text-primary"><Download className="h-3.5 w-3.5" /></button>
                {canEdit && <button onClick={() => { setAdding(false); setEditing(st); try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* ignore */ } }} title="Edit issue" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-light bg-bg-base text-text-muted hover:border-primary hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>}
                {canEdit && <button onClick={() => voidIssue(st)} title="Remove issue" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
          </div>
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
    { id: 'purchases', label: 'Buy', icon: ShoppingCart },
    { id: 'report', label: 'Report', icon: Wallet },
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
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {[['all', 'All'], ['undelivered', 'Undelivered'], ['delivered', 'Delivered'], ['unpaid', 'Unpaid'], ['paid', 'Paid']].map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${filter === id ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-muted'}`}>{label}</button>
            ))}
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
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
              {orders.map(o => <OrderRow key={o.id} order={o} onOpen={setEditing} />)}
            </div>
          )}
        </div>
      )}

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
