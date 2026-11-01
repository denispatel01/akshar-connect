// ===========================================================================
// Geo helpers for the Seva Route (Annakut padhramani) feature.
// Pure functions — no React, no network. Distances are straight-line ("as the
// crow flies") which is plenty accurate for ORDERING nearby areas; the actual
// driving route is drawn by Google Maps once we hand it the ordered stops.
// ===========================================================================

const R_KM = 6371; // Earth's mean radius in km
const toRad = (d) => (d * Math.PI) / 180;

/** True when a value is a usable finite number (coordinates may arrive as strings). */
export function isNum(v) {
  return v !== '' && v !== null && v !== undefined && !isNaN(Number(v));
}

/** Does a point have both a valid lat and lng? Accepts {lat,lng} or {area,lat,lng}. */
export function hasCoords(p) {
  return !!p && isNum(p.lat) && isNum(p.lng);
}

/**
 * Great-circle (haversine) distance in kilometres between two {lat,lng} points.
 * Returns Infinity if either point is missing coordinates, so incomplete pins sort
 * to the end rather than crashing the comparison.
 */
export function haversineKm(a, b) {
  if (!hasCoords(a) || !hasCoords(b)) return Infinity;
  const lat1 = Number(a.lat), lng1 = Number(a.lng);
  const lat2 = Number(b.lat), lng2 = Number(b.lng);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Human distance label: "650 m" under a km, else "1.2 km". */
export function formatKm(km) {
  if (!isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Order `stops` into a short visiting route with the classic nearest-neighbour
 * heuristic: from `start`, repeatedly hop to the closest not-yet-visited stop.
 * Fast, dependency-free, and good enough for a handful of areas. When `start` is
 * null we begin at the first stop. Stops without coordinates are dropped.
 * Returns a new array (input is not mutated); each item keeps its original object.
 */
export function nearestNeighborOrder(stops, start = null) {
  const pts = (stops || []).filter(hasCoords);
  if (pts.length <= 1) return pts.slice();
  const remaining = pts.slice();
  const route = [];
  let current = start && hasCoords(start) ? start : remaining.shift();
  if (!(start && hasCoords(start))) route.push(current);
  while (remaining.length) {
    let bestIdx = 0;
    let bestKm = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const km = haversineKm(current, remaining[i]);
      if (km < bestKm) { bestKm = km; bestIdx = i; }
    }
    current = remaining.splice(bestIdx, 1)[0];
    route.push(current);
  }
  return route;
}

/** Total straight-line length of an ordered list of points, in km. */
export function routeLengthKm(ordered, start = null) {
  const pts = (ordered || []).filter(hasCoords);
  let total = 0;
  let prev = start && hasCoords(start) ? start : null;
  for (const p of pts) {
    if (prev) total += haversineKm(prev, p);
    prev = p;
  }
  return total;
}

/** A Google Maps directions URL to a single {lat,lng} (optionally from `start`). */
export function googleMapsToPoint(dest, start = null) {
  if (!hasCoords(dest)) return '';
  const d = encodeURIComponent(`${Number(dest.lat)},${Number(dest.lng)}`);
  const o = start && hasCoords(start) ? `&origin=${encodeURIComponent(`${Number(start.lat)},${Number(start.lng)}`)}` : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${d}${o}&travelmode=driving`;
}

/** A Google Maps search URL for a free-text address — the fallback when a home
 *  has no GPS pin yet. */
export function googleMapsSearchUrl(query) {
  const q = String(query || '').trim();
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const ll = (p) => `${Number(p.lat)},${Number(p.lng)}`;

/**
 * Build a Google Maps directions URL (universal "Maps URL" scheme, api=1) that
 * visits `ordered` IN THE GIVEN ORDER (Maps does NOT re-optimise an api=1 link,
 * which is exactly what we want — we already chose the order). Optionally starts
 * from `start` (e.g. the user's live GPS position).
 *
 * Google caps this scheme at ~9 waypoints between origin and destination, so for
 * longer lists use `googleMapsDirUrls` to split into legs.
 */
export function googleMapsDirUrl(ordered, start = null) {
  const pts = (ordered || []).filter(hasCoords);
  if (!pts.length) return '';
  const origin = start && hasCoords(start) ? start : pts[0];
  const rest = start && hasCoords(start) ? pts : pts.slice(1);
  if (!rest.length) {
    // Single stop — just route to it.
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll(origin))}&travelmode=driving`;
  }
  const destination = rest[rest.length - 1];
  const waypoints = rest.slice(0, -1);
  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ll(origin))}&destination=${encodeURIComponent(ll(destination))}&travelmode=driving`;
  if (waypoints.length) {
    url += `&waypoints=${waypoints.map((p) => encodeURIComponent(ll(p))).join('|')}`;
  }
  return url;
}

/**
 * Split a long ordered route into Google Maps directions links of at most
 * `perLeg` stops each (default 10 — 1 origin + 8 waypoints + 1 destination that
 * is reused as the next leg's origin, so consecutive legs join seamlessly).
 * Returns an array of { url, from, to, stops }.
 */
export function googleMapsDirUrls(ordered, start = null, perLeg = 10) {
  const pts = (ordered || []).filter(hasCoords);
  if (!pts.length) return [];
  // Prepend the live start so the first leg begins where the user is.
  const full = start && hasCoords(start) ? [start, ...pts] : pts.slice();
  if (full.length <= perLeg) {
    return [{ url: googleMapsDirUrl(pts, start && hasCoords(start) ? start : null), from: 0, to: pts.length - 1, stops: pts.length }];
  }
  const legs = [];
  let i = 0;
  while (i < full.length - 1) {
    const slice = full.slice(i, i + perLeg);
    // Each leg routes slice[0] → … → slice[last], in order.
    legs.push({
      url: googleMapsDirUrl(slice.slice(1), slice[0]),
      stops: slice.length,
    });
    i += perLeg - 1; // reuse the last stop as the next leg's origin
  }
  return legs;
}
