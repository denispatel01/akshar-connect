import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Minus, Search, X, Check, Trash2, Download, RefreshCw, Settings as SettingsIcon,
  Package, Truck, Wallet, ArrowLeft, User, Users, AlertCircle, CloudOff, Cloud, Eye, EyeOff, Pencil, MessageCircle, Phone,
} from 'lucide-react';
import { ghariService, GHARI_CATEGORIES } from '../services/ghariService';
import { dataService } from '../services/dataService';
import { alertError } from '../utils/sweetAlert';

const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

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
  const change = (text) => { setQ(text); onText?.(text); setResults(ghariService.searchDevotees(text)); setOpen(true); };
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
            <button key={d.id} type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(d)}
              className="flex w-full items-center gap-3 border-b border-border-light px-3 py-2.5 text-left last:border-0 hover:bg-bg-base">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: accent === 'orange' ? '#FF9D52' : '#0D9488' }}>{d.name?.[0] || '?'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-text-main">{d.name}</span>
                <span className="block truncate text-[11px] text-text-muted">{[d.area, d.mobile].filter(Boolean).join(' · ')}</span>
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

function ProductCard({ product, qty, onChange }) {
  const cat = GHARI_CATEGORIES[product.category];
  const color = cat?.color || '#E56F18';
  const active = qty > 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 p-3 transition-all"
      style={{
        background: active ? tint(color, 0.18) : tint(color, 0.08),
        borderColor: active ? color : tint(color, 0.35),
        boxShadow: active ? `0 4px 14px ${tint(color, 0.25)}` : 'none',
      }}>
      <div className="absolute right-0 top-0 h-full w-1.5" style={{ background: color }} />
      <button onClick={() => onChange(qty + 1)} className="block w-full text-left">
        <div className="flex items-start justify-between gap-1">
          <span className="text-[13px] font-extrabold leading-tight text-text-main">{product.name}</span>
          {active && <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-black text-white">{qty}</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="rounded-md bg-bg-base px-1.5 py-0.5 text-[10px] font-bold text-text-muted">{product.size}</span>
          <span className="text-[11px] font-bold" style={{ color: cat?.color }}>{rupee(product.unitPrice)}</span>
        </div>
      </button>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <button onClick={() => onChange(Math.max(0, qty - 1))} disabled={!qty}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-light bg-surface text-text-main disabled:opacity-30 active:scale-95">
          <Minus className="h-4 w-4" />
        </button>
        <span className={`min-w-8 text-center text-lg font-black ${active ? 'text-primary' : 'text-text-muted'}`}>{qty}</span>
        <button onClick={() => onChange(qty + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow active:scale-95">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── Order form (new + edit) ──────────────────────────
function OrderForm({ initialOrder, onSaved, onCancel, embedded, onManageItems }) {
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
  const [customerName, setCustomerName] = useState(initialOrder?.customerName || '');
  const [customerMobile, setCustomerMobile] = useState(initialOrder?.customerMobile || '');
  const [devoteeId, setDevoteeId] = useState(initialOrder?.devoteeId || '');
  const [karyakarta, setKaryakarta] = useState(initialOrder?.karyakarta || '');
  const [karyakartaId, setKaryakartaId] = useState(initialOrder?.karyakartaId || '');
  const customerRef = useRef(null);
  const karyakartaRef = useRef(null);
  const mobileRef = useRef(null);
  const [delivered, setDelivered] = useState(initialOrder?.delivered || false);
  const [paymentType, setPaymentType] = useState(initialOrder?.paymentType || '');
  const [remarks, setRemarks] = useState(initialOrder?.remarks || '');
  const [payEdited, setPayEdited] = useState(isEdit);
  const [paymentReceived, setPaymentReceived] = useState(initialOrder?.paymentReceived ?? 0);

  const items = useMemo(() => Object.entries(cart).filter(([, q]) => q > 0).map(([sku, qty]) => {
    const p = bySku[sku]; return p ? { sku, name: p.name, size: p.size, category: p.category, qty, unitPrice: p.unitPrice } : null;
  }).filter(Boolean), [cart, bySku]);
  const totals = useMemo(() => ghariService.computeTotals(items), [items]);
  const paid = payEdited ? Number(paymentReceived || 0) : totals.total;
  const balance = totals.total - paid;

  const setQty = (sku, qty) => setCart(c => ({ ...c, [sku]: qty }));
  const reset = () => { setCart({}); setCustomerName(''); setCustomerMobile(''); setDevoteeId(''); setKaryakarta(''); setKaryakartaId(''); setDelivered(false); setPaymentType(''); setRemarks(''); setPayEdited(false); setPaymentReceived(0); };

  const save = (addAnother) => {
    if (!items.length) { alertError('Add items', 'Please add at least one item to the order.'); return; }
    if (!customerName.trim()) { alertError('Customer name needed', 'Please enter or pick a customer name.'); return; }
    const order = ghariService.saveOrder({
      id: initialOrder?.id, season: initialOrder?.season,
      customerName: customerName.trim(), customerMobile: String(customerMobile || '').replace(/\D/g, ''), devoteeId,
      karyakarta: karyakarta.trim(), karyakartaId,
      items, delivered,
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
    <div className="space-y-4">
      {/* People */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-text-muted">Customer</label>
          <DevoteePicker value={customerName} placeholder="Search devotee or type name"
            inputRef={customerRef} onCommit={() => karyakartaRef.current?.focus()}
            onText={(t) => { setCustomerName(t); setDevoteeId(''); }}
            onPick={(d) => { if (d) { setCustomerName(d.name); setDevoteeId(d.id); if (d.mobile) setCustomerMobile(String(d.mobile)); } else { setCustomerName(''); setDevoteeId(''); setCustomerMobile(''); } }} />
          <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2 focus-within:border-primary">
            <Phone className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <input ref={mobileRef} inputMode="numeric" value={customerMobile}
              onChange={(e) => setCustomerMobile(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
              placeholder="Mobile (for WhatsApp follow-up)" maxLength={13}
              className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted" />
          </div>
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
        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-text-muted">Items — tap to add</label>
        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-light bg-surface py-8 text-center">
            <Package className="mx-auto mb-2 h-9 w-9 text-text-muted" />
            <p className="text-sm font-bold text-text-muted">No items in the catalog</p>
            <button onClick={() => (onManageItems ? onManageItems() : ghariService.restoreDefaults())} className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white">Add items in Settings</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
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

      <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (optional)"
        className="w-full rounded-2xl border border-border-light bg-surface px-3 py-2.5 text-sm font-semibold text-text-main outline-none placeholder:font-medium placeholder:text-text-muted focus:border-primary" />

      {/* Category mini-breakdown */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.values(GHARI_CATEGORIES).map(c => totals.byCategory[c.key] > 0 && (
            <span key={c.key} className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: c.color }}>{c.short}: {rupee(totals.byCategory[c.key])}</span>
          ))}
        </div>
      )}

      {/* Sticky action bar */}
      <div className={`${embedded ? 'sticky z-20 bottom-[76px] md:bottom-3' : ''} flex items-center gap-2 rounded-2xl border border-border-light bg-surface/95 p-2.5 shadow-lg backdrop-blur`}>
        <div className="pl-1">
          <div className="text-[10px] font-bold uppercase text-text-muted">{totals.boxes} box{totals.boxes === 1 ? '' : 'es'}</div>
          <div className="text-2xl font-black leading-none text-text-main">{rupee(totals.total)}</div>
        </div>
        <div className="ml-auto flex gap-2">
          {onCancel && <button onClick={onCancel} className="rounded-xl border border-border-light px-4 py-2.5 text-sm font-bold text-text-muted">Cancel</button>}
          {!isEdit && <button onClick={() => save(true)} className="rounded-xl border-2 border-primary px-3 py-2.5 text-sm font-black text-primary">Save & new</button>}
          <button onClick={() => save(false)} className="rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-5 py-2.5 text-sm font-black text-white shadow-md active:scale-95">{isEdit ? 'Save' : 'Save order'}</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Order row (list) ─────────────────────────────────
function OrderRow({ order, onOpen }) {
  const bal = order.total - Number(order.paymentReceived || 0);
  const paidState = Number(order.paymentReceived || 0) <= 0 ? 'unpaid' : bal > 0 ? 'partial' : 'paid';
  const summary = order.items.map(i => `${i.qty}× ${i.name.replace('Ghari ', '')} ${i.size}`).join(', ');
  const wa = ghariService.whatsappLink(order);
  return (
    <div className="flex items-center gap-2 border-b border-border-light px-3 py-3 last:border-0 hover:bg-bg-base">
      <button onClick={() => onOpen(order)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-extrabold text-text-main">{order.customerName || '(no name)'}</span>
            {order.delivered && <Truck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
          </div>
          <div className="truncate text-[11px] text-text-muted">{summary}</div>
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
          : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>
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
function ReportView({ season }) {
  const r = useMemo(() => ghariService.buildReport(season), [season]);
  const catMax = Math.max(1, ...Object.values(r.byCategory));
  const kkList = Object.entries(r.byKaryakarta).sort((a, b) => b[1].amount - a[1].amount);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Revenue" value={rupee(r.revenue)} sub={`${r.orderCount} orders`} icon={Wallet} />
        <StatTile label="Received" value={rupee(r.received)} sub={`${rupee(r.outstanding)} outstanding`} color="#0D9488" icon={Check} />
        <StatTile label="Boxes" value={r.boxes} sub="total sold" color="#7C3AED" icon={Package} />
        <StatTile label="Delivery" value={`${r.delivered}/${r.orderCount}`} sub={`${r.pending} pending`} color="#2563EB" icon={Truck} />
        <StatTile label="Cash" value={rupee(r.cash)} color="#16A34A" />
        <StatTile label="G-Pay" value={rupee(r.gpay)} color="#2563EB" />
        <StatTile label="Unpaid" value={rupee(r.unpaid)} color="#E11D48" />
        <StatTile label="Outstanding" value={rupee(r.outstanding)} color="#EA580C" />
      </div>

      <div className="rounded-2xl border border-border-light bg-surface p-4">
        <h3 className="mb-3 text-sm font-black text-text-main">Revenue by category</h3>
        <div className="space-y-2.5">
          {Object.values(GHARI_CATEGORIES).map(c => (
            <div key={c.key}>
              <div className="mb-0.5 flex justify-between text-[11px] font-bold"><span style={{ color: c.color }}>{c.label}</span><span className="text-text-main">{rupee(r.byCategory[c.key])}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-bg-base"><div className="h-full rounded-full" style={{ width: `${(r.byCategory[c.key] / catMax) * 100}%`, background: c.color }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border-light bg-surface p-4">
        <h3 className="mb-3 text-sm font-black text-text-main">By product</h3>
        <div className="space-y-1.5">
          {Object.values(r.bySku).filter(s => s.qty > 0).map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="font-bold text-text-main">{s.name} <span className="text-text-muted">{s.size}</span></span>
              <span className="font-black text-text-muted">{s.qty} × · {rupee(s.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      {kkList.length > 0 && (
        <div className="rounded-2xl border border-border-light bg-surface p-4">
          <h3 className="mb-3 text-sm font-black text-text-main">By karyakarta</h3>
          <div className="space-y-1.5">
            {kkList.map(([name, d]) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <span className="truncate font-bold text-text-main">{name}</span>
                <span className="shrink-0 font-black text-text-muted">{d.boxes} box · {rupee(d.amount)} <span className={d.received >= d.amount ? 'text-emerald-600' : 'text-rose-600'}>({rupee(d.received)} rcvd)</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => ghariService.exportXlsx(season)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-primary/5 py-3 text-sm font-black text-primary">
        <Download className="h-4 w-4" /> Export {season} ledger to Excel
      </button>
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
      <input value={name} onChange={e => setName(e.target.value)} placeholder="New item name e.g. Ghari (Ghee Wali)" autoFocus
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
  const del = (p) => {
    if (!window.confirm(`Delete "${p.name} ${p.size}"?\n\nPast orders keep their own saved copy, so totals won't change.`)) return;
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

// ───────────────────────── Edit modal ───────────────────────────────────────
function EditModal({ order, onClose, onSaved }) {
  const wa = ghariService.whatsappLink(order);
  const voidIt = () => {
    if (!window.confirm('Void this order? It will be hidden from totals but can be restored later.')) return;
    ghariService.voidOrder(order.id); onSaved?.();
  };
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-base">
      <div className="flex items-center justify-between border-b border-border-light bg-surface px-4 py-3">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-bold text-text-muted"><ArrowLeft className="h-4 w-4" /> Back</button>
        <span className="text-sm font-black text-text-main">Edit order</span>
        <div className="flex items-center gap-3">
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-emerald-600"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
          <button onClick={voidIt} className="flex items-center gap-1 text-xs font-bold text-rose-600"><Trash2 className="h-4 w-4" /> Void</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {(order.createdBy || order.updatedBy) && (
          <div className="mb-3 rounded-xl border border-border-light bg-surface px-3 py-2 text-[11px] font-semibold text-text-muted">
            {order.createdBy && <span>Added by <b className="text-text-main">{order.createdBy}</b>{order.createdOn ? ` · ${new Date(order.createdOn).toLocaleDateString('en-IN')}` : ''}</span>}
            {order.updatedBy && order.updatedBy !== order.createdBy && <span className="block">Last edited by <b className="text-text-main">{order.updatedBy}</b></span>}
          </div>
        )}
        <OrderForm initialOrder={order} onCancel={onClose} onSaved={() => onSaved?.()} />
      </div>
    </div>
  );
}

// ───────────────────────── Main page ────────────────────────────────────────
export default function GhariPage({ user }) {
  const [tab, setTab] = useState('entry');
  const [season, setSeasonState] = useState(ghariService.getSeason());
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | undelivered | unpaid
  const [toast, setToast] = useState('');

  useEffect(() => { ghariService.init(); ghariService.syncDown().then(() => setTick(t => t + 1)); }, []);
  useEffect(() => {
    const onChange = () => setTick(t => t + 1);
    window.addEventListener('ac-ghari-changed', onChange);
    window.addEventListener('ac-ghari-synced', onChange);
    return () => { window.removeEventListener('ac-ghari-changed', onChange); window.removeEventListener('ac-ghari-synced', onChange); };
  }, []);

  const setSeason = (s) => { ghariService.setSeason(s); setSeasonState(s); setTick(t => t + 1); };
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  const orders = useMemo(() => {
    let list = ghariService.getOrders(season);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(o => o.customerName.toLowerCase().includes(q) || o.karyakarta.toLowerCase().includes(q));
    if (filter === 'undelivered') list = list.filter(o => !o.delivered);
    if (filter === 'unpaid') list = list.filter(o => (o.total - Number(o.paymentReceived || 0)) > 0);
    return list;
  }, [season, search, filter, tick]);

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
    { id: 'entry', label: 'New Order', icon: Plus },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'report', label: 'Report', icon: Wallet },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
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
          <div className="mb-3 flex gap-1.5">
            {[['all', 'All'], ['undelivered', 'Undelivered'], ['unpaid', 'Unpaid']].map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${filter === id ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-muted'}`}>{label}</button>
            ))}
            <span className="ml-auto self-center text-[11px] font-bold text-text-muted">{orders.length} order{orders.length === 1 ? '' : 's'}</span>
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

      {tab === 'report' && <ReportView key={tick} season={season} />}
      {tab === 'settings' && <SettingsView season={season} onSeason={setSeason} />}

      {editing && <EditModal order={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setTick(t => t + 1); flash('Order updated ✓'); }} />}
    </div>
  );
}
