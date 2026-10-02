import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Download, Printer, MessageCircle, Mail, Plus, Filter, QrCode, CheckSquare, X, MapPin, Phone, Trash2, Pencil, Save, Droplet, Briefcase, GraduationCap, User, UserCheck, Users, Home, Calendar, ChevronDown, ChevronLeft, ChevronRight, MessageSquare, ShieldCheck } from 'lucide-react';
import { dataService } from '../services/dataService';
import AutoResizeTextarea from '../components/AutoResizeTextarea';
import AddDevoteeWizard from '../components/AddDevoteeWizard';
import { alertDevoteeCreated, alertDevoteeSaved, alertDevoteeSaveFailed } from '../utils/sweetAlert';
import { tagsByCategory, tagLabel, tagChipStyle, getMutuallyExclusiveKeys } from '../services/tagCatalog';
import { isBirthdayToday, isBirthdayWithin } from '../utils/birthdays';
import { scoreMatch, devoteeSearchText } from '../utils/search';
import EmptyState from '../components/EmptyState';
import { ListSkeleton } from '../components/SkeletonLoader';
import {
  hasAnyTag, deriveAge, AREAS, GENDERS, QUALIFICATIONS, EDUCATION_STATUS,
  PROFESSIONS, MARITAL_STATUS, RELATIONS, YUVAK_TYPES, STATUSES, BLOOD_GROUPS,
  FAMILY_RECORD_TYPES, formatFamilyRecordType, formatFamilyMembershipContext
} from '../services/devoteeSchema';

// Age bands for the Divine Devotees filter.
const AGE_BANDS = {
  under15: { label: 'Under 15', test: (a) => a !== '' && a < 15 },
  '15to45': { label: '15 – 45', test: (a) => a !== '' && a >= 15 && a <= 45 },
  over45: { label: 'Over 45', test: (a) => a !== '' && a > 45 },
};

// Profile tabs -> [field, label]. 'Tags' is a special tab (no fields, renders tag UI).
const TABS = {
  'Personal':    [['firstName','First Name'],['middleName','Middle Name'],['lastName','Last Name'],['gender','Gender'],['dob','Date of Birth'],['bloodGroup','Blood Group'],['maritalStatus','Marital Status'],['anniversary','Anniversary']],
  'Contact':     [['mobile','Mobile'],['whatsapp','WhatsApp'],['secondaryMobile','Secondary Mobile'],['email','Email'],['address','Address'],['area','Area'],['city','City'],['areaRoute','Area Route No.']],
  'Education':   [['qualification','Qualification'],['education','Education / Stream'],['educationStatus','Education Status'],['school','School / College']],
  'Profession':  [['profession','Profession'],['professionField','Field'],['companyName','Company'],['occupation','Occupation (legacy)']],
  'Satsang':     [['yuvakType','Yuvak Type'],['familyId','Family Head'],['relation','Relation to family head'],['followupKaryakarta','Follow-up Karyakarta'],['followupKaryakartaMobile','Karyakarta Mobile'],['reference','Reference']],
  'Family':      [], // special tab: lists everyone in this devotee's family (+ shows Family ID)
  'System':      [['id','Yuvak ID'],['status','Status'],['dateOfJoining','Date of Joining'],['notes','Notes']],
  'Tags':        [], // rendered separately
};
// Satsang fields handled by the custom family-role block (not the generic grid).
const SATSANG_ROLE_FIELDS = new Set(['familyId', 'relation']);
// Order of sections in the single-scroll LinkedIn-style profile.
const PROFILE_SECTION_ORDER = ['Personal', 'Contact', 'Satsang', 'Family', 'Education', 'Profession', 'Tags', 'System'];

// Multi-select dropdown (checkbox list). `options` is an array of strings or
// {value,label}. `selected` is an array of values. Used for every directory filter.
function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = React.useState(false);
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const text = selected.length === 0
    ? label
    : selected.length === 1
      ? (opts.find((o) => o.value === selected[0])?.label || selected[0])
      : `${label} (${selected.length})`;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-1 rounded-xl border px-3 py-2 text-xs font-semibold outline-none ${selected.length ? 'border-primary bg-primary/5 text-text-main' : 'border-border-light bg-bg-base text-text-muted'}`}>
        <span className="truncate">{text}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-full min-w-[11rem] max-h-56 overflow-y-auto rounded-xl border border-border-light bg-surface shadow-lg p-1">
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="block w-full text-left px-2 py-1.5 text-[11px] font-bold text-red-500 hover:bg-bg-base rounded-lg">Clear</button>
            )}
            {opts.map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-text-main hover:bg-bg-base rounded-lg cursor-pointer">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="rounded text-primary focus:ring-primary" />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Searchable Family Head picker — type to filter heads by name/area instead of
// scrolling a long dropdown.
function FamilyHeadPicker({ heads, value, onChange, inputCls }) {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const selected = heads.find((h) => h.familyId === value);
  const ql = q.trim().toLowerCase();
  const matches = (ql
    ? heads.filter((h) => (h.name || '').toLowerCase().includes(ql) || (h.area || '').toLowerCase().includes(ql))
    : heads
  ).slice(0, 40);
  return (
    <div className="relative">
      <input
        value={open ? q : (selected ? `${selected.name}${selected.area ? ` — ${selected.area}` : ''}` : '')}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(''); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search head by name or area…"
        className={inputCls + ' bg-surface'} />
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border-light bg-surface shadow-lg">
          {matches.length === 0 && <p className="px-3 py-2 text-xs font-semibold text-text-muted">No matching head</p>}
          {value && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); setQ(''); }}
              className="block w-full text-left px-3 py-2 text-xs font-bold text-red-500 hover:bg-bg-base border-b border-border-light">Clear</button>
          )}
          {matches.map((h) => (
            <button type="button" key={h.familyId}
              onMouseDown={(e) => { e.preventDefault(); onChange(h.familyId); setOpen(false); setQ(''); }}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-bg-base ${h.familyId === value ? 'bg-primary/5 font-bold text-primary' : 'text-text-main'}`}>
              {h.name}{h.area ? <span className="text-text-muted"> — {h.area}</span> : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
const ALL_FIELDS = Object.values(TABS).flat();
const READ_ONLY_FIELDS = new Set(['id', 'familyId']);
const FULL_WIDTH_FIELDS = new Set(['address', 'notes']);

const WINGS = ['Yuva Wing', 'Kishore Wing', 'Bal Wing', 'Seniors Wing'];

// Display a full name as first + last only (drop middle name(s)) for compact labels.
const firstLastName = (full) => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return parts.length <= 2 ? parts.join(' ') : `${parts[0]} ${parts[parts.length - 1]}`;
};

// Map field keys to dropdown options (from devoteeSchema) for smart rendering
const FIELD_OPTIONS = {
  gender: GENDERS, bloodGroup: BLOOD_GROUPS, maritalStatus: MARITAL_STATUS,
  area: AREAS, qualification: QUALIFICATIONS, educationStatus: EDUCATION_STATUS,
  profession: PROFESSIONS, relation: RELATIONS, yuvakType: YUVAK_TYPES,
  status: STATUSES, wing: WINGS, type: FAMILY_RECORD_TYPES,
};
// Fields that should render as textarea
const TEXTAREA_FIELDS = new Set(['address', 'notes']);
// Fields that allow both dropdown + manual entry (datalist pattern)
const COMBO_FIELDS = new Set(['area', 'followupKaryakarta', 'reference']);

const PRESET_META = {
  total: { tags: [], match: () => true, banner: 'Showing all devotees' },
  ambrish: { tags: ['ambrish'], match: () => true, banner: 'Showing devotees tagged Ambrish' },
  families: {
    tags: [],
    match: (d) => d.type === 'Primary',
    banner: 'Showing primary members (head of each family)',
  },
  birthdays: {
    tags: [],
    match: (d) => isBirthdayToday(d.dob),
    banner: "Showing devotees with a birthday today",
  },
  upcomingBirthdays: {
    tags: [],
    match: (d) => isBirthdayWithin(d.dob, 30),
    banner: "Showing devotees with a birthday in the next 30 days",
  },
};

const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dobShort(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return dob;
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS_ABBR[d.getMonth()]}-${d.getFullYear()}`;
}

export default function DevoteesPage({ user, devoteesPreset, filterPreset, onClearDevoteesPreset, openDevoteeId, onClearOpenDevotee, refreshing }) {
  const [devotees, setDevotees] = useState(() => dataService.getDevotees());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDevotee, setSelectedDevotee] = useState(null);
  const [qrModalDevotee, setQrModalDevotee] = useState(null);
  const [activeTab, setActiveTab] = useState('Personal');
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [selectedTags, setSelectedTags] = useState([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [showTags, setShowTags] = useState(false); // separate Tags filter section (outside Filters)
  const [sortBy, setSortBy] = useState(''); // '' = default | name | joinedDesc | joinedAsc
  // All directory filters are multi-select (arrays of selected values).
  const [filterKaryakartas, setFilterKaryakartas] = useState([]);
  const [filterAreas, setFilterAreas] = useState([]);
  const [filterReferences, setFilterReferences] = useState([]);
  const [filterQualifications, setFilterQualifications] = useState([]);
  const [filterAges, setFilterAges] = useState([]); // keys of AGE_BANDS
  const [filterGenders, setFilterGenders] = useState([]);
  const [filterTypes, setFilterTypes] = useState([]); // 'Primary' | 'Family'
  const [filterOldNews, setFilterOldNews] = useState([]); // 'Old' | 'Reference' | 'New'
  const anyFilterActive = filterKaryakartas.length || filterAreas.length || filterReferences.length || filterQualifications.length || filterAges.length || filterGenders.length || filterTypes.length || filterOldNews.length;
  const [whatsappSameAsMobile, setWhatsappSameAsMobile] = useState(false);
  const [addWhatsappSameAsMobile, setAddWhatsappSameAsMobile] = useState(false);
  const [manualOverride, setManualOverride] = useState({});
  const [saving, setSaving] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [familyFilter, setFamilyFilter] = useState(null); // familyId -> show all its members
  const [expandedCard, setExpandedCard] = useState(null); // devotee id expanded inline
  const [tagsExpandedId, setTagsExpandedId] = useState(null); // devotee id whose full tags are shown

  // Family heads (primary members) — used to link a family member to their head.
  const familyHeads = useMemo(() => devotees
    .filter(d => d.type === 'Primary')
    .map(d => ({ name: d.name, familyId: d.familyId || d.id, id: d.id, area: d.area }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '')), [devotees]);
  const headNameByFamilyId = useMemo(() => {
    const m = new Map();
    familyHeads.forEach(h => m.set(h.familyId, h.name));
    return m;
  }, [familyHeads]);
  const familyHeadLabel = (fid) => {
    if (!fid) return '—';
    const nm = headNameByFamilyId.get(fid);
    return nm ? `${nm} · ${fid}` : fid;
  };

  const uniqueKaryakartas = useMemo(() => [...new Set(devotees.map(d => d.followupKaryakarta).filter(Boolean))].sort(), [devotees]);
  // Karyakarta picker: real devotees tagged 'karyakarta' (exact names), merged with any
  // names already used as a follow-up karyakarta — so the name always matches the Devotees tab.
  const karyakartaOptions = useMemo(() => {
    const tagged = devotees.filter(d => (d.tags || []).includes('karyakarta')).map(d => d.name).filter(Boolean);
    return [...new Set([...tagged, ...uniqueKaryakartas])].sort((a, b) => a.localeCompare(b));
  }, [devotees, uniqueKaryakartas]);
  // Look up a karyakarta devotee by exact name → auto-fill their mobile from the Devotees tab.
  const devoteeByName = useMemo(() => {
    const m = new Map();
    devotees.forEach(d => { if (d.name) m.set(d.name.trim().toLowerCase(), d); });
    return m;
  }, [devotees]);
  const karyakartaMobileFor = (name) => devoteeByName.get((name || '').trim().toLowerCase())?.mobile || '';
  const uniqueAreas = useMemo(() => [...new Set(devotees.map(d => d.area).filter(Boolean))].sort(), [devotees]);
  const uniqueReferences = useMemo(() => [...new Set(devotees.map(d => d.reference).filter(Boolean))].sort(), [devotees]);
  // Reference picker: existing reference values first, then every devotee name, + free typing.
  const referenceOptions = useMemo(
    () => [...new Set([...uniqueReferences, ...devotees.map(d => d.name).filter(Boolean)])],
    [uniqueReferences, devotees]);
  const uniqueWings = useMemo(() => [...new Set(devotees.map(d => d.wing).filter(Boolean))].sort(), [devotees]);

  const toggleFilterTag = (key) => setSelectedTags((prev) =>
    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  const todayISO = new Date().toISOString().slice(0, 10);
  // New yuvak defaults: a new record is a Primary family head (self), male, joining today.
  const blankForm = { name:'', firstName:'', middleName:'', lastName:'', mobile:'', whatsapp:'', secondaryMobile:'', email:'',
    gender:'Male', dob:'', bloodGroup:'', maritalStatus:'', anniversary:'', yuvakType:'', photo:'',
    qualification:'', education:'', educationStatus:'Completed', school:'',
    profession:'', professionField:'', companyName:'',
    address:'', area:'', city:'Surat', mandal:'Adajan',
    followupKaryakarta:'', followupKaryakartaMobile:'', reference:'', notes:'', tags:[],
    familyId:'', type:'Primary', relation:'Self', dateOfJoining: todayISO };
  const [formData, setFormData] = useState(blankForm);

  useEffect(() => { loadDevotees(); }, []);

  useEffect(() => {
    if (devoteesPreset && PRESET_META[devoteesPreset]) {
      const { tags } = PRESET_META[devoteesPreset];
      setSelectedTags(tags || []);
      setFilterKaryakartas([]); setFilterAreas([]); setFilterReferences([]);
      setFilterQualifications([]); setFilterAges([]); setFilterGenders([]);
      setFilterTypes([]); setFilterOldNews([]);
      setSearchQuery('');
      setShowTagFilter(devoteesPreset === 'ambrish');
    }
  }, [devoteesPreset]);

  useEffect(() => {
    if (filterPreset) {
      setFilterKaryakartas(filterPreset.karyakarta ? [filterPreset.karyakarta] : []);
      setFilterAreas(filterPreset.area ? [filterPreset.area] : []);
      setSelectedTags([]); // clear tags when applying these filters
      setSearchQuery('');
      setShowTagFilter(true);
    }
  }, [filterPreset]);

  const loadDevotees = () => setDevotees([...dataService.getDevotees()]);

  const presetMeta = devoteesPreset ? PRESET_META[devoteesPreset] : null;
  const presetMatch = presetMeta?.match ?? (() => true);

  const isDevotee = user?.role === 'Devotee';
  const canEdit   = user?.role === 'Admin' || user?.role === 'Sevak';
  const canDelete = user?.role === 'Admin'; // Sevak and Devotee cannot delete
  // A devotee may edit their OWN profile (fields only — tags stay admin-only).
  const isOwnProfile = isDevotee && !!selectedDevotee && String(selectedDevotee.id) === String(user?.devoteeId);
  const canEditProfile = canEdit || isOwnProfile;

  // Devotee: restrict visible records to their own family only
  const devoteeFamily = useMemo(() => {
    if (!isDevotee) return null;
    const fid = user?.familyId || user?.devoteeId;
    if (!fid) return [];
    return devotees.filter(d => d.familyId === fid || d.id === fid || d.id === user?.devoteeId);
  }, [isDevotee, devotees, user]);

  // Count members per family (to show a "Family (N)" chip on head cards).
  const familySizes = useMemo(() => {
    const m = {};
    devotees.forEach((d) => { if (d.familyId) m[d.familyId] = (m[d.familyId] || 0) + 1; });
    return m;
  }, [devotees]);

  // Head (Primary) record for each family — used to inherit the family's shared
  // address / area / follow-up karyakarta onto a new or newly-linked member.
  const headRecordByFamilyId = useMemo(() => {
    const m = new Map();
    devotees.forEach((d) => { if (d.type === 'Primary') m.set(d.familyId || d.id, d); });
    return m;
  }, [devotees]);
  // Fields a family member inherits from their head (non-empty head values win).
  const inheritFromHead = (familyId, data) => {
    const h = headRecordByFamilyId.get(familyId);
    if (!h) return {};
    return {
      address: h.address || data.address || '',
      area: h.area || data.area || '',
      followupKaryakarta: h.followupKaryakarta || data.followupKaryakarta || '',
      followupKaryakartaMobile: h.followupKaryakartaMobile || data.followupKaryakartaMobile || '',
    };
  };

  // All members of the open devotee's family (head first), for the Family tab.
  const familyMembers = useMemo(() => {
    if (!selectedDevotee) return [];
    const fid = selectedDevotee.familyId;
    let list = fid ? devotees.filter((d) => d.familyId === fid) : [];
    if (!list.some((d) => d.id === selectedDevotee.id)) list = [selectedDevotee, ...list];
    const rank = (d) => (d.type === 'Primary' ? 0 : 1);
    return [...list].sort((a, b) => rank(a) - rank(b) || (b.dob || '').localeCompare(a.dob || ''));
  }, [selectedDevotee, devotees]);

  // Plain browsing (no query/tag/preset) lists heads only — family members are
  // hidden until you open their family or search for them.
  const isPlainBrowse = !isDevotee && !searchQuery && selectedTags.length === 0 && !anyFilterActive && !devoteesPreset;

  // Search matches a devotee's OWN name parts, DOB and mobile only — never
  // karyakarta / reference / address (see devoteeSearchText).
  const searchText = (d) => devoteeSearchText(d);

  const query = searchQuery.trim();
  const filteredDevotees = useMemo(() => {
    // Devotees only see their own family — no search/filter applies
    if (isDevotee) return devoteeFamily || [];

    let base = devotees.filter((d) => {
      if (familyFilter) return d.familyId === familyFilter; // family view: every member
      if (isPlainBrowse && d.type !== 'Primary') return false; // default browse: family heads only
      if (filterTypes.length && !filterTypes.includes(d.type === 'Primary' ? 'Primary' : 'Family')) return false;
      if (filterKaryakartas.length && !filterKaryakartas.includes(d.followupKaryakarta)) return false;
      if (filterAreas.length && !filterAreas.includes(d.area)) return false;
      if (filterReferences.length && !filterReferences.includes(d.reference)) return false;
      if (filterQualifications.length && !filterQualifications.includes(d.qualification)) return false;
      if (filterAges.length && !filterAges.some(a => AGE_BANDS[a]?.test(deriveAge(d.dob)))) return false;
      if (filterGenders.length && !filterGenders.includes(d.gender)) return false;
      if (filterOldNews.length && !filterOldNews.some(v => String(d.oldNew || '').toLowerCase() === v.toLowerCase())) return false;
      return hasAnyTag(d, selectedTags) && presetMatch(d);
    });
    if (query) {
      base = base
        .map((d) => ({ d, s: scoreMatch(searchText(d), d.name || '', query) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s) // exact first, then partial, then fuzzy
        .map((x) => x.d);
    } else if (sortBy) {
      base = [...base].sort((a, b) => {
        if (sortBy === 'joinedDesc') return String(b.dateOfJoining || '').localeCompare(String(a.dateOfJoining || ''));
        if (sortBy === 'joinedAsc') return String(a.dateOfJoining || '').localeCompare(String(b.dateOfJoining || ''));
        return String(a.name || '').localeCompare(String(b.name || '')); // name A-Z
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devotees, query, sortBy, selectedTags, filterKaryakartas, filterAreas, filterReferences, filterQualifications, filterAges, filterGenders, filterTypes, filterOldNews, familyFilter, devoteesPreset, isPlainBrowse]);

  const familyName = familyFilter
    ? (devotees.find((d) => d.familyId === familyFilter && d.type === 'Primary')?.name
        || devotees.find((d) => d.familyId === familyFilter)?.name || familyFilter)
    : '';

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const name = formData.name || [formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(' ');
    // Validate required fields and tell the user exactly what is missing.
    const missing = [];
    if (!(formData.firstName || '').trim() && !name.trim()) missing.push('First Name');
    const mob = String(formData.mobile || '').trim();
    if (!mob) missing.push('Mobile number');
    else if (mob.length !== 10) missing.push('Mobile number must be 10 digits');
    if (formData.familyId && !(formData.relation || '').trim()) missing.push('Relation to family head');
    if (missing.length) { window.alert('Please complete before saving:\n\n• ' + missing.join('\n• ')); return; }
    const whatsapp = addWhatsappSameAsMobile ? formData.mobile : formData.whatsapp;
    setSaving(true);
    try {
      const created = await dataService.addDevoteeAndSync({ ...formData, whatsapp, name, mandal: formData.mandal || 'Adajan', createdBy: user?.name || '' });
      loadDevotees();
      setShowAddModal(false);
      setFormData(blankForm);
      setAddWhatsappSameAsMobile(false);
      await alertDevoteeCreated(name);
      // Open the new devotee immediately so the auto-generated Family ID shows without a manual refresh.
      if (created) openProfile(created);
    } catch (err) {
      loadDevotees();
      await alertDevoteeSaveFailed(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openProfile = (d) => { setSelectedDevotee(d); setActiveTab('Personal'); setEditing(false); };

  // --- Profile tab swipe navigation ---
  const TAB_KEYS = Object.keys(TABS);
  const [slideDir, setSlideDir] = useState(1);
  const [tabAnimKey, setTabAnimKey] = useState(0); // increment to re-trigger animation
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const touchDeltaX = useRef(0);
  const tabBarRef = useRef(null);

  const goToTab = (dir, targetKey) => {
    const currentIdx = TAB_KEYS.indexOf(activeTab);
    let nextKey = targetKey;
    if (!nextKey) {
      const nextIdx = currentIdx + dir;
      if (nextIdx < 0 || nextIdx >= TAB_KEYS.length) return;
      nextKey = TAB_KEYS[nextIdx];
    }
    const resolvedDir = TAB_KEYS.indexOf(nextKey) > currentIdx ? 1 : -1;
    setSlideDir(resolvedDir);
    setTabAnimKey(k => k + 1);
    setActiveTab(nextKey);
    // Scroll active tab button into view
    setTimeout(() => {
      const bar = tabBarRef.current;
      if (!bar) return;
      const active = bar.querySelector('[data-active="true"]');
      if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 30);
  };

  const onBodyTouchStart = (e) => {
    if (editing) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDeltaX.current = 0;
  };
  const onBodyTouchMove = (e) => {
    if (editing || touchStartX.current == null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const onBodyTouchEnd = (e) => {
    if (editing || touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchDeltaX.current = 0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goToTab(dx < 0 ? 1 : -1);
    }
  };

  // Open a specific devotee's profile when navigated here from another screen.
  useEffect(() => {
    if (!openDevoteeId) return;
    const d = dataService.getDevotees().find((x) => x.id === openDevoteeId);
    if (d) openProfile(d);
    onClearOpenDevotee?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDevoteeId]);

  const startEdit = () => {
    const seed = {}; ALL_FIELDS.forEach(([f]) => seed[f] = selectedDevotee[f] ?? '');
    seed.type = selectedDevotee.type ?? ''; // membership is derived via the family-role block, not a visible field
    setEditData(seed);
    const mob = String(selectedDevotee.mobile || '');
    const wa = String(selectedDevotee.whatsapp || '');
    setWhatsappSameAsMobile(Boolean(mob && wa === mob));
    setEditing(true);
  };

  const buildSavePayload = () => {
    const payload = { ...editData };
    READ_ONLY_FIELDS.forEach((f) => { delete payload[f]; });
    payload.id = selectedDevotee.id;
    payload.familyId = editData.familyId ?? selectedDevotee.familyId;
    if (whatsappSameAsMobile) payload.whatsapp = payload.mobile ?? selectedDevotee.mobile;
    payload.name = [payload.firstName, payload.middleName, payload.lastName].filter(Boolean).join(' ')
      || selectedDevotee.name;
    return payload;
  };

  const saveEdit = async () => {
    setSaving(true);
    const displayName = buildSavePayload().name;
    try {
      const updated = await dataService.updateDevoteeAndSync(selectedDevotee.id, buildSavePayload());
      setSelectedDevotee(updated);
      setEditing(false);
      loadDevotees();
      await alertDevoteeSaved(displayName);
    } catch (err) {
      loadDevotees();
      await alertDevoteeSaveFailed(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleProfileTag = (key, nextOn) => {
    const exclusiveKeys = nextOn ? getMutuallyExclusiveKeys(key) : [];
    const updated = dataService.setDevoteeTag(selectedDevotee.id, key, nextOn, exclusiveKeys);
    if (updated) setSelectedDevotee(updated);
    loadDevotees();
  };

  const handleDelete = (id) => {
    if (window.confirm('Delete this devotee record?')) { dataService.deleteDevotee(id); loadDevotees(); setSelectedDevotee(null); }
  };

  const val = (v, fieldKey) => {
    if (v === undefined || v === null || v === '') return '—';
    if (fieldKey === 'type') return formatFamilyRecordType(v);
    return v;
  };

  const inputCls = 'w-full rounded-xl border border-border-light p-2 text-sm font-semibold text-text-main outline-none focus:border-primary';

  // Smart field renderer for edit mode — dropdowns, datalist, textarea, date, tel as appropriate
  const renderEditField = (f, data, setData) => {
    // Family Head picker. "Self" means this person heads their own family (Primary);
    // choosing someone else makes this person a Family member under them. The old
    // separate "Family membership" field is gone — membership is derived here.
    if (f === 'familyId') {
      const ownId = selectedDevotee?.id;
      const isSelf = data.type === 'Primary';
      const selectValue = isSelf ? '__self__' : (data.familyId || '');
      return (
        <div>
          <select value={selectValue} onChange={(e) => {
            const v = e.target.value;
            if (v === '__self__') {
              setData({ ...data, type: 'Primary', relation: 'Self', familyId: data.familyId || ownId || '' });
            } else if (v === '') {
              setData({ ...data, familyId: '', type: '' });
            } else {
              setData({ ...data, familyId: v, type: 'Family', relation: data.relation === 'Self' ? '' : data.relation });
            }
          }} className={inputCls + ' bg-surface'}>
            <option value="__self__">★ This person is the family head (Self)</option>
            <option value="">— Not linked yet —</option>
            {familyHeads.filter(h => h.id !== ownId).map(h => (
              <option key={h.familyId} value={h.familyId}>{h.name}{h.area ? ` — ${h.area}` : ''}</option>
            ))}
          </select>
          <p className="mt-1 text-[10px] font-semibold text-text-muted">
            Pick <strong>Self</strong> if this person heads their own family (they become the primary member). Otherwise choose the head they live under — that makes them a family member, and you can set their relation below.
          </p>
        </div>
      );
    }
    if (READ_ONLY_FIELDS.has(f)) {
      return (
        <div className="rounded-xl border border-border-light bg-bg-base px-3 py-2 text-sm font-semibold text-text-main break-words">
          {val(data[f], f)}
        </div>
      );
    }
    const value = data[f] ?? '';
    const onChange = (e) => {
      const next = e.target.value;
      if (f === 'mobile' && whatsappSameAsMobile) {
        setData({ ...data, mobile: next, whatsapp: next });
      } else {
        setData({ ...data, [f]: next });
      }
    };
    const options = FIELD_OPTIONS[f];

    // Dropdown with manual entry fallback
    if (COMBO_FIELDS.has(f)) {
      const listOptions = f === 'followupKaryakarta' ? karyakartaOptions : f === 'reference' ? uniqueReferences : (FIELD_OPTIONS[f] || []);
      const isManual = manualOverride[f];
      // Selecting a follow-up karyakarta also auto-fills their mobile from the Devotees tab.
      const comboOnChange = f === 'followupKaryakarta'
        ? (e) => { const name = e.target.value; setData({ ...data, followupKaryakarta: name, followupKaryakartaMobile: karyakartaMobileFor(name) || data.followupKaryakartaMobile || '' }); }
        : onChange;
      return (
        <div>
          {isManual ? (
            <input value={value} onChange={comboOnChange} className={inputCls} placeholder="Type manually..." />
          ) : (
            <select value={value} onChange={comboOnChange} className={inputCls + ' bg-surface'}>
              <option value="">- Select -</option>
              {listOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5 mt-1.5 text-[10px] font-bold text-text-muted cursor-pointer hover:text-text-main">
            <input type="checkbox" checked={!!isManual} onChange={(e) => {
               setManualOverride({...manualOverride, [f]: e.target.checked});
               if (!e.target.checked && value && !listOptions.includes(value)) {
                 setData({ ...data, [f]: '' });
               }
            }} className="rounded focus:ring-primary" />
            If not listed then tick here
          </label>
        </div>
      );
    }
    // Pure select dropdown
    if (options) {
      const labelFor = (o) => (f === 'type' ? formatFamilyRecordType(o) : o);
      return (
        <select value={value} onChange={onChange} className={inputCls + ' bg-surface'}>
          <option value="">— Select —</option>
          {options.map(o => <option key={o} value={o}>{labelFor(o)}</option>)}
        </select>
      );
    }
    // Textarea fields (auto-grow; no trimming)
    if (TEXTAREA_FIELDS.has(f)) {
      return (
        <AutoResizeTextarea
          value={value}
          onChange={onChange}
          minRows={f === 'address' ? 3 : 2}
          className={inputCls}
        />
      );
    }
    // Date fields
    if (f === 'dob' || f === 'anniversary' || f === 'dateOfJoining') {
      return <input type="date" value={value} onChange={onChange} className={inputCls} />;
    }
    // Tel fields
    if (f === 'mobile' || f === 'whatsapp' || f === 'secondaryMobile' || f === 'followupKaryakartaMobile') {
      const onTelChange = (e) => {
        const next = e.target.value.replace(/\D/g, '');
        if (f === 'mobile' && whatsappSameAsMobile) setData({ ...data, mobile: next, whatsapp: next });
        else setData({ ...data, [f]: next });
      };
      return (
        <div className="space-y-1">
          <input
            type="tel"
            inputMode="numeric"
            value={value}
            onChange={onTelChange}
            disabled={f === 'whatsapp' && whatsappSameAsMobile}
            className={inputCls + (f === 'whatsapp' && whatsappSameAsMobile ? ' bg-bg-base opacity-80' : '')}
          />
          {f === 'whatsapp' && (
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted cursor-pointer hover:text-text-main w-fit">
              <input type="checkbox" checked={whatsappSameAsMobile} onChange={(e) => {
                setWhatsappSameAsMobile(e.target.checked);
                if (e.target.checked) setData(prev => ({ ...prev, whatsapp: prev.mobile }));
              }} className="rounded text-text-main focus:ring-[#003158]" />
              Same as mobile
            </label>
          )}
        </div>
      );
    }
    // Email
    if (f === 'email') {
      return <input type="email" value={value} onChange={onChange} className={inputCls} />;
    }
    // Default text
    return <input type="text" value={value} onChange={onChange} className={inputCls} />;
  };

  // Family role editor (replaces the separate Family Head + Relation + membership
  // fields). Self = head of own family → relation/head are implied and hidden.
  const renderFamilyRoleEdit = () => {
    const data = editData, setData = setEditData;
    const ownId = selectedDevotee?.id;
    const isSelf = data.type === 'Primary';
    return (
      <div className="sm:col-span-2 rounded-2xl border border-border-light bg-bg-base p-4 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Family role</div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button"
            onClick={() => setData({ ...data, type: 'Primary', relation: 'Self', familyId: data.familyId || ownId || '' })}
            className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${isSelf ? 'border-primary bg-primary text-white shadow-sm' : 'border-border-light bg-surface text-text-main hover:border-primary'}`}>
            ★ Head of own family
          </button>
          <button type="button"
            onClick={() => setData({ ...data, type: 'Family', relation: data.relation === 'Self' ? '' : data.relation })}
            className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${!isSelf ? 'border-primary bg-primary text-white shadow-sm' : 'border-border-light bg-surface text-text-main hover:border-primary'}`}>
            Member of a family
          </button>
        </div>
        {isSelf ? (
          <p className="text-[11px] font-semibold text-text-muted">This person is the head of their own family — relation and family head are set automatically.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Family Head</div>
              <FamilyHeadPicker
                heads={familyHeads.filter(h => h.id !== ownId)}
                value={data.familyId || ''}
                onChange={(fid) => setData({ ...data, familyId: fid, ...(fid ? inheritFromHead(fid, data) : {}) })}
                inputCls={inputCls}
              />
              <p className="mt-1 text-[10px] font-semibold text-text-muted">Choosing a head copies the family's address and follow-up karyakarta onto this member.</p>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Relation to family head</div>
              <select value={data.relation || ''} onChange={(e) => setData({ ...data, relation: e.target.value })} className={inputCls + ' bg-surface'}>
                <option value="">— Select —</option>
                {RELATIONS.filter(r => r !== 'Self').map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFamilyRoleView = () => {
    const d = selectedDevotee;
    const isSelf = d.type === 'Primary';
    return (
      <div className="sm:col-span-2 rounded-2xl border border-border-light bg-bg-base p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Family role</div>
        {isSelf ? (
          <p className="text-sm font-bold text-text-main">★ Head of their own family</p>
        ) : d.familyId ? (
          <div className="text-sm font-semibold text-text-main">
            <p>Member of <span className="text-primary font-bold">{familyHeadLabel(d.familyId)}</span>'s family</p>
            {d.relation && <p className="mt-0.5 text-xs text-text-muted">Relation: {d.relation}</p>}
          </div>
        ) : (
          <p className="text-sm font-semibold text-text-muted">Not linked to a family yet</p>
        )}
      </div>
    );
  };


  // Auto-open own profile for Devotee login
  useEffect(() => {
    if (isDevotee && user?.devoteeId && filteredDevotees.length > 0 && !selectedDevotee) {
      const own = filteredDevotees.find(d => d.id === user.devoteeId) || filteredDevotees[0];
      if (own) openProfile(own);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevotee, filteredDevotees.length]);

  return (
    <div className="w-full max-w-none px-4 py-6 sm:px-6 space-y-6">

      {/* Devotee mode — limited view banner */}
      {isDevotee && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
          <User className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-bold text-text-main">My Family Profile</p>
            <p className="text-xs text-text-muted">You can view and edit your profile and your family members' profiles.</p>
          </div>
        </div>
      )}

      {!isDevotee && (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Devotee Directory</h1>
          <p className="text-sm font-medium text-text-muted">
            {filteredDevotees.length === devotees.length
              ? `${devotees.length} members`
              : `${filteredDevotees.length} of ${devotees.length} members`}
            {' '}· view profiles, edit details, generate QR passes.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => { setFormData(blankForm); setShowAddModal(true); }}
            className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#00223f]">
            <Plus className="h-4 w-4" /> Add New Devotee
          </button>
        )}
      </div>
      )}

      {!isDevotee && (<>
      {presetMeta && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-xs font-bold text-text-main">{presetMeta.banner}</p>
          {onClearDevoteesPreset && (
            <button
              type="button"
              onClick={() => { onClearDevoteesPreset(); setSelectedTags([]); setShowTagFilter(false); }}
              className="text-xs font-bold text-[#FF862A] hover:underline"
            >
              Clear dashboard filter
            </button>
          )}
        </div>
      )}

      <div className="sticky top-[64px] z-30 bg-bg-base pt-2 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pt-0 border-b sm:border-0 border-border-light shadow-sm sm:shadow-none mb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-text-muted" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, DOB (dd-MM-yyyy) or mobile"
              className="w-full rounded-2xl border border-border-light bg-surface pl-10 pr-10 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary dark:focus:border-primary-hover" />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} title="Clear search"
                className="absolute right-2.5 top-1.5 grid h-7 w-7 place-items-center rounded-full text-text-muted hover:bg-bg-base hover:text-text-main">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowTagFilter((s) => !s)}
              className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold ' +
                (anyFilterActive ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-main hover:bg-bg-base')}>
              <Filter className="h-4 w-4" /> Filters{anyFilterActive ? ' (Active)' : ''}
            </button>
            <button onClick={() => setShowTags((s) => !s)}
              className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold ' +
                (selectedTags.length ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-main hover:bg-bg-base')}>
              Tags{selectedTags.length ? ` (${selectedTags.length})` : ''}
            </button>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} title="Sort"
              className={'rounded-2xl border px-3 py-2.5 text-sm font-bold outline-none ' +
                (sortBy ? 'border-primary bg-primary/5 text-text-main' : 'border-border-light bg-surface text-text-muted')}>
              <option value="">Sort: Default</option>
              <option value="name">Name (A–Z)</option>
              <option value="joinedDesc">Recently joined</option>
              <option value="joinedAsc">Oldest joined</option>
            </select>
            
            <div className="flex gap-2">
               <button onClick={() => {
                 const now = new Date();
                 const dateStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
                 const filterDesc = searchQuery ? `Search: "${searchQuery}"` : selectedTags.length ? `Tags: ${selectedTags.join(', ')}` : filterKaryakartas.length ? `Karyakarta: ${filterKaryakartas.join(', ')}` : familyFilter ? `Family: ${familyFilter}` : 'All Devotees';
                 const rows = filteredDevotees.map((d, i) => `
                   <tr>
                     <td>${i + 1}</td>
                     <td>${d.id || ''}</td>
                     <td class="name">${d.name || ''}</td>
                     <td>${d.mobile || ''}</td>
                     <td>${d.area || ''}</td>
                     <td>${d.gender || ''}</td>
                     <td>${d.dob ? d.dob.replace(/(\d{4})-(\d{2})-(\d{2})/, '$3-$2-$1') : ''}</td>
                     <td>${d.bloodGroup || ''}</td>
                     <td>${d.yuvakType || ''}</td>
                     <td>${d.followupKaryakarta || ''}</td>
                     <td>${Array.isArray(d.tags) && d.tags.length ? d.tags.map(k => tagLabel(k)).join(', ') : ''}</td>
                   </tr>`).join('');
                 const win = window.open('', '_blank');
                 win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Akshar Connect – Devotee Directory</title><style>
                   *{margin:0;padding:0;box-sizing:border-box}
                   body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#111;background:#fff;padding:16px}
                   .header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #003158;padding-bottom:10px;margin-bottom:12px}
                   .header-left h1{font-size:16px;font-weight:700;color:#003158}
                   .header-left p{font-size:9px;color:#555;margin-top:2px}
                   .header-right{text-align:right;font-size:9px;color:#555}
                   .meta{display:flex;gap:20px;margin-bottom:10px;font-size:9px;color:#444;background:#f4f7fb;padding:6px 10px;border-radius:6px}
                   .meta strong{color:#003158}
                   table{width:100%;border-collapse:collapse;font-size:9px}
                   thead tr{background:#003158;color:#fff}
                   thead th{padding:6px 5px;text-align:left;font-weight:600;white-space:nowrap}
                   tbody tr:nth-child(even){background:#f4f7fb}
                   tbody tr:hover{background:#e8eff8}
                   td{padding:5px 5px;border-bottom:1px solid #e4eaf3;vertical-align:top}
                   td.name{font-weight:600;color:#003158}
                   .footer{margin-top:14px;border-top:1px solid #ddd;padding-top:8px;display:flex;justify-content:space-between;font-size:8px;color:#888}
                   @page{margin:14mm 10mm;size:A4 landscape}
                   @media print{body{padding:0}}
                 </style></head><body>
                   <div class="header">
                     <div class="header-left">
                       <h1>Akshar Connect — Devotee Directory</h1>
                       <p>Adajan Satsang Mandal · Swaminarayan Hariprabodham Foundation, Adajan, Surat</p>
                     </div>
                     <div class="header-right">Printed: ${dateStr}<br/>Jai Swaminarayan 🙏</div>
                   </div>
                   <div class="meta"><span><strong>Filter:</strong> ${filterDesc}</span><span><strong>Total:</strong> ${filteredDevotees.length} devotees</span></div>
                   <table>
                     <thead><tr>
                       <th>#</th><th>ID</th><th>Name</th><th>Mobile</th><th>Area</th>
                       <th>Gender</th><th>DOB</th><th>Blood</th><th>Type</th><th>Karyakarta</th><th>Tags</th>
                     </tr></thead>
                     <tbody>${rows}</tbody>
                   </table>
                   <div class="footer"><span>Akshar Connect · akshar-connect.web.app</span><span>Confidential — for internal satsang use only</span></div>
                   <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script>
                 </body></html>`);
                 win.document.close();
               }} title="Print / PDF" className="flex items-center justify-center p-2.5 rounded-2xl border border-border-light bg-surface text-text-main hover:bg-bg-base transition-colors">
                 <Printer className="h-4 w-4" />
               </button>
               <button onClick={async () => {
                  // Real .xlsx so it opens straight in Google Sheets / Excel (incl. mobile).
                  const XLSX = await import('xlsx');
                  const data = filteredDevotees.map(d => {
                    const age = deriveAge(d.dob);
                    return {
                      'ID': d.id || '',
                      'Name': d.name || '',
                      'Mobile': d.mobile || '',
                      'WhatsApp': d.whatsapp || '',
                      'DOB': d.dob ? d.dob.replace(/(\d{4})-(\d{2})-(\d{2})/, '$3-$2-$1') : '',
                      'Age': age === '' ? '' : age,
                      'Area': d.area || '',
                      'Reference': d.reference || '',
                      'Karyakarta': d.followupKaryakarta || '',
                      'Qualification': d.qualification || '',
                      'Gender': d.gender || '',
                      'Membership': d.type || '',
                    };
                  });
                  const ws = XLSX.utils.json_to_sheet(data);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Devotees');
                  XLSX.writeFile(wb, `Devotees_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
               }} title="Export to Excel" className="flex items-center justify-center gap-2 rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-bold text-text-main hover:bg-bg-base transition-colors">
                 <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
               </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Filter Panel */}
      {showTagFilter && (
        <div className="rounded-2xl border border-border-light bg-surface shadow-sm p-4 space-y-4 animate-slide-up">
          {/* Multi-select filter dropdowns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2">
            <MultiSelect label="All Areas" options={uniqueAreas} selected={filterAreas} onChange={setFilterAreas} />
            <MultiSelect label="All Karyakartas" options={uniqueKaryakartas.map(k => ({ value: k, label: firstLastName(k) }))} selected={filterKaryakartas} onChange={setFilterKaryakartas} />
            <MultiSelect label="All References" options={uniqueReferences} selected={filterReferences} onChange={setFilterReferences} />
            <MultiSelect label="All Qualifications" options={QUALIFICATIONS} selected={filterQualifications} onChange={setFilterQualifications} />
            <MultiSelect label="All Ages" options={Object.entries(AGE_BANDS).map(([key, b]) => ({ value: key, label: b.label }))} selected={filterAges} onChange={setFilterAges} />
            <MultiSelect label="All Genders" options={['Male', 'Female']} selected={filterGenders} onChange={setFilterGenders} />
            <MultiSelect label="All Members" options={[{ value: 'Primary', label: 'Family Heads (Self)' }, { value: 'Family', label: 'Family Members' }]} selected={filterTypes} onChange={setFilterTypes} />
            <MultiSelect label="All (Old/Ref/New)" options={['Old', 'Reference', 'New']} selected={filterOldNews} onChange={setFilterOldNews} />
          </div>

          {/* Clear all */}
          {anyFilterActive ? (
            <button onClick={() => { setFilterAreas([]); setFilterKaryakartas([]); setFilterReferences([]); setFilterQualifications([]); setFilterAges([]); setFilterGenders([]); setFilterTypes([]); setFilterOldNews([]); }}
              className="text-xs font-bold text-red-500 hover:underline">
              Clear all filters
            </button>
          ) : null}
        </div>
      )}

      {/* Tags filter — separate toggle-able section (not part of Filters) */}
      {showTags && (
        <div className="rounded-2xl border border-border-light bg-surface shadow-sm p-4 space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Filter by tags — showing devotees with ANY selected tag</p>
            {selectedTags.length > 0 && (
              <button onClick={() => setSelectedTags([])} className="text-xs font-bold text-red-500 hover:underline">Clear tags</button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tagsByCategory().flatMap(({ tags }) => tags).map((t) => {
              const active = selectedTags.includes(t.key);
              return (
                <button key={t.key} onClick={() => toggleFilterTag(t.key)}
                  style={active ? tagChipStyle(t.key) : undefined}
                  className={'rounded-full px-3 py-1 text-[11px] font-bold border transition-all ' +
                    (active ? '' : 'border-border-light bg-bg-base text-text-muted hover:border-primary/50 hover:text-text-main')}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectMode && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 animate-slide-up">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-text-main">{selectedIds.size} selected</span>
            <button onClick={() => {
              if (selectedIds.size === filteredDevotees.length) setSelectedIds(new Set());
              else setSelectedIds(new Set(filteredDevotees.map(d => d.id)));
            }} className="text-xs font-bold text-primary hover:underline">
              {selectedIds.size === filteredDevotees.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>
      )}

      
      {filterKaryakartas.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-2.5 mb-2 animate-slide-up">
          <p className="text-sm font-bold text-text-main flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">Karyakarta: {filterKaryakartas.join(', ')}</span>
          </p>
          <div className="flex items-center gap-2 text-xs font-bold text-text-main shrink-0">
            <span className="bg-surface px-2 py-1 rounded-md border border-border-light shadow-sm">{filteredDevotees.length} Devotees</span>
            <span className="bg-surface px-2 py-1 rounded-md border border-border-light shadow-sm">{new Set(filteredDevotees.map(d => d.familyId || d.id)).size} Families</span>
            <button onClick={() => setFilterKaryakartas([])} className="text-red-500 hover:bg-red-50 px-2 py-1 rounded-md ml-1 transition-colors">Clear</button>
          </div>
        </div>
      )}

      {familyFilter && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-[#EAF0F7] px-4 py-2.5">
          <p className="text-sm font-bold text-text-main flex items-center gap-2 min-w-0">
            <Users className="h-4 w-4 shrink-0" />
            <span className="truncate">{familyName}'s family · {filteredDevotees.length} members</span>
          </p>
          <button onClick={() => setFamilyFilter(null)} className="text-xs font-bold text-[#FF862A] hover:underline shrink-0">
            Back to all
          </button>
        </div>
      )}

      <p className="text-xs font-semibold text-text-muted">
        Showing {filteredDevotees.length}{isPlainBrowse ? ' family heads (open a family to see its members)' : ' devotees'}
      </p>
      </>)}

      {refreshing ? (
        <ListSkeleton count={6} />
      ) : filteredDevotees.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredDevotees.map((devotee) => {
            const expanded = expandedCard === devotee.id;
            const stop = (e) => e.stopPropagation();
            const Row = ({ icon: Icon, color, text, title, clamp }) => (
              <p className="text-[11.5px] text-slate-600 flex items-start gap-2" title={title || text}>
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md ${color}`}><Icon className="h-2.5 w-2.5" /></span>
                <span className={clamp ? 'line-clamp-2' : 'truncate'}>{text}</span>
              </p>
            );
            return (
            <div key={devotee.id}
              onClick={() => {
              if (selectMode) {
                const newSet = new Set(selectedIds);
                if (newSet.has(devotee.id)) newSet.delete(devotee.id);
                else newSet.add(devotee.id);
                setSelectedIds(newSet);
              } else {
                openProfile(devotee);
              }
            }}
              className={`relative group flex flex-col rounded-3xl border p-4 sm:p-5 shadow-[0_1px_3px_rgba(16,40,80,0.05)] transition-all duration-200 cursor-pointer hover:-translate-y-0.5 ${selectedIds.has(devotee.id) ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border-light bg-surface hover:border-primary/30 hover:shadow-[0_10px_28px_rgba(16,40,80,0.12)]'}`}>
              {selectMode && (
                <div className="absolute top-4 right-4 z-10">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-md border ${selectedIds.has(devotee.id) ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface'}`}>
                    {selectedIds.has(devotee.id) && <CheckSquare className="h-4 w-4" />}
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3.5">
                <img src={devotee.photo || devotee.avatar || 'https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name='+encodeURIComponent(devotee.name||'?')}
                  alt={devotee.name} className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-2xl object-cover ring-2 ring-[#EAF0F7] group-hover:ring-[#003158]/20 transition" />
                <div className="min-w-0 flex-1">
                  {devotee.wing && <span className="text-[9.5px] font-bold text-accent uppercase tracking-wider block mb-0.5">{devotee.wing}</span>}
                  <h3 className="text-[15px] font-bold text-text-main leading-tight truncate">{devotee.name}</h3>

                  {/* First-glance priority: contact, full address, DOB, karyakarta */}
                  <div className="mt-2 space-y-1.5">
                    <Row icon={Phone} color="bg-sky-50 text-sky-600" text={val(devotee.mobile)} />
                    {devotee.address && <Row icon={Home} color="bg-slate-100 text-slate-500" text={devotee.address} clamp />}
                    {devotee.dob && <Row icon={Calendar} color="bg-purple-50 text-purple-600" text={dobShort(devotee.dob)} title={`DOB: ${dobShort(devotee.dob)}`} />}
                    {devotee.followupKaryakarta && <Row icon={User} color="bg-blue-50 text-blue-600" text={devotee.followupKaryakarta} title={`Follow-up Karyakarta: ${devotee.followupKaryakarta}`} />}
                  </div>

                  {Array.isArray(devotee.tags) && devotee.tags.length > 0 && (() => {
                    const tagsOpen = tagsExpandedId === devotee.id;
                    const shown = tagsOpen ? devotee.tags : devotee.tags.slice(0, 3);
                    return (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {shown.map((key) => (
                          <span key={key} style={tagChipStyle(key)} className="rounded-full px-2 py-0.5 text-[10px] font-bold">{tagLabel(key)}</span>
                        ))}
                        {devotee.tags.length > 3 && (
                          <button onClick={(e) => { stop(e); setTagsExpandedId(tagsOpen ? null : devotee.id); }}
                            title={tagsOpen ? 'Show fewer tags' : 'Show all tags'}
                            className="rounded-full bg-bg-base px-2 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/10 border border-transparent hover:border-primary/30">
                            {tagsOpen ? 'Show less' : `+${devotee.tags.length - 3}`}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Expanded inline details — same Row style as above, aligned under the avatar */}
              {expanded && (
                <div className="flex gap-3.5 animate-slide-up mt-1">
                  {/* Spacer aligns content under the text column, matching avatar width */}
                  <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0" />
                  <div className="flex-1 min-w-0 border-t border-border-light pt-2.5 space-y-1.5">
                    {[devotee.area, devotee.city].filter(Boolean).length > 0 && (
                      <Row icon={MapPin} color="bg-slate-100 text-slate-500" text={[devotee.area, devotee.city].filter(Boolean).join(', ')} />
                    )}
                    {devotee.gender && <Row icon={User} color="bg-slate-100 text-slate-500" text={devotee.gender} />}
                    {(devotee.profession || devotee.education) && (
                      <Row icon={Briefcase} color="bg-amber-50 text-amber-500" text={[devotee.profession, devotee.education].filter(Boolean).join(' · ')} />
                    )}
                    {devotee.bloodGroup && <Row icon={Droplet} color="bg-red-50 text-red-400" text={devotee.bloodGroup} />}
                    {devotee.yuvakType && <Row icon={GraduationCap} color="bg-emerald-50 text-emerald-500" text={devotee.yuvakType} />}
                    {devotee.followupKaryakartaMobile && <Row icon={Phone} color="bg-blue-50 text-blue-500" text={`Karyakarta: ${devotee.followupKaryakartaMobile}`} />}
                    {devotee.reference && <Row icon={Users} color="bg-slate-100 text-slate-500" text={`Ref: ${devotee.reference}`} />}
                  </div>
                </div>
              )}

              <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10.5px] font-bold text-text-main bg-bg-base px-2 py-1 rounded-full shrink-0 border border-border-light">{devotee.id}</span>
                  {!familyFilter && devotee.familyId && familySizes[devotee.familyId] > 1 && (
                    <button onClick={(e) => { stop(e); setFamilyFilter(devotee.familyId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      title="View family members"
                      className="flex items-center gap-1 rounded-full bg-[#EAF0F7] px-2 py-1 text-[10.5px] font-bold text-text-main hover:bg-[#dbe6f2] shrink-0 dark:bg-surface dark:hover:bg-bg-base border border-border-light">
                      <Users className="h-3 w-3" /> {familySizes[devotee.familyId]}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={(e) => { stop(e); setExpandedCard(expanded ? null : devotee.id); }} title={expanded ? 'Show less' : 'Quick details'}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-bg-base text-text-main hover:bg-[#E4EBF3] dark:hover:bg-surface border border-transparent hover:border-border-light">
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                  <button onClick={(e) => { stop(e); setQrModalDevotee(devotee); }} title="QR Pass" className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-accent hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900 border border-transparent"><QrCode className="h-4 w-4" /></button>
                  <button onClick={(e) => { stop(e); openProfile(devotee); }} className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-hover shadow-sm transition-colors border border-transparent">Profile</button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <EmptyState 
          icon={Search} 
          title="No devotees found" 
          description={searchQuery || selectedTags.length ? "Try adjusting your search query or filters." : "Your directory is empty."}
        />
      )}

      {/* Add Devotee — multi-step wizard */}
      {showAddModal && (
        <AddDevoteeWizard
          user={user}
          devotees={devotees}
          familyHeads={familyHeads}
          karyakartaOptions={karyakartaOptions}
          karyakartaMobileFor={karyakartaMobileFor}
          referenceOptions={referenceOptions}
          headRecordByFamilyId={headRecordByFamilyId}
          onClose={() => setShowAddModal(false)}
          onCreated={(created) => { setShowAddModal(false); loadDevotees(); if (created) openProfile(created); }}
        />
      )}

      

      {/* Profile — FULL-SCREEN (not a popup): the most-used view, so it fills the
          screen for easy reading and traversal. Portal to document.body to escape
          main's animation stacking context; iOS safe areas respected. */}
      {selectedDevotee && createPortal(
        <div
          className="fixed inset-0 z-[60] bg-bg-base animate-[acFade_.18s_ease-out] flex flex-col"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
          /* React portals bubble events through the component tree, so stop touch
             events here — otherwise they reach App's pull-to-refresh handler and a
             stray gesture (e.g. while typing) can remount the page and drop you out
             of the profile/edit screen. */
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div
            className="w-full flex-1 min-h-0 bg-surface relative flex flex-col overflow-hidden animate-[acPop_.22s_cubic-bezier(0.16,1,0.3,1)]"
          >
            <style>{`
              @keyframes acSlideL{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:translateX(0)}}
              @keyframes acSlideR{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:translateX(0)}}
              @keyframes acFade{from{opacity:0}to{opacity:1}}
              @keyframes acPop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
              /* Interesting save loader: staggered bouncing beads + light sweep */
              @keyframes acBead{0%,80%,100%{transform:translateY(0) scale(.6);opacity:.45}40%{transform:translateY(-5px) scale(1);opacity:1}}
              @keyframes acSweep{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
              .ac-beads{display:inline-flex;align-items:center;gap:4px}
              .ac-beads i{width:6px;height:6px;border-radius:9999px;background:#fff;display:block;animation:acBead 1s infinite ease-in-out}
              .ac-beads i:nth-child(2){animation-delay:.16s}
              .ac-beads i:nth-child(3){animation-delay:.32s}
              .ac-sweep{position:absolute;inset:0;background:linear-gradient(100deg,transparent 20%,rgba(255,255,255,.28) 50%,transparent 80%);animation:acSweep 1.15s infinite}
            `}</style>

            {/* Floating close — stays visible while the whole profile (header included) scrolls */}
            <button onClick={() => { setSelectedDevotee(null); setEditing(false); }}
              className="absolute right-4 z-30 grid h-9 w-9 place-items-center rounded-full bg-black/25 text-white hover:bg-black/45 backdrop-blur-sm transition-colors"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
              <X className="h-5 w-5" />
            </button>

            {/* Everything scrolls — nothing is pinned */}
            <div className="flex-1 min-h-0 overflow-y-auto bg-bg-base">
            {/* Header: cover banner, overlapping avatar, headline, quick actions */}
            <div className="relative border-b border-border-light">

              {/* Cover */}
              <div className="h-24 sm:h-28 bg-gradient-to-br from-primary via-[#013a6b] to-[#00223f]" />

              <div className="px-5 sm:px-7 pb-4">
                {/* Avatar overlapping the cover */}
                <img src={selectedDevotee.photo || selectedDevotee.avatar || 'https://ui-avatars.com/api/?background=003158&color=ffffff&bold=true&size=128&name=' + encodeURIComponent(selectedDevotee.name || '?')}
                  alt={selectedDevotee.name}
                  className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-cover ring-4 ring-surface shadow-lg bg-surface -mt-10 sm:-mt-12" />

                <h2 className="mt-2 text-xl sm:text-2xl font-black text-text-main leading-tight break-words">{selectedDevotee.name}</h2>
                {(() => {
                  const age = deriveAge(selectedDevotee.dob);
                  const headline = [selectedDevotee.yuvakType, selectedDevotee.professionField || selectedDevotee.profession, age !== '' ? `${age} yrs` : '']
                    .filter(Boolean).join('  ·  ');
                  return headline ? <p className="mt-0.5 text-sm font-semibold text-text-muted">{headline}</p> : null;
                })()}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {selectedDevotee.type && (
                    <span className="text-[10px] sm:text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full" title="Family membership">
                      {selectedDevotee.type === 'Primary' ? 'Head of family' : 'Family member'}
                    </span>
                  )}
                  {selectedDevotee.area && <span className="text-[10px] sm:text-[11px] font-semibold text-text-muted bg-bg-base border border-border-light px-2.5 py-1 rounded-full">{selectedDevotee.area}</span>}
                  <span className="text-[10px] sm:text-[11px] font-bold text-text-muted bg-bg-base border border-border-light px-2.5 py-1 rounded-full">{selectedDevotee.id}</span>
                </div>

                {/* Quick actions */}
                {val(selectedDevotee.mobile) !== '—' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={`tel:${selectedDevotee.mobile}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#00223f] transition-colors">
                      <Phone className="h-3.5 w-3.5" /> Call
                    </a>
                    <a href={`https://wa.me/${String(selectedDevotee.whatsapp || selectedDevotee.mobile).replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}`}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border-light bg-surface px-4 py-2 text-xs font-bold text-text-main hover:border-primary transition-colors">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp
                    </a>
                  </div>
                )}

                {/* Key satsang-contact info */}
                <div className="mt-3 space-y-1.5">
                  {selectedDevotee.mobile && (
                    <div className="flex items-start gap-2 text-xs sm:text-sm text-text-muted">
                      <Phone className="h-4 w-4 mt-0.5 shrink-0 text-primary/70" /><span className="font-semibold break-words">{selectedDevotee.mobile}</span>
                    </div>
                  )}
                  {selectedDevotee.address && (
                    <div className="flex items-start gap-2 text-xs sm:text-sm text-text-muted">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary/70" /><span className="font-semibold break-words">{selectedDevotee.address}</span>
                    </div>
                  )}
                  {selectedDevotee.followupKaryakarta && (
                    <div className="flex items-start gap-2 text-xs sm:text-sm text-text-muted">
                      <User className="h-4 w-4 mt-0.5 shrink-0 text-primary/70" /><span className="font-semibold break-words"><span className="text-text-muted/70">Karyakarta:</span> {selectedDevotee.followupKaryakarta}</span>
                    </div>
                  )}
                  {selectedDevotee.reference && (
                    <div className="flex items-start gap-2 text-xs sm:text-sm text-text-muted">
                      <UserCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary/70" /><span className="font-semibold break-words"><span className="text-text-muted/70">Reference:</span> {selectedDevotee.reference}</span>
                    </div>
                  )}
                </div>

                {/* Key facts strip */}
                <div className="mt-3 grid grid-cols-3 gap-2 max-w-md">
                  {[
                    ['Age', deriveAge(selectedDevotee.dob) === '' ? '—' : `${deriveAge(selectedDevotee.dob)} yrs`],
                    ['Gender', selectedDevotee.gender || '—'],
                    ['DOB', selectedDevotee.dob ? selectedDevotee.dob.replace(/(\d{4})-(\d{2})-(\d{2})/, '$3-$2-$1') : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-border-light bg-bg-base px-2 py-2 text-center">
                      <p className="text-xs sm:text-sm font-extrabold text-text-main truncate">{v}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted">{k}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Body — section cards (continues the same scroll as the header) */}
              <div className="w-full p-3 sm:p-4 space-y-3">
                {PROFILE_SECTION_ORDER.map((sec) => {
                  // ── Family members card ──
                  if (sec === 'Family') {
                    return (
                      <div key="Family" className="rounded-2xl border border-border-light bg-surface p-4 sm:p-5 shadow-xs">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-black text-text-main">Family <span className="text-text-muted font-bold">· {familyMembers.length}</span></h3>
                          <span className="font-mono text-[10px] font-bold text-text-muted bg-bg-base border border-border-light rounded-lg px-2 py-0.5">ID: {selectedDevotee.familyId || '—'}</span>
                        </div>
                        <div className="space-y-2">
                          {familyMembers.map((m) => {
                            const mAge = deriveAge(m.dob);
                            const isThis = m.id === selectedDevotee.id;
                            return (
                              <button key={m.id} onClick={() => { if (!isThis) openProfile(m); }}
                                className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${isThis ? 'border-primary bg-primary/5 cursor-default' : 'border-border-light bg-surface hover:border-primary/40 hover:shadow-sm'}`}>
                                <img src={m.photo || m.avatar || 'https://ui-avatars.com/api/?background=EAF0F7&color=003158&bold=true&name=' + encodeURIComponent(m.name || '?')}
                                  alt={m.name} className="h-11 w-11 rounded-xl object-cover border border-border-light shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold text-text-main truncate">
                                    {m.name}{isThis && <span className="ml-1.5 text-[10px] font-bold text-primary">(this profile)</span>}
                                  </p>
                                  <p className="text-xs font-semibold text-text-muted truncate">
                                    {m.type === 'Primary' ? '★ Head of family' : (m.relation || 'Member')}{mAge !== '' ? ` · ${mAge} yrs` : ''}
                                  </p>
                                </div>
                                {m.mobile && (
                                  <a href={`tel:${m.mobile}`} onClick={(e) => e.stopPropagation()}
                                    className="shrink-0 grid h-9 w-9 place-items-center rounded-xl bg-bg-base text-primary hover:bg-primary hover:text-white transition-colors" title={m.mobile}>
                                    <Phone className="h-4 w-4" />
                                  </a>
                                )}
                                {!isThis && <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />}
                              </button>
                            );
                          })}
                          {familyMembers.length <= 1 && (
                            <p className="text-center text-xs font-semibold text-text-muted py-6">No other family members linked yet. Link members by setting this person as their Family Head.</p>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // ── Tags card ──
                  if (sec === 'Tags') {
                    return (
                      <div key="Tags" className="rounded-2xl border border-border-light bg-surface p-4 sm:p-5 shadow-xs">
                        <h3 className="text-sm font-black text-text-main mb-3">Tags</h3>
                        <div className="mb-3">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Active Tags</div>
                          {Array.isArray(selectedDevotee.tags) && selectedDevotee.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {selectedDevotee.tags.map((key) => (
                                <span key={key} style={tagChipStyle(key)} className="rounded-full px-2.5 py-0.5 text-[11px] font-bold">{tagLabel(key)}</span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm font-semibold text-text-muted">No tags yet.</p>
                          )}
                        </div>
                        {canEdit && (
                          <div className="mt-4 space-y-5">
                            <p className="text-[11px] font-bold text-text-muted">Tap a tag to add or remove it.</p>
                            {tagsByCategory().map(({ category, tags: catTags }) => {
                              const groups = [];
                              const seen = new Set();
                              catTags.forEach(t => {
                                if (t.mutuallyExclusiveGroup && !seen.has(t.mutuallyExclusiveGroup)) {
                                  seen.add(t.mutuallyExclusiveGroup);
                                  groups.push({ type: 'mutex', group: t.mutuallyExclusiveGroup, tags: catTags.filter(x => x.mutuallyExclusiveGroup === t.mutuallyExclusiveGroup) });
                                } else if (!t.mutuallyExclusiveGroup) {
                                  groups.push({ type: 'single', tags: [t] });
                                }
                              });
                              return (
                                <div key={category.key}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: category.color.dot }} />
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-main">{category.label}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {groups.map((g, gi) =>
                                      g.type === 'mutex' ? (
                                        <span key={gi} className="inline-flex items-center rounded-full border border-dashed border-border-light gap-0.5 p-0.5" title="Only one may be active">
                                          {g.tags.map(t => {
                                            const active = (selectedDevotee.tags || []).includes(t.key);
                                            return (
                                              <button key={t.key} onClick={() => toggleProfileTag(t.key, !active)}
                                                style={active ? tagChipStyle(t.key) : undefined} title={t.desc}
                                                className={'rounded-full px-3 py-1 text-[11px] font-bold transition-all ' +
                                                  (active ? '' : 'text-text-muted hover:text-text-main hover:bg-bg-base')}>
                                                {t.label}
                                              </button>
                                            );
                                          })}
                                        </span>
                                      ) : (
                                        g.tags.map(t => {
                                          const active = (selectedDevotee.tags || []).includes(t.key);
                                          return (
                                            <button key={t.key} onClick={() => toggleProfileTag(t.key, !active)}
                                              style={active ? tagChipStyle(t.key) : undefined} title={t.desc}
                                              className={'rounded-full px-3 py-1 text-[11px] font-bold transition-all ' +
                                                (active ? '' : 'border border-border-light bg-surface text-text-muted hover:border-primary hover:text-text-main')}>
                                              {t.label}
                                            </button>
                                          );
                                        })
                                      )
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // ── Field section card (Personal / Contact / Satsang / Education / Profession / System) ──
                  const fields = (TABS[sec] || []).filter(([f]) => !(sec === 'Satsang' && SATSANG_ROLE_FIELDS.has(f)));
                  return (
                    <div key={sec} className="rounded-2xl border border-border-light bg-surface p-4 sm:p-5 shadow-xs">
                      <h3 className="text-sm font-black text-text-main mb-3">{sec}</h3>
                      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-4">
                        {fields.map(([f, label]) => (
                          <div key={f} className={FULL_WIDTH_FIELDS.has(f) ? 'col-span-2 lg:col-span-3 xl:col-span-4' : ''}>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">{label}</div>
                            {editing ? (
                              renderEditField(f, editData, setEditData)
                            ) : (
                              <div className="text-sm font-semibold text-text-main break-words whitespace-pre-wrap">
                                {val(selectedDevotee[f], f)}
                              </div>
                            )}
                          </div>
                        ))}
                        {sec === 'Satsang' && (editing ? renderFamilyRoleEdit() : renderFamilyRoleView())}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer actions — safe-area handled by the overlay padding now */}
            {canEditProfile && (
              <div className="flex items-center gap-2 px-4 py-3.5 border-t border-border-light bg-surface shrink-0">
                {editing ? (
                  <>
                    <button onClick={saveEdit} disabled={saving} aria-busy={saving}
                      className={`relative overflow-hidden flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-xs font-bold text-white transition-colors ${saving ? 'cursor-wait' : 'hover:bg-[#00223f]'}`}>
                      {saving && <span className="ac-sweep" aria-hidden="true" />}
                      <span className="relative flex items-center gap-2">
                        {saving
                          ? <><span className="ac-beads" aria-hidden="true"><i /><i /><i /></span> Saving…</>
                          : <><Save className="h-4 w-4" /> Save Changes</>}
                      </span>
                    </button>
                    <button onClick={() => setEditing(false)} disabled={saving}
                      className="rounded-2xl border border-border-light px-4 py-2.5 text-xs font-bold text-text-main hover:bg-bg-base disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={startEdit} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-xs font-bold text-white hover:bg-[#00223f]"><Pencil className="h-4 w-4" /> Edit Profile</button>
                    {canDelete && (
                      <button onClick={() => handleDelete(selectedDevotee.id)} className="rounded-2xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      , document.body)}

      {/* QR Modal */}
      {qrModalDevotee && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl text-center relative">
            <button onClick={() => setQrModalDevotee(null)} className="absolute right-4 top-4 text-text-muted hover:text-text-main"><X className="h-5 w-5" /></button>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#FF862A] block mb-1">Akshar Connect Pass</span>
            <h3 className="text-lg font-bold text-text-main mb-4">{qrModalDevotee.name}</h3>
            <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-2xl border-4 border-primary bg-slate-950 p-4 shadow-inner">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrModalDevotee.id)}`} alt="QR" className="h-full w-full rounded-xl bg-surface p-2" />
            </div>
            <p className="mt-4 text-xs font-bold text-text-main">{qrModalDevotee.id}</p>
            <p className="text-[11px] text-slate-400 mt-1">Scan at sabha entry for instant attendance</p>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
