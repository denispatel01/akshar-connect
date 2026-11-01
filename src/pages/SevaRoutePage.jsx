import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin, Crosshair, Map as MapIcon, Navigation, Route, Trash2, X, Check,
  RefreshCw, LocateFixed, ExternalLink, Home, Pencil, CloudOff,
  CheckCircle2, DoorClosed, Phone, MessageCircle, ClipboardList, ChevronLeft, CloudOff as CloudOffIcon,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { sevaVisitService, isCovered } from '../services/sevaVisitService';
import { isAdminRole, isSevakRole } from '../utils/navItems';
import { alertError, alertSuccess } from '../utils/sweetAlert';
import {
  hasCoords, haversineKm, formatKm, nearestNeighborOrder, routeLengthKm, googleMapsDirUrls,
  googleMapsToPoint, googleMapsSearchUrl,
} from '../utils/geo';

// Surat (Adajan) — a sensible default map centre for this mandal's areas.
const DEFAULT_CENTER = { lat: 21.1959, lng: 72.7933 };

// ── Device geolocation (Promise wrapper) ─────────────────────────────────────
function getCurrentPosition(opts = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This device does not support location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => {
        const msg = err && err.code === 1
          ? 'Location permission was denied. Allow location access for this app and try again.'
          : 'Could not get your location. Make sure GPS is on and try again.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...opts },
    );
  });
}

// ── On-demand Leaflet loader (CDN — no bundle weight, needs connection) ───────
let leafletPromise = null;
function loadLeaflet() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.async = true;
    s.onload = () => resolve(window.L);
    s.onerror = () => { leafletPromise = null; reject(new Error('Could not load the map. Check your connection.')); };
    document.head.appendChild(s);
  });
  return leafletPromise;
}

// ── Map pin picker (drop/drag a pin to set an area's GPS) ─────────────────────
function MapPicker({ area, initial, onSave, onClose }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [pos, setPos] = useState(hasCoords(initial) ? { lat: Number(initial.lat), lng: Number(initial.lng) } : null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !divRef.current) return;
      const start = pos || DEFAULT_CENTER;
      const map = L.map(divRef.current).setView([start.lat, start.lng], pos ? 16 : 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap',
      }).addTo(map);
      const marker = L.marker([start.lat, start.lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => { const ll = marker.getLatLng(); setPos({ lat: ll.lat, lng: ll.lng }); });
      map.on('click', (e) => { marker.setLatLng(e.latlng); setPos({ lat: e.latlng.lat, lng: e.latlng.lng }); });
      mapRef.current = map;
      markerRef.current = marker;
      setLoading(false);
      // Leaflet needs a size recalc once the modal has painted.
      setTimeout(() => { try { map.invalidateSize(); } catch { /* ignore */ } }, 120);
    }).catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; try { mapRef.current && mapRef.current.remove(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = async () => {
    try {
      const p = await getCurrentPosition();
      setPos({ lat: p.lat, lng: p.lng });
      if (mapRef.current && markerRef.current) {
        markerRef.current.setLatLng([p.lat, p.lng]);
        mapRef.current.setView([p.lat, p.lng], 16);
      }
    } catch (e) { alertError('Location', e.message); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="flex h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:h-[80vh] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <div className="flex items-center gap-2 font-black text-text">
            <MapIcon className="h-5 w-5 text-sky-500" /> Pin for {area}
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-text-muted hover:bg-black/5"><X className="h-5 w-5" /></button>
        </div>
        <div className="relative flex-1">
          {loading && <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-text-muted">Loading map…</div>}
          {err && <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-rose-600">{err}</div>}
          <div ref={divRef} className="h-full w-full" />
        </div>
        <div className="border-t border-border-light px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
            <span>Tap the map or drag the pin to {area}.</span>
            {pos && <span className="font-mono">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={useMyLocation} className="flex items-center gap-1.5 rounded-xl border border-border-light px-3 py-2 text-sm font-bold text-text active:scale-95">
              <Crosshair className="h-4 w-4 text-sky-500" /> My location
            </button>
            <button onClick={() => pos && onSave(pos)} disabled={!pos}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 px-4 py-2 text-sm font-black text-white shadow-md active:scale-95 disabled:opacity-40">
              <Check className="h-4 w-4" /> Save pin
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── One area row in the "Set pins" list ──────────────────────────────────────
function AreaPinRow({ area, homes, loc, canEdit, onUse, onMap, onGeocode, onClear, busy }) {
  const set = hasCoords(loc);
  return (
    <div className="flex items-center gap-3 border-b border-border-light px-3 py-2.5 last:border-0">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${set ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-black/5 text-text-muted'}`}>
        <MapPin className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-bold text-text">{area}
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-text-muted">{homes} home{homes === 1 ? '' : 's'}</span>
        </div>
        <div className="truncate text-xs text-text-muted">
          {set ? <span className="font-mono">{Number(loc.lat).toFixed(5)}, {Number(loc.lng).toFixed(5)}</span> : 'No pin set yet'}
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <button title="Use my current location" onClick={onUse} disabled={busy}
            className="rounded-lg border border-border-light p-2 text-sky-600 active:scale-95 disabled:opacity-40"><Crosshair className="h-4 w-4" /></button>
          <button title="Drop a pin on the map" onClick={onMap} disabled={busy}
            className="rounded-lg border border-border-light p-2 text-indigo-600 active:scale-95 disabled:opacity-40"><MapIcon className="h-4 w-4" /></button>
          <button title="Find from address" onClick={onGeocode} disabled={busy}
            className="rounded-lg border border-border-light p-2 text-amber-600 active:scale-95 disabled:opacity-40"><Pencil className="h-4 w-4" /></button>
          {set && <button title="Clear pin" onClick={onClear} disabled={busy}
            className="rounded-lg border border-border-light p-2 text-rose-500 active:scale-95 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>}
        </div>
      )}
    </div>
  );
}

export default function SevaRoutePage({ user }) {
  const canEdit = isAdminRole(user) || isSevakRole(user);
  const [tab, setTab] = useState('visit'); // visit | pins | plan | nearest
  const [locMap, setLocMap] = useState({}); // area -> { lat, lng }
  const [loading, setLoading] = useState(true);
  const [busyArea, setBusyArea] = useState('');
  const [picker, setPicker] = useState(null); // { area, initial }

  // The real area list comes from the Areas sheet (loaded at bootstrap), ordered by
  // its `number` column — NOT a hardcoded list, so adding/renaming an area in the
  // sheet flows straight through here.
  const areas = useMemo(() => {
    const list = (dataService.getAreas() || [])
      .map((a) => ({ name: String(a.name || '').trim(), number: Number(a.number) || 0 }))
      .filter((a) => a.name);
    list.sort((x, y) => (x.number - y.number) || x.name.localeCompare(y.name));
    // De-duplicate names (keep first), just in case the sheet has repeats.
    const seen = new Set();
    return list.map((a) => a.name).filter((n) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }, []);

  // Start the offline-first visit sync once.
  useEffect(() => { try { sevaVisitService.init(); } catch { /* ignore */ } }, []);

  // Active devotee homes grouped by area (deceased excluded), used by home counts
  // and the Visit checklist. Ordered by Area-Route no., then name.
  const devoteesByArea = useMemo(() => {
    const out = {};
    areas.forEach((a) => { out[a] = []; });
    (dataService.getDevotees() || []).forEach((d) => {
      if (String(d.status || 'Active') === 'Deceased') return;
      const a = String(d.area || '').trim();
      if (a && out[a]) out[a].push(d);
    });
    Object.values(out).forEach((list) => list.sort((x, y) =>
      ((Number(x.areaRoute) || 1e9) - (Number(y.areaRoute) || 1e9)) || String(x.name || '').localeCompare(String(y.name || ''))));
    return out;
  }, [areas]);

  const homesByArea = useMemo(() => {
    const out = {};
    areas.forEach((a) => { out[a] = (devoteesByArea[a] || []).length; });
    return out;
  }, [areas, devoteesByArea]);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await dataService.getAreaLocations();
      const m = {};
      (list || []).forEach((r) => { if (hasCoords(r)) m[String(r.area)] = { lat: Number(r.lat), lng: Number(r.lng) }; });
      setLocMap(m);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const saveArea = async (area, lat, lng) => {
    setBusyArea(area);
    try {
      await dataService.setAreaLocation({ area, lat, lng });
      setLocMap((m) => {
        const next = { ...m };
        if (lat === '' || lng === '' || lat == null || lng == null) delete next[area];
        else next[area] = { lat: Number(lat), lng: Number(lng) };
        return next;
      });
    } catch (e) { alertError('Could not save', e.message); }
    finally { setBusyArea(''); }
  };

  const useMyLocationFor = async (area) => {
    setBusyArea(area);
    try {
      const p = await getCurrentPosition();
      await saveArea(area, p.lat, p.lng);
      alertSuccess('Pin set', `${area} set to your current location.`);
    } catch (e) { alertError('Location', e.message); }
    finally { setBusyArea(''); }
  };

  const geocodeFor = async (area) => {
    // Seed the prompt with a sample address from that area, if we have one.
    const sample = (dataService.getDevotees() || []).find((d) => String(d.area || '').trim() === area && String(d.address || '').trim());
    const def = sample ? `${sample.address}, ${area}, Surat` : `${area}, Surat, Gujarat`;
    const input = window.prompt(`Find the ${area} pin from an address:`, def);
    if (input == null) return;
    const addr = input.trim();
    if (!addr) return;
    setBusyArea(area);
    try {
      const r = await dataService.geocodeAddress(addr);
      await saveArea(area, r.lat, r.lng);
      alertSuccess('Pin set', `${area} located${r.formatted ? ` — ${r.formatted}` : ''}.`);
    } catch (e) { alertError('Address lookup', e.message); }
    finally { setBusyArea(''); }
  };

  const clearFor = async (area) => { await saveArea(area, '', ''); };

  const pinnedCount = areas.filter((a) => hasCoords(locMap[a])).length;

  return (
    <div className="mx-auto max-w-2xl p-3 sm:p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-text">
            <Route className="h-6 w-6 text-sky-500" /> Seva Route
          </h1>
          <p className="text-xs text-text-muted">Annakut padhramani — shortest path between areas</p>
        </div>
        <button onClick={refresh} className="rounded-full border border-border-light p-2 text-text-muted active:scale-95" title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-1 rounded-2xl bg-black/5 p-1 text-[13px] font-bold">
        {[['visit', 'Visit', CheckCircle2], ['pins', 'Pins', MapPin], ['plan', 'Plan', Route], ['nearest', 'Nearest', Navigation]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 transition-colors ${tab === id ? 'bg-surface text-sky-600 shadow-sm' : 'text-text-muted'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'pins' && (
        <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
          <div className="border-b border-border-light bg-black/[0.02] px-3 py-2 text-xs text-text-muted">
            {pinnedCount} of {areas.length} areas pinned.
            {!canEdit && ' You have view-only access.'}
          </div>
          {areas.map((area) => (
            <AreaPinRow key={area} area={area} homes={homesByArea[area] || 0} loc={locMap[area]} canEdit={canEdit}
              busy={busyArea === area}
              onUse={() => useMyLocationFor(area)}
              onMap={() => setPicker({ area, initial: locMap[area] })}
              onGeocode={() => geocodeFor(area)}
              onClear={() => clearFor(area)} />
          ))}
        </div>
      )}

      {tab === 'visit' && <VisitTracker areas={areas} devoteesByArea={devoteesByArea} areaPins={locMap} canEdit={canEdit} />}
      {tab === 'plan' && <PlanRoute areas={areas} locMap={locMap} homesByArea={homesByArea} onNeedPins={() => setTab('pins')} />}
      {tab === 'nearest' && <NearestFromHere areas={areas} locMap={locMap} homesByArea={homesByArea} onNeedPins={() => setTab('pins')} />}

      {picker && (
        <MapPicker area={picker.area} initial={picker.initial}
          onClose={() => setPicker(null)}
          onSave={async (p) => { const a = picker.area; setPicker(null); await saveArea(a, p.lat, p.lng); alertSuccess('Pin set', `${a} pin saved.`); }} />
      )}
    </div>
  );
}

// ── Feature A: plan the full outing (ordered areas → Google Maps) ─────────────
function PlanRoute({ areas, locMap, homesByArea, onNeedPins }) {
  const pinned = areas.filter((a) => hasCoords(locMap[a]));
  const [selected, setSelected] = useState(() => new Set(pinned));
  const [useGps, setUseGps] = useState(true);
  const [start, setStart] = useState(null);
  const [ordered, setOrdered] = useState(null);
  const [busy, setBusy] = useState(false);

  const toggle = (a) => setSelected((s) => { const n = new Set(s); n.has(a) ? n.delete(a) : n.add(a); return n; });

  const plan = async () => {
    const stops = pinned.filter((a) => selected.has(a)).map((a) => ({ area: a, ...locMap[a] }));
    if (stops.length < 2) { alertError('Pick more areas', 'Select at least two pinned areas to plan a route.'); return; }
    setBusy(true);
    let s = null;
    if (useGps) {
      try { s = await getCurrentPosition(); } catch (e) { alertError('Location', `${e.message} Planning from the first area instead.`); }
    }
    setStart(s);
    setOrdered(nearestNeighborOrder(stops, s));
    setBusy(false);
  };

  if (!pinned.length) return <EmptyPins onNeedPins={onNeedPins} />;

  const legs = ordered ? googleMapsDirUrls(ordered, start) : [];
  const total = ordered ? routeLengthKm(ordered, start) : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border-light bg-surface p-3">
        <div className="mb-2 text-sm font-bold text-text">Areas to cover today</div>
        <div className="flex flex-wrap gap-2">
          {pinned.map((a) => (
            <button key={a} onClick={() => toggle(a)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${selected.has(a) ? 'border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-300' : 'border-border-light text-text-muted'}`}>
              {selected.has(a) && <Check className="h-3.5 w-3.5" />}{a}
              <span className="text-[11px] opacity-70">· {homesByArea[a] || 0}</span>
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={useGps} onChange={(e) => setUseGps(e.target.checked)} className="h-4 w-4 accent-sky-500" />
          Start from my current location
        </label>
        <button onClick={plan} disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 px-4 py-2.5 text-sm font-black text-white shadow-md active:scale-95 disabled:opacity-50">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />} Plan shortest route
        </button>
      </div>

      {ordered && (
        <div className="rounded-2xl border border-border-light bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-text">Your order</div>
            <div className="text-xs text-text-muted">≈ {formatKm(total)} total</div>
          </div>
          <ol className="space-y-1.5">
            {start && <li className="flex items-center gap-2 text-sm text-text-muted"><LocateFixed className="h-4 w-4 text-sky-500" /> Your location (start)</li>}
            {ordered.map((s, i) => (
              <li key={s.area} className="flex items-center gap-2 text-sm text-text">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-xs font-black text-sky-700 dark:bg-sky-950 dark:text-sky-300">{i + 1}</span>
                <span className="font-semibold">{s.area}</span>
                <span className="flex items-center gap-0.5 text-xs text-text-muted"><Home className="h-3 w-3" /> {homesByArea[s.area] || 0}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 space-y-2">
            {legs.map((leg, i) => (
              <a key={i} href={leg.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white shadow active:scale-95">
                <ExternalLink className="h-4 w-4" /> Open in Google Maps{legs.length > 1 ? ` — Leg ${i + 1}` : ''}
              </a>
            ))}
            {legs.length > 1 && <p className="text-center text-[11px] text-text-muted">Google Maps fits ~10 stops per link, so the route is split into legs.</p>}
          </div>
          <p className="mt-2 text-[11px] text-text-muted">Inside each area, visit homes in your usual Area-Route order.</p>
        </div>
      )}
    </div>
  );
}

// ── Feature B: "Where are you?" → nearest areas, you decide ───────────────────
function NearestFromHere({ areas, locMap, homesByArea, onNeedPins }) {
  const pinned = areas.filter((a) => hasCoords(locMap[a]));
  const [from, setFrom] = useState(null); // { area?, lat, lng, label }
  const [busy, setBusy] = useState(false);

  const fromArea = (a) => setFrom({ area: a, ...locMap[a], label: a });
  const fromGps = async () => {
    setBusy(true);
    try {
      const p = await getCurrentPosition();
      // Name the nearest pinned area to show "you're near X".
      let nearest = null, best = Infinity;
      pinned.forEach((a) => { const km = haversineKm(p, locMap[a]); if (km < best) { best = km; nearest = a; } });
      setFrom({ lat: p.lat, lng: p.lng, label: nearest ? `your location (near ${nearest})` : 'your location' });
    } catch (e) { alertError('Location', e.message); }
    finally { setBusy(false); }
  };

  if (!pinned.length) return <EmptyPins onNeedPins={onNeedPins} />;

  const ranked = from
    ? pinned
        .filter((a) => !(from.area && a === from.area))
        .map((a) => ({ area: a, km: haversineKm(from, locMap[a]) }))
        .sort((x, y) => x.km - y.km)
    : [];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border-light bg-surface p-3">
        <div className="mb-2 text-sm font-bold text-text">Where are you?</div>
        <button onClick={fromGps} disabled={busy}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 px-4 py-2.5 text-sm font-black text-white shadow-md active:scale-95 disabled:opacity-50">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Use my current location
        </button>
        <div className="mb-1.5 text-xs text-text-muted">…or pick the area you're in:</div>
        <div className="flex flex-wrap gap-2">
          {pinned.map((a) => (
            <button key={a} onClick={() => fromArea(a)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${from && from.area === a ? 'border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-300' : 'border-border-light text-text-muted'}`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {from && (
        <div className="rounded-2xl border border-border-light bg-surface p-3">
          <div className="mb-2 text-sm font-bold text-text">Nearest from <span className="text-sky-600">{from.label}</span></div>
          <div className="space-y-2">
            {ranked.map(({ area, km }) => (
              <div key={area} className="flex items-center gap-3 rounded-xl border border-border-light px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-bold text-text">{area}
                    <span className="flex items-center gap-0.5 text-xs font-normal text-text-muted"><Home className="h-3 w-3" /> {homesByArea[area] || 0}</span>
                  </div>
                  <div className="text-xs text-text-muted">{formatKm(km)} away</div>
                </div>
                <a href={googleMapsDirUrls([{ area, ...locMap[area] }], from)[0]?.url} target="_blank" rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white shadow active:scale-95">
                  <Navigation className="h-3.5 w-3.5" /> Go
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feature #1-3: visit tracking, auto home-GPS capture, missed-homes pass ────
function telLink(mobile) { const m = String(mobile || '').replace(/\D/g, ''); return m ? `tel:${m}` : null; }
function waLink(mobile, name) {
  const m = String(mobile || '').replace(/\D/g, '');
  if (m.length < 10) return null;
  const num = m.length === 10 ? '91' + m : m;
  const msg = `Jai Swaminarayan ${String(name || '').split(' ')[0] || ''} 🙏 Annakut prasad padhramani — we are on our way to your home.`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}
function navUrlFor(d, homeLoc, areaPins) {
  if (hasCoords(homeLoc)) return googleMapsToPoint(homeLoc);
  const ap = areaPins[String(d.area || '').trim()];
  if (hasCoords(ap)) return googleMapsToPoint(ap);
  return googleMapsSearchUrl([d.address, d.area, 'Surat'].filter(Boolean).join(', '));
}

const STATUS_META = {
  done:     { label: 'Done',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', Icon: CheckCircle2 },
  not_home: { label: 'Not home', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', Icon: DoorClosed },
  skip:     { label: 'Skip',     cls: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300', Icon: X },
};

function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function HomeCard({ d, status, homeLoc, areaPins, busy, onMark }) {
  const call = telLink(d.mobile);
  const wa = waLink(d.mobile, d.name);
  const nav = navUrlFor(d, homeLoc, areaPins);
  const meta = STATUS_META[status];
  const pinned = hasCoords(homeLoc);
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${status === 'done' ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-border-light bg-surface'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-bold text-text">
            {d.areaRoute ? <span className="rounded bg-black/5 px-1.5 text-[11px] text-text-muted">#{d.areaRoute}</span> : null}
            {d.name}
            {pinned && <MapPin className="h-3.5 w-3.5 text-emerald-500" title="Home GPS captured" />}
          </div>
          {d.address ? <div className="truncate text-xs text-text-muted">{d.address}</div> : null}
          {meta && <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.cls}`}><meta.Icon className="h-3 w-3" /> {meta.label}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {call && <a href={call} className="rounded-lg border border-border-light p-2 text-sky-600 active:scale-95"><Phone className="h-4 w-4" /></a>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border-light p-2 text-emerald-600 active:scale-95"><MessageCircle className="h-4 w-4" /></a>}
          {nav && <a href={nav} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border-light p-2 text-indigo-600 active:scale-95"><Navigation className="h-4 w-4" /></a>}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <button onClick={() => onMark(d, 'done')} disabled={busy}
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold active:scale-95 disabled:opacity-50 ${status === 'done' ? 'bg-emerald-500 text-white' : 'border border-border-light text-emerald-700 dark:text-emerald-300'}`}>
          {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Done
        </button>
        <button onClick={() => onMark(d, 'not_home')} disabled={busy}
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold active:scale-95 disabled:opacity-50 ${status === 'not_home' ? 'bg-amber-500 text-white' : 'border border-border-light text-amber-700 dark:text-amber-300'}`}>
          <DoorClosed className="h-3.5 w-3.5" /> Not home
        </button>
        <button onClick={() => onMark(d, 'skip')} disabled={busy}
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold active:scale-95 disabled:opacity-50 ${status === 'skip' ? 'bg-slate-500 text-white' : 'border border-border-light text-text-muted'}`}>
          <X className="h-3.5 w-3.5" /> Skip
        </button>
      </div>
    </div>
  );
}

function VisitTracker({ areas, devoteesByArea, areaPins, canEdit }) {
  const [, setTick] = useState(0);
  const [selected, setSelected] = useState(null); // area name
  const [missedOnly, setMissedOnly] = useState(false);
  const [busyId, setBusyId] = useState('');
  const season = sevaVisitService.getSeason();

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('ac-seva-visit-changed', on);
    window.addEventListener('ac-seva-visit-synced', on);
    return () => { window.removeEventListener('ac-seva-visit-changed', on); window.removeEventListener('ac-seva-visit-synced', on); };
  }, []);

  const visits = sevaVisitService.visitsMap(season);
  const homeLocs = sevaVisitService.homeLocMap();
  const statusOf = (d) => (visits[String(d.id)] ? String(visits[String(d.id)].status) : 'pending');

  // Per-area and overall progress.
  const areaProgress = useMemo(() => {
    const out = {};
    let doneT = 0, totalT = 0;
    areas.forEach((a) => {
      const list = devoteesByArea[a] || [];
      const done = list.filter((d) => isCovered(visits[String(d.id)] && visits[String(d.id)].status)).length;
      out[a] = { done, total: list.length };
      doneT += done; totalT += list.length;
    });
    return { out, doneT, totalT };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, devoteesByArea, visits]);

  const mark = async (d, status) => {
    if (!canEdit) { alertError('View only', 'You have view-only access to the seva route.'); return; }
    const next = statusOf(d) === status ? 'pending' : status;
    // Instant optimistic mark.
    sevaVisitService.markVisit(d.id, { status: next });
    // For a real visit, capture the home's GPS in the background (auto-pin).
    if (next === 'done' || next === 'not_home') {
      setBusyId(d.id);
      try { const p = await getCurrentPosition(); sevaVisitService.markVisit(d.id, { status: next, lat: p.lat, lng: p.lng }); }
      catch { /* keep the status; just no pin this time */ }
      finally { setBusyId(''); }
    }
  };

  // ── Overview: all areas with progress ──
  if (!selected) {
    const withHomes = areas.filter((a) => (devoteesByArea[a] || []).length > 0);
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-border-light bg-surface p-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-bold text-text">Annakut padhramani {season}</div>
            <div className="text-xs font-bold text-emerald-600">{areaProgress.doneT} / {areaProgress.totalT} homes</div>
          </div>
          <ProgressBar done={areaProgress.doneT} total={areaProgress.totalT} />
          {!sevaVisitService.isOnline() && <div className="mt-2 flex items-center gap-1 text-[11px] text-amber-600"><CloudOffIcon className="h-3.5 w-3.5" /> Offline — marks are saved on this device and will sync.</div>}
        </div>
        <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
          {withHomes.map((a) => {
            const pr = areaProgress.out[a];
            const complete = pr.total > 0 && pr.done >= pr.total;
            return (
              <button key={a} onClick={() => { setSelected(a); setMissedOnly(false); }}
                className="flex w-full items-center gap-3 border-b border-border-light px-3 py-2.5 text-left last:border-0 active:bg-black/5">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${complete ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-black/5 text-text-muted'}`}>
                  {complete ? <Check className="h-5 w-5" /> : <Home className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-text">{a}</span>
                    <span className="text-xs font-semibold text-text-muted">{pr.done}/{pr.total}</span>
                  </div>
                  <div className="mt-1"><ProgressBar done={pr.done} total={pr.total} /></div>
                </div>
              </button>
            );
          })}
          {!withHomes.length && <div className="p-6 text-center text-sm text-text-muted">No devotee homes found in any area.</div>}
        </div>
      </div>
    );
  }

  // ── One area's home checklist ──
  const list = devoteesByArea[selected] || [];
  const shown = missedOnly ? list.filter((d) => !isCovered(statusOf(d))) : list;
  const pr = areaProgress.out[selected] || { done: 0, total: 0 };
  // "Route missed homes": only useful once ≥2 missed homes already have a GPS pin
  // (e.g. a second pass, or next year). Falls back to per-home Navigate otherwise.
  const missedPinned = list.filter((d) => !isCovered(statusOf(d)) && hasCoords(homeLocs[String(d.id)]))
    .map((d) => ({ area: d.name, ...homeLocs[String(d.id)] }));
  const missedRouteUrl = missedPinned.length >= 2 ? googleMapsDirUrls(nearestNeighborOrder(missedPinned))[0]?.url : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setSelected(null)} className="rounded-lg border border-border-light p-2 text-text-muted active:scale-95"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="truncate font-black text-text">{selected}</span>
            <span className="text-xs font-bold text-emerald-600">{pr.done}/{pr.total}</span>
          </div>
          <div className="mt-1"><ProgressBar done={pr.done} total={pr.total} /></div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setMissedOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold active:scale-95 ${missedOnly ? 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300' : 'border-border-light text-text-muted'}`}>
          <ClipboardList className="h-3.5 w-3.5" /> {missedOnly ? 'Showing not-done' : 'Show not-done only'}
        </button>
        {missedRouteUrl && (
          <a href={missedRouteUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-white active:scale-95">
            <Route className="h-3.5 w-3.5" /> Route not-done
          </a>
        )}
      </div>

      <div className="space-y-2">
        {shown.map((d) => (
          <HomeCard key={d.id} d={d} status={statusOf(d)} homeLoc={homeLocs[String(d.id)]} areaPins={areaPins}
            busy={busyId === d.id} onMark={mark} />
        ))}
        {!shown.length && <div className="rounded-xl border border-dashed border-border-light p-6 text-center text-sm text-text-muted">{missedOnly ? 'Every home here is done. 🎉' : 'No homes in this area.'}</div>}
      </div>
    </div>
  );
}

function EmptyPins({ onNeedPins }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-light bg-surface p-8 text-center">
      <CloudOff className="mx-auto mb-2 h-10 w-10 text-text-muted" />
      <p className="font-bold text-text">No area pins yet</p>
      <p className="mt-1 text-sm text-text-muted">Set at least two area GPS pins first.</p>
      <button onClick={onNeedPins} className="mt-3 rounded-xl bg-sky-500 px-4 py-2 text-sm font-black text-white active:scale-95">Set pins</button>
    </div>
  );
}
