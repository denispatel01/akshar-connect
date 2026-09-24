// ===========================================================================
// Akshar Connect — Tag Master (single source of truth for all devotee tags)
// ---------------------------------------------------------------------------
// A devotee may carry many tags across every category. Tags are stored on the
// devotee record as a single pipe-delimited string of tag KEYS (see
// devoteeSchema.js), and this catalog maps each key to its label + category.
// To add/rename a tag, edit ONLY this file.
// ===========================================================================

// Tag categories, in display order. `color` drives the chip styling.
export const TAG_CATEGORIES = [
  {
    key: 'seva-event',
    label: 'Seva & Event Groups',
    short: 'Seva / Event',
    description: 'Marks that a devotee takes part in this activity — used to build invitation and seva lists.',
    color: { chipBg: '#FFF1E6', chipText: '#C8642B', dot: '#C8642B' },
  },
  {
    key: 'spiritual',
    label: 'Spiritual Level & Interest',
    short: 'Spiritual',
    description: "The devotee's stage, role, attendance and specific needs.",
    color: { chipBg: '#EAF0F7', chipText: '#1F3A5F', dot: '#1F3A5F' },
  },
];

// Every tag: { key, label, category, desc? }
// `desc` is shown as a tooltip / helper — especially where meaning matters.
export const TAGS = [
  // ---- Seva & Event Groups -------------------------------------------------
  { key: 'samaiyo',                   label: 'Samaiyo (Welcome Procession)', category: 'seva-event' },
  { key: 'zoli-seva',                 label: 'Zoli Seva',                    category: 'seva-event' },
  { key: 'surat-prabodh-swami-sabha', label: 'Surat – Prabodh Swami Sabha',  category: 'seva-event' },
  { key: 'adajan-friday-sabha',       label: 'Adajan – Friday Sabha',        category: 'seva-event' },
  { key: 'adajan-yuva-sabha',         label: 'Adajan – Yuva Sabha',          category: 'seva-event' },
  { key: 'adajan-sarvam-swami-sabha', label: 'Adajan – Sarvam Swami Sabha',  category: 'seva-event' },
  { key: 'parivar-sabha',             label: 'Parivar Sabha',                category: 'seva-event' },
  { key: 'shravan-padhramani',        label: 'Shravan Padhramani',           category: 'seva-event' },
  { key: 'annakut-seva',              label: 'Annakut Seva',                 category: 'seva-event' },
  { key: 'ghaari-seva',               label: 'Ghaari Seva',                  category: 'seva-event' },
  { key: 'adajan-general-event',      label: 'Adajan – General Event',       category: 'seva-event', desc: 'Catch-all for general Adajan events.' },
  { key: 'graduate-sabha',            label: 'Graduate Sabha',               category: 'seva-event' },

  // ---- Spiritual Level & Interest -----------------------------------------
  { key: 'ambrish',            label: 'Ambrish',                   category: 'spiritual', desc: 'Satsang Diksha initiated devotee.' },
  { key: 'karyakarta',         label: 'Karyakarta',                category: 'spiritual', desc: 'Volunteer / worker.' },
  { key: 'regular-sabha',      label: 'Regular Sabha Attending',   category: 'spiritual' },
  { key: 'irregular-sabha',    label: 'Irregular Sabha Attending', category: 'spiritual' },
  { key: 'balika-sabha',       label: 'Balika Sabha',              category: 'spiritual', desc: "Girls' assembly member." },
  { key: 'bal-sabha',          label: 'Bal Sabha',                 category: 'spiritual', desc: "Children's assembly member." },
  { key: 'kids',               label: 'Kids',                      category: 'spiritual', desc: 'Child of a satsangi who does NOT attend Bal Sabha.' },
  { key: 'bal-parents',        label: 'Bal Parents',               category: 'spiritual', desc: "Parents of Bal Sabha children — filter so they aren't invited to every event." },
  { key: 'sadbhav',            label: 'Sadbhav',                   category: 'spiritual' },
  { key: 'out-of-town',        label: 'Out of Town',               category: 'spiritual', desc: 'Lives outside Surat / away.' },
  { key: 'ride-seva',          label: 'Ride Seva',                 category: 'spiritual', desc: 'Needs a ride provided for events — must appear on the route / pickup sheet.' },
];

// ---- Lookups ---------------------------------------------------------------
const TAG_BY_KEY = TAGS.reduce((m, t) => { m[t.key] = t; return m; }, {});
const CATEGORY_BY_KEY = TAG_CATEGORIES.reduce((m, c) => { m[c.key] = c; return m; }, {});

export const TAG_KEYS = TAGS.map(t => t.key);
export const isValidTag = (key) => Object.prototype.hasOwnProperty.call(TAG_BY_KEY, key);
export const getTag = (key) => TAG_BY_KEY[key] || null;
export const tagLabel = (key) => (TAG_BY_KEY[key] ? TAG_BY_KEY[key].label : key);
export const getCategory = (categoryKey) => CATEGORY_BY_KEY[categoryKey] || null;
export const categoryOfTag = (key) => (TAG_BY_KEY[key] ? CATEGORY_BY_KEY[TAG_BY_KEY[key].category] : null);

// Tags grouped by category, in catalog order: [{ category, tags: [...] }]
export const tagsByCategory = () =>
  TAG_CATEGORIES.map(category => ({
    category,
    tags: TAGS.filter(t => t.category === category.key),
  }));

// Chip style for a tag key (falls back to a neutral grey for unknown keys).
export const tagChipStyle = (key) => {
  const cat = categoryOfTag(key);
  if (!cat) return { backgroundColor: '#EEF1F4', color: '#5B6673' };
  return { backgroundColor: cat.color.chipBg, color: cat.color.chipText };
};
