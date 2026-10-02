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

// Numeric date-of-birth forms so a devotee can be found by typing their DOB as
// dd-MM-yy or dd-MM-yyyy (also tolerates / and . separators), e.g. 01-12-1995,
// 01-12-95, 01/12/1995.
export function dobSearchForms(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return String(dob);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const yy = yyyy.slice(-2);
  const seps = ['-', '/', '.'];
  const forms = [];
  for (const s of seps) { forms.push(`${dd}${s}${mm}${s}${yyyy}`, `${dd}${s}${mm}${s}${yy}`); }
  forms.push(dateSearchForms(dob));
  return forms.join(' ');
}

// Restricted searchable text for a devotee: ONLY their own name parts, DOB, and
// phone numbers. Deliberately excludes karyakarta / reference / address so that
// searching a karyakarta's name returns people *named* that — not everyone the
// karyakarta manages.
export function devoteeSearchText(d) {
  return [
    d.firstName, d.middleName, d.lastName, d.name,
    d.mobile, d.whatsapp, d.secondaryMobile,
    dobSearchForms(d.dob),
  ].filter(Boolean).join(' ').toLowerCase();
}

// Does a devotee match the query on name / DOB / mobile only? (token-based,
// every query token must match somewhere in the restricted text.)
export function devoteeMatches(d, query) {
  return scoreMatch(devoteeSearchText(d), d.name || '', query) >= 0;
}

// Score one devotee's searchable text against the raw query. STRICT, not fuzzy:
// a word-like token must be the PREFIX of some word (so "ravi" matches Ravi /
// Ravibhai but not Pravin), and a token containing digits (phone / DOB) must
// appear as an exact substring of some word (so "992459843" matches only numbers
// that actually contain it, and "01-12-1995" matches only that date). Every query
// token must match, or the record is excluded. Returns a score for ranking, or -1.
// `text` should be a lowercased, space-joined string of all searchable fields.
export function scoreMatch(text, name, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  let total = 0;

  for (const t of tokens) {
    const numeric = /\d/.test(t); // phone number or date-of-birth fragment
    let best = 0;
    for (const w of words) {
      if (w === t) { best = 3; break; }
      if (w.startsWith(t)) { best = Math.max(best, 2.2); continue; }
      if (numeric && w.includes(t)) { best = Math.max(best, 1.8); }
    }
    if (best === 0) return -1; // this token matched nothing → not a result
    total += best;
  }

  // Boost contiguous / leading matches on the full name (exact-first ranking).
  const nm = (name || '').toLowerCase();
  if (nm.includes(q)) total += 2.5;
  if (nm.startsWith(q)) total += 1.5;
  return total;
}
