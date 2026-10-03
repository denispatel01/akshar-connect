import { INITIAL_DEVOTEES, INITIAL_SABHAS, INITIAL_THOUGHTS, INITIAL_USERS } from './mockData';
import { normalizeDevotee, toBackendRow, withTag, buildKaryakartaReconcilePlan, parseTags } from './devoteeSchema';

// ===== Live backend =====================================================
// Replaced at build time with the deployed Apps Script /exec URL.
const API_URL = "https://script.google.com/macros/s/AKfycbw-LyYduU1mUaXwamTGPyh_TtP6pZkO3pTCPPGKMQOhUwJhFa_Z4wFzz83FYXnq9YqAnA/exec";
const hasBackend = () => typeof API_URL === 'string' && API_URL.indexOf('http') === 0;

const SESSION_KEY = 'ac_session_v1';
const CACHE_KEY = 'ac_cache_v1';

const ADMIN_SEED = { mobile:'9924598434', pin:'170853', password:'', role:'Admin', name:'Denis Patel' };

// The signed-in actor as a stable "Name (mobile)" label for audit columns
// (createdBy / updatedBy). Reads the real session key — earlier code read a
// non-existent 'ac-session' key, so these columns were never populated.
function actorLabel() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s) return 'System';
    const name = (s.name || '').trim();
    const mobile = (s.mobile || '').toString().trim();
    if (name && mobile) return `${name} (${mobile})`;
    return name || mobile || 'System';
  } catch { return 'System'; }
}

// In-memory database (populated by bootstrap before the app renders).
let DB = { users: [], devotees: [], sabhas: [], thoughts: [], attendance: [], followups: [], areas: [] };

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function api(action, payload = {}) {
  const body = JSON.stringify({ action, ...payload });
  let lastErr;
  for (let n = 1; n <= 4; n++) {
    try {
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request, no CORS preflight
        body, redirect: 'follow'
      });
      const t = await r.text();
      let d; try { d = JSON.parse(t); } catch (e) { lastErr = new Error('Server busy'); await delay(500 * n); continue; }
      if (d && d.ok === false) throw new Error(d.error || 'Error');
      return d;
    } catch (e) { lastErr = e; await delay(500 * n); }
  }
  throw lastErr || new Error('Network error');
}

// Fire-and-forget write with retry; keeps UI snappy (optimistic).
function push(action, payload) {
  if (!hasBackend()) return;
  api(action, payload).catch(err => console.warn('sync failed:', action, err.message));
}

function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(DB)); } catch (e) {} }

// Synchronously populate DB from the local cache (or the bundled dataset) so the
// app can render INSTANTLY without waiting for the network. Returns the source.
function hydrateSync() {
  try {
    const c = localStorage.getItem(CACHE_KEY);
    if (c) {
      const parsed = JSON.parse(c);
      DB = {
        users: parsed.users || [], devotees: (parsed.devotees || []).map(normalizeDevotee),
        sabhas: parsed.sabhas || [], thoughts: parsed.thoughts || [],
        attendance: parsed.attendance || [], followups: parsed.followups || [],
        areas: parsed.areas || [],
      };
      ensureSeedAdminPin_();
      return 'cache';
    }
  } catch (e) { /* fall through to bundled */ }
  loadDemo();
  ensureSeedAdminPin_();
  return 'bundled';
}

function loadDemo() {
  DB = {
    users: [...INITIAL_USERS], devotees: INITIAL_DEVOTEES.map(normalizeDevotee),
    sabhas: [...INITIAL_SABHAS], thoughts: [...INITIAL_THOUGHTS], attendance: [], followups: [], areas: []
  };
}

/** Keep seed admin PIN in sync (e.g. after changing ADMIN_SEED or old 5-digit cache). */
function ensureSeedAdminPin_() {
  const idx = DB.users.findIndex(u => String(u.mobile) === ADMIN_SEED.mobile);
  if (idx < 0) return;
  if (String(DB.users[idx].pin) === String(ADMIN_SEED.pin)) return;
  DB.users[idx] = { ...DB.users[idx], pin: ADMIN_SEED.pin };
  saveCache();
  push('upsertUser', DB.users[idx]);
}

// Called once from main.jsx BEFORE the app renders.
// People (first + last) who — together with their whole family — are "Old".
// Everyone else is "New". Used once by the bootstrap classification.
const OLD_PEOPLE = [
  ['Hemant', 'Ahir'], ['Hasmukh', 'Chandegara'], ['Suketu', 'Thakor'], ['Vrajesh', 'Panchal'],
  ['Pratik', 'Patel'], ['Ashwin', 'Patel'], ['Aman', 'Jadav'], ['Prerak', 'Ariwala'],
  ['Nirdosh', 'Patel'], ['Ashish', 'Makwana'], ['Rigal', 'Patel'], ['Girish', 'Bodiwala'],
  ['Jenish', 'Bodiwala'], ['Nanu', 'Ahir'], ['Bhadresh', 'Gandhi'], ['Mehul', 'Gandhi'],
  ['Akshit', 'Panchal'], ['Yogesh', 'Panchal'], ['Yogesh', 'Bhagat'], ['Kanti', 'Sakanwala'],
  ['Nilesh', 'Chapaneriya'], ['Digesh', 'Patel'], ['Priyank', 'Mistry'], ['Milan', 'Bhatt'],
  ['Ravi', 'Papoliwala'],
];

// Normalize a name part: lowercase, drop honorific suffixes, keep letters only.
const normName_ = (s) => String(s || '').toLowerCase().replace(/bhai|kumar/g, '').replace(/[^a-z]/g, '');

function firstLast_(dv) {
  const parts = String(dv.name || '').trim().split(/\s+/).filter(Boolean);
  const first = dv.firstName || parts[0] || '';
  const last = dv.lastName || (parts.length > 1 ? parts[parts.length - 1] : '');
  return [normName_(first), normName_(last)];
}

// First names match if equal or one is a prefix of the other (handles
// "Priyank" vs "Priyankkumar", "Digesh" vs "Digesh (Denis)").
const firstMatch_ = (a, b) => a && b && (a === b || a.startsWith(b) || b.startsWith(a));

// Returns the Set of familyIds that should be marked Old.
function classifyOldFamilies_(devotees) {
  const old = OLD_PEOPLE.map(([f, l]) => [normName_(f), normName_(l)]);
  const families = new Set();
  devotees.forEach((dv) => {
    const [f, l] = firstLast_(dv);
    if (old.some(([of, ol]) => l === ol && firstMatch_(f, of))) families.add(dv.familyId || dv.id);
  });
  return families;
}

async function bootstrap() {
  if (!hasBackend()) { loadDemo(); return { mode: 'demo' }; }
  try {
    const d = await api('bootstrap');
    DB.users = d.users || []; DB.devotees = (d.devotees || []).map(normalizeDevotee);
    DB.sabhas = d.sabhas || []; DB.thoughts = d.thoughts || [];
    DB.attendance = d.attendance || []; DB.followups = d.followups || [];
    DB.areas = d.areas || [];
    // Self-healing: if any stored devotee still carries a tag that is no longer
    // in the catalog (e.g. a removed tag) or a duplicate, rewrite the cleaned
    // rows once. normalizeDevotee already stripped them in-memory, so this just
    // persists the purge. Self-terminating: once the sheet is clean it stops.
    const rawDevotees = d.devotees || [];
    const needsTagPurge = rawDevotees.some(r => {
      const rawKeys = String(r.tags || '').split(/[|,]/).map(s => s.trim()).filter(Boolean);
      const cleaned = parseTags(r.tags);
      return rawKeys.length !== cleaned.length || rawKeys.some(k => !cleaned.includes(k));
    });
    if (needsTagPurge && DB.devotees.length) {
      try { await api('replaceDevotees', { rows: DB.devotees.map(toBackendRow) }); } catch (e) { /* non-fatal */ }
    }
    // One-time Old/New classification. Runs only while some devotee still has a
    // blank oldNew (i.e. before this has ever been applied). The listed people
    // and everyone in their family are marked Old; everyone else New. Once every
    // record has a value it never runs again, and new devotees default to New.
    const needsOldNew = DB.devotees.length && (d.devotees || []).some(r => !String(r.oldNew || '').trim());
    if (needsOldNew) {
      const oldFamilyIds = classifyOldFamilies_(DB.devotees);
      DB.devotees = DB.devotees.map(dv => normalizeDevotee({
        ...dv,
        oldNew: oldFamilyIds.has(dv.familyId || dv.id) ? 'Old' : 'New',
      }));
      try { await api('replaceDevotees', { rows: DB.devotees.map(toBackendRow) }); } catch (e) { /* non-fatal */ }
    }
    // First run: populate the new sheet with the bundled devotee list.
    if (DB.devotees.length === 0 && INITIAL_DEVOTEES.length) {
      await api('seedDevotees', { rows: INITIAL_DEVOTEES.map(r => toBackendRow(normalizeDevotee(r))) });
      DB.devotees = INITIAL_DEVOTEES.map(normalizeDevotee);
    }
    // Ensure the seed admin account exists on the live sheet.
    if (!DB.users.some(u => String(u.mobile) === ADMIN_SEED.mobile)) {
      try { await api('upsertUser', ADMIN_SEED); } catch (e) { /* non-fatal */ }
      DB.users.push({ ...ADMIN_SEED });
    }
    ensureSeedAdminPin_();
    saveCache();
    return { mode: 'live' };
  } catch (e) {
    // Offline: use last cached data, else demo seed.
    const c = localStorage.getItem(CACHE_KEY);
    if (c) { try { DB = JSON.parse(c); DB.devotees = (DB.devotees || []).map(normalizeDevotee); DB.followups = DB.followups || []; return { mode: 'cache' }; } catch (er) {} }
    loadDemo();
    return { mode: 'demo', error: e.message };
  }
}

export const dataService = {
  bootstrap,
  hydrateSync,
  isLive: () => hasBackend(),

  // ---- Auth ----
  loginWithPin: async (mobile, pin) => {
    const user = DB.users.find(u => String(u.mobile) === String(mobile) && String(u.pin) === String(pin));
    if (user) { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); return { success: true, user }; }
    throw new Error('Invalid Mobile Number or PIN. Please check your credentials.');
  },

  // Devotee self-login: mobile + DOB. Password is the date of birth in
  // dd-MM-yyyy (e.g. 01121995). A 2-digit year (ddMMyy) is still accepted.
  loginWithDob: async (mobile, dob) => {
    // Find matching devotee record
    const devotee = DB.devotees.find(d => String(d.mobile) === String(mobile));
    if (!devotee) throw new Error('No devotee found with this mobile number.');
    if (!devotee.dob) throw new Error('Date of birth not set for this record. Contact your Mandal admin.');
    // DOB stored as YYYY-MM-DD → build the accepted ddMMyyyy / ddMMyy forms.
    const [y, m, d] = devotee.dob.split('-');
    const entered = String(dob).replace(/\D/g, '');
    const expectedFull  = `${d}${m}${y}`;          // ddMMyyyy
    const expectedShort = `${d}${m}${y.slice(2)}`; // ddMMyy (legacy)
    if (entered !== expectedFull && entered !== expectedShort)
      throw new Error('Incorrect date of birth. Use format DD-MM-YYYY (e.g. 01-12-1995).');
    // Build a session user object for the devotee
    const sessionUser = {
      mobile: String(mobile),
      name: devotee.name || 'Devotee',
      role: 'Devotee',
      pin: '',
      password: '',
      devoteeId: devotee.id,   // anchor to their own record
      familyId: devotee.familyId || devotee.id,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    return { success: true, user: sessionUser };
  },

  // Fire-and-forget: email the admin when a user hits a runtime error.
  reportError: (info) => {
    try {
      if (!hasBackend()) return;
      const sess = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
      const body = JSON.stringify({
        action: 'logError',
        user: sess?.name || '', mobile: sess?.mobile || '',
        message: String(info?.message || info || '').slice(0, 500),
        stack: String(info?.stack || '').slice(0, 4000),
        page: info?.page || (typeof location !== 'undefined' ? location.hash : ''),
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        time: new Date().toISOString(),
      });
      fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: true }).catch(() => {});
    } catch (e) { /* never throw from the error reporter */ }
  },

  loginWithPassword: async (mobile, password) => {
    const user = DB.users.find(u => String(u.mobile) === String(mobile) && u.password === password);
    if (!user) throw new Error('Invalid Mobile Number or Password.');
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return { success: true, user };
  },

  requestOtp: async (mobile) => {
    if (!mobile || mobile.length !== 10) throw new Error('Please enter a valid 10-digit mobile number.');
    return { success: true, otp: '123456', message: 'OTP sent to WhatsApp +91 ' + mobile };
  },
  verifyOtp: async (mobile, otp) => {
    if (otp !== '123456') throw new Error('Invalid OTP. Use demo OTP: 123456');
    return { success: true };
  },

  completeSetup: async (mobile, password, pin) => {
    const idx = DB.users.findIndex(u => String(u.mobile) === String(mobile));
    const user = {
      mobile, password, pin,
      role: idx >= 0 ? DB.users[idx].role : 'Devotee',
      name: idx >= 0 ? DB.users[idx].name : 'Satsangi Devotee'
    };
    if (idx >= 0) DB.users[idx] = user; else DB.users.push(user);
    saveCache(); push('upsertUser', user);
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return { success: true, user };
  },

  getUsers: () => DB.users,

  addUser: (u) => {
    const user = { mobile:String(u.mobile||'').trim(), pin:String(u.pin||'').trim(), password:u.password||'', role:u.role||'Devotee', name:u.name||'Satsangi Devotee' };
    const idx = DB.users.findIndex(x=>String(x.mobile)===user.mobile);
    if(idx>=0) DB.users[idx]=user; else DB.users.push(user);
    saveCache();
    push('upsertUser', user);
    return user;
  },

  // Create or edit a system user (Admin). Merges with the existing record so a
  // partial edit (e.g. just the role) keeps the pin/password.
  saveUser: (u) => {
    const mobile = String(u.mobile || '').trim();
    const idx = DB.users.findIndex(x => String(x.mobile) === mobile);
    const cur = idx >= 0 ? DB.users[idx] : {};
    const user = {
      mobile,
      name: (u.name ?? cur.name) || 'Satsangi Devotee',
      role: (u.role ?? cur.role) || 'Devotee',
      pin: (u.pin !== undefined && u.pin !== '') ? String(u.pin) : (cur.pin || ''),
      password: (u.password !== undefined && u.password !== '') ? u.password : (cur.password || ''),
    };
    if (idx >= 0) DB.users[idx] = user; else DB.users.push(user);
    saveCache();
    // Send only the fields we intend to change (backend merges the rest).
    const payload = { mobile, name: user.name, role: user.role };
    if (u.pin !== undefined && u.pin !== '') payload.pin = String(u.pin);
    if (u.password !== undefined && u.password !== '') payload.password = u.password;
    push('upsertUser', payload);
    return user;
  },

  deleteUserAndSync: async (mobile) => {
    DB.users = DB.users.filter(x => String(x.mobile) !== String(mobile));
    saveCache();
    if (hasBackend()) await api('deleteUser', { mobile: String(mobile) });
  },

  // Change the signed-in user's own password and/or PIN. Works for staff and
  // devotees; for a devotee (no Users row yet) it creates one so they can then
  // also sign in with the new password/PIN.
  changeMyCredentials: async ({ password, pin } = {}) => {
    const sess = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!sess || !sess.mobile) throw new Error('You must be signed in.');
    const payload = { mobile: String(sess.mobile), name: sess.name, role: sess.role || 'Devotee' };
    if (password) payload.password = password;
    if (pin) payload.pin = String(pin);
    if (!password && !pin) throw new Error('Enter a new password or PIN.');
    if (hasBackend()) await api('upsertUser', payload);
    // reflect locally
    const idx = DB.users.findIndex(x => String(x.mobile) === String(sess.mobile));
    const merged = { ...(idx >= 0 ? DB.users[idx] : {}), ...payload };
    if (idx >= 0) DB.users[idx] = merged; else DB.users.push(merged);
    const newSess = { ...sess, ...(password ? { password } : {}), ...(pin ? { pin: String(pin) } : {}) };
    localStorage.setItem(SESSION_KEY, JSON.stringify(newSess));
    saveCache();
    return { success: true, user: newSess };
  },

  getCurrentSession: () => JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'),
  logout: () => localStorage.removeItem(SESSION_KEY),

  // Who is acting right now — used to stamp createdBy / updatedBy. Returns a
  // stable, human-readable identity "Name (mobile)" so the actor is unambiguous
  // even when two people share a name. Falls back to 'System' when signed out.
  currentActor: () => actorLabel(),

  // ---- Devotees ----
  getDevotees: () => DB.devotees,
  getDevoteeById: (id) => DB.devotees.find(d => d.id === id) || null,

  addDevotee: (devotee) => {
    const nextNum = DB.devotees.length + 1;
    const now = new Date().toISOString();
    const newDevotee = normalizeDevotee({
      ...devotee,
      id: `HPP-${nextNum}`,
      attendanceRate: devotee.attendanceRate ?? 0,
      status: devotee.status || 'Active',
      oldNew: devotee.oldNew || 'New', // newly added devotees default to New
      createdOn: now, updatedOn: now, createdBy: actorLabel(), updatedBy: actorLabel(),
    });
    DB.devotees.unshift(newDevotee); saveCache();
    push('insert', { collection: 'Devotees', row: toBackendRow(newDevotee) });
    return newDevotee;
  },

  updateDevotee: (id, updatedFields) => {
    const idx = DB.devotees.findIndex(d => d.id === id);
    if (idx === -1) return null;
    const merged = normalizeDevotee({ ...DB.devotees[idx], ...updatedFields, updatedOn: new Date().toISOString(), updatedBy: actorLabel() });
    DB.devotees[idx] = merged; saveCache();
    push('update', { collection: 'Devotees', keyField: 'id', key: id, row: toBackendRow(merged) });
    return merged;
  },

  /** Save devotee and wait for live sheet sync (for user-facing success/error alerts). */
  updateDevoteeAndSync: async (id, updatedFields) => {
    const idx = DB.devotees.findIndex(d => d.id === id);
    if (idx === -1) throw new Error('Devotee record not found.');
    const prev = DB.devotees[idx];
    const merged = normalizeDevotee({ ...prev, ...updatedFields, updatedOn: new Date().toISOString(), updatedBy: actorLabel() });
    DB.devotees[idx] = merged;
    saveCache();
    // Optimistic: return immediately; the write syncs in the background (with retry).
    push('update', { collection: 'Devotees', keyField: 'id', key: id, row: toBackendRow(merged) });
    return merged;
  },

  addDevoteeAndSync: async (devotee) => {
    const nextNum = DB.devotees.length + 1;
    const now = new Date().toISOString();
    const id = `HPP-${nextNum}`;
    // A primary member (family head) is their own family — auto-generate the
    // Family ID from their own record ID so it's populated immediately.
    const isPrimary = devotee.type === 'Primary' || !devotee.type;
    const familyId = devotee.familyId || (isPrimary ? id : '');
    const newDevotee = normalizeDevotee({
      ...devotee,
      id,
      familyId,
      attendanceRate: devotee.attendanceRate ?? 0,
      status: devotee.status || 'Active',
      oldNew: devotee.oldNew || 'New', // newly added devotees default to New
      createdOn: now, updatedOn: now,
      // Always stamp the acting user centrally so audit columns are reliable,
      // regardless of what the caller passed (fixes empty createdBy).
      createdBy: devotee.createdBy || actorLabel(),
      updatedBy: actorLabel(),
    });
    DB.devotees.unshift(newDevotee);
    saveCache();
    // Optimistic: return immediately; the insert syncs in the background (with retry).
    push('insert', { collection: 'Devotees', row: toBackendRow(newDevotee) });
    return newDevotee;
  },

  // Assign/unassign a single tag; returns the updated devotee.
  bulkUpdateTagsAndSync: async (ids, tagsToAdd, tagsToRemove) => {
    const now = new Date().toISOString();
    const user = actorLabel();
    const toSync = [];
    ids.forEach(id => {
      const idx = DB.devotees.findIndex(d => d.id === id);
      if (idx !== -1) {
        let tags = DB.devotees[idx].tags || [];
        tags = [...new Set([...tags, ...tagsToAdd])];
        tags = tags.filter(t => !tagsToRemove.includes(t));
        DB.devotees[idx] = normalizeDevotee({ ...DB.devotees[idx], tags, updatedOn: now, updatedBy: user });
        toSync.push(DB.devotees[idx]);
      }
    });
    saveCache();
    // One batched background request instead of one per devotee.
    if (toSync.length) push('bulkUpdateTags', { ids, tagsToAdd, tagsToRemove, updatedBy: user });
  },

  // Replace the full tag array for several devotees at once. `entries` is
  // [{ id, tags }] — used by the swipe-through bulk tagger where each devotee
  // gets its own complete tag set. Only devotees whose tags actually changed
  // are synced to the backend.
  bulkSetTagsAndSync: async (entries) => {
    const now = new Date().toISOString();
    const user = actorLabel();
    const toSync = [];
    entries.forEach(({ id, tags }) => {
      const idx = DB.devotees.findIndex(d => d.id === id);
      if (idx === -1) return;
      const nextTags = parseTags(tags); // normalize/dedupe to valid keys
      const prev = DB.devotees[idx].tags || [];
      const changed = prev.length !== nextTags.length || prev.some(t => !nextTags.includes(t));
      if (!changed) return;
      DB.devotees[idx] = normalizeDevotee({ ...DB.devotees[idx], tags: nextTags, updatedOn: now, updatedBy: user });
      toSync.push(DB.devotees[idx]);
    });
    saveCache();
    // One batched background request instead of one per devotee.
    if (toSync.length) push('bulkSetTags', { rows: toSync.map(d => ({ id: d.id, tags: toBackendRow(d).tags })), updatedBy: user });
    return toSync.length;
  },

  setDevoteeTag: (id, tagKey, on, exclusiveKeys = []) => {
    const d = DB.devotees.find(x => x.id === id);
    if (!d) return null;
    let tags = withTag(d.tags, tagKey, on);
    // Remove mutually exclusive siblings when turning this tag on
    if (on) exclusiveKeys.forEach(k => { tags = withTag(tags, k, false); });
    return dataService.updateDevotee(id, { tags });
  },

  deleteDevotee: (id) => {
    DB.devotees = DB.devotees.filter(d => d.id !== id); saveCache();
    push('remove', { collection: 'Devotees', keyField: 'id', key: id });
  },

  // Admin: replace ALL devotees (live sheet + memory) with the bundled merged
  // dataset. Destructive — overwrites the Devotees tab. Returns the new count.
  importBundledDevotees: async () => {
    const normalized = INITIAL_DEVOTEES.map(normalizeDevotee);
    if (hasBackend()) {
      await api('replaceDevotees', { rows: normalized.map(toBackendRow) });
    }
    DB.devotees = normalized; saveCache();
    return DB.devotees.length;
  },
  bundledDevoteeCount: () => INITIAL_DEVOTEES.length,

  // Preview the follow-up karyakarta reconciliation without writing anything.
  planKaryakartaReconcile: (minScore = 0.85) => buildKaryakartaReconcilePlan(DB.devotees, minScore),

  // Reconcile every devotee's follow-up karyakarta name to its matching devotee
  // record, and fill the karyakarta mobile from that record. Single atomic sheet
  // write (replaceDevotees), same trusted path as the bundled-data import.
  reconcileKaryakartaNamesAndSync: async (minScore = 0.85) => {
    const groups = buildKaryakartaReconcilePlan(DB.devotees, minScore);
    const map = new Map();
    groups.forEach(g => { if (g.confident && g.match) map.set(g.value, g.match); });
    let recordsChanged = 0, renamed = 0, mobilesFilled = 0;
    DB.devotees = DB.devotees.map(d => {
      const cur = (d.followupKaryakarta || '').trim();
      const m = map.get(cur);
      if (!m) return d;
      const nameDiff = d.followupKaryakarta !== m.name;
      const mobileDiff = (d.followupKaryakartaMobile || '') !== (m.mobile || '');
      if (!nameDiff && !mobileDiff) return d;
      if (nameDiff) renamed++;
      if (mobileDiff) mobilesFilled++;
      recordsChanged++;
      return normalizeDevotee({ ...d, followupKaryakarta: m.name, followupKaryakartaMobile: m.mobile });
    });
    saveCache();
    if (hasBackend()) await api('replaceDevotees', { rows: DB.devotees.map(toBackendRow) });
    return { recordsChanged, renamed, mobilesFilled, groups };
  },

  // ---- Sabhas & Attendance ----
  getSabhas: () => DB.sabhas,

  addSabha: (sabha) => {
    const newSabha = { ...sabha, id: `SAB-2026-0${DB.sabhas.length + 1}`, type: sabha.type || 'Sabha', presentCount: 0, totalCount: DB.devotees.length, status: 'Scheduled' };
    DB.sabhas.unshift(newSabha); saveCache();
    push('insert', { collection: 'Sabhas', row: newSabha });
    return newSabha;
  },

  updateSabha: (id, fields) => {
    const idx = DB.sabhas.findIndex(s => s.id === id);
    if (idx === -1) return null;
    const merged = { ...DB.sabhas[idx], ...fields, id };
    DB.sabhas[idx] = merged; saveCache();
    push('update', { collection: 'Sabhas', keyField: 'id', key: id, row: merged });
    return merged;
  },

  deleteSabha: (id) => {
    DB.sabhas = DB.sabhas.filter(s => s.id !== id);
    DB.followups = DB.followups.filter(f => f.eventId !== id);
    saveCache();
    push('remove', { collection: 'Sabhas', keyField: 'id', key: id });
  },

  // ---- Area master (admin) ----
  // Stored area records assign a number/label to an area name. The directory's
  // actual area strings live on devotee records; this is a lookup layer.
  getAreas: () => DB.areas,

  // Create or update an area by name (name is the key). Optimistic + background sync.
  saveAreaAndSync: async (name, { number = '', notes = '', prevName } = {}) => {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Area name is required.');
    const key = (prevName || clean).trim();
    const idx = DB.areas.findIndex(a => String(a.name).trim().toLowerCase() === key.toLowerCase());
    const row = { name: clean, number: String(number ?? '').trim(), notes: String(notes ?? '').trim() };
    if (idx >= 0) {
      DB.areas[idx] = { ...DB.areas[idx], ...row };
      saveCache();
      push('update', { collection: 'Areas', keyField: 'name', key, row });
    } else {
      DB.areas.push(row);
      saveCache();
      push('insert', { collection: 'Areas', row });
    }
    return row;
  },

  deleteAreaAndSync: async (name) => {
    const key = String(name || '').trim();
    DB.areas = DB.areas.filter(a => String(a.name).trim().toLowerCase() !== key.toLowerCase());
    saveCache();
    push('remove', { collection: 'Areas', keyField: 'name', key });
  },

  markAttendance: (sabhaId, devoteeId, present = true) => {
    const idx = DB.attendance.findIndex(l => l.sabhaId === sabhaId && l.devoteeId === devoteeId);
    if (idx >= 0) { DB.attendance[idx].present = present; DB.attendance[idx].timestamp = new Date().toISOString(); }
    else DB.attendance.push({ id: `ATT-${Date.now()}`, sabhaId, devoteeId, present, timestamp: new Date().toISOString() });
    const sabha = DB.sabhas.find(s => s.id === sabhaId);
    if (sabha) sabha.presentCount = DB.attendance.filter(l => l.sabhaId === sabhaId && l.present).length;
    saveCache();
    const sess = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    push('markAttendance', { sabhaId, devoteeId, present, markedBy: sess ? sess.name : '' });
  },

  getAttendanceForSabha: (sabhaId) => DB.attendance.filter(l => l.sabhaId === sabhaId),

  // ---- Event Follow-ups ----
  // Events = Sabhas (each carries a `type`). One follow-up per (event, devotee).
  getEvents: () => DB.sabhas,
  getFollowups: () => DB.followups,
  getFollowupsForEvent: (eventId) => DB.followups.filter(f => f.eventId === eventId),
  getFollowup: (eventId, devoteeId) => DB.followups.find(f => f.eventId === eventId && f.devoteeId === devoteeId) || null,

  // Upsert a follow-up (channels/outcome/remark/assignment) for one devotee.
  saveFollowup: (eventId, devoteeId, fields) => {
    const idx = DB.followups.findIndex(f => f.eventId === eventId && f.devoteeId === devoteeId);
    const sess = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    const base = idx >= 0 ? DB.followups[idx]
      : { id: `FUP-${Date.now()}-${devoteeId}`, eventId, devoteeId, assignedTo: '', call: false, inPerson: false, message: false, outcome: '', remark: '' };
    const rec = { ...base, ...fields, contactedOn: new Date().toISOString(), contactedBy: sess ? sess.name : '' };
    if (idx >= 0) DB.followups[idx] = rec; else DB.followups.push(rec);
    saveCache();
    push('saveFollowup', {
      eventId, devoteeId, assignedTo: rec.assignedTo,
      call: rec.call, inPerson: rec.inPerson, message: rec.message,
      outcome: rec.outcome, remark: rec.remark, contactedBy: rec.contactedBy,
    });
    return rec;
  },

  // A follow-up counts as "contacted" if any channel is ticked or an outcome is set.
  isContacted: (f) => !!(f && (f.call || f.inPerson || f.message || f.outcome)),

  // Summary counts for an event over an audience (array of devotee ids).
  followupSummary: (eventId, audienceIds) => {
    const ids = audienceIds || DB.devotees.map(d => d.id);
    const map = {};
    DB.followups.filter(f => f.eventId === eventId).forEach(f => { map[f.devoteeId] = f; });
    const s = { total: ids.length, contacted: 0, coming: 0, notComing: 0, maybe: 0, pending: 0 };
    ids.forEach(id => {
      const f = map[id];
      if (f && (f.call || f.inPerson || f.message || f.outcome)) s.contacted++; else s.pending++;
      if (f) {
        if (f.outcome === 'Coming') s.coming++;
        else if (f.outcome === 'Not Coming') s.notComing++;
        else if (f.outcome === 'Maybe') s.maybe++;
      }
    });
    return s;
  },

  // ---- Thoughts ----
  getThoughts: () => DB.thoughts,

  // ---- CSV Export ----
  exportToCSV: (filename, rows) => {
    if (!rows || !rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = keys.join(',') + '\n' + rows.map(row => keys.map(k => {
      let cell = row[k] == null ? '' : row[k];
      cell = cell instanceof Date ? cell.toLocaleString() : cell.toString();
      cell = cell.replace(/"/g, '""');
      return /("|,|\n)/g.test(cell) ? `"${cell}"` : cell;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url); link.setAttribute('download', filename);
      link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
  }
};
