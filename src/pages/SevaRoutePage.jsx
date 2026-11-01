import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin, Crosshair, Map as MapIcon, Navigation, Route, Trash2, X, Check,
  RefreshCw, LocateFixed, ExternalLink, Home, Pencil, CloudOff,
  CheckCircle2, DoorClosed, Phone, MessageCircle, ClipboardList, ChevronLeft, ChevronRight,
  CloudOff as CloudOffIcon, Plus, Minus, Send, BarChart3, Users, Package, Search,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { sevaVisitService, isCovered } from '../services/sevaVisitService';
import { hasAnyTag, hasAllTags } from '../services/devoteeSchema';
import { tagsByCategory, tagChipStyle, tagLabel } from '../services/tagCatalog';
import { isAdminRole, isSevakRole } from '../utils/navItems';
import { alertError, alertSuccess, confirmDialog } from '../utils/sweetAlert';
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
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

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

  const moveTo = (lat, lng, zoom = 16) => {
    setPos({ lat, lng });
    if (mapRef.current && markerRef.current) { markerRef.current.setLatLng([lat, lng]); mapRef.current.setView([lat, lng], zoom); }
  };
  const useMyLocation = async () => {
    try { const p = await getCurrentPosition(); moveTo(p.lat, p.lng); }
    catch (e) { alertError('Location', e.message); }
  };
  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try { const r = await dataService.geocodeAddress(q); moveTo(r.lat, r.lng, 17); }
    catch (e) { alertError('Search', e.message); }
    finally { setSearching(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex flex-col bg-surface" onClick={(e) => e.stopPropagation()}>
      {/* Header + search */}
      <div className="border-b border-border-light px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 font-black text-text">
            <MapIcon className="h-5 w-5 shrink-0 text-sky-500" /> <span className="truncate">Pin for {area}</span>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-text-muted hover:bg-black/5"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-2 flex gap-2">
          <div className="flex flex-1 items-center gap-1.5 rounded-xl border border-border-light px-2.5">
            <Search className="h-4 w-4 shrink-0 text-text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
              placeholder="Search a place or address…" className="w-full bg-transparent py-2 text-sm text-text focus:outline-none" />
          </div>
          <button onClick={search} disabled={searching} className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-sm font-bold text-white active:scale-95 disabled:opacity-50">
            {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {/* Full-screen map */}
      <div className="relative flex-1">
        {loading && <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-text-muted">Loading map…</div>}
        {err && <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-rose-600">{err}</div>}
        <div ref={divRef} className="h-full w-full" />
      </div>
      {/* Footer actions */}
      <div className="border-t border-border-light px-4 py-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
          <span>Tap the map or drag the pin to {area}.</span>
          {pos && <span className="font-mono">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={useMyLocation} className="flex items-center gap-1.5 rounded-xl border border-border-light px-3 py-2.5 text-sm font-bold text-text active:scale-95">
            <Crosshair className="h-4 w-4 text-sky-500" /> My location
          </button>
          <button onClick={() => pos && onSave(pos)} disabled={!pos}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 px-4 py-2.5 text-sm font-black text-white shadow-md active:scale-95 disabled:opacity-40">
            <Check className="h-4 w-4" /> Save pin
          </button>
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
  const [, setDriveTick] = useState(0);
  const [showDrives, setShowDrives] = useState(false);

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

  // Start the offline-first visit sync once; re-render when drives/visits change.
  useEffect(() => {
    try { sevaVisitService.init(); } catch { /* ignore */ }
    const on = () => setDriveTick((t) => t + 1);
    window.addEventListener('ac-seva-visit-changed', on);
    window.addEventListener('ac-seva-visit-synced', on);
    return () => { window.removeEventListener('ac-seva-visit-changed', on); window.removeEventListener('ac-seva-visit-synced', on); };
  }, []);

  const drives = sevaVisitService.getDrives();
  const driveId = sevaVisitService.getDriveId();
  const drive = sevaVisitService.getDrive(driveId);

  // Devotees for the CURRENT seva, chosen by its tags (any/all) — like a Follow-up
  // event. No drive selected → no homes (the UI prompts to pick a seva). Grouped by
  // area and ordered by Area-Route no., then name.
  const devoteesByArea = useMemo(() => {
    const out = {};
    areas.forEach((a) => { out[a] = []; });
    if (!drive) return out;
    const tags = drive.tags || [];
    const matches = (d) => {
      if (!tags.length) return true; // a drive with no tags = everyone
      return drive.matchMode === 'all' ? hasAllTags(d, tags) : hasAnyTag(d, tags);
    };
    (dataService.getDevotees() || []).forEach((d) => {
      if (String(d.status || 'Active') === 'Deceased') return;
      if (!matches(d)) return;
      const a = String(d.area || '').trim();
      if (a && out[a]) out[a].push(d);
    });
    Object.values(out).forEach((list) => list.sort((x, y) =>
      ((Number(x.areaRoute) || 1e9) - (Number(y.areaRoute) || 1e9)) || String(x.name || '').localeCompare(String(y.name || ''))));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, driveId, drive && drive.tags && drive.tags.join(','), drive && drive.matchMode]);

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

  const pinFromMyLocation = async (area) => {
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
          <p className="text-xs text-text-muted">Pick a seva — visit every home & find the shortest path</p>
        </div>
        <button onClick={refresh} className="rounded-full border border-border-light p-2 text-text-muted active:scale-95" title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Seva (drive) selector */}
      <div className="mb-3 flex items-center gap-2">
        <select value={driveId} onChange={(e) => sevaVisitService.setDriveId(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-border-light bg-surface px-3 py-2 text-sm font-bold text-text focus:outline-none">
          <option value="">— Select a seva —</option>
          {drives.filter((d) => d.status !== 'archived').map((d) => <option key={d.id} value={d.id}>{d.name || 'Untitled seva'}</option>)}
        </select>
        {canEdit && <button onClick={() => setShowDrives(true)} className="flex items-center gap-1 rounded-xl border border-border-light px-3 py-2 text-sm font-bold text-text-muted active:scale-95"><ClipboardList className="h-4 w-4" /> Sevas</button>}
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
              onUse={() => pinFromMyLocation(area)}
              onMap={() => setPicker({ area, initial: locMap[area] })}
              onGeocode={() => geocodeFor(area)}
              onClear={() => clearFor(area)} />
          ))}
        </div>
      )}

      {tab !== 'pins' && !drive && (
        <div className="rounded-2xl border border-dashed border-border-light bg-surface p-8 text-center">
          <ClipboardList className="mx-auto mb-2 h-10 w-10 text-text-muted" />
          <p className="font-bold text-text">Pick a seva first</p>
          <p className="mt-1 text-sm text-text-muted">Choose a seva above, or create one (e.g. Annakut, Shravan padhramani) and pick its devotees by tag.</p>
          {canEdit && <button onClick={() => setShowDrives(true)} className="mt-3 rounded-xl bg-sky-500 px-4 py-2 text-sm font-black text-white active:scale-95">Create a seva</button>}
        </div>
      )}

      {tab === 'visit' && drive && <VisitTracker key={driveId} areas={areas} devoteesByArea={devoteesByArea} areaPins={locMap} canEdit={canEdit} drive={drive} />}
      {tab === 'plan' && drive && <PlanRoute areas={areas} locMap={locMap} homesByArea={homesByArea} onNeedPins={() => setTab('pins')} />}
      {tab === 'nearest' && drive && <NearestFromHere areas={areas} locMap={locMap} homesByArea={homesByArea} onNeedPins={() => setTab('pins')} />}

      {picker && (
        <MapPicker area={picker.area} initial={picker.initial}
          onClose={() => setPicker(null)}
          onSave={async (p) => { const a = picker.area; setPicker(null); await saveArea(a, p.lat, p.lng); alertSuccess('Pin set', `${a} pin saved.`); }} />
      )}
      {showDrives && <ManageDrivesModal drives={drives} currentId={driveId} onClose={() => setShowDrives(false)} onSelect={(id) => sevaVisitService.setDriveId(id)} />}
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

function HomeCard({ d, status, boxes, homeLoc, areaPins, busy, onMark, onBoxes }) {
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
      {/* Prasad box count */}
      <div className="mt-2 flex items-center justify-between rounded-lg bg-black/[0.03] px-2 py-1">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-text-muted"><Package className="h-3.5 w-3.5" /> Prasad boxes</span>
        <div className="flex items-center gap-2">
          <button onClick={() => onBoxes(d, Math.max(0, (Number(boxes) || 0) - 1))} className="flex h-6 w-6 items-center justify-center rounded-full border border-border-light text-text-muted active:scale-90"><Minus className="h-3.5 w-3.5" /></button>
          <span className="w-5 text-center text-sm font-black text-text">{Number(boxes) || 0}</span>
          <button onClick={() => onBoxes(d, (Number(boxes) || 0) + 1)} className="flex h-6 w-6 items-center justify-center rounded-full border border-border-light text-emerald-600 active:scale-90"><Plus className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

const TEAM_COLORS = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#4B5563'];

function VisitTracker({ areas, devoteesByArea, areaPins, canEdit, drive }) {
  const [, setTick] = useState(0);
  const [selected, setSelected] = useState(null); // area name
  const [missedOnly, setMissedOnly] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [view, setView] = useState('overview'); // overview | report
  const [teamFilter, setTeamFilter] = useState(''); // '' | teamId | 'unassigned'
  const [showTeams, setShowTeams] = useState(false);
  const [guide, setGuide] = useState(false);
  const [guideIdx, setGuideIdx] = useState(0);
  const [notifying, setNotifying] = useState(false);
  const driveId = drive.id;
  const driveName = drive.name || 'Seva';

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('ac-seva-visit-changed', on);
    window.addEventListener('ac-seva-visit-synced', on);
    return () => { window.removeEventListener('ac-seva-visit-changed', on); window.removeEventListener('ac-seva-visit-synced', on); };
  }, []);

  const visits = sevaVisitService.visitsMap(driveId);
  const homeLocs = sevaVisitService.homeLocMap();
  const teams = sevaVisitService.getTeams(driveId);
  const statusOf = (d) => (visits[String(d.id)] ? String(visits[String(d.id)].status) : 'pending');
  const boxesOf = (d) => { const v = visits[String(d.id)]; return v && v.boxes !== '' && v.boxes != null ? Number(v.boxes) : 0; };
  const teamForArea = (a) => teams.find((t) => (t.areas || []).includes(a)) || null;

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
    sevaVisitService.markVisit(d.id, { status: next });
    if (next === 'done' || next === 'not_home') {
      setBusyId(d.id);
      try { const p = await getCurrentPosition(); sevaVisitService.markVisit(d.id, { status: next, lat: p.lat, lng: p.lng }); }
      catch { /* keep the status; just no pin this time */ }
      finally { setBusyId(''); }
    }
  };
  const setBoxes = (d, n) => {
    if (!canEdit) { alertError('View only', 'You have view-only access to the seva route.'); return; }
    // Handing over boxes implies the home was visited — promote a pending home to done.
    const st = (Number(n) > 0 && statusOf(d) === 'pending') ? 'done' : statusOf(d);
    sevaVisitService.markVisit(d.id, { status: st, boxes: n });
  };

  // #6 — push an "on our way" reminder to the not-done homes in an area.
  const notifyUpcoming = async (areaName) => {
    const mobiles = (devoteesByArea[areaName] || [])
      .filter((d) => !isCovered(statusOf(d)))
      .map((d) => String(d.mobile || '').replace(/\D/g, ''))
      .filter((m) => m.length >= 10);
    const uniq = [...new Set(mobiles)];
    if (!uniq.length) { alertError('No numbers', 'No not-done homes in this area have a mobile number.'); return; }
    const ok = await confirmDialog({ title: 'Send "on our way"?', text: `Push a padhramani reminder to ${uniq.length} home${uniq.length === 1 ? '' : 's'} in ${areaName}.`, confirmText: 'Send' });
    if (!ok) return;
    setNotifying(true);
    try {
      const r = await dataService.sendFollowupReminder({
        title: 'Annakut Prasad padhramani 🙏',
        body: `Our karyakartas are doing padhramani in ${areaName} today — please be at home to receive Annakut prasad.`,
        mobiles: uniq,
      });
      alertSuccess('Sent', `Reminder sent to ${r.reached || 0} recipient${(r.reached || 0) === 1 ? '' : 's'}.`);
    } catch (e) { alertError('Could not send', e.message); }
    finally { setNotifying(false); }
  };

  // ── Coverage report ──
  if (view === 'report') {
    return <VisitReport areas={areas} devoteesByArea={devoteesByArea} visits={visits} driveName={driveName} onBack={() => setView('overview')} />;
  }

  // ── Overview: all areas with progress ──
  if (!selected) {
    let withHomes = areas.filter((a) => (devoteesByArea[a] || []).length > 0);
    if (teamFilter === 'unassigned') withHomes = withHomes.filter((a) => !teamForArea(a));
    else if (teamFilter) { const t = teams.find((x) => x.id === teamFilter); withHomes = withHomes.filter((a) => t && (t.areas || []).includes(a)); }
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-border-light bg-surface p-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-bold text-text">{driveName}</div>
            <div className="text-xs font-bold text-emerald-600">{areaProgress.doneT} / {areaProgress.totalT} homes</div>
          </div>
          <ProgressBar done={areaProgress.doneT} total={areaProgress.totalT} />
          {!sevaVisitService.isOnline() && <div className="mt-2 flex items-center gap-1 text-[11px] text-amber-600"><CloudOffIcon className="h-3.5 w-3.5" /> Offline — marks are saved on this device and will sync.</div>}
          <div className="mt-2.5 flex items-center gap-2">
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
              className="flex-1 rounded-lg border border-border-light bg-surface px-2 py-1.5 text-xs font-semibold text-text">
              <option value="">All areas</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name || 'Team'}</option>)}
              <option value="unassigned">Unassigned areas</option>
            </select>
            {canEdit && <button onClick={() => setShowTeams(true)} className="flex items-center gap-1 rounded-lg border border-border-light px-2.5 py-1.5 text-xs font-bold text-text-muted active:scale-95"><Users className="h-3.5 w-3.5" /> Teams</button>}
            <button onClick={() => setView('report')} className="flex items-center gap-1 rounded-lg border border-border-light px-2.5 py-1.5 text-xs font-bold text-text-muted active:scale-95"><BarChart3 className="h-3.5 w-3.5" /> Report</button>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
          {withHomes.map((a) => {
            const pr = areaProgress.out[a];
            const complete = pr.total > 0 && pr.done >= pr.total;
            const team = teamForArea(a);
            return (
              <button key={a} onClick={() => { setSelected(a); setMissedOnly(false); setGuide(false); }}
                className="flex w-full items-center gap-3 border-b border-border-light px-3 py-2.5 text-left last:border-0 active:bg-black/5">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${complete ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-black/5 text-text-muted'}`}>
                  {complete ? <Check className="h-5 w-5" /> : <Home className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold text-text">
                      {team && <span className="h-2.5 w-2.5 rounded-full" style={{ background: team.color || '#999' }} title={team.name} />}
                      {a}
                    </span>
                    <span className="text-xs font-semibold text-text-muted">{pr.done}/{pr.total}</span>
                  </div>
                  <div className="mt-1"><ProgressBar done={pr.done} total={pr.total} /></div>
                </div>
              </button>
            );
          })}
          {!withHomes.length && <div className="p-6 text-center text-sm text-text-muted">No areas to show for this filter.</div>}
        </div>
        {showTeams && <ManageTeamsModal areas={areas} teams={teams} driveName={driveName} onClose={() => setShowTeams(false)} />}
      </div>
    );
  }

  // ── One area's home checklist ──
  const list = devoteesByArea[selected] || [];
  const shown = missedOnly ? list.filter((d) => !isCovered(statusOf(d))) : list;
  const pr = areaProgress.out[selected] || { done: 0, total: 0 };
  const missedPinned = list.filter((d) => !isCovered(statusOf(d)) && hasCoords(homeLocs[String(d.id)]))
    .map((d) => ({ area: d.name, ...homeLocs[String(d.id)] }));
  const missedRouteUrl = missedPinned.length >= 2 ? googleMapsDirUrls(nearestNeighborOrder(missedPinned))[0]?.url : null;
  const guideList = shown;
  const gi = Math.min(guideIdx, Math.max(0, guideList.length - 1));
  const guideHome = guideList[gi];

  const header = (
    <div className="flex items-center gap-2">
      <button onClick={() => { setSelected(null); setGuide(false); }} className="rounded-lg border border-border-light p-2 text-text-muted active:scale-95"><ChevronLeft className="h-4 w-4" /></button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="truncate font-black text-text">{selected}</span>
          <span className="text-xs font-bold text-emerald-600">{pr.done}/{pr.total}</span>
        </div>
        <div className="mt-1"><ProgressBar done={pr.done} total={pr.total} /></div>
      </div>
    </div>
  );

  // #5 — guide (turn-by-turn) mode: one home at a time, in route order.
  if (guide) {
    return (
      <div className="space-y-3">
        {header}
        <div className="flex items-center justify-between text-xs text-text-muted">
          <button onClick={() => setGuide(false)} className="flex items-center gap-1 rounded-full border border-border-light px-3 py-1.5 font-bold active:scale-95"><ClipboardList className="h-3.5 w-3.5" /> List view</button>
          <span>{guideList.length ? `${gi + 1} of ${guideList.length}` : '0 of 0'}</span>
        </div>
        {guideHome ? (
          <>
            <HomeCard d={guideHome} status={statusOf(guideHome)} boxes={boxesOf(guideHome)} homeLoc={homeLocs[String(guideHome.id)]} areaPins={areaPins}
              busy={busyId === guideHome.id}
              onMark={async (d, s) => { await mark(d, s); if (s === 'done' || s === 'not_home') setGuideIdx((i) => Math.min(guideList.length - 1, i + 1)); }}
              onBoxes={setBoxes} />
            <div className="flex gap-2">
              <button onClick={() => setGuideIdx((i) => Math.max(0, i - 1))} disabled={gi === 0}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-border-light py-2.5 text-sm font-bold text-text active:scale-95 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Prev</button>
              <button onClick={() => setGuideIdx((i) => Math.min(guideList.length - 1, i + 1))} disabled={gi >= guideList.length - 1}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-sky-500 py-2.5 text-sm font-black text-white active:scale-95 disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
            </div>
          </>
        ) : <div className="rounded-xl border border-dashed border-border-light p-6 text-center text-sm text-text-muted">Every home here is done. 🎉</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setGuide(true); setGuideIdx(0); }} className="flex items-center gap-1.5 rounded-full bg-sky-500 px-3 py-1.5 text-xs font-black text-white active:scale-95">
          <Navigation className="h-3.5 w-3.5" /> Guide me
        </button>
        <button onClick={() => setMissedOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold active:scale-95 ${missedOnly ? 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300' : 'border-border-light text-text-muted'}`}>
          <ClipboardList className="h-3.5 w-3.5" /> {missedOnly ? 'Not-done' : 'Not-done only'}
        </button>
        {canEdit && <button onClick={() => notifyUpcoming(selected)} disabled={notifying}
          className="flex items-center gap-1.5 rounded-full border border-border-light px-3 py-1.5 text-xs font-bold text-emerald-700 active:scale-95 disabled:opacity-50 dark:text-emerald-300">
          {notifying ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} On our way
        </button>}
        {missedRouteUrl && (
          <a href={missedRouteUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-white active:scale-95">
            <Route className="h-3.5 w-3.5" /> Route not-done
          </a>
        )}
      </div>

      <div className="space-y-2">
        {shown.map((d, i) => (
          <HomeCard key={`${d.id}-${i}`} d={d} status={statusOf(d)} boxes={boxesOf(d)} homeLoc={homeLocs[String(d.id)]} areaPins={areaPins}
            busy={busyId === d.id} onMark={mark} onBoxes={setBoxes} />
        ))}
        {!shown.length && <div className="rounded-xl border border-dashed border-border-light p-6 text-center text-sm text-text-muted">{missedOnly ? 'Every home here is done. 🎉' : 'No homes in this area.'}</div>}
      </div>
    </div>
  );
}

// ── #7 Coverage report ────────────────────────────────────────────────────────
function Stat({ label, value, cls }) {
  return (
    <div className="rounded-xl border border-border-light bg-surface p-2.5 text-center">
      <div className={`text-lg font-black ${cls || 'text-text'}`}>{value}</div>
      <div className="text-[11px] text-text-muted">{label}</div>
    </div>
  );
}
function VisitReport({ areas, devoteesByArea, visits, driveName, onBack }) {
  const statusOf = (d) => (visits[String(d.id)] ? String(visits[String(d.id)].status) : 'pending');
  const boxesOf = (d) => { const v = visits[String(d.id)]; return v && v.boxes !== '' && v.boxes != null ? Number(v.boxes) : 0; };

  let done = 0, notHome = 0, skip = 0, pending = 0, total = 0, boxes = 0;
  const rows = [];
  const missed = [];
  areas.forEach((a) => {
    const list = devoteesByArea[a] || [];
    if (!list.length) return;
    let d0 = 0, n0 = 0, s0 = 0, p0 = 0, b0 = 0;
    list.forEach((d) => {
      const st = statusOf(d); b0 += boxesOf(d);
      if (st === 'done') d0++; else if (st === 'not_home') { n0++; missed.push({ ...d, _st: st }); }
      else if (st === 'skip') { s0++; missed.push({ ...d, _st: st }); }
      else { p0++; missed.push({ ...d, _st: st }); }
    });
    done += d0; notHome += n0; skip += s0; pending += p0; total += list.length; boxes += b0;
    rows.push({ area: a, total: list.length, done: d0, notHome: n0, skip: s0, pending: p0, boxes: b0 });
  });

  // New devotees (joined within 120 days) and whether they've been visited.
  const newOnes = (dataService.getDevotees() || []).filter((d) => {
    if (String(d.status || 'Active') === 'Deceased') return false;
    const j = new Date(d.dateOfJoining); if (isNaN(j.getTime())) return false;
    return (Date.now() - j.getTime()) <= 120 * 24 * 60 * 60 * 1000;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-border-light p-2 text-text-muted active:scale-95"><ChevronLeft className="h-4 w-4" /></button>
        <span className="font-black text-text">Coverage — {driveName}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Done" value={done} cls="text-emerald-600" />
        <Stat label="Not home" value={notHome} cls="text-amber-600" />
        <Stat label="Pending" value={pending} cls="text-text-muted" />
        <Stat label="Skipped" value={skip} cls="text-slate-500" />
        <Stat label="Homes" value={total} />
        <Stat label="Prasad boxes" value={boxes} cls="text-sky-600" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
        <div className="border-b border-border-light bg-black/[0.02] px-3 py-2 text-xs font-bold text-text-muted">By area</div>
        {rows.map((r) => (
          <div key={r.area} className="flex items-center gap-2 border-b border-border-light px-3 py-2 text-sm last:border-0">
            <span className="flex-1 truncate font-semibold text-text">{r.area}</span>
            <span className="w-16 text-right text-emerald-600">{r.done}/{r.total}</span>
            <span className="w-16 text-right text-xs text-text-muted">{r.boxes} box</span>
          </div>
        ))}
      </div>

      {newOnes.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
          <div className="border-b border-border-light bg-black/[0.02] px-3 py-2 text-xs font-bold text-text-muted">New devotees (joined &lt; 120 days) — {newOnes.length}</div>
          {newOnes.slice(0, 50).map((d, i) => (
            <div key={`${d.id}-${i}`} className="flex items-center gap-2 border-b border-border-light px-3 py-2 text-sm last:border-0">
              <span className="flex-1 truncate font-semibold text-text">{d.name}</span>
              <span className="text-xs text-text-muted">{d.area || '—'}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusOf(d) === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{statusOf(d) === 'done' ? 'done' : 'not yet'}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-[11px] text-text-muted">{missed.length} home{missed.length === 1 ? '' : 's'} still to cover.</p>
    </div>
  );
}

// ── #4 Manage karyakarta teams (assign areas) ────────────────────────────────
function ManageTeamsModal({ areas, teams, driveName, onClose }) {
  const [editing, setEditing] = useState(null); // { id?, name, color, areas:Set }
  const [busy, setBusy] = useState(false);

  const startNew = () => setEditing({ name: '', color: TEAM_COLORS[teams.length % TEAM_COLORS.length], areas: new Set() });
  const startEdit = (t) => setEditing({ id: t.id, name: t.name || '', color: t.color || TEAM_COLORS[0], areas: new Set(t.areas || []) });
  const toggleArea = (a) => setEditing((e) => { const n = new Set(e.areas); n.has(a) ? n.delete(a) : n.add(a); return { ...e, areas: n }; });

  const save = async () => {
    if (!editing.name.trim()) { alertError('Name needed', 'Give the team a name.'); return; }
    setBusy(true);
    try { await sevaVisitService.saveTeam({ id: editing.id, name: editing.name.trim(), color: editing.color, areas: [...editing.areas] }); setEditing(null); }
    catch (e) { alertError('Could not save', e.message); }
    finally { setBusy(false); }
  };
  const del = async (t) => {
    const ok = await confirmDialog({ title: 'Delete team?', text: `Remove "${t.name}"? Its areas become unassigned.`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    try { await sevaVisitService.deleteTeam(t.id); } catch (e) { alertError('Could not delete', e.message); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <div className="flex items-center gap-2 font-black text-text"><Users className="h-5 w-5 text-sky-500" /> Teams — {driveName}</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-text-muted hover:bg-black/5"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!editing && (
            <>
              <div className="space-y-2">
                {teams.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border-light px-3 py-2">
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: t.color || '#999' }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-text">{t.name || 'Team'}</div>
                      <div className="text-xs text-text-muted">{(t.areas || []).length} area{(t.areas || []).length === 1 ? '' : 's'}</div>
                    </div>
                    <button onClick={() => startEdit(t)} className="rounded-lg border border-border-light p-2 text-indigo-600 active:scale-95"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(t)} className="rounded-lg border border-border-light p-2 text-rose-500 active:scale-95"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {!teams.length && <p className="py-4 text-center text-sm text-text-muted">No teams yet. Create one to split the areas.</p>}
              </div>
              <button onClick={startNew} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-black text-white active:scale-95"><Plus className="h-4 w-4" /> New team</button>
            </>
          )}
          {editing && (
            <div className="space-y-3">
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Team name (e.g. Team A / Pankaj bhai's car)"
                className="w-full rounded-xl border border-border-light bg-surface px-3 py-2 text-sm text-text focus:outline-none" />
              <div className="flex flex-wrap gap-2">
                {TEAM_COLORS.map((c) => (
                  <button key={c} onClick={() => setEditing({ ...editing, color: c })}
                    className={`h-8 w-8 rounded-full border-2 ${editing.color === c ? 'border-text' : 'border-transparent'}`} style={{ background: c }} />
                ))}
              </div>
              <div>
                <div className="mb-1 text-xs font-bold text-text-muted">Areas for this team</div>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border-light p-2">
                  {areas.map((a) => (
                    <label key={a} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-text active:bg-black/5">
                      <input type="checkbox" checked={editing.areas.has(a)} onChange={() => toggleArea(a)} className="h-4 w-4 accent-sky-500" />
                      {a}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-border-light py-2.5 text-sm font-bold text-text active:scale-95">Cancel</button>
                <button onClick={save} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-sm font-black text-white active:scale-95 disabled:opacity-50">{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Manage sevas (drives): name + devotees by tag, like a Follow-up event ─────
function ManageDrivesModal({ drives, currentId, onClose, onSelect }) {
  const [editing, setEditing] = useState(null); // { id?, name, tags:Set, matchMode, status }
  const [busy, setBusy] = useState(false);

  const startNew = () => setEditing({ name: '', tags: new Set(), matchMode: 'any', status: 'active' });
  const startEdit = (d) => setEditing({ id: d.id, name: d.name || '', tags: new Set(d.tags || []), matchMode: d.matchMode || 'any', status: d.status || 'active' });
  const toggleTag = (k) => setEditing((e) => { const n = new Set(e.tags); n.has(k) ? n.delete(k) : n.add(k); return { ...e, tags: n }; });

  const save = async () => {
    if (!editing.name.trim()) { alertError('Name needed', 'Give the seva a name (e.g. Annakut Prasad).'); return; }
    setBusy(true);
    try {
      const row = await sevaVisitService.saveDrive({ id: editing.id, name: editing.name.trim(), tags: [...editing.tags], matchMode: editing.matchMode, status: editing.status });
      if (!editing.id) onSelect(row.id); // auto-select a newly created seva
      setEditing(null);
    } catch (e) { alertError('Could not save', e.message); }
    finally { setBusy(false); }
  };
  const del = async (d) => {
    const ok = await confirmDialog({ title: 'Delete seva?', text: `Remove "${d.name}"? Its visit progress stays in the sheet but it disappears from the list.`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    try { await sevaVisitService.deleteDrive(d.id); } catch (e) { alertError('Could not delete', e.message); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <div className="flex items-center gap-2 font-black text-text"><ClipboardList className="h-5 w-5 text-sky-500" /> {editing ? (editing.id ? 'Edit seva' : 'New seva') : 'Sevas'}</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-text-muted hover:bg-black/5"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!editing && (
            <>
              <div className="space-y-2">
                {drives.map((d) => (
                  <div key={d.id} className={`rounded-xl border px-3 py-2.5 ${d.id === currentId ? 'border-sky-300 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20' : 'border-border-light'}`}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { onSelect(d.id); onClose(); }} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-1.5 font-bold text-text">{d.name || 'Untitled'}{d.status === 'archived' && <span className="rounded bg-black/10 px-1.5 text-[10px] text-text-muted">archived</span>}</div>
                        <div className="truncate text-xs text-text-muted">{(d.tags || []).length ? (d.tags.map((k) => tagLabel(k)).join(d.matchMode === 'all' ? ' + ' : ', ')) : 'All devotees'}</div>
                      </button>
                      <button onClick={() => startEdit(d)} className="rounded-lg border border-border-light p-2 text-indigo-600 active:scale-95"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => del(d)} className="rounded-lg border border-border-light p-2 text-rose-500 active:scale-95"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
                {!drives.length && <p className="py-4 text-center text-sm text-text-muted">No sevas yet. Create one and choose its devotees by tag.</p>}
              </div>
              <button onClick={startNew} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-black text-white active:scale-95"><Plus className="h-4 w-4" /> New seva</button>
            </>
          )}
          {editing && (
            <div className="space-y-3">
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Seva name (e.g. Annakut Prasad, Shravan Padhramani)"
                className="w-full rounded-xl border border-border-light bg-surface px-3 py-2 text-sm text-text focus:outline-none" />
              <div>
                <div className="mb-1.5 text-xs font-bold text-text-muted">Devotees — pick tags</div>
                <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-border-light p-2.5">
                  {tagsByCategory().map(({ category, tags }) => (
                    <div key={category.key}>
                      <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">{category.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((t) => {
                          const on = editing.tags.has(t.key);
                          return (
                            <button type="button" key={t.key} onClick={() => toggleTag(t.key)}
                              style={on ? tagChipStyle(t.key) : undefined}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${on ? '' : 'border border-border-light text-slate-500'}`}>{t.label}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-text-muted">No tags = every devotee. The route uses their saved Area.</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-text-muted">Match:</span>
                <button onClick={() => setEditing({ ...editing, matchMode: 'any' })} className={`rounded-full px-3 py-1 font-bold ${editing.matchMode !== 'all' ? 'bg-sky-500 text-white' : 'border border-border-light text-text-muted'}`}>Any tag</button>
                <button onClick={() => setEditing({ ...editing, matchMode: 'all' })} className={`rounded-full px-3 py-1 font-bold ${editing.matchMode === 'all' ? 'bg-sky-500 text-white' : 'border border-border-light text-text-muted'}`}>All tags</button>
              </div>
              <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" checked={editing.status === 'archived'} onChange={(e) => setEditing({ ...editing, status: e.target.checked ? 'archived' : 'active' })} className="h-4 w-4 accent-sky-500" /> Archived (hide from the picker)</label>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-border-light py-2.5 text-sm font-bold text-text active:scale-95">Cancel</button>
                <button onClick={save} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-sm font-black text-white active:scale-95 disabled:opacity-50">{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
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
