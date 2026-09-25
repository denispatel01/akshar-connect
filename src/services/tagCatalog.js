// ===========================================================================
// Akshar Connect — Tag Master  (single source of truth for all devotee tags)
// ---------------------------------------------------------------------------
// Tags are stored on the devotee record as a pipe-delimited string of KEYS.
// To add / rename a tag edit ONLY this file.
//
// mutuallyExclusiveGroup — tags sharing the same group string are radio-style:
//   enabling one automatically removes the other(s) in that group.
// ===========================================================================

// ── Categories (display order) ──────────────────────────────────────────────
export const TAG_CATEGORIES = [
  {
    key: 'invitations',
    label: 'Sabha & Event Invitations',
    short: 'Invitations',
    description: 'Which sabhas and events this devotee should be invited to.',
    color: { chipBg: '#FFF4E5', chipText: '#B85C00', dot: '#B85C00' },
  },
  {
    key: 'seva',
    label: 'Satsang Seva',
    short: 'Seva',
    description: 'Active seva commitments — volunteering, physical service roles.',
    color: { chipBg: '#E8F5EC', chipText: '#276237', dot: '#276237' },
  },
  {
    key: 'attendance',
    label: 'Sabha Attendance',
    short: 'Attendance',
    description: 'Regularity and type of sabha the devotee participates in.',
    color: { chipBg: '#EEF2FF', chipText: '#3730A3', dot: '#3730A3' },
  },
  {
    key: 'classification',
    label: 'Satsang Role & Classification',
    short: 'Role',
    description: "Devotee's identity, level and role within the satsang community.",
    color: { chipBg: '#EAF0F7', chipText: '#1F3A5F', dot: '#1F3A5F' },
  },
  {
    key: 'logistics',
    label: 'Logistics & Special Flags',
    short: 'Logistics',
    description: 'Operational flags — location, transport needs, outreach.',
    color: { chipBg: '#F5F0FF', chipText: '#6B21A8', dot: '#6B21A8' },
  },
];

// ── Tags ────────────────────────────────────────────────────────────────────
export const TAGS = [

  // ── Sabha & Event Invitations ────────────────────────────────────────────
  { key: 'samaiyo',                   label: 'Samaiyo',                         category: 'invitations', desc: 'Invited to the Samaiyo (Welcome Procession).' },
  { key: 'surat-prabodh-swami-sabha', label: 'Surat – Prabodh Swamiji Sabha',   category: 'invitations' },
  { key: 'adajan-friday-sabha',       label: 'Adajan – Friday Sabha',           category: 'invitations' },
  { key: 'adajan-yuva-sabha',         label: 'Adajan – Yuva Sabha',             category: 'invitations' },
  { key: 'adajan-sarvam-swami-sabha', label: 'Adajan – Sarvam Swamiji Sabha',   category: 'invitations' },
  { key: 'parivar-sabha',             label: 'Parivar Sabha',                   category: 'invitations' },
  { key: 'graduate-sabha',            label: 'Graduate Sabha',                  category: 'invitations' },

  // ── Satsang Seva ────────────────────────────────────────────────────────
  { key: 'zoli-seva',            label: 'Zoli Seva',              category: 'seva' },
  { key: 'shravan-padhramani',   label: 'Shravan Mas Padhramani', category: 'seva' },
  { key: 'annakut-seva',         label: 'Annakutt Seva',          category: 'seva' },
  { key: 'ghaari-seva',          label: 'Ghaari Seva',            category: 'seva' },

  // ── Sabha Attendance ─────────────────────────────────────────────────────
  // regularity: only one of these two may be active at a time
  { key: 'regular-sabha',   label: 'Regular Attending',   category: 'attendance', mutuallyExclusiveGroup: 'sabha-regularity', desc: 'Attends sabha regularly.' },
  { key: 'irregular-sabha', label: 'Irregular Attending', category: 'attendance', mutuallyExclusiveGroup: 'sabha-regularity', desc: 'Attends sabha irregularly.' },
  // assembly type: only one of these two may be active at a time
  { key: 'balika-sabha', label: 'Balika Sabha', category: 'attendance', mutuallyExclusiveGroup: 'assembly-type', desc: "Girls' assembly." },
  { key: 'bal-sabha',    label: 'Bal Sabha',    category: 'attendance', mutuallyExclusiveGroup: 'assembly-type', desc: "Children's assembly." },

  // ── Satsang Role & Classification ────────────────────────────────────────
  { key: 'ambrish',     label: 'Ambrish',          category: 'classification', desc: 'Satsang Diksha initiated devotee.' },
  { key: 'karyakarta',  label: 'Karyakarta',        category: 'classification', desc: 'Active volunteer / worker.' },
  { key: 'yuvak',       label: 'Yuvak',             category: 'classification', desc: 'Youth (Yuva Wing) member.' },
  { key: 'vadil',       label: 'Vadil',             category: 'classification', desc: 'Senior / elder devotee.' },
  { key: 'vip',         label: 'VIP',               category: 'classification', desc: 'Special / prominent devotee.' },
  { key: 'sadbhav',     label: 'Sadbhav',           category: 'classification' },
  { key: 'kids',        label: 'Kids',              category: 'classification', desc: 'Child of a satsangi who does NOT attend Bal Sabha.' },
  { key: 'bal-parents', label: 'Bal Sabha Parents', category: 'classification', desc: "Parents of Bal Sabha children." },

  // ── Logistics & Special Flags ─────────────────────────────────────────────
  { key: 'out-of-town', label: 'Out of Town',       category: 'logistics', desc: 'Lives outside Surat or is away for an extended period.' },
  { key: 'ride-seva',   label: 'Ride Seva Needed',  category: 'logistics', desc: 'Needs a ride to events — must appear on the pickup/route sheet.' },
];

// ── Lookups ─────────────────────────────────────────────────────────────────
const TAG_BY_KEY      = TAGS.reduce((m, t) => { m[t.key] = t; return m; }, {});
const CATEGORY_BY_KEY = TAG_CATEGORIES.reduce((m, c) => { m[c.key] = c; return m; }, {});

export const TAG_KEYS    = TAGS.map(t => t.key);
export const isValidTag  = (key) => Object.prototype.hasOwnProperty.call(TAG_BY_KEY, key);
export const getTag      = (key) => TAG_BY_KEY[key] || null;
export const tagLabel    = (key) => (TAG_BY_KEY[key] ? TAG_BY_KEY[key].label : key);
export const getCategory = (categoryKey) => CATEGORY_BY_KEY[categoryKey] || null;
export const categoryOfTag = (key) => (TAG_BY_KEY[key] ? CATEGORY_BY_KEY[TAG_BY_KEY[key].category] : null);

// Tags grouped by category, in catalog order: [{ category, tags: [...] }]
export const tagsByCategory = () =>
  TAG_CATEGORIES.map(category => ({
    category,
    tags: TAGS.filter(t => t.category === category.key),
  }));

// Chip style for a tag key (falls back to neutral grey for unknown keys).
export const tagChipStyle = (key) => {
  const cat = categoryOfTag(key);
  if (!cat) return { backgroundColor: '#EEF1F4', color: '#5B6673' };
  return { backgroundColor: cat.color.chipBg, color: cat.color.chipText };
};

// Returns the set of tag keys that must be turned OFF when `key` is turned ON.
// Empty array if `key` is not part of any mutual-exclusion group.
export const getMutuallyExclusiveKeys = (key) => {
  const tag = TAG_BY_KEY[key];
  if (!tag?.mutuallyExclusiveGroup) return [];
  return TAGS
    .filter(t => t.mutuallyExclusiveGroup === tag.mutuallyExclusiveGroup && t.key !== key)
    .map(t => t.key);
};
