// ===========================================================================
// Akshar Connect — Annakut Seva visit tracking (OFFLINE-FIRST)
// ---------------------------------------------------------------------------
// Padhramani is done in the field where mobile signal is often poor, so every
// mark lands in localStorage instantly AND in a durable outbox that drains to
// the backend with retries. Marking a home visited also captures the visitor's
// current GPS as that home's permanent pin — so one normal seva quietly builds
// a full home-level map for next year, with zero extra effort.
//
// Shares dataService's deployed /exec backend + retrying api().
// ===========================================================================

import { backendApi, backendOnline, dataService } from './dataService';

const VISITS_KEY = 'ac_seva_visits_v1';
const HOMES_KEY  = 'ac_home_locations_v1';
const TEAMS_KEY  = 'ac_seva_teams_v1';
const OUTBOX_KEY = 'ac_seva_visit_outbox_v1';
const META_KEY   = 'ac_seva_visit_meta_v1';

export const VISIT_STATUSES = ['pending', 'done', 'not_home', 'skip'];
// Anything that isn't "done" still needs a visit — used by the "missed homes" pass.
export const isCovered = (status) => String(status || 'pending') === 'done';

function readJSON_(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function writeJSON_(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } }
function nowISO_() { return new Date().toISOString(); }
function emit_(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ } }
function defaultSeason_() { return String(new Date().getFullYear()); }

let MEM = { visits: null, homes: null, teams: null, meta: null };
let flushing = false;
let inited = false;

function meta_() {
  if (!MEM.meta) MEM.meta = readJSON_(META_KEY, { season: defaultSeason_() });
  if (!MEM.meta.season) MEM.meta.season = defaultSeason_();
  return MEM.meta;
}
function visits_() { if (!MEM.visits) MEM.visits = readJSON_(VISITS_KEY, []) || []; return MEM.visits; }
function homes_() { if (!MEM.homes) MEM.homes = readJSON_(HOMES_KEY, []) || []; return MEM.homes; }
function teams_() { if (!MEM.teams) MEM.teams = readJSON_(TEAMS_KEY, []) || []; return MEM.teams; }
function saveVisitsLocal_() { writeJSON_(VISITS_KEY, MEM.visits); }
function saveHomesLocal_() { writeJSON_(HOMES_KEY, MEM.homes); }
function saveTeamsLocal_() { writeJSON_(TEAMS_KEY, MEM.teams); }
function saveMetaLocal_() { writeJSON_(META_KEY, MEM.meta); }
function outbox_() { return readJSON_(OUTBOX_KEY, []) || []; }
function setOutbox_(arr) { writeJSON_(OUTBOX_KEY, arr); }

// ── Durable outbox — keep an op until the server acks it ──────────────────────
// Only the LATEST state of a given (action,key) matters, so collapse duplicates.
function enqueue_(action, keyField, keyVal, payload) {
  const box = outbox_().filter(op => !(op.action === action && op.key === keyVal));
  box.push({ opId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, action, key: keyVal, payload, tries: 0, queuedAt: nowISO_() });
  setOutbox_(box);
}

async function flush() {
  if (flushing) return;
  if (!backendOnline() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  const box = outbox_();
  if (!box.length) return;
  flushing = true;
  try {
    const succeeded = new Set();
    const meta = {};
    for (const op of box) {
      try { await backendApi(op.action, op.payload); succeeded.add(op.opId); }
      catch (e) { meta[op.opId] = { tries: (op.tries || 0) + 1, lastError: String((e && e.message) || e) }; }
      emit_('ac-seva-visit-synced', { pending: outbox_().filter(o => !succeeded.has(o.opId)).length });
    }
    const left = outbox_().filter(o => !succeeded.has(o.opId)).map(o => meta[o.opId] ? { ...o, ...meta[o.opId] } : o);
    setOutbox_(left);
  } finally {
    flushing = false;
    emit_('ac-seva-visit-synced', { pending: outbox_().length });
  }
}

// ── Pull the server's copy, keeping any un-synced local marks ─────────────────
async function syncDown(season) {
  if (!backendOnline() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { ok: false, offline: true };
  const scope = String(season || meta_().season || '');
  let res;
  try { res = await backendApi('sevaVisitsBootstrap', { season: scope }); } catch (e) { return { ok: false, error: e.message }; }

  const box = outbox_();
  const pendingVisitIds = new Set(box.filter(o => o.action === 'upsertSevaVisit').map(o => o.key));
  const pendingHomeIds = new Set(box.filter(o => o.action === 'setHomeLocation').map(o => o.key));

  // Visits: server is authoritative for the scoped season, except rows with a
  // pending local mark; other seasons' local rows are preserved.
  const serverVisits = (res.visits || []);
  const seen = new Set();
  const merged = [];
  serverVisits.forEach(v => { if (!pendingVisitIds.has(v.id) && !seen.has(v.id)) { seen.add(v.id); merged.push(v); } });
  visits_().forEach(v => {
    if (seen.has(v.id)) return;
    if (String(v.season) !== scope || pendingVisitIds.has(v.id)) { seen.add(v.id); merged.push(v); }
  });
  MEM.visits = merged; saveVisitsLocal_();

  // Home pins are global; take the server's, keep any with a pending local write.
  const serverHomes = (res.homeLocations || []);
  const seenH = new Set();
  const mergedH = [];
  serverHomes.forEach(h => { if (!pendingHomeIds.has(String(h.devoteeId)) && !seenH.has(String(h.devoteeId))) { seenH.add(String(h.devoteeId)); mergedH.push(h); } });
  homes_().forEach(h => { if (!seenH.has(String(h.devoteeId))) { seenH.add(String(h.devoteeId)); mergedH.push(h); } });
  MEM.homes = mergedH; saveHomesLocal_();

  // Teams are admin-managed (no field outbox): server is authoritative for the
  // scoped season; keep other seasons' cached teams.
  if (Array.isArray(res.teams)) {
    const kept = teams_().filter(t => String(t.season) !== scope);
    MEM.teams = [...kept, ...res.teams]; saveTeamsLocal_();
  }

  MEM.meta = { ...meta_(), lastSyncDown: nowISO_() }; saveMetaLocal_();
  emit_('ac-seva-visit-synced', { pending: outbox_().length, refreshed: true });
  return { ok: true };
}

function init() {
  if (inited) return;
  inited = true;
  visits_(); homes_(); teams_(); meta_();
  try {
    window.addEventListener('online', () => { flush().then(() => syncDown()); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
  } catch { /* non-browser */ }
  flush().then(() => syncDown()).catch(() => {});
}

// ── Lookups ───────────────────────────────────────────────────────────────
function visitKey_(devoteeId, season) { return `${devoteeId}|${season}`; }

const sevaVisitService = {
  init, flush, syncDown,

  getSeason: () => meta_().season,
  setSeason: (s) => { MEM.meta = { ...meta_(), season: String(s) }; saveMetaLocal_(); emit_('ac-seva-visit-changed'); return MEM.meta.season; },

  // A { devoteeId -> visit } map for the current (or given) season.
  visitsMap: (season) => {
    const s = String(season || meta_().season);
    const m = {};
    visits_().forEach(v => { if (String(v.season) === s) m[String(v.devoteeId)] = v; });
    return m;
  },
  getVisit: (devoteeId, season) => {
    const s = String(season || meta_().season);
    return visits_().find(v => String(v.devoteeId) === String(devoteeId) && String(v.season) === s) || null;
  },
  getStatus: (devoteeId, season) => {
    const v = sevaVisitService.getVisit(devoteeId, season);
    return v ? String(v.status || 'pending') : 'pending';
  },

  // A { devoteeId -> {lat,lng} } map of home pins.
  homeLocMap: () => {
    const m = {};
    homes_().forEach(h => { if (h.lat !== '' && h.lng !== '' && h.lat != null && h.lng != null) m[String(h.devoteeId)] = { lat: Number(h.lat), lng: Number(h.lng) }; });
    return m;
  },
  getHomeLoc: (devoteeId) => sevaVisitService.homeLocMap()[String(devoteeId)] || null,

  pendingCount: () => outbox_().length,
  isOnline: () => backendOnline() && (typeof navigator === 'undefined' || navigator.onLine !== false),

  // Mark a home's visit status. Optimistic: saves locally + queues the push, and
  // (when lat/lng are given) captures/updates the home's GPS pin too.
  markVisit: (devoteeId, { status, lat, lng, note, boxes } = {}) => {
    const id = String(devoteeId);
    const season = meta_().season;
    const actor = dataService.currentActor ? dataService.currentActor() : '';
    const key = visitKey_(id, season);
    const prev = sevaVisitService.getVisit(id, season);
    const row = {
      id: key, devoteeId: id, season,
      status: String(status || 'pending'),
      note: note != null ? String(note) : (prev ? prev.note : ''),
      boxes: boxes != null && boxes !== '' ? Number(boxes) : (prev && prev.boxes !== '' && prev.boxes != null ? Number(prev.boxes) : ''),
      visitedBy: actor,
      visitedOn: nowISO_(),
    };
    // Upsert the visit in the local cache.
    const list = visits_().filter(v => v.id !== key);
    list.push(row);
    MEM.visits = list; saveVisitsLocal_();

    const hasCoords = !(lat === '' || lat == null) && !(lng === '' || lng == null);
    if (hasCoords) {
      const h = homes_().filter(x => String(x.devoteeId) !== id);
      h.push({ devoteeId: id, lat: Number(lat), lng: Number(lng), updatedBy: actor, updatedOn: nowISO_() });
      MEM.homes = h; saveHomesLocal_();
    }

    // Queue the backend write (visit + optional pin in one call).
    enqueue_('upsertSevaVisit', 'id', key, hasCoords ? { row, lat: Number(lat), lng: Number(lng) } : { row });
    emit_('ac-seva-visit-changed', { devoteeId: id, status: row.status });
    flush();
    return row;
  },

  // Save/overwrite a home pin on its own (e.g. drop-pin on a map), no visit change.
  setHomeLocation: (devoteeId, lat, lng) => {
    const id = String(devoteeId);
    const actor = dataService.currentActor ? dataService.currentActor() : '';
    const h = homes_().filter(x => String(x.devoteeId) !== id);
    if (!(lat === '' || lat == null) && !(lng === '' || lng == null)) h.push({ devoteeId: id, lat: Number(lat), lng: Number(lng), updatedBy: actor, updatedOn: nowISO_() });
    MEM.homes = h; saveHomesLocal_();
    enqueue_('setHomeLocation', 'devoteeId', id, { devoteeId: id, lat: (lat === '' || lat == null) ? '' : Number(lat), lng: (lng === '' || lng == null) ? '' : Number(lng), updatedBy: actor });
    emit_('ac-seva-visit-changed', { devoteeId: id });
    flush();
  },

  // ── Teams (admin-managed area split) ──────────────────────────────────────
  getTeams: (season) => {
    const s = String(season || meta_().season);
    return teams_().filter(t => String(t.season) === s).map(t => ({
      ...t,
      areas: (() => { try { return Array.isArray(t.areas) ? t.areas : JSON.parse(t.areasJson || '[]'); } catch { return []; } })(),
    }));
  },
  // The team a given area is assigned to (for the current season), or null.
  teamForArea: (area, season) => {
    const a = String(area || '');
    return sevaVisitService.getTeams(season).find(t => (t.areas || []).includes(a)) || null;
  },
  saveTeam: async ({ id, name, color, areas }) => {
    const season = meta_().season;
    const actor = dataService.currentActor ? dataService.currentActor() : '';
    const tid = id || `TEAM-${season}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const prev = teams_().find(t => t.id === tid);
    const row = {
      id: tid, season, name: String(name || ''), color: String(color || ''),
      areasJson: JSON.stringify(areas || []),
      createdBy: prev ? prev.createdBy : actor, createdOn: prev ? prev.createdOn : nowISO_(),
      updatedBy: actor, updatedOn: nowISO_(),
    };
    // Optimistic local update.
    MEM.teams = teams_().filter(t => t.id !== tid).concat([row]); saveTeamsLocal_();
    emit_('ac-seva-visit-changed', { team: tid });
    if (backendOnline()) { try { await backendApi('upsertSevaTeam', { row }); } catch { /* stays local, will re-save on next edit */ } }
    return row;
  },
  deleteTeam: async (id) => {
    MEM.teams = teams_().filter(t => t.id !== id); saveTeamsLocal_();
    emit_('ac-seva-visit-changed', { team: id });
    if (backendOnline()) { try { await backendApi('deleteSevaTeam', { id }); } catch { /* ignore */ } }
  },
};

export { sevaVisitService };
