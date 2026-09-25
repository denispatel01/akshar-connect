// Attractive, table-based PDF reports for the Reports page.
// jsPDF + autotable are loaded ON DEMAND (dynamic import) so they never
// weigh down the app's initial load — the libs only download when a user
// actually taps a report.

import { deriveAge } from '../services/devoteeSchema';

const NAVY = [0, 49, 88];       // #003158 brand primary
const ORANGE = [255, 134, 42];  // #FF862A brand accent
const LIGHT = [239, 243, 248];  // row stripe
const INK = [30, 41, 59];

const dobShort = (dob) => {
  if (!dob) return '';
  const [y, m, d] = String(dob).split('-');
  if (!y) return '';
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] || '';
  return `${d}-${mon}-${y}`;
};

// Devotee ordering for every report.
// Between families: ambrish → karyakarta → regular → irregular → not attending
//   → untagged → New (New always last, "old first, new later").
// Within a family: primary/self first, then spouse (husband & wife together),
//   then children, then parents (mother & father together), then others.
const TAG_PRIORITY = ['ambrish', 'karyakarta', 'regular-sabha', 'irregular-sabha', 'not-attending-sabha'];

function tagRank(d) {
  const tags = Array.isArray(d.tags) ? d.tags : [];
  if (tags.includes('new')) return 90;          // New devotees always sort last
  let best = Infinity;
  TAG_PRIORITY.forEach((k, i) => { if (tags.includes(k)) best = Math.min(best, i); });
  return best === Infinity ? 50 : best;         // untagged: after old, before New
}

function relationRank(d) {
  if (d.type === 'Primary' || !d.type) return 0; // family head / primary record
  const r = String(d.relation || '').toLowerCase();
  if (r.includes('self') || r.includes('head')) return 0;
  if (r.includes('wife') || r.includes('husband') || r.includes('spouse')) return 1;
  if (r.includes('son') || r.includes('daughter') || r.includes('child')) return 2;
  if (r.includes('father') || r.includes('mother') || r.includes('parent')) return 3;
  return 4;
}

function sortForReport(rows) {
  // Group by family so members stay adjacent.
  const groups = new Map();
  rows.forEach((d) => {
    const fid = d.familyId || d.id;
    if (!groups.has(fid)) groups.set(fid, []);
    groups.get(fid).push(d);
  });
  const ordered = [];
  Array.from(groups.values())
    .map((members) => {
      // Within a family: primary first, spouse, children, parents, others.
      const sorted = members.slice().sort((a, b) => {
        const ra = relationRank(a), rb = relationRank(b);
        if (ra !== rb) return ra - rb;
        return (a.name || '').localeCompare(b.name || '');
      });
      const groupRank = Math.min(...members.map(tagRank)); // family placed by best member
      return { sorted, groupRank, name: sorted[0]?.name || '' };
    })
    .sort((a, b) => (a.groupRank - b.groupRank) || a.name.localeCompare(b.name))
    .forEach((g) => ordered.push(...g.sorted));
  return ordered;
}

// Default columns (used when a report doesn't pass its own `columns`).
const DEFAULT_COLUMNS = [
  { header: '#', get: (_d, i) => String(i + 1), width: 26, halign: 'center' },
  { header: 'Name', get: (d) => d.name || '' },
  { header: 'Age', get: (d) => (deriveAge(d.dob) === '' ? '' : String(deriveAge(d.dob))), width: 32, halign: 'center' },
  { header: 'Gender', get: (d) => d.gender || '', width: 46 },
  { header: 'Mobile', get: (d) => d.mobile || '', width: 78 },
  { header: 'Area', get: (d) => d.area || '' },
  { header: 'Karyakarta', get: (d) => d.followupKaryakarta || '' },
];

// rows: array of devotee objects. title/subtitle are strings.
// columns: optional [{ header, get(d,i), width?, halign? }] to control layout.
export async function downloadReportPdf({ title, subtitle, rows, columns }) {
  const cols = columns && columns.length ? columns : DEFAULT_COLUMNS;
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableMod.default || autoTableMod.autoTable;

  const orderedRows = sortForReport(rows);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // ── Header band ────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 96, 'F');
  doc.setFillColor(...ORANGE);
  doc.rect(0, 96, pageW, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('AKSHAR CONNECT', 40, 34);
  doc.setFontSize(18);
  doc.text(title || 'Report', 40, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(210, 224, 240);
  doc.text(subtitle || 'Adajan Satsang Mandal', 40, 80);

  // Date (right aligned)
  doc.setFontSize(9);
  doc.setTextColor(210, 224, 240);
  doc.text(`Generated: ${dateStr} ${timeStr}`, pageW - 40, 34, { align: 'right' });

  // ── Summary ────────────────────────────────────────────────────────────────
  const families = new Set(orderedRows.map(d => d.familyId || ('ID_' + d.id))).size;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`${orderedRows.length} devotees`, 40, 128);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 130, 145);
  doc.text(`${families} families`, 40 + doc.getTextWidth(`${orderedRows.length} devotees`) + 16, 128);

  // ── Table ──────────────────────────────────────────────────────────────────
  const head = [cols.map((c) => c.header)];
  const body = orderedRows.map((d, i) => cols.map((c) => c.get(d, i)));

  const columnStyles = {};
  cols.forEach((c, idx) => {
    const s = {};
    if (c.width) s.cellWidth = c.width;
    if (c.halign) s.halign = c.halign;
    if (Object.keys(s).length) columnStyles[idx] = s;
  });

  autoTable(doc, {
    startY: 146,
    head,
    body,
    theme: 'striped',
    // linebreak = wrap long values onto extra lines so nothing is ever cut off.
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.5, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'left' },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles,
    margin: { left: 40, right: 40, bottom: 44 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      const w = doc.internal.pageSize.getWidth();
      const page = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150, 160, 175);
      doc.text('Adajan Satsang Mandal · Akshar Connect', 40, h - 20);
      doc.text(`Page ${page}`, w - 40, h - 20, { align: 'right' });
    },
  });

  const safe = String(title || 'report').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
  doc.save(`${safe}_${now.toISOString().split('T')[0]}.pdf`);
}
