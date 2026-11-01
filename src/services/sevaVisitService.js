// ===========================================================================
// Akshar Connect — Seva visit tracking (OFFLINE-FIRST, DRIVE-BASED)
// ---------------------------------------------------------------------------
// A "seva drive" is a named seva (Annakut prasad, Shravan padhramani…) whose
// devotee set is chosen by tags — exactly like a Follow-up event. Each drive
// tracks its OWN visit progress, so different sevas don't share status.
//
// Padhramani happens in the field with poor signal, so every mark lands in
// localStorage instantly AND in a durable outbox that drains to the backend
// with retries. Marking a home visited captures the visitor's current GPS as
// that home's permanent pin (home pins are GLOBAL — shared across every drive).
//
// Shares dataService's deployed /exec backend + retrying api().
// ===========================================================================

import { backendApi, backendOnline, dataService } from './dataService';

const VISITS_KEY = 'ac_seva_visits_v1';
const HOMES_KEY  = 'ac_home_locations_v1';
const TEAMS_KEY  = 'ac_seva_teams_v1';
const DRIVES_KEY = 'ac_seva_drives_v1';
const OUTBOX_KEY = 'ac_seva_visit_outbox_v1';
const META_KEY   = 'ac_seva_visit_meta_v1';

export const VISIT_STATUSES = ['pending', 'done', 'not_home', 'skip'];
export const isCovered = (status) => String(status || 'pending') === 'done';

function readJSON_(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function writeJSON_(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } }
function nowISO_() { return new Date().toISOString(); }
function emit_(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ } }

let MEM = { visits: null, homes: null, teams: null, drives: null, meta: null };
let flushing = false;
let inited = false;

function meta_() { if (!MEM.meta) MEM.meta = readJSON_(META_KEY, { driveId: '' }); return MEM.meta; }
function visits_() { if (!MEM.visits) MEM.visits = readJSON_(VISITS_KEY, []) || []; return MEM.visits; }
function homes_() { if (!MEM.homes) MEM.homes = readJSON_(HOMES_KEY, []) || []; return MEM.homes; }
function teams_() { if (!MEM.teams) MEM.teams = readJSON_(TEAMS_KEY, []) || []; return MEM.teams; }
function drives_() { if (!MEM.drives) MEM.drives = readJSON_(DRIVES_KEY, []) || []; return MEM.drives; }
function saveVisitsLocal_() { writeJSON_(VISITS_KEY, MEM.visits); }
function saveHomesLocal_() { writeJSON_(HOMES_KEY, MEM.homes); }
function saveTeamsLocal_() { writeJSON_(TEAMS_KEY, MEM.teams); }
function saveDrivesLocal_() { writeJSON_(DRIVES_KEY, MEM.drives); }
function saveMetaLocal_() { writeJSON_(META_KEY, MEM.meta); }
function outbox_() { return readJSON_(OUTBOX_KEY, []) || []; }
function setOutbox_(arr) { writeJSON_(OUTBOX_KEY, arr); }

function driveId_() { return String(meta_().driveId || ''); }
function visitKey_(devoteeId, driveId) { return `${driveId}|${devoteeId}`; }

// ── Durable outbox ───────────────────────────────────────────────────────────
function enqueue_(action, keyVal, payload) {
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

// ── Pull the server's copy for one drive, keeping un-synced local marks ────────
async function syncDown(driveId) {
  if (!backendOnline() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { ok: false, offline: true };
  const scope = String(driveId || driveId_() || '');
  let res;
  try { res = await backendApi('sevaVisitsBootstrap', { driveId: scope }); } catch (e) { return { ok: false, error: e.message }; }

  const box = outbox_();
  const pendingVisitIds = new Set(box.filter(o => o.action === 'upsertSevaVisit').map(o => o.key));
  const pendingHomeIds = new Set(box.filter(o => o.action === 'setHomeLocation').map(o => o.key));

  // Visits: server authoritative for the scoped drive, except rows with a pending
  // local mark; other drives' local rows are preserved.
  const serverVisits = (res.visits || []);
  const seen = new Set();
  const merged = [];
  serverVisits.forEach(v => { if (!pendingVisitIds.has(v.id) && !seen.has(v.id)) { seen.add(v.id); merged.push(v); } });
  visits_().forEach(v => {
    if (seen.has(v.id)) return;
    if (String(v.driveId) !== scope || pendingVisitIds.has(v.id)) { seen.add(v.id); merged.push(v); }
  });
  MEM.visits = merged; saveVisitsLocal_();

  // Home pins are global; take the server's, keep any with a pending local write.
  const serverHomes = (res.homeLocations || []);
  const seenH = new Set();
  const mergedH = [];
  serverHomes.forEach(h => { if (!pendingHomeIds.has(String(h.devoteeId)) && !seenH.has(String(h.devoteeId))) { seenH.add(String(h.devoteeId)); mergedH.push(h); } });
  homes_().forEach(h => { if (!seenH.has(String(h.devoteeId))) { seenH.add(String(h.devoteeId)); mergedH.push(h); } });
  MEM.homes = mergedH; saveHomesLocal_();

  // Teams: server authoritative for the scoped drive; keep other drives' teams.
  if (Array.isArray(res.teams)) {
    const kept = teams_().filter(t => String(t.driveId) !== scope);
    MEM.teams = [...kept, ...res.teams]; saveTeamsLocal_();
  }
  // Drives: the full list is small and admin-managed — server is authoritative.
  if (Array.isArray(res.drives)) { MEM.drives = res.drives; saveDrivesLocal_(); }

  MEM.meta = { ...meta_(), lastSyncDown: nowISO_() }; saveMetaLocal_();
  emit_('ac-seva-visit-synced', { pending: outbox_().length, refreshed: true });
  return { ok: true };
}

async function loadDrives() {
  if (!backendOnline()) return drives_();
  try { const r = await backendApi('getSevaDrives', {}); if (r && Array.isArray(r.drives)) { MEM.drives = r.drives; saveDrivesLocal_(); emit_('ac-seva-visit-changed', { drives: true }); } }
  catch { /* offline — keep cache */ }
  return drives_();
}

function init() {
  if (inited) return;
  inited = true;
  visits_(); homes_(); teams_(); drives_(); meta_();
  try {
    window.addEventListener('online', () => { flush().then(() => syncDown()); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
  } catch { /* non-browser */ }
  flush().then(() => { loadDrives(); if (driveId_()) return syncDown(); }).catch(() => {});
}

const sevaVisitService = {
  init, flush, syncDown, loadDrives,

  // ── Drives ────────────────────────────────────────────────────────────────
  getDriveId: () => driveId_(),
  setDriveId: (id) => { MEM.meta = { ...meta_(), driveId: String(id || '') }; saveMetaLocal_(); emit_('ac-seva-visit-changed', { drive: id }); if (id) syncDown(String(id)); return driveId_(); },
  // All drives (active first). Each has `tags` (parsed array).
  getDrives: () => drives_().map(d => ({
    ...d,
    tags: (() => { try { return Array.isArray(d.tags) ? d.tags : JSON.parse(d.tagsJson || '[]'); } catch { return []; } })(),
    matchMode: d.matchMode === 'all' ? 'all' : 'any',
    status: d.status === 'archived' ? 'archived' : 'active',
  })).sort((a, b) => (a.status === b.status ? String(a.name).localeCompare(String(b.name)) : (a.status === 'active' ? -1 : 1))),
  getDrive: (id) => sevaVisitService.getDrives().find(d => d.id === String(id)) || null,
  saveDrive: async ({ id, name, tags, matchMode, status }) => {
    const actor = dataService.currentActor ? dataService.currentActor() : '';
    const did = id || `SVD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const prev = drives_().find(d => d.id === did);
    const row = {
      id: did, name: String(name || ''), tagsJson: JSON.stringify(tags || []),
      matchMode: matchMode === 'all' ? 'all' : 'any', status: status === 'archived' ? 'archived' : 'active',
      createdBy: prev ? prev.createdBy : actor, createdOn: prev ? prev.createdOn : nowISO_(),
      updatedBy: actor, updatedOn: nowISO_(),
    };
    MEM.drives = drives_().filter(d => d.id !== did).concat([row]); saveDrivesLocal_();
    emit_('ac-seva-visit-changed', { drive: did });
    if (backendOnline()) { try { await backendApi('upsertSevaDrive', { row }); } catch { /* stays local */ } }
    return row;
  },
  deleteDrive: async (id) => {
    MEM.drives = drives_().filter(d => d.id !== id); saveDrivesLocal_();
    if (driveId_() === String(id)) sevaVisitService.setDriveId('');
    emit_('ac-seva-visit-changed', { drive: id });
    if (backendOnline()) { try { await backendApi('deleteSevaDrive', { id }); } catch { /* ignore */ } }
  },

  // ── Visits (scoped to the current drive) ───────────────────────────────────
  visitsMap: (driveId) => {
    const s = String(driveId || driveId_());
    const m = {};
    visits_().forEach(v => { if (String(v.driveId) === s) m[String(v.devoteeId)] = v; });
    return m;
  },
  getVisit: (devoteeId, driveId) => {
    const s = String(driveId || driveId_());
    return visits_().find(v => String(v.devoteeId) === String(devoteeId) && String(v.driveId) === s) || null;
  },
  getStatus: (devoteeId, driveId) => { const v = sevaVisitService.getVisit(devoteeId, driveId); return v ? String(v.status || 'pending') : 'pending'; },

  homeLocMap: () => {
    const m = {};
    homes_().forEach(h => { if (h.lat !== '' && h.lng !== '' && h.lat != null && h.lng != null) m[String(h.devoteeId)] = { lat: Number(h.lat), lng: Number(h.lng), source: String(h.source || 'gps') }; });
    return m;
  },
  getHomeLoc: (devoteeId) => sevaVisitService.homeLocMap()[String(devoteeId)] || null,

  // Auto-fill approximate home pins from devotee addresses. `rows` = [{devoteeId,
  // address}] (the page chooses which — typically devotees with no pin yet). The
  // backend geocodes each (keyless) and writes a 'geocoded' pin; a real 'gps' pin
  // is never overwritten. Returns { geocoded, skipped, failed }. Online-only.
  geocodeHomes: async (rows, { force = false } = {}) => {
    const list = (rows || []).filter(r => r && r.devoteeId && String(r.address || '').trim());
    if (!list.length) return { ok: true, geocoded: 0, skipped: 0, failed: 0 };
    if (!backendOnline() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { ok: false, offline: true };
    const actor = dataService.currentActor ? dataService.currentActor() : '';
    const res = await backendApi('geocodeHomes', { rows: JSON.stringify(list), force: !!force, updatedBy: actor });
    if (res && Array.isArray(res.results) && res.results.length) {
      const byId = {}; homes_().forEach(h => { byId[String(h.devoteeId)] = h; });
      res.results.forEach(r => {
        if (!r.ok) return;
        const ex = byId[String(r.devoteeId)];
        if (ex && String(ex.source) === 'gps' && ex.lat !== '' && ex.lat != null) return; // never clobber a GPS pin
        byId[String(r.devoteeId)] = { devoteeId: String(r.devoteeId), lat: Number(r.lat), lng: Number(r.lng), source: 'geocoded', updatedBy: actor, updatedOn: nowISO_() };
      });
      MEM.homes = Object.values(byId); saveHomesLocal_();
      emit_('ac-seva-visit-changed', { geocoded: res.geocoded });
    }
    return res || { ok: false };
  },

  pendingCount: () => outbox_().length,
  isOnline: () => backendOnline() && (typeof navigator === 'undefined' || navigator.onLine !== false),

  markVisit: (devoteeId, { status, lat, lng, note, boxes } = {}) => {
    const drive = driveId_();
    if (!drive) return null;
    const id = String(devoteeId);
    const actor = dataService.currentActor ? dataService.currentActor() : '';
    const key = visitKey_(id, drive);
    const prev = sevaVisitService.getVisit(id, drive);
    const row = {
      id: key, driveId: drive, devoteeId: id,
      status: String(status || 'pending'),
      note: note != null ? String(note) : (prev ? prev.note : ''),
      boxes: boxes != null && boxes !== '' ? Number(boxes) : (prev && prev.boxes !== '' && prev.boxes != null ? Number(prev.boxes) : ''),
      visitedBy: actor, visitedOn: nowISO_(),
    };
    const list = visits_().filter(v => v.id !== key);
    list.push(row);
    MEM.visits = list; saveVisitsLocal_();

    const hasCoords = !(lat === '' || lat == null) && !(lng === '' || lng == null);
    if (hasCoords) {
      const h = homes_().filter(x => String(x.devoteeId) !== id);
      h.push({ devoteeId: id, lat: Number(lat), lng: Number(lng), source: 'gps', updatedBy: actor, updatedOn: nowISO_() });
      MEM.homes = h; saveHomesLocal_();
    }
    enqueue_('upsertSevaVisit', key, hasCoords ? { row, lat: Number(lat), lng: Number(lng) } : { row });
    emit_('ac-seva-visit-changed', { devoteeId: id, status: row.status });
    flush();
    return row;
  },

  setHomeLocation: (devoteeId, lat, lng) => {
    const id = String(devoteeId);
    const actor = dataService.currentActor ? dataService.currentActor() : '';
    const h = homes_().filter(x => String(x.devoteeId) !== id);
    if (!(lat === '' || lat == null) && !(lng === '' || lng == null)) h.push({ devoteeId: id, lat: Number(lat), lng: Number(lng), source: 'gps', updatedBy: actor, updatedOn: nowISO_() });
    MEM.homes = h; saveHomesLocal_();
    enqueue_('setHomeLocation', id, { devoteeId: id, lat: (lat === '' || lat == null) ? '' : Number(lat), lng: (lng === '' || lng == null) ? '' : Number(lng), source: 'gps', updatedBy: actor });
    emit_('ac-seva-visit-changed', { devoteeId: id });
    flush();
  },

  // ── Teams (scoped to the current drive) ────────────────────────────────────
  getTeams: (driveId) => {
    const s = String(driveId || driveId_());
    return teams_().filter(t => String(t.driveId) === s).map(t => ({
      ...t,
      areas: (() => { try { return Array.isArray(t.areas) ? t.areas : JSON.parse(t.areasJson || '[]'); } catch { return []; } })(),
    }));
  },
  teamForArea: (area, driveId) => {
    const a = String(area || '');
    return sevaVisitService.getTeams(driveId).find(t => (t.areas || []).includes(a)) || null;
  },
  saveTeam: async ({ id, name, color, areas }) => {
    const drive = driveId_();
    const actor = dataService.currentActor ? dataService.currentActor() : '';
    const tid = id || `TEAM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const prev = teams_().find(t => t.id === tid);
    const row = {
      id: tid, driveId: drive, name: String(name || ''), color: String(color || ''),
      areasJson: JSON.stringify(areas || []),
      createdBy: prev ? prev.createdBy : actor, createdOn: prev ? prev.createdOn : nowISO_(),
      updatedBy: actor, updatedOn: nowISO_(),
    };
    MEM.teams = teams_().filter(t => t.id !== tid).concat([row]); saveTeamsLocal_();
    emit_('ac-seva-visit-changed', { team: tid });
    if (backendOnline()) { try { await backendApi('upsertSevaTeam', { row }); } catch { /* stays local */ } }
    return row;
  },
  deleteTeam: async (id) => {
    MEM.teams = teams_().filter(t => t.id !== id); saveTeamsLocal_();
    emit_('ac-seva-visit-changed', { team: id });
    if (backendOnline()) { try { await backendApi('deleteSevaTeam', { id }); } catch { /* ignore */ } }
  },
};

export { sevaVisitService };
