/** Build TH-1 … TH-100 for daily rotation (demo / first load). */
const TEMPLATES = [
  {
    author: 'Mahant Swami Maharaj',
    thought: 'Ekta, Samp, and Suhradbhav are the true ornaments of a Satsangi.',
    date: '2026-09-19',
  },
  {
    author: 'Pramukh Swami Maharaj',
    thought: 'In the joy of others lies our own. In the progress of others lies our own.',
    date: '2026-09-18',
  },
];

function isoDateOffset(daysBefore) {
  const d = new Date(2026, 8, 19);
  d.setDate(d.getDate() - daysBefore);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildInitialThoughts(count = 100) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const tpl = TEMPLATES[i % TEMPLATES.length];
    const date = i < TEMPLATES.length ? tpl.date : isoDateOffset(i);
    return {
      id: `TH-${n}`,
      author: tpl.author,
      thought: tpl.thought,
      date,
    };
  });
}

export const INITIAL_THOUGHTS = buildInitialThoughts(100);
