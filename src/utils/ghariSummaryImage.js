// ===========================================================================
// Ghari contribution summary — ONE 4K portrait share image, made in the browser.
// ---------------------------------------------------------------------------
// A single mobile-friendly poster stacked vertically: Ghari on top (orange),
// Bhusu below (purple), same design/colour. Each section ranks karyakartas and
// customers by KILOGRAMS (no amounts, no bar charts — just the numbers). Drawn
// as an SVG, then rasterized to a real 2048×4096 PNG via an offscreen <canvas>
// (both dimensions ≤ 4096 so it renders on iOS too). Data comes from buildReport
// so it matches the on-screen Insights (active orders only, split-aware).
// ===========================================================================
import { ghariService } from '../services/ghariService';

const W = 2048, H = 4096, PAD = 60, GAP = 56;

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtKg = (n) => (+(Number(n) || 0).toFixed(1)).toLocaleString('en-IN');
const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

const THEMES = {
  ghari: { title: 'Ghari', label: 'Ghari Seva', metric: (d) => d.ghariKg || 0, hA: '#FBBF24', hB: '#EA580C', accent: '#C2510A', page: '#FFF8EE', card: '#FFFFFF', line: '#F0E2CC', ink: '#2B1E0D', mut: '#9C7E52', blob: '#F6C684', soft: '#FDEFD8' },
  bhusu: { title: 'Bhusu', label: 'Bhusu Seva', metric: (d) => d.bhusuKg || 0, hA: '#C084FC', hB: '#7C3AED', accent: '#6D28D9', page: '#FBF7FF', card: '#FFFFFF', line: '#E8DCF8', ink: '#241536', mut: '#917BB4', blob: '#D9BDF8', soft: '#F2E9FD' },
};

function medal(cx, cy, r, rank, T) {
  const cols = { 1: ['#E6A72B', '#6A4A00'], 2: ['#AEB7C4', '#4A515C'], 3: ['#CC7A45', '#5A2E12'] };
  if (rank <= 3) { const [b, tx] = cols[rank]; return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#med${rank})"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${b}" stroke-width="3"/><text x="${cx}" y="${cy + r * 0.34}" font-size="${r * 1.05}" font-weight="800" fill="${tx}" text-anchor="middle">${rank}</text>`; }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${T.soft}"/><text x="${cx}" y="${cy + r * 0.34}" font-size="${r * 0.95}" font-weight="800" fill="${T.accent}" text-anchor="middle">${rank}</text>`;
}

function card(x, y, w, h, title, sub, rows, gradId, T) {
  const n = rows.length || 1;
  const total = rows.reduce((s, r) => s + r.v, 0) || 1;
  let out = '';
  out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="36" fill="${T.card}"/>`;
  out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="36" fill="none" stroke="${T.line}" stroke-width="2"/>`;
  const hx = x + 44, hy = y + 44;
  out += `<rect x="${hx}" y="${hy + 4}" width="60" height="60" rx="16" fill="url(#${gradId})"/>`;
  out += `<text x="${hx + 30}" y="${hy + 46}" font-size="36" font-weight="800" fill="#fff" text-anchor="middle">${esc(title[0])}</text>`;
  out += `<text x="${hx + 80}" y="${hy + 34}" font-size="46" font-weight="800" fill="${T.ink}">${esc(title)}</text>`;
  out += `<text x="${hx + 80}" y="${hy + 72}" font-size="28" font-weight="600" fill="${T.mut}">${esc(sub)}</text>`;
  const top = y + 136, bot = y + h - 40;
  const rowH = Math.min(96, Math.floor((bot - top) / n));
  const nameX = x + 128, valRight = x + w - 44, valW = 300;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const ry = top + i * rowH, cy = ry + rowH / 2;
    if (i > 0) out += `<line x1="${x + 40}" y1="${ry}" x2="${valRight}" y2="${ry}" stroke="${T.line}" stroke-width="1.5"/>`;
    const fs = rowH >= 82 ? 46 : rowH >= 64 ? 41 : 36;
    out += medal(x + 80, cy, Math.min(31, rowH * 0.36), i + 1, T);
    const maxCh = Math.max(10, Math.floor((valRight - valW - nameX) / (fs * 0.54)));
    out += `<text x="${nameX}" y="${cy + fs * 0.34}" font-size="${fs}" font-weight="800" fill="${T.ink}">${esc(trunc(r.name, maxCh))}</text>`;
    const pctRaw = (r.v / total) * 100;
    const pct = pctRaw >= 1 ? Math.round(pctRaw) + '%' : '&lt;1%';
    out += `<text x="${valRight}" y="${cy + fs * 0.34}" font-size="${fs + 4}" font-weight="800" fill="${T.accent}" text-anchor="end">${fmtKg(r.v)}<tspan font-size="${fs * 0.64}" font-weight="700" fill="${T.mut}"> kg · ${pct}</tspan></text>`;
  }
  return out;
}

function section(y0, BH, key, season, r) {
  const T = THEMES[key];
  const gradId = 'grad_' + key;
  const kk = Object.values(r.byKaryakarta || {}).map((d) => ({ name: d.name, v: T.metric(d) })).filter((x) => x.v > 0.0001).sort((a, b) => b.v - a.v);
  const cu = Object.values(r.byCustomer || {}).map((d) => ({ name: d.name, v: T.metric(d) })).filter((x) => x.v > 0.0001).sort((a, b) => b.v - a.v);
  const grand = kk.reduce((s, x) => s + x.v, 0);
  const kkShown = kk.slice(0, 20), cuShown = cu.slice(0, 20);
  let s = '';
  s += `<clipPath id="clip_${key}"><rect x="${PAD}" y="${y0}" width="${W - 2 * PAD}" height="${BH}" rx="48"/></clipPath>`;
  s += `<g clip-path="url(#clip_${key})"><rect x="${PAD}" y="${y0}" width="${W - 2 * PAD}" height="${BH}" fill="${T.page}"/><circle cx="${W - 240}" cy="${y0 + 120}" r="560" fill="url(#blob_${key})"/></g>`;
  s += `<rect x="${PAD}" y="${y0}" width="${W - 2 * PAD}" height="${BH}" rx="48" fill="none" stroke="${T.line}" stroke-width="2"/>`;
  const hx = PAD + 40, hw = W - 2 * PAD - 80, HH = 340;
  s += `<rect x="${hx}" y="${y0 + 36}" width="${hw}" height="${HH}" rx="40" fill="url(#${gradId})"/>`;
  s += `<rect x="${hx}" y="${y0 + 36}" width="${hw}" height="${HH / 2}" rx="40" fill="#ffffff" opacity="0.08"/>`;
  const tx = hx + 56;
  s += `<text x="${tx}" y="${y0 + 120}" font-size="32" font-weight="700" fill="#fff" opacity="0.85" letter-spacing="3">AKSHAR CONNECT · ${esc(T.label.toUpperCase())} ${esc(season)}</text>`;
  s += `<text x="${tx}" y="${y0 + 212}" font-size="100" font-weight="800" fill="#fff">${esc(T.title)} Contribution</text>`;
  s += `<text x="${tx}" y="${y0 + 270}" font-size="38" font-weight="600" fill="#fff" opacity="0.92">Ranked in kilograms · no amounts</text>`;
  const pills = [['Karyakartas', String(kk.length)], ['Customers', String(cu.length)]];
  let px = tx;
  pills.forEach(([l, v]) => { const pw = 70 + (l.length + v.length) * 20; s += `<rect x="${px}" y="${y0 + 296}" width="${pw}" height="52" rx="26" fill="#ffffff" opacity="0.18"/><text x="${px + 26}" y="${y0 + 330}" font-size="30" font-weight="700" fill="#fff"><tspan opacity="0.85">${esc(l)}  </tspan><tspan font-weight="800">${esc(v)}</tspan></text>`; px += pw + 24; });
  const mcx = hx + hw - 170, mcy = y0 + 36 + HH / 2;
  s += `<circle cx="${mcx}" cy="${mcy}" r="140" fill="#ffffff" opacity="0.16"/><circle cx="${mcx}" cy="${mcy}" r="140" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/>`;
  s += `<text x="${mcx}" y="${mcy - 10}" font-size="84" font-weight="800" fill="#fff" text-anchor="middle">${fmtKg(grand)}</text><text x="${mcx}" y="${mcy + 48}" font-size="36" font-weight="700" fill="#fff" opacity="0.9" text-anchor="middle">kg ${esc(T.title)}</text>`;
  const cardsY = y0 + 36 + HH + 36, cardsH = BH - (36 + HH + 36) - 36;
  const gap = 40, cw = (W - 2 * PAD - 80 - gap) / 2;
  s += card(hx, cardsY, cw, cardsH, 'Karyakarta', `${kk.length} total · top ${kkShown.length}`, kkShown, gradId, T);
  s += card(hx + cw + gap, cardsY, cw, cardsH, 'Customers', `${cu.length} total · top ${cuShown.length}`, cuShown, gradId, T);
  return { svg: s, empty: kk.length === 0 && cu.length === 0 };
}

function buildCombinedSVG(season, r) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif">`;
  s += `<defs>`;
  ['ghari', 'bhusu'].forEach((k) => { const T = THEMES[k]; s += `<linearGradient id="grad_${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.hA}"/><stop offset="1" stop-color="${T.hB}"/></linearGradient><radialGradient id="blob_${k}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${T.blob}" stop-opacity="0.5"/><stop offset="1" stop-color="${T.blob}" stop-opacity="0"/></radialGradient>`; });
  [['1', '#FFE79A', '#F0B41F'], ['2', '#F3F6FB', '#C2CAD6'], ['3', '#FAD1AE', '#E08A4F']].forEach(([rk, a, b]) => { s += `<linearGradient id="med${rk}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`; });
  s += `</defs>`;
  s += `<rect width="${W}" height="${H}" fill="#EFEDF2"/>`;
  const BH = (H - 2 * PAD - GAP) / 2;
  const g = section(PAD, BH, 'ghari', season, r);
  const b = section(PAD + BH + GAP, BH, 'bhusu', season, r);
  s += g.svg; s += b.svg;
  s += `</svg>`;
  return { svg: s, empty: g.empty && b.empty };
}

function svgToPngBlob(svg, w, h) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#EFEDF2'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob((bl) => (bl ? resolve(bl) : reject(new Error('Could not encode PNG'))), 'image/png');
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not render the image')); };
    img.src = url;
  });
}

// Build the single combined contribution image for a season and hand it over.
// Native share sheet on a phone (save to Photos / send), download on desktop.
// Returns 'shared' | 'downloaded' | 'cancelled'.
export async function downloadGhariSummaryImages(season) {
  const s = season || ghariService.getSeason();
  const r = ghariService.buildReport(s);
  const { svg, empty } = buildCombinedSVG(s, r);
  if (empty) throw new Error(`No Ghari or Bhusu contributions recorded for ${s} yet.`);
  const blob = await svgToPngBlob(svg, W, H);
  const name = `Ghari_Seva_${s}_contribution_kg.png`;

  try {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `Ghari Seva ${s} — contribution (kg)` });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
