// Fuzzy, token-based devotee search.
// Matches any combination of tokens (name parts, mobile, dob, address, area…),
// tolerant of order and small spelling mistakes. Returns a score for ranking
// (higher = better), or -1 when a query token matches nothing.

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// Extra searchable form of a date so "25 sep", "sep 1985", "1985" all match.
export function dateSearchForms(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return String(dob);
  const dd = d.getDate(), mon = MONTHS[d.getMonth()], yyyy = d.getFullYear();
  return `${dd} ${mon} ${yyyy} ${dd}-${mon}-${yyyy} ${dob}`;
}

// Score one devotee's searchable text against the raw query.
// `text` should be a lowercased, space-joined string of all searchable fields.
export function scoreMatch(text, name, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  let total = 0;

  for (const t of tokens) {
    let best = 0;
    if (text.includes(t)) best = 1.5; // covers substrings across fields (address, dob…)
    for (const w of words) {
      if (best >= 3) break;
      if (w === t) { best = 3; break; }
      if (w.startsWith(t)) { best = Math.max(best, 2.2); continue; }
      if (w.includes(t)) { best = Math.max(best, 1.6); continue; }
      const tol = t.length <= 4 ? 1 : 2;
      // misspelled partial: compare token to the word's prefix of equal length
      const pre = w.slice(0, t.length);
      let dd = levenshtein(pre, t);
      if (dd <= tol) { best = Math.max(best, 1.3 - dd * 0.2); continue; }
      // misspelled full word
      dd = levenshtein(w, t);
      if (dd <= tol) { best = Math.max(best, 1.1 - dd * 0.2); }
    }
    if (best === 0) return -1; // this token matched nothing anywhere → not a result
    total += best;
  }

  // Boost contiguous / leading matches on the full name (exact-first ranking).
  const nm = (name || '').toLowerCase();
  if (nm.includes(q)) total += 2.5;
  if (nm.startsWith(q)) total += 1.5;
  return total;
}
