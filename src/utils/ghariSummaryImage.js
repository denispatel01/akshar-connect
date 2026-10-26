// ===========================================================================
// Ghari contribution summary — 4K share images, generated in the browser.
// ---------------------------------------------------------------------------
// Builds the same poster the backend script makes (one per product: Ghari and
// Bhusu), ranking karyakartas and customers by KILOGRAMS (no amounts). Drawn as
// an SVG, then rasterized to a real 3840×2160 PNG via an offscreen <canvas> —
// no dependencies. On a phone it offers the native share sheet (save / send);
// on desktop it downloads both PNGs. Data comes straight from buildReport, so
// it matches the on-screen Insights (active orders only, split-aware).
// ===========================================================================
import { ghariService } from '../services/ghariService';

const W = 3840, H = 2160, PAD = 90;

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtKg = (n) => (+(Number(n) || 0).toFixed(1)).toLocaleString('en-IN');
const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

const THEMES = {
  ghari: { title: 'Ghari', label: 'Ghari Seva', metric: (d) => d.ghariKg || 0, hA: '#FBBF24', hB: '#EA580C', accent: '#C2510A', barA: '#F8A134', barB: '#E4610D', page: '#FFF8EE', card: '#FFFFFF', track: '#F7E8D2', line: '#F0E2CC', ink: '#2B1E0D', mut: '#9C7E52', blob: '#F6C684', soft: '#FDEFD8' },
  bhusu: { title: 'Bhusu', label: 'Bhusu Seva', metric: (d) => d.bhusuKg || 0, hA: '#C084FC', hB: '#7C3AED', accent: '#6D28D9', barA: '#B07BF2', barB: '#7E3BE6', page: '#FBF7FF', card: '#FFFFFF', track: '#EEE4FB', line: '#E8DCF8', ink: '#241536', mut: '#917BB4', blob: '#D9BDF8', soft: '#F2E9FD' },
};

function medal(cx, cy, r, rank, T) {
  const cols = { 1: ['#E6A72B', '#6A4A00'], 2: ['#AEB7C4', '#4A515C'], 3: ['#CC7A45', '#5A2E12'] };
  if (rank <= 3) { const [b, tx] = cols[rank]; return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#med${rank})"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${b}" stroke-width="3"/><text x="${cx}" y="${cy + r * 0.34}" font-size="${r * 1.05}" font-weight="800" fill="${tx}" text-anchor="middle">${rank}</text>`; }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${T.soft}"/><text x="${cx}" y="${cy + r * 0.34}" font-size="${r * 0.95}" font-weight="800" fill="${T.accent}" text-anchor="middle">${rank}</text>`;
}

function card(x, y, w, h, title, sub, rows, T) {
  const n = rows.length || 1;
  const max = Math.max(...rows.map((r) => r.v), 0.001);
  const total = rows.reduce((s, r) => s + r.v, 0) || 1;
  let out = '';
  out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="40" fill="${T.card}"/>`;
  out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="40" fill="none" stroke="${T.line}" stroke-width="2"/>`;
  const hx = x + 54, hy = y + 50;
  out += `<rect x="${hx}" y="${hy + 6}" width="64" height="64" rx="18" fill="url(#grad)"/>`;
  out += `<text x="${hx + 32}" y="${hy + 52}" font-size="38" font-weight="800" fill="#fff" text-anchor="middle">${esc(title[0])}</text>`;
  out += `<text x="${hx + 88}" y="${hy + 38}" font-size="46" font-weight="800" fill="${T.ink}">${esc(title)}</text>`;
  out += `<text x="${hx + 88}" y="${hy + 78}" font-size="30" font-weight="600" fill="${T.mut}">${esc(sub)}</text>`;
  const top = y + 150, bot = y + h - 44;
  const rowH = Math.min(100, Math.floor((bot - top) / n));
  const nameX = x + 156, valRight = x + w - 64;
  const nameW = Math.round(w * 0.33);
  const barX = nameX + nameW + 28, valW = 330;
  const barMax = (valRight - valW) - barX;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const ry = top + i * rowH, cy = ry + rowH / 2;
    if (i > 0) out += `<line x1="${x + 56}" y1="${ry}" x2="${valRight}" y2="${ry}" stroke="${T.line}" stroke-width="1.5"/>`;
    const fs = rowH >= 82 ? 38 : rowH >= 64 ? 34 : 30;
    out += medal(x + 100, cy, Math.min(33, rowH * 0.36), i + 1, T);
    const maxCh = Math.max(12, Math.floor((nameW - 24) / (fs * 0.54)));
    out += `<text x="${nameX}" y="${cy + fs * 0.34}" font-size="${fs}" font-weight="800" fill="${T.ink}">${esc(trunc(r.name, maxCh))}</text>`;
    const barH = 24, barY = cy - barH / 2;
    const bw = Math.max((r.v / max) * barMax, barH);
    out += `<rect x="${barX}" y="${barY}" width="${barMax}" height="${barH}" rx="${barH / 2}" fill="${T.track}"/>`;
    out += `<rect x="${barX}" y="${barY}" width="${bw}" height="${barH}" rx="${barH / 2}" fill="url(#bar)"/>`;
    const pctRaw = (r.v / total) * 100;
    const pct = pctRaw >= 1 ? Math.round(pctRaw) + '%' : '&lt;1%';
    out += `<text x="${valRight}" y="${cy + fs * 0.34}" font-size="${fs + 6}" font-weight="800" fill="${T.accent}" text-anchor="end">${fmtKg(r.v)}<tspan font-size="${fs * 0.62}" font-weight="700" fill="${T.mut}"> kg  ·  ${pct}</tspan></text>`;
  }
  return out;
}

function buildSummarySVG(key, season, r) {
  const T = THEMES[key];
  const kk = Object.values(r.byKaryakarta || {}).map((d) => ({ name: d.name, v: T.metric(d) })).filter((x) => x.v > 0.0001).sort((a, b) => b.v - a.v);
  const cu = Object.values(r.byCustomer || {}).map((d) => ({ name: d.name, v: T.metric(d) })).filter((x) => x.v > 0.0001).sort((a, b) => b.v - a.v);
  const grand = kk.reduce((s, x) => s + x.v, 0);
  const kkShown = kk.slice(0, 20), cuShown = cu.slice(0, 20);
  const topName = kk[0] ? kk[0].name : '—';

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif">`;
  s += `<defs>`;
  s += `<linearGradient id="grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.hA}"/><stop offset="1" stop-color="${T.hB}"/></linearGradient>`;
  s += `<linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${T.barA}"/><stop offset="1" stop-color="${T.barB}"/></linearGradient>`;
  s += `<radialGradient id="blob" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${T.blob}" stop-opacity="0.55"/><stop offset="1" stop-color="${T.blob}" stop-opacity="0"/></radialGradient>`;
  [['1', '#FFE79A', '#F0B41F'], ['2', '#F3F6FB', '#C2CAD6'], ['3', '#FAD1AE', '#E08A4F']].forEach(([rk, a, b]) => { s += `<linearGradient id="med${rk}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`; });
  s += `</defs>`;
  s += `<rect width="${W}" height="${H}" fill="${T.page}"/>`;
  s += `<circle cx="${W - 260}" cy="200" r="900" fill="url(#blob)"/>`;
  s += `<circle cx="120" cy="${H - 120}" r="620" fill="url(#blob)"/>`;
  const hy = 70, hh = 340, hw = W - 2 * PAD;
  s += `<rect x="${PAD}" y="${hy}" width="${hw}" height="${hh}" rx="48" fill="url(#grad)"/>`;
  s += `<rect x="${PAD}" y="${hy}" width="${hw}" height="${hh / 2}" rx="48" fill="#ffffff" opacity="0.08"/>`;
  const tx = PAD + 70;
  s += `<text x="${tx}" y="${hy + 92}" font-size="34" font-weight="700" fill="#ffffff" opacity="0.85" letter-spacing="3">AKSHAR CONNECT · ${esc(T.label.toUpperCase())} ${esc(season)}</text>`;
  s += `<text x="${tx}" y="${hy + 186}" font-size="104" font-weight="800" fill="#ffffff">${esc(T.title)} Contribution</text>`;
  s += `<text x="${tx}" y="${hy + 248}" font-size="42" font-weight="600" fill="#ffffff" opacity="0.92">Who contributed how much — ranked in kilograms. No amounts.</text>`;
  const pills = [['Karyakartas', String(kk.length)], ['Customers', String(cu.length)], ['Top', trunc(topName, 20)]];
  let px = tx;
  pills.forEach(([l, v]) => { const pw = 70 + (l.length + v.length) * 20; s += `<rect x="${px}" y="${hy + 272}" width="${pw}" height="52" rx="26" fill="#ffffff" opacity="0.18"/><text x="${px + 26}" y="${hy + 306}" font-size="30" font-weight="700" fill="#ffffff"><tspan opacity="0.8">${esc(l)}  </tspan><tspan font-weight="800">${esc(v)}</tspan></text>`; px += pw + 26; });
  const mcx = W - PAD - 230, mcy = hy + hh / 2;
  s += `<circle cx="${mcx}" cy="${mcy}" r="150" fill="#ffffff" opacity="0.16"/><circle cx="${mcx}" cy="${mcy}" r="150" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="4"/>`;
  s += `<text x="${mcx}" y="${mcy - 14}" font-size="88" font-weight="800" fill="#ffffff" text-anchor="middle">${fmtKg(grand)}</text><text x="${mcx}" y="${mcy + 48}" font-size="40" font-weight="700" fill="#ffffff" opacity="0.9" text-anchor="middle">kg ${esc(T.title)}</text>`;
  const cardsY = hy + hh + 56, cardsH = H - cardsY - 90;
  const gap = 60, cw = (W - 2 * PAD - gap) / 2;
  s += card(PAD, cardsY, cw, cardsH, 'Karyakarta', `${kk.length} contributors · top ${kkShown.length}`, kkShown, T);
  s += card(PAD + cw + gap, cardsY, cw, cardsH, 'Customers', `${cu.length} customers · top ${cuShown.length}`, cuShown, T);
  const now = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  s += `<text x="${W - PAD}" y="${H - 34}" font-size="28" font-weight="600" fill="${T.mut}" text-anchor="end">Akshar Connect · ${esc(season)} · generated ${esc(now)}</text>`;
  s += `</svg>`;
  return { svg: s, empty: kk.length === 0 && cu.length === 0 };
}

// Rasterize an SVG string to a PNG Blob at the exact pixel size (offscreen canvas).
function svgToPngBlob(svg, w, h) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode PNG'))), 'image/png');
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not render the image')); };
    img.src = url;
  });
}

// Generate BOTH images for a season and hand them to the user. On a device that
// supports sharing files, opens the native share sheet with both PNGs (save to
// Photos / Files, or send). Otherwise downloads both. Returns 'shared' |
// 'downloaded' | 'cancelled'.
export async function downloadGhariSummaryImages(season) {
  const s = season || ghariService.getSeason();
  const r = ghariService.buildReport(s);
  const specs = [
    { key: 'ghari', name: `Ghari_Seva_${s}_Ghari_kg.png` },
    { key: 'bhusu', name: `Ghari_Seva_${s}_Bhusu_kg.png` },
  ];
  const out = [];
  for (const spec of specs) {
    const { svg, empty } = buildSummarySVG(spec.key, s, r);
    if (empty) continue; // nothing of this product this season — skip its image
    const blob = await svgToPngBlob(svg, W, H);
    out.push({ blob, name: spec.name });
  }
  if (!out.length) throw new Error(`No Ghari or Bhusu contributions recorded for ${s} yet.`);

  // Prefer the native share sheet (best on phones — save to Photos or send).
  try {
    const files = out.map((o) => new File([o.blob], o.name, { type: 'image/png' }));
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, title: `Ghari Seva ${s} — contribution (kg)` });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled'; // user closed the share sheet
    // any other share error → fall through to a plain download
  }

  out.forEach(({ blob, name }) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  return 'downloaded';
}
