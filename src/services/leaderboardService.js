// ===========================================================================
// Akshar Connect — Adajan Mandal Leaderboard service
// ---------------------------------------------------------------------------
// A reusable progress board for any seva. Ghari Seva runs now; more sevas will
// come, and each gets its own board. The mandal's 17 leaders are FIXED — they
// are seeded once on the backend and every new board prefills from them, so the
// user only ever does the Target/Done data entry.
//
// Data model (backend collections):
//   MandalLeaders : fixed roster      { id, name, sortOrder, active }
//   LeaderBoards  : one per seva/board{ id, title, subtitle, unit, status, ... }
//   LeaderEntries : one per leader    { id, boardId, leaderId, leaderName,
//                                        per board           target, done, sortOrder }
//
// Reuses dataService's deployed /exec backend via backendApi (generic
// insert/update/remove + a getLeaderboards read). Reads come from a localStorage
// cache for instant, offline-tolerant loads; the network is a background refresh.
// ===========================================================================

import { backendApi, backendOnline } from './dataService';

const CACHE_KEY = 'ac_leaderboard_v1';

// Fallback roster — identical to the backend seed. Used only when the app is
// offline / the backend hasn't been deployed yet, so the UI still works.
export const DEFAULT_MANDAL_LEADERS = [
  'Pankajbhai', 'Smitbhai/Krunalbhai', 'Bhavikbhai', 'Pavitrabhai', 'Bittubhai',
  'Rameshbhai Modi', 'Chachubhai', 'Krunalbhai Vasani', 'Umeshbhai', 'Mayurbhai Tailor',
  'Dr. Jigneshbhai', 'Mohitbhai', 'Pushpakbhai', 'Nirdoshbhai', 'Prerakbhai',
  'Ankitbhai Modi', 'Ravibhai',
];

export const COMMON_UNITS = ['Kg', '₹', 'Count', 'Boxes', 'Nos'];

// ── Small persistence helpers (every read/write is try/caught) ───────────────
function readCache_() {
  try { const v = localStorage.getItem(CACHE_KEY); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
function writeCache_(state) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch { /* quota */ }
}

// In-memory state, hydrated synchronously on first use.
let MEM = readCache_() || { leaders: null, boards: [], entries: [] };

function num_(v) { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
function bool_(v) { return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1'; }
function uid_(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
function nowISO_() { return new Date().toISOString(); }

function emitChanged_() { try { window.dispatchEvent(new CustomEvent('ac-leaderboard-changed')); } catch { /* SSR */ } }

function persist_() { writeCache_(MEM); emitChanged_(); }

// Default leaders if the backend hasn't returned any yet.
function fallbackLeaders_() {
  return DEFAULT_MANDAL_LEADERS.map((name, i) => ({
    id: 'LDR-' + (i + 1), name, sortOrder: i + 1, active: true,
  }));
}

export const leaderboardService = {
  isOnline: () => backendOnline(),

  /** Synchronous snapshot from cache — leaders (roster) + boards + entries. */
  getState() {
    const leaders = (MEM.leaders && MEM.leaders.length) ? MEM.leaders : fallbackLeaders_();
    return {
      leaders: leaders.filter((l) => bool_(l.active) || l.active === undefined)
        .slice().sort((a, b) => num_(a.sortOrder) - num_(b.sortOrder)),
      boards: (MEM.boards || []).slice()
        .sort((a, b) => String(b.createdOn || '').localeCompare(String(a.createdOn || ''))),
      entries: (MEM.entries || []).slice(),
    };
  },

  /** Entries for one board, in roster order. */
  entriesFor(boardId) {
    return (MEM.entries || [])
      .filter((e) => String(e.boardId) === String(boardId))
      .sort((a, b) => num_(a.sortOrder) - num_(b.sortOrder));
  },

  board(boardId) {
    return (MEM.boards || []).find((b) => String(b.id) === String(boardId)) || null;
  },

  /** Background refresh from the backend. Never throws. */
  async refresh() {
    if (!backendOnline()) return this.getState();
    try {
      const r = await backendApi('getLeaderboards', {});
      if (r && r.ok) {
        MEM = {
          leaders: r.leaders || [],
          boards: (r.boards || []).map((b) => ({ ...b })),
          entries: (r.entries || []).map((e) => ({ ...e, target: num_(e.target), done: num_(e.done) })),
        };
        persist_();
      }
    } catch { /* keep cache */ }
    return this.getState();
  },

  // ── Boards ────────────────────────────────────────────────────────────────
  /**
   * Create a board and auto-prefill one entry per active leader (target/done = 0).
   * Returns the new board id.
   */
  async createBoard({ title, subtitle = '', unit = 'Kg', createdBy = '' }) {
    const board = {
      id: uid_('LB'), title: String(title || '').trim(), subtitle: String(subtitle || '').trim(),
      unit: String(unit || 'Kg').trim() || 'Kg', status: 'active',
      createdBy, createdOn: nowISO_(), updatedBy: createdBy, updatedOn: nowISO_(),
    };
    const roster = this.getState().leaders;
    const entries = roster.map((l, i) => ({
      id: uid_('LE'), boardId: board.id, leaderId: l.id, leaderName: l.name,
      target: 0, done: 0, sortOrder: num_(l.sortOrder) || i + 1,
    }));

    // Optimistic local write first (instant UI, survives offline).
    MEM.boards = [board, ...(MEM.boards || [])];
    MEM.entries = [...(MEM.entries || []), ...entries];
    persist_();

    if (backendOnline()) {
      try {
        await backendApi('insert', { collection: 'LeaderBoards', row: board });
        // Entries one by one — small roster, keeps backend logic trivial.
        for (const e of entries) {
          await backendApi('insert', { collection: 'LeaderEntries', row: e });
        }
      } catch (err) { console.warn('createBoard sync failed:', err.message); }
    }
    return board.id;
  },

  async updateBoard(boardId, patch, updatedBy = '') {
    const b = this.board(boardId);
    if (!b) return;
    const next = { ...b, ...patch, updatedBy, updatedOn: nowISO_() };
    MEM.boards = (MEM.boards || []).map((x) => (String(x.id) === String(boardId) ? next : x));
    persist_();
    if (backendOnline()) {
      try { await backendApi('update', { collection: 'LeaderBoards', keyField: 'id', key: boardId, row: next }); }
      catch (err) { console.warn('updateBoard sync failed:', err.message); }
    }
  },

  async deleteBoard(boardId) {
    const entries = this.entriesFor(boardId);
    MEM.boards = (MEM.boards || []).filter((b) => String(b.id) !== String(boardId));
    MEM.entries = (MEM.entries || []).filter((e) => String(e.boardId) !== String(boardId));
    persist_();
    if (backendOnline()) {
      try {
        for (const e of entries) {
          await backendApi('remove', { collection: 'LeaderEntries', keyField: 'id', key: e.id });
        }
        await backendApi('remove', { collection: 'LeaderBoards', keyField: 'id', key: boardId });
      } catch (err) { console.warn('deleteBoard sync failed:', err.message); }
    }
  },

  // ── Entries (the data entry) ────────────────────────────────────────────────
  async updateEntry(entryId, { target, done }) {
    let changed = null;
    MEM.entries = (MEM.entries || []).map((e) => {
      if (String(e.id) !== String(entryId)) return e;
      changed = {
        ...e,
        target: target === undefined ? num_(e.target) : num_(target),
        done: done === undefined ? num_(e.done) : num_(done),
      };
      return changed;
    });
    persist_();
    if (changed && backendOnline()) {
      try { await backendApi('update', { collection: 'LeaderEntries', keyField: 'id', key: entryId, row: changed }); }
      catch (err) { console.warn('updateEntry sync failed:', err.message); }
    }
  },

  // ── Leader roster (add/edit/delete the fixed 17) ────────────────────────────
  async addLeader(name) {
    const roster = (MEM.leaders && MEM.leaders.length) ? MEM.leaders : fallbackLeaders_();
    const maxSort = roster.reduce((m, l) => Math.max(m, num_(l.sortOrder)), 0);
    const row = { id: uid_('LDR'), name: String(name || '').trim(), sortOrder: maxSort + 1, active: true };
    MEM.leaders = [...roster, row];
    persist_();
    if (backendOnline()) {
      try { await backendApi('insert', { collection: 'MandalLeaders', row }); }
      catch (err) { console.warn('addLeader sync failed:', err.message); }
    }
    return row;
  },

  /**
   * Add a new leader to the roster AND create an entry for them on one board
   * (the board currently being edited). Updates in-memory state so the UI reflects
   * it immediately. Returns the new entry.
   */
  async addLeaderToBoard(boardId, name) {
    const leader = await this.addLeader(name);
    const entry = {
      id: uid_('LE'), boardId, leaderId: leader.id, leaderName: leader.name,
      target: 0, done: 0, sortOrder: num_(leader.sortOrder) || 999,
    };
    MEM.entries = [...(MEM.entries || []), entry];
    persist_();
    if (backendOnline()) {
      try { await backendApi('insert', { collection: 'LeaderEntries', row: entry }); }
      catch (err) { console.warn('addLeaderToBoard sync failed:', err.message); }
    }
    return entry;
  },

  async renameLeader(leaderId, name) {
    const roster = (MEM.leaders && MEM.leaders.length) ? MEM.leaders : fallbackLeaders_();
    let next = null;
    MEM.leaders = roster.map((l) => {
      if (String(l.id) !== String(leaderId)) return l;
      next = { ...l, name: String(name || '').trim() };
      return next;
    });
    persist_();
    if (next && backendOnline()) {
      try { await backendApi('update', { collection: 'MandalLeaders', keyField: 'id', key: leaderId, row: next }); }
      catch (err) { console.warn('renameLeader sync failed:', err.message); }
    }
  },

  async removeLeader(leaderId) {
    const roster = (MEM.leaders && MEM.leaders.length) ? MEM.leaders : fallbackLeaders_();
    MEM.leaders = roster.filter((l) => String(l.id) !== String(leaderId));
    persist_();
    if (backendOnline()) {
      try { await backendApi('remove', { collection: 'MandalLeaders', keyField: 'id', key: leaderId }); }
      catch (err) { console.warn('removeLeader sync failed:', err.message); }
    }
  },
};
