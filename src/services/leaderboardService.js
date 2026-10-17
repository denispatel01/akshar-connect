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

// In-memory state, hydrated synchronously on first use. `pending` holds the ids of
// boards created/edited locally but NOT yet confirmed saved to the backend. Only
// these are protected from (and re-pushed by) refresh — a board that's gone from the
// server and ISN'T pending was deleted elsewhere, so it must drop locally too
// (otherwise a deleted board keeps resurrecting from this device's cache).
let MEM = readCache_() || { leaders: null, boards: [], entries: [], pending: [] };
if (!Array.isArray(MEM.pending)) MEM.pending = [];

function num_(v) { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
function bool_(v) { return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1'; }
function uid_(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
function nowISO_() { return new Date().toISOString(); }

function emitChanged_() { try { window.dispatchEvent(new CustomEvent('ac-leaderboard-changed')); } catch { /* SSR */ } }

function persist_() { writeCache_(MEM); emitChanged_(); }

// ── Pending (unsynced) board tracking ────────────────────────────────────────
function markPending_(boardId) {
  const id = String(boardId);
  if (!(MEM.pending || []).includes(id)) MEM.pending = [...(MEM.pending || []), id];
}
function clearPending_(boardId) {
  MEM.pending = (MEM.pending || []).filter((id) => id !== String(boardId));
}

// ── Debounced per-board save ─────────────────────────────────────────────────
// Inline Target/Done edits update local state instantly; the backend save (which
// also emails the admin) is coalesced so a burst of edits produces ONE call + ONE
// email, not one per cell. Flushed on demand when the user leaves the board.
const dirtyBoards_ = new Set();
let saveTimer_ = null;
const SAVE_DEBOUNCE_MS = 3000;

async function saveBoardToBackend_(boardId) {
  if (!backendOnline()) return;
  const board = (MEM.boards || []).find((b) => String(b.id) === String(boardId));
  if (!board) return;
  const entries = (MEM.entries || []).filter((e) => String(e.boardId) === String(boardId));
  try {
    await backendApi('saveLeaderboard', { board, entries });
    clearPending_(boardId); // confirmed on the server
    persist_();
  } catch (err) { console.warn('saveLeaderboard failed:', err.message); } // stays pending, retried
}

function scheduleSave_(boardId) {
  dirtyBoards_.add(boardId);
  if (saveTimer_) clearTimeout(saveTimer_);
  saveTimer_ = setTimeout(() => { leaderboardService.flushSaves(); }, SAVE_DEBOUNCE_MS);
}

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

  /**
   * Background refresh from the backend. Never throws, and NEVER loses local data
   * that hasn't synced yet: the server copy is merged with any local-only rows
   * (boards/entries whose id the server doesn't have), and those unsynced rows are
   * re-pushed. This is what prevents a freshly-created board from vanishing when the
   * server reply is empty (e.g. the insert hadn't landed, or failed earlier).
   */
  async refresh() {
    if (!backendOnline()) return this.getState();
    let r;
    try { r = await backendApi('getLeaderboards', {}); } catch { return this.getState(); }
    if (!r || !r.ok) return this.getState();

    const beBoards = (r.boards || []).map((b) => ({ ...b }));
    const beEntries = (r.entries || []).map((e) => ({ ...e, target: num_(e.target), done: num_(e.done) }));
    const pendingIds = new Set((MEM.pending || []).map(String));

    // Pending boards: the LOCAL copy wins (don't let the server overwrite unsynced
    // edits, and don't let an empty server wipe a just-created board). Everything
    // else: the SERVER is the source of truth — so a board deleted on the server and
    // not pending simply drops here instead of resurrecting from this cache.
    const localPendingBoards = (MEM.boards || []).filter((b) => pendingIds.has(String(b.id)));
    const localPendingIds = new Set(localPendingBoards.map((b) => String(b.id)));
    const localPendingEntries = (MEM.entries || []).filter((e) => localPendingIds.has(String(e.boardId)));

    const serverBoards = beBoards.filter((b) => !pendingIds.has(String(b.id)));
    const serverBoardIds = new Set(serverBoards.map((b) => String(b.id)));
    const serverEntries = beEntries.filter((e) => serverBoardIds.has(String(e.boardId)));

    MEM = {
      leaders: r.leaders || MEM.leaders || [],
      boards: [...localPendingBoards, ...serverBoards],
      entries: [...serverEntries, ...localPendingEntries],
      pending: MEM.pending || [],
    };
    persist_();

    // Re-push still-pending boards (clears their pending flag on success).
    for (const b of localPendingBoards) { await saveBoardToBackend_(b.id); }
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

    // Optimistic local write first (instant UI, survives offline). Pending until the
    // single saveLeaderboard call confirms.
    MEM.boards = [board, ...(MEM.boards || [])];
    MEM.entries = [...(MEM.entries || []), ...entries];
    markPending_(board.id);
    persist_();

    // ONE backend call saves the board + all entries and emails the admin — far
    // faster than inserting 18 rows one at a time (clears pending on success).
    await saveBoardToBackend_(board.id);
    return board.id;
  },

  async updateBoard(boardId, patch, updatedBy = '') {
    const b = this.board(boardId);
    if (!b) return;
    const next = { ...b, ...patch, updatedBy, updatedOn: nowISO_() };
    MEM.boards = (MEM.boards || []).map((x) => (String(x.id) === String(boardId) ? next : x));
    markPending_(boardId);
    persist_();
    // Save board + entries in one call (also emails the admin; clears pending).
    await saveBoardToBackend_(boardId);
  },

  async deleteBoard(boardId) {
    const board = this.board(boardId);
    dirtyBoards_.delete(boardId);
    clearPending_(boardId);
    MEM.boards = (MEM.boards || []).filter((b) => String(b.id) !== String(boardId));
    MEM.entries = (MEM.entries || []).filter((e) => String(e.boardId) !== String(boardId));
    persist_();
    // One backend call removes the board + all its entries.
    if (backendOnline()) {
      try { await backendApi('deleteLeaderboard', { boardId, title: board?.title || '' }); }
      catch (err) { console.warn('deleteBoard sync failed:', err.message); }
    }
  },

  // ── Entries (the data entry) ────────────────────────────────────────────────
  // Updates local state instantly; the backend save is debounced + coalesced per
  // board (one call + one email per burst of edits), flushed when leaving the board.
  updateEntry(entryId, { target, done }) {
    let boardId = null;
    MEM.entries = (MEM.entries || []).map((e) => {
      if (String(e.id) !== String(entryId)) return e;
      boardId = e.boardId;
      return {
        ...e,
        target: target === undefined ? num_(e.target) : num_(target),
        done: done === undefined ? num_(e.done) : num_(done),
      };
    });
    if (boardId) { markPending_(boardId); scheduleSave_(boardId); }
    persist_();
  },

  /** Flush any pending debounced board saves now (e.g. when leaving a board). */
  async flushSaves() {
    if (saveTimer_) { clearTimeout(saveTimer_); saveTimer_ = null; }
    const ids = [...dirtyBoards_]; dirtyBoards_.clear();
    for (const id of ids) { await saveBoardToBackend_(id); }
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
    markPending_(boardId);
    persist_();
    // Save the whole board so the new row persists (clears pending on success).
    await saveBoardToBackend_(boardId);
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
