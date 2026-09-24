/** Daily rotation cycles through thought slots 1 … ROTATION_SIZE (inclusive). */
export const THOUGHT_ROTATION_SIZE = 100;

/** Parse `TH-42` → 42; unknown ids → null. */
export function parseThoughtNumber(id) {
  const m = String(id || '').match(/^TH-(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Calendar day index in local timezone (stable for rotation). */
export function localDayNumber(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(start.getTime() / 86400000);
}

/**
 * Which slot (1–100) is shown on this calendar day.
 */
export function thoughtSlotForDay(d = new Date()) {
  const day = localDayNumber(d);
  return (day % THOUGHT_ROTATION_SIZE) + 1;
}

/**
 * Pick the thought for today's rotation slot. Prefers id `TH-{slot}`; otherwise
 * the entry at index (slot - 1) in the sorted 1…100 pool.
 */
export function pickRotatingThought(thoughts, d = new Date()) {
  if (!thoughts?.length) return { thought: null, slot: thoughtSlotForDay(d) };

  const slot = thoughtSlotForDay(d);
  const byNumber = new Map();

  for (const t of thoughts) {
    const n = parseThoughtNumber(t.id);
    if (n != null && n >= 1 && n <= THOUGHT_ROTATION_SIZE) byNumber.set(n, t);
  }

  const exact = byNumber.get(slot);
  if (exact) return { thought: exact, slot };

  const sorted = [...byNumber.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  const pool = sorted.length ? sorted : [...thoughts];
  const idx = (slot - 1) % pool.length;
  return { thought: pool[idx], slot };
}

/** Show the stored date string unchanged (when the author shared the thought). */
export function displayThoughtDate(dateStr) {
  if (dateStr === undefined || dateStr === null) return '';
  return String(dateStr).trim();
}
