// ===========================================================================
// Akshar Connect — Devotee Schema (single source of truth for the data model)
// ---------------------------------------------------------------------------
// Defines every devotee field (grouped into sections), the option lists, and
// the normalize/serialize helpers that bridge the app (tags as an array) and
// the Google Sheet backend (tags as one pipe-delimited text column).
// ===========================================================================

import { TAG_KEYS, isValidTag } from './tagCatalog.js';

export const TAGS_DELIMITER = '|';

// ---- Option lists ----------------------------------------------------------
export const AREAS = ['Nebula', 'Ganganagar', 'Rama', 'Vaishnodevi', 'BR Park', 'Sundarvan', 'Palanpur', 'Adajan'];
export const GENDERS = ['Male', 'Female'];
export const QUALIFICATIONS = ['10th', '12th', 'Diploma', 'ITI', 'Bachelor', 'Master', 'Ph.D', 'Course', 'Other'];
export const EDUCATION_STATUS = ['Pursuing', 'Completed'];
export const PROFESSIONS = ['Job', 'Business', 'Retired', 'Homemaker', 'Student'];
export const MARITAL_STATUS = ['Single', 'Married', 'Engaged'];
export const RELATIONS = ['Self', 'Head', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Spouse', 'Wife', 'Other'];
export const YUVAK_TYPES = ['Ambrish', 'Yuvak', 'Bal', 'New'];
export const STATUSES = ['Active', 'Inactive', 'Moved', 'Deceased'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

// ---- Field sections --------------------------------------------------------
// type: text | tel | email | date | number | select | textarea | tags | derived
// isNew: added in the Devotee Management module (for the plan / migration notes)
export const DEVOTEE_SECTIONS = [
  {
    key: 'identity', label: 'Identity',
    fields: [
      { key: 'firstName',  label: 'First Name',  type: 'text' },
      { key: 'middleName', label: 'Middle Name', type: 'text' },
      { key: 'lastName',   label: 'Last Name',   type: 'text' },
      { key: 'gender',     label: 'Gender',      type: 'select', options: GENDERS },
      { key: 'dob',        label: 'Date of Birth', type: 'date' },
      { key: 'age',        label: 'Age',         type: 'derived' },
      { key: 'bloodGroup', label: 'Blood Group', type: 'select', options: BLOOD_GROUPS },
      { key: 'maritalStatus', label: 'Marital Status', type: 'select', options: MARITAL_STATUS },
      { key: 'anniversary',   label: 'Anniversary',    type: 'date' },
      { key: 'photo',      label: 'Photo URL',   type: 'text', isNew: true },
    ],
  },
  {
    key: 'contact', label: 'Contact',
    fields: [
      { key: 'mobile',          label: 'Mobile',          type: 'tel' },
      { key: 'whatsapp',        label: 'WhatsApp',        type: 'tel' },
      { key: 'secondaryMobile', label: 'Secondary Mobile', type: 'tel' },
      { key: 'email',           label: 'Email',           type: 'email' },
      { key: 'address',         label: 'Address',         type: 'textarea' },
      { key: 'area',            label: 'Area',            type: 'select', options: AREAS },
      { key: 'city',            label: 'City',            type: 'text' },
      { key: 'areaRoute',       label: 'Area Route No.',  type: 'number', isNew: true, help: 'Pickup / padhramani order within the area.' },
    ],
  },
  {
    key: 'education', label: 'Education',
    fields: [
      { key: 'qualification',   label: 'Qualification',   type: 'select', options: QUALIFICATIONS, isNew: true },
      { key: 'education',       label: 'Education / Stream', type: 'text', help: 'e.g. M.Tech Computer, B.Tech Electrical' },
      { key: 'educationStatus', label: 'Education Status', type: 'select', options: EDUCATION_STATUS, isNew: true },
      { key: 'school',          label: 'School / College', type: 'text', isNew: true },
    ],
  },
  {
    key: 'profession', label: 'Profession',
    fields: [
      { key: 'profession',      label: 'Profession',      type: 'select', options: PROFESSIONS, isNew: true },
      { key: 'professionField', label: 'Field',           type: 'text', isNew: true, help: 'e.g. Software Developer' },
      { key: 'companyName',     label: 'Company Name',    type: 'text', isNew: true, help: 'e.g. Fountainhead' },
    ],
  },
  {
    key: 'satsang', label: 'Satsang & Relationship',
    fields: [
      { key: 'familyId',           label: 'Family ID',           type: 'text' },
      { key: 'relation',           label: 'Relation to Family Head', type: 'select', options: RELATIONS },
      { key: 'yuvakType',          label: 'Yuvak Type',          type: 'select', options: YUVAK_TYPES, isNew: true },
      { key: 'ambrish',            label: 'Ambrish',             type: 'text' },
      { key: 'followupKaryakarta', label: 'Follow-up Karyakarta', type: 'text', isNew: true },
      { key: 'followupKaryakartaMobile', label: 'Follow-up Karyakarta Mobile', type: 'tel', isNew: true },
      { key: 'reference',          label: 'Reference / Introduced By', type: 'text' },
      { key: 'tags',               label: 'Tags',                type: 'tags', isNew: true },
    ],
  },
  {
    key: 'system', label: 'System',
    fields: [
      { key: 'status',       label: 'Status',        type: 'select', options: STATUSES },
      { key: 'dateOfJoining', label: 'Date of Joining', type: 'date' },
      { key: 'onboarding',   label: 'New (Onboarding)', type: 'derived', isNew: true },
      { key: 'notes',        label: 'Notes',         type: 'textarea', isNew: true },
    ],
  },
];

// Flat field list (excludes purely-derived fields).
export const DEVOTEE_FIELDS = DEVOTEE_SECTIONS
  .flatMap(s => s.fields)
  .filter(f => f.type !== 'derived');

// Columns that ONLY the module added (used by the backend migration note).
export const NEW_FIELD_KEYS = DEVOTEE_SECTIONS
  .flatMap(s => s.fields)
  .filter(f => f.isNew && f.type !== 'derived')
  .map(f => f.key);

// Scalar (non-tag) default values for a brand-new devotee.
export const DEVOTEE_DEFAULTS = DEVOTEE_FIELDS.reduce((acc, f) => {
  if (f.key !== 'tags') acc[f.key] = '';
  return acc;
}, {});

// ---- Tag (de)serialization -------------------------------------------------
// Parse the stored tag value (pipe- or comma-delimited string, or array) into
// a clean array of valid, de-duplicated tag keys.
export function parseTags(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[|,]/);
  const seen = new Set();
  const out = [];
  for (let t of raw) {
    const key = String(t).trim();
    if (key && isValidTag(key) && !seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

// Serialize a tag array back into the single delimited column value.
export function serializeTags(tags) {
  return parseTags(tags).join(TAGS_DELIMITER);
}

// ---- Derived helpers -------------------------------------------------------
export function deriveAge(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : '';
}

export function fullName(d) {
  return d.name || [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ');
}

// Onboarding = joined within the last 90 days (auto-derived; never stored).
export function isOnboarding(d) {
  if (!d || !d.dateOfJoining) return false;
  const j = new Date(d.dateOfJoining);
  if (isNaN(j.getTime())) return false;
  return (Date.now() - j.getTime()) <= 90 * 24 * 60 * 60 * 1000;
}

// ---- Record normalization --------------------------------------------------
// Turn a raw record (from the sheet or demo data) into the in-memory shape the
// app uses: every field present, `tags` as an array.
export function normalizeDevotee(raw) {
  const d = { ...raw };
  for (const f of DEVOTEE_FIELDS) {
    if (f.key === 'tags') continue;
    if (d[f.key] === undefined || d[f.key] === null) d[f.key] = '';
  }
  d.tags = parseTags(raw.tags);
  d.name = fullName(d);
  return d;
}

// Turn an in-memory devotee into the flat row shape the backend stores
// (tags array -> delimited string). Non-destructive.
export function toBackendRow(devotee) {
  return { ...devotee, tags: serializeTags(devotee.tags) };
}

// Add/remove a single tag on an array; returns a new array.
export function withTag(tags, key, on) {
  const set = new Set(parseTags(tags));
  if (on) set.add(key); else set.delete(key);
  return Array.from(set).filter(isValidTag);
}

// Does a devotee have every / any of the given tag keys?
export function hasAllTags(devotee, keys) {
  const set = new Set(devotee.tags || []);
  return keys.every(k => set.has(k));
}
export function hasAnyTag(devotee, keys) {
  if (!keys.length) return true;
  const set = new Set(devotee.tags || []);
  return keys.some(k => set.has(k));
}

// Sanity check: every catalog tag key is unique & kebab-case (dev aid).
export const _TAG_KEYS = TAG_KEYS;
