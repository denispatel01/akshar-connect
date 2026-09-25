import { INITIAL_DEVOTEES, INITIAL_SABHAS, INITIAL_THOUGHTS, INITIAL_USERS } from './mockData';
import { normalizeDevotee, toBackendRow, withTag } from './devoteeSchema';

// ===== Live backend =====================================================
// Replaced at build time with the deployed Apps Script /exec URL.
const API_URL = "https://script.google.com/macros/s/AKfycbw-LyYduU1mUaXwamTGPyh_TtP6pZkO3pTCPPGKMQOhUwJhFa_Z4wFzz83FYXnq9YqAnA/exec";
const hasBackend = () => typeof API_URL === 'string' && API_URL.indexOf('http') === 0;

const SESSION_KEY = 'ac_session_v1';
const CACHE_KEY = 'ac_cache_v1';

const ADMIN_SEED = { mobile:'9924598434', pin:'170853', password:'', role:'Admin', name:'Denis Patel' };

// In-memory database (populated by bootstrap before the app renders).
let DB = { users: [], devotees: [], sabhas: [], thoughts: [], attendance: [], followups: [] };

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
    sabhas: [...INITIAL_SABHAS], thoughts: [...INITIAL_THOUGHTS], attendance: [], followups: []
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
async function bootstrap() {
  if (!hasBackend()) { loadDemo(); return { mode: 'demo' }; }
  try {
    const d = await api('bootstrap');
    DB.users = d.users || []; DB.devotees = (d.devotees || []).map(normalizeDevotee);
    DB.sabhas = d.sabhas || []; DB.thoughts = d.thoughts || [];
    DB.attendance = d.attendance || []; DB.followups = d.followups || [];
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

  getCurrentSession: () => JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'),
  logout: () => localStorage.removeItem(SESSION_KEY),

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
      createdOn: now, updatedOn: now, createdBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System', updatedBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System', createdBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System', updatedBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System',
    });
    DB.devotees.unshift(newDevotee); saveCache();
    push('insert', { collection: 'Devotees', row: toBackendRow(newDevotee) });
    return newDevotee;
  },

  updateDevotee: (id, updatedFields) => {
    const idx = DB.devotees.findIndex(d => d.id === id);
    if (idx === -1) return null;
    const merged = normalizeDevotee({ ...DB.devotees[idx], ...updatedFields, updatedOn: new Date().toISOString(), updatedBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System', updatedBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System' });
    DB.devotees[idx] = merged; saveCache();
    push('update', { collection: 'Devotees', keyField: 'id', key: id, row: toBackendRow(merged) });
    return merged;
  },

  /** Save devotee and wait for live sheet sync (for user-facing success/error alerts). */
  updateDevoteeAndSync: async (id, updatedFields) => {
    const idx = DB.devotees.findIndex(d => d.id === id);
    if (idx === -1) throw new Error('Devotee record not found.');
    const prev = DB.devotees[idx];
    const merged = normalizeDevotee({ ...prev, ...updatedFields, updatedOn: new Date().toISOString() });
    DB.devotees[idx] = merged;
    saveCache();
    if (hasBackend()) {
      await api('update', { collection: 'Devotees', keyField: 'id', key: id, row: toBackendRow(merged) });
    }
    return merged;
  },

  addDevoteeAndSync: async (devotee) => {
    const nextNum = DB.devotees.length + 1;
    const now = new Date().toISOString();
    const newDevotee = normalizeDevotee({
      ...devotee,
      id: `HPP-${nextNum}`,
      attendanceRate: devotee.attendanceRate ?? 0,
      status: devotee.status || 'Active',
      createdOn: now, updatedOn: now,
    });
    DB.devotees.unshift(newDevotee);
    saveCache();
    if (hasBackend()) {
      await api('insert', { collection: 'Devotees', row: toBackendRow(newDevotee) });
    }
    return newDevotee;
  },

  // Assign/unassign a single tag; returns the updated devotee.
  setDevoteeTag: (id, tagKey, on) => {
    const d = DB.devotees.find(x => x.id === id);
    if (!d) return null;
    return dataService.updateDevotee(id, { tags: withTag(d.tags, tagKey, on) });
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

  // ---- Sabhas & Attendance ----
  getSabhas: () => DB.sabhas,

  addSabha: (sabha) => {
    const newSabha = { ...sabha, id: `SAB-2026-0${DB.sabhas.length + 1}`, type: sabha.type || 'Sabha', presentCount: 0, totalCount: DB.devotees.length, status: 'Scheduled' };
    DB.sabhas.unshift(newSabha); saveCache();
    push('insert', { collection: 'Sabhas', row: newSabha });
    return newSabha;
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
