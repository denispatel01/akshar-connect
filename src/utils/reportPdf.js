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

// rows: array of devotee objects. title/subtitle are strings.
export async function downloadReportPdf({ title, subtitle, rows }) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableMod.default || autoTableMod.autoTable;

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
  const families = new Set(rows.map(d => d.familyId || ('ID_' + d.id))).size;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`${rows.length} devotees`, 40, 128);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 130, 145);
  doc.text(`${families} families`, 40 + doc.getTextWidth(`${rows.length} devotees`) + 16, 128);

  // ── Table ──────────────────────────────────────────────────────────────────
  const body = rows.map((d, i) => [
    String(i + 1),
    d.name || '',
    deriveAge(d.dob) === '' ? '' : String(deriveAge(d.dob)),
    d.gender || '',
    d.mobile || '',
    d.area || '',
    d.followupKaryakarta || '',
  ]);

  autoTable(doc, {
    startY: 146,
    head: [['#', 'Name', 'Age', 'Gender', 'Mobile', 'Area', 'Karyakarta']],
    body,
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'left' },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 26, halign: 'center', textColor: [140, 150, 165] },
      2: { cellWidth: 32, halign: 'center' },
      3: { cellWidth: 46 },
      4: { cellWidth: 78 },
    },
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
