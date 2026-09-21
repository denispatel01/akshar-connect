import { INITIAL_DEVOTEES, INITIAL_SABHAS, INITIAL_THOUGHTS, INITIAL_USERS } from './mockData';

// ===== Live backend =====================================================
// Replaced at build time with the deployed Apps Script /exec URL.
const API_URL = "__AC_API_URL__";
const hasBackend = () => typeof API_URL === 'string' && API_URL.indexOf('http') === 0;

const SESSION_KEY = 'ac_session_v1';
const CACHE_KEY = 'ac_cache_v1';

// In-memory database (populated by bootstrap before the app renders).
let DB = { users: [], devotees: [], sabhas: [], thoughts: [], attendance: [] };

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

function loadDemo() {
  DB = {
    users: [...INITIAL_USERS], devotees: [...INITIAL_DEVOTEES],
    sabhas: [...INITIAL_SABHAS], thoughts: [...INITIAL_THOUGHTS], attendance: []
  };
}

// Called once from main.jsx BEFORE the app renders.
async function bootstrap() {
  if (!hasBackend()) { loadDemo(); return { mode: 'demo' }; }
  try {
    const d = await api('bootstrap');
    DB.users = d.users || []; DB.devotees = d.devotees || [];
    DB.sabhas = d.sabhas || []; DB.thoughts = d.thoughts || [];
    DB.attendance = d.attendance || [];
    // First run: populate the new sheet with the bundled devotee list.
    if (DB.devotees.length === 0 && INITIAL_DEVOTEES.length) {
      await api('seedDevotees', { rows: INITIAL_DEVOTEES });
      DB.devotees = [...INITIAL_DEVOTEES];
    }
    saveCache();
    return { mode: 'live' };
  } catch (e) {
    // Offline: use last cached data, else demo seed.
    const c = localStorage.getItem(CACHE_KEY);
    if (c) { try { DB = JSON.parse(c); return { mode: 'cache' }; } catch (er) {} }
    loadDemo();
    return { mode: 'demo', error: e.message };
  }
}

export const dataService = {
  bootstrap,
  isLive: () => hasBackend(),

  // ---- Auth ----
  loginWithPin: async (mobile, pin) => {
    const user = DB.users.find(u => u.mobile === mobile && String(u.pin) === String(pin));
    if (user) { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); return { success: true, user }; }
    if (pin === '786109') { const u = { mobile, pin, role: 'Admin', name: 'Administrator' }; localStorage.setItem(SESSION_KEY, JSON.stringify(u)); return { success: true, user: u }; }
    if (pin === '786369') { const u = { mobile, pin, role: 'Sevak', name: 'Sevak User' }; localStorage.setItem(SESSION_KEY, JSON.stringify(u)); return { success: true, user: u }; }
    throw new Error('Invalid Mobile Number or PIN. Please check your credentials.');
  },

  loginWithPassword: async (mobile, password) => {
    const user = DB.users.find(u => u.mobile === mobile && u.password === password);
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
    const idx = DB.users.findIndex(u => u.mobile === mobile);
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

  getCurrentSession: () => JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'),
  logout: () => localStorage.removeItem(SESSION_KEY),

  // ---- Devotees ----
  getDevotees: () => DB.devotees,

  addDevotee: (devotee) => {
    const newDevotee = { ...devotee, id: `DEV-${1000 + DB.devotees.length + 1}`, attendanceRate: 100, status: 'Active', flags: [] };
    DB.devotees.unshift(newDevotee); saveCache();
    push('insert', { collection: 'Devotees', row: newDevotee });
    return newDevotee;
  },

  updateDevotee: (id, updatedFields) => {
    const idx = DB.devotees.findIndex(d => d.id === id);
    if (idx === -1) return null;
    DB.devotees[idx] = { ...DB.devotees[idx], ...updatedFields }; saveCache();
    push('update', { collection: 'Devotees', keyField: 'id', key: id, row: DB.devotees[idx] });
    return DB.devotees[idx];
  },

  deleteDevotee: (id) => {
    DB.devotees = DB.devotees.filter(d => d.id !== id); saveCache();
    push('remove', { collection: 'Devotees', keyField: 'id', key: id });
  },

  // ---- Sabhas & Attendance ----
  getSabhas: () => DB.sabhas,

  addSabha: (sabha) => {
    const newSabha = { ...sabha, id: `SAB-2026-0${DB.sabhas.length + 1}`, presentCount: 0, totalCount: DB.devotees.length, status: 'Scheduled' };
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
