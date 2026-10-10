import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Download, Printer, MessageCircle, Mail, Plus, Filter, QrCode, CheckSquare, X, MapPin, Phone, Trash2, Pencil, Droplet, Briefcase, GraduationCap, User, UserCheck, Users, Home, Calendar, ChevronDown, ChevronLeft, ChevronRight, MessageSquare, ShieldCheck, LayoutGrid, Table2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import AddDevoteeWizard from '../components/AddDevoteeWizard';
import { alertDevoteeCreated, alertDevoteeSaved, alertDevoteeSaveFailed } from '../utils/sweetAlert';
import { tagsByCategory, tagLabel, tagChipStyle } from '../services/tagCatalog';
import { isBirthdayToday, isBirthdayWithin } from '../utils/birthdays';
import { scoreMatch, devoteeSearchText } from '../utils/search';
import { focusNextOnEnter } from '../utils/formNav';
import EmptyState from '../components/EmptyState';
import { ListSkeleton } from '../components/SkeletonLoader';
import {
  hasAnyTag, deriveAge, QUALIFICATIONS, formatFamilyRecordType, gradeDisplay
} from '../services/devoteeSchema';

// Age bands for the Divine Devotees filter.
const AGE_BANDS = {
  under15: { label: 'Under 15', test: (a) => a !== '' && a < 15 },
  '15to45': { label: '15 – 45', test: (a) => a !== '' && a >= 15 && a <= 45 },
  over45: { label: 'Over 45', test: (a) => a !== '' && a > 45 },
};

// Profile tabs -> [field, label]. 'Tags' is a special tab (no fields, renders tag UI).
const TABS = {
  'Personal':    [['name','Name'],['gender','Gender'],['dob','Date of Birth'],['bloodGroup','Blood Group'],['maritalStatus','Marital Status'],['anniversary','Anniversary']],
  'Contact':     [['mobileWhatsapp','Mobile / WhatsApp'],['address','Address'],['email','Email'],['area','Area']],
  'Education':   [['qualification','Qualification'],['grade','Grade / Standard'],['education','Education / Stream'],['educationStatus','Education Status'],['school','School / College']],
  'Profession':  [['profession','Profession'],['professionField','Field'],['companyName','Company']],
  'Satsang':     [['yuvakType','Yuvak Type'],['familyId','Family Head'],['relation','Relation to family head'],['followupKaryakarta','Follow-up Karyakarta'],['followupKaryakartaMobile','Karyakarta Mobile'],['reference','Reference']],
  'Family':      [], // special tab: lists everyone in this devotee's family (+ shows Family ID)
  'System':      [['id','Yuvak ID'],['oldNew','Devotee Type'],['status','Status'],['dateOfJoining','Date of Joining'],['notes','Notes']],
  'Tags':        [], // rendered separately
};
// Satsang fields handled by the custom family-role block (not the generic grid).
const SATSANG_ROLE_FIELDS = new Set(['familyId', 'relation']);
// Order of sections in the single-scroll LinkedIn-style profile.
const PROFILE_SECTION_ORDER = ['Personal', 'Contact', 'Satsang', 'Family', 'Education', 'Profession', 'Tags', 'System'];
// Emoji per profile section — quick visual scanning of the single-scroll profile.
const SECTION_EMOJI = {
  Personal: '👤', Contact: '📞', Satsang: '🙏', Family: '👨‍👩‍👧', Education: '🎓',
  Profession: '💼', Tags: '🏷️', System: '⚙️',
};

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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full min-w-[11rem] max-h-72 overflow-y-auto rounded-xl border border-border-light bg-surface shadow-xl p-1">
            {/* Select all / Clear (#135) */}
            <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border-light mb-1 sticky top-0 bg-surface">
              <button type="button" onClick={() => onChange(opts.map((o) => o.value))} className="text-[11px] font-bold text-primary hover:underline">Select all</button>
              {selected.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="text-[11px] font-bold text-red-500 hover:underline">Clear</button>
              )}
            </div>
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

const FULL_WIDTH_FIELDS = new Set(['address', 'notes']);

const WINGS = ['Yuva Wing', 'Kishore Wing', 'Bal Wing', 'Seniors Wing'];

// Display a full name as first + last only (drop middle name(s)) for compact labels.
const firstLastName = (full) => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return parts.length <= 2 ? parts.join(' ') : `${parts[0]} ${parts[parts.length - 1]}`;
};

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

// Emoji per profile field for extra visual cues (#98).
const FIELD_EMOJI = {
  name: '🪪', mobileWhatsapp: '📱',
  firstName: '🪪', middleName: '🪪', lastName: '🪪', gender: '⚧️', dob: '🎂', bloodGroup: '🩸',
  maritalStatus: '💍', anniversary: '💕', address: '📍', mobile: '📱', whatsapp: '💬', email: '📧',
  area: '🗺️', city: '🏙️', qualification: '🎓', grade: '📘', education: '📚', educationStatus: '⏳',
  school: '🏫', profession: '💼', professionField: '🛠️', companyName: '🏢',
  yuvakType: '🧑‍🤝‍🧑', familyId: '👨‍👩‍👧', relation: '🔗', followupKaryakarta: '🙏', followupKaryakartaMobile: '📞',
  reference: '🤝', id: '🆔', status: '✅', dateOfJoining: '🗓️', notes: '📝', oldNew: '🏷️',
};

const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dobShort(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return dob;
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS_ABBR[d.getMonth()]}-${d.getFullYear()}`;
}

// Read-only audit footer for the profile's System card — shows who created the
// record and when, and (only if it was later edited) who last updated it.
function AuditFooter({ d }) {
  const fmt = (v) => {
    if (!v) return '';
    const dt = new Date(v);
    if (isNaN(dt.getTime())) return String(v);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };
  const createdOn = fmt(d.createdOn);
  const updatedOn = fmt(d.updatedOn);
  // Show the "updated" line whenever update info exists (#101) — even if it was
  // only stamped at creation, the user wants to see who/when last touched it.
  const hasUpdated = d.updatedBy || d.updatedOn;
  if (!d.createdBy && !createdOn && !hasUpdated) return null;
  return (
    <div className="mt-4 pt-3 border-t border-dashed border-border-light space-y-1.5">
      {(d.createdBy || createdOn) && (
        <p className="text-[11px] font-semibold text-text-muted flex flex-wrap items-center gap-x-1.5">
          <span>🆕 Created by</span>
          <span className="text-text-main font-bold">{d.createdBy || '—'}</span>
          {createdOn && <span>· {createdOn}</span>}
        </p>
      )}
      {hasUpdated && (
        <p className="text-[11px] font-semibold text-text-muted flex flex-wrap items-center gap-x-1.5">
          <span>✏️ Last updated by</span>
          <span className="text-text-main font-bold">{d.updatedBy || '—'}</span>
          {updatedOn && <span>· {updatedOn}</span>}
        </p>
      )}
    </div>
  );
}

export default function DevoteesPage({ user, devoteesPreset, filterPreset, onClearDevoteesPreset, openDevoteeId, onClearOpenDevotee, refreshing, familyView = false }) {
  const [devotees, setDevotees] = useState(() => dataService.getDevotees());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editWizard, setEditWizard] = useState(null); // devotee being edited in the gradient wizard
  const [selectedDevotee, setSelectedDevotee] = useState(null);
  const [qrModalDevotee, setQrModalDevotee] = useState(null);
  const [activeTab, setActiveTab] = useState('Personal');
  const [selectedTags, setSelectedTags] = useState([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [showTags, setShowTags] = useState(false); // separate Tags filter section (outside Filters)
  const [sortBy, setSortBy] = useState(''); // '' = default | name | joinedDesc | joinedAsc | areaAsc | areaDesc
  // Area name (lowercased) -> assigned number from the Area Master, for area sorting.
  const areaNumMap = useMemo(() => {
    const m = {};
    (dataService.getAreas() || []).forEach(a => { if (a.name) m[String(a.name).trim().toLowerCase()] = a.number; });
    return m;
  }, [devotees]);
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
  const [addWhatsappSameAsMobile, setAddWhatsappSameAsMobile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [familyFilter, setFamilyFilter] = useState(null); // familyId -> show all its members
  const [expandedCard, setExpandedCard] = useState(null); // devotee id expanded inline
  const [tagsExpandedId, setTagsExpandedId] = useState(null); // devotee id whose full tags are shown
  // Desktop-only layout: 'grid' (dense scrollable table, default) or 'cards'.
  // Remembered per browser. Mobile always renders cards regardless.
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('ac-devotees-view') || 'grid'; } catch { return 'grid'; }
  });
  const setView = (v) => { setViewMode(v); try { localStorage.setItem('ac-devotees-view', v); } catch {} };

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
  // Area dropdown source (#125): the Area Master sheet names first (by their assigned
  // order), then any extra areas typed on devotee records — NOT a hardcoded list.
  const areaOptions = useMemo(() => {
    const master = (dataService.getAreas() || [])
      .filter(a => a && a.name)
      .sort((a, b) => {
        const na = parseInt(a.number, 10), nb = parseInt(b.number, 10);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        if (!isNaN(na) && isNaN(nb)) return -1;
        if (isNaN(na) && !isNaN(nb)) return 1;
        return String(a.name).localeCompare(String(b.name));
      })
      .map(a => String(a.name).trim());
    const seen = new Set(master.map(n => n.toLowerCase()));
    const extra = [...new Set(devotees.map(d => String(d.area || '').trim()).filter(Boolean))]
      .filter(n => !seen.has(n.toLowerCase())).sort((a, b) => a.localeCompare(b));
    return [...master, ...extra];
  }, [devotees]);
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
    address:'', area:'', mandal:'Adajan',
    followupKaryakarta:'', followupKaryakartaMobile:'', reference:'', notes:'', tags:[],
    familyId:'', type:'Primary', relation:'Self', dateOfJoining: todayISO };
  const [formData, setFormData] = useState(blankForm);

  useEffect(() => {
    loadDevotees();
    // The background bootstrap can finish AFTER this page mounts; reload so devotees
    // and the Area dropdown (from AreaMaster) fill in without a manual navigate (#125).
    const onRefresh = () => loadDevotees();
    window.addEventListener('ac-data-refreshed', onRefresh);
    return () => window.removeEventListener('ac-data-refreshed', onRefresh);
  }, []);

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

  // Re-read fresh data in place when the background live-refresh finishes, so the
  // list updates WITHOUT remounting (keeps the user's search/filters/scroll) (#147).
  useEffect(() => {
    const onRefreshed = () => setDevotees([...dataService.getDevotees()]);
    window.addEventListener('ac-data-refreshed', onRefreshed);
    return () => window.removeEventListener('ac-data-refreshed', onRefreshed);
  }, []);

  const presetMeta = devoteesPreset ? PRESET_META[devoteesPreset] : null;
  const presetMatch = presetMeta?.match ?? (() => true);

  const isDevotee = user?.role === 'Devotee';
  const canEdit   = user?.role === 'Admin' || user?.role === 'Sevak';
  const canDelete = user?.role === 'Admin'; // Sevak and Devotee cannot delete
  // A devotee may edit their OWN profile (fields only — tags stay admin-only).
  const isOwnProfile = isDevotee && !!selectedDevotee && String(selectedDevotee.id) === String(user?.devoteeId);
  const canEditProfile = canEdit || isOwnProfile;

  // Privacy: a Devotee-role viewer must NOT see a FEMALE devotee's phone number
  // in any way, UNLESS she belongs to the viewer's OWN family. Admin/Sevak see
  // everything; male/other numbers are always shown. Applied at every render +
  // export point so a hidden number never even reaches the DOM.
  const myFamilyId = String(user?.familyId || user?.devoteeId || '');
  const canSeeMobileOf = (d) => {
    if (!isDevotee) return true;
    if (String(d?.gender || '') !== 'Female') return true;
    const fid = String(d?.familyId || d?.id || '');
    return !!myFamilyId && fid === myFamilyId;
  };
  const mobileOf = (d) => (canSeeMobileOf(d) ? (d?.mobile || '') : '');
  const whatsappOf = (d) => (canSeeMobileOf(d) ? (d?.whatsapp || '') : '');

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
      if (filterOldNews.length && !filterOldNews.some(v => {
        const val = v.toLowerCase();
        // "Reference" = explicitly typed Reference OR anyone introduced by a
        // reference (non-empty reference field), so the filter isn't empty (#134).
        if (val === 'reference') return String(d.oldNew || '').toLowerCase() === 'reference' || !!String(d.reference || '').trim();
        return String(d.oldNew || '').toLowerCase() === val;
      })) return false;
      return hasAnyTag(d, selectedTags) && presetMatch(d);
    });
    if (query) {
      base = base
        .map((d) => ({ d, s: scoreMatch(searchText(d), d.name || '', query) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s) // exact first, then partial, then fuzzy
        .map((x) => x.d);
    } else if (sortBy) {
      const areaNum = (d) => {
        const n = areaNumMap[String(d.area || '').trim().toLowerCase()];
        return (n === undefined || n === '' || isNaN(parseInt(n, 10))) ? null : parseInt(n, 10);
      };
      base = [...base].sort((a, b) => {
        if (sortBy === 'joinedDesc') return String(b.dateOfJoining || '').localeCompare(String(a.dateOfJoining || ''));
        if (sortBy === 'joinedAsc') return String(a.dateOfJoining || '').localeCompare(String(b.dateOfJoining || ''));
        if (sortBy === 'areaAsc' || sortBy === 'areaDesc') {
          const na = areaNum(a), nb = areaNum(b);
          if (na === null && nb === null) return String(a.area || '').localeCompare(String(b.area || ''));
          if (na === null) return 1;   // unnumbered areas last
          if (nb === null) return -1;
          return sortBy === 'areaAsc' ? na - nb : nb - na;
        }
        return String(a.name || '').localeCompare(String(b.name || '')); // name A-Z
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devotees, query, sortBy, areaNumMap, selectedTags, filterKaryakartas, filterAreas, filterReferences, filterQualifications, filterAges, filterGenders, filterTypes, filterOldNews, familyFilter, devoteesPreset, isPlainBrowse]);

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
      const created = await dataService.addDevoteeAndSync({ ...formData, whatsapp, name, mandal: formData.mandal || 'Adajan' });
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

  const openProfile = (d) => { setSelectedDevotee(d); setActiveTab('Personal'); };

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
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDeltaX.current = 0;
  };
  const onBodyTouchMove = (e) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const onBodyTouchEnd = (e) => {
    if (touchStartX.current == null) return;
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

  const handleDelete = (id) => {
    if (window.confirm('Delete this devotee record?')) { dataService.deleteDevotee(id); loadDevotees(); setSelectedDevotee(null); }
  };

  const val = (v, fieldKey) => {
    if (v === undefined || v === null || v === '') return '—';
    if (fieldKey === 'type') return formatFamilyRecordType(v);
    return v;
  };
  // Combined display values for the profile view (#115/#116): full name in one line,
  // mobile + WhatsApp together.
  const fieldDisplay = (d, f) => {
    if (f === 'name') return d.name || [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ');
    if (f === 'mobileWhatsapp') {
      const m = String(mobileOf(d) || '').trim(), w = String(whatsappOf(d) || '').trim();
      if (m && w && w === m) return `${m}  ·  WhatsApp same`;
      return [m && `📱 ${m}`, w && `💬 ${w}`].filter(Boolean).join('  ·  ');
    }
    if (f === 'mobile') return mobileOf(d);
    if (f === 'whatsapp') return whatsappOf(d);
    if (f === 'grade') return gradeDisplay(d.grade, d.gradeAsOf); // current grade + as-on date (#138/#139)
    return d[f];
  };


  const renderFamilyRoleView = () => {
    const d = selectedDevotee;
    const isSelf = d.type === 'Primary';
    return (
      <div className="col-span-full rounded-2xl border border-border-light bg-bg-base p-4">
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


  // Auto-open own profile for Devotee login — but NOT in the "Family" tab, which
  // shows the family member list so the devotee can pick whom to open.
  useEffect(() => {
    if (!familyView && isDevotee && user?.devoteeId && filteredDevotees.length > 0 && !selectedDevotee) {
      const own = filteredDevotees.find(d => d.id === user.devoteeId) || filteredDevotees[0];
      if (own) openProfile(own);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevotee, filteredDevotees.length, familyView]);

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
          <h1 className="text-2xl font-bold text-text-main">🧑‍🤝‍🧑 Devotee Directory</h1>
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
              <option value="areaAsc">Area (1 → last)</option>
              <option value="areaDesc">Area (last → 1)</option>
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
                     <td>${mobileOf(d) || ''}</td>
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
                  const ddmmyyyy = (s) => s ? String(s).replace(/(\d{4})-(\d{2})-(\d{2})/, '$3-$2-$1') : '';
                  const data = filteredDevotees.map((d, i) => {
                    const age = deriveAge(d.dob);
                    return {
                      // Requested leading order:
                      'SN': i + 1,
                      'Full Name': d.name || '',
                      'Address': d.address || '',
                      'Mobile No': mobileOf(d) || '',
                      'DOB': ddmmyyyy(d.dob),
                      'Follow-up Karyakarta': d.followupKaryakarta || '',
                      'Reference': d.reference || '',
                      'Yuvak Type': d.yuvakType || '',
                      // then the rest of the fields:
                      'ID': d.id || '',
                      'Age': age === '' ? '' : age,
                      'Gender': d.gender || '',
                      'WhatsApp': whatsappOf(d) || '',
                      'Email': d.email || '',
                      'Area': d.area || '',
                      'Blood Group': d.bloodGroup || '',
                      'Marital Status': d.maritalStatus || '',
                      'Qualification': d.qualification || '',
                      'Education': d.education || '',
                      'Education Status': d.educationStatus || '',
                      'School/College': d.school || '',
                      'Profession': d.profession || '',
                      'Field': d.professionField || '',
                      'Company': d.companyName || '',
                      'Karyakarta Mobile': d.followupKaryakartaMobile || '',
                      'Family ID': d.familyId || '',
                      'Relation': d.relation || '',
                      'Membership': d.type === 'Primary' ? 'Head' : (d.type || ''),
                      'Old/New': d.oldNew || '',
                      'Status': d.status || '',
                      'Date of Joining': ddmmyyyy(d.dateOfJoining),
                      'Tags': Array.isArray(d.tags) ? d.tags.map(k => tagLabel(k)).join(', ') : '',
                      'Notes': d.notes || '',
                      'Created By': d.createdBy || '',
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

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-text-muted">
          Showing {filteredDevotees.length}{isPlainBrowse ? ' family heads (open a family to see its members)' : ' devotees'}
        </p>
        {/* Desktop view switch — grid (table) vs cards. Hidden on mobile. */}
        <div className="hidden md:inline-flex items-center rounded-xl border border-border-light bg-bg-base p-0.5">
          <button onClick={() => setView('grid')} title="Grid view"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${viewMode === 'grid' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
            <Table2 className="h-4 w-4" /> Grid
          </button>
          <button onClick={() => setView('cards')} title="Card view"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${viewMode === 'cards' ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
            <LayoutGrid className="h-4 w-4" /> Cards
          </button>
        </div>
      </div>
      </>)}

      {refreshing ? (
        <ListSkeleton count={6} />
      ) : filteredDevotees.length > 0 ? (
        <>
        {/* ── Desktop GRID (table) view — sticky header, scrollable body ── */}
        {viewMode === 'grid' && (
          <div className="hidden md:block rounded-2xl border border-border-light bg-surface shadow-sm overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-bg-base text-left text-[11px] font-black uppercase tracking-wider text-text-muted">
                    {selectMode && <th className="px-3 py-3 w-10 border-b border-border-light"></th>}
                    <th className="px-4 py-3 border-b border-border-light">👤 Devotee</th>
                    <th className="px-3 py-3 border-b border-border-light">🆔 ID</th>
                    <th className="px-3 py-3 border-b border-border-light">📱 Mobile</th>
                    <th className="px-3 py-3 border-b border-border-light">🎂 DOB</th>
                    <th className="px-3 py-3 border-b border-border-light">🗺️ Area</th>
                    <th className="px-3 py-3 border-b border-border-light">🙏 Karyakarta</th>
                    <th className="px-3 py-3 border-b border-border-light">🏷️ Tags</th>
                    <th className="px-3 py-3 border-b border-border-light text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevotees.map((devotee) => {
                    const sel = selectedIds.has(devotee.id);
                    const rowClick = () => {
                      if (selectMode) {
                        const n = new Set(selectedIds);
                        n.has(devotee.id) ? n.delete(devotee.id) : n.add(devotee.id);
                        setSelectedIds(n);
                      } else openProfile(devotee);
                    };
                    return (
                      <tr key={devotee.id} onClick={rowClick}
                        className={`cursor-pointer border-b border-border-light transition-colors ${sel ? 'bg-primary/5' : 'hover:bg-bg-base'}`}>
                        {selectMode && (
                          <td className="px-3 py-2.5">
                            <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${sel ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface'}`}>
                              {sel && <CheckSquare className="h-3.5 w-3.5" />}
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img src={devotee.photo || devotee.avatar || 'https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name=' + encodeURIComponent(devotee.name || '?')}
                              alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-border-light" />
                            <div className="min-w-0">
                              <p className="font-bold text-text-main truncate max-w-[220px]">{devotee.name}</p>
                              {devotee.yuvakType && <p className="text-[11px] font-semibold text-text-muted truncate">{devotee.yuvakType}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-text-muted whitespace-nowrap">{devotee.id}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-text-main">{val(mobileOf(devotee))}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">{devotee.dob ? dobShort(devotee.dob) : '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">{devotee.area || '—'}</td>
                        <td className="px-3 py-2.5 text-text-muted"><span className="block truncate max-w-[160px]">{devotee.followupKaryakarta || '—'}</span></td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {(devotee.tags || []).slice(0, 3).map((k) => (
                              <span key={k} style={tagChipStyle(k)} className="rounded-full px-2 py-0.5 text-[10px] font-bold">{tagLabel(k)}</span>
                            ))}
                            {(devotee.tags || []).length > 3 && <span className="text-[10px] font-bold text-text-muted">+{devotee.tags.length - 3}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setQrModalDevotee(devotee)} title="QR Pass" className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-accent hover:bg-amber-100 dark:bg-amber-950"><QrCode className="h-4 w-4" /></button>
                            <button onClick={() => openProfile(devotee)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-hover">Profile</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Card view — always on mobile; on desktop only when 'cards' selected ── */}
        <div className={viewMode === 'grid' ? 'md:hidden' : ''}>
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
                    <Row icon={Phone} color="bg-sky-50 text-sky-600" text={val(mobileOf(devotee))} />
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
                    {devotee.area && (
                      <Row icon={MapPin} color="bg-slate-100 text-slate-500" text={devotee.area} />
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
        </div>
        </>
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
          areaOptions={areaOptions}
          onClose={() => setShowAddModal(false)}
          onCreated={(created) => { setShowAddModal(false); loadDevotees(); alertDevoteeCreated(created?.name); if (created) openProfile(created); }}
        />
      )}

      {editWizard && (
        <AddDevoteeWizard
          user={user}
          devotees={devotees}
          familyHeads={familyHeads}
          karyakartaOptions={karyakartaOptions}
          karyakartaMobileFor={karyakartaMobileFor}
          referenceOptions={referenceOptions}
          headRecordByFamilyId={headRecordByFamilyId}
          areaOptions={areaOptions}
          editDevotee={editWizard}
          onClose={() => setEditWizard(null)}
          onSaved={(updated) => { setEditWizard(null); loadDevotees(); if (updated) setSelectedDevotee(updated); alertDevoteeSaved(updated?.name); }}
        />
      )}

      

      {/* Profile — FULL-SCREEN (not a popup): the most-used view, so it fills the
          screen for easy reading and traversal. Portal to document.body to escape
          main's animation stacking context; iOS safe areas respected. */}
      {selectedDevotee && createPortal(
        <div
          /* Full-screen, but on mobile it stops above the app's bottom nav so the
             nav stays visible/tappable across the whole app (the nav is ~56px +
             safe-area; on md+ there is no bottom nav, so it fills the screen). */
          className="fixed top-0 left-0 right-0 bottom-[calc(56px_+_env(safe-area-inset-bottom))] md:bottom-0 z-[60] bg-bg-base animate-[acFade_.18s_ease-out] flex flex-col"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
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
            <button onClick={() => setSelectedDevotee(null)}
              className="absolute right-4 z-30 grid h-9 w-9 place-items-center rounded-full bg-black/25 text-white hover:bg-black/45 backdrop-blur-sm transition-colors"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
              <X className="h-5 w-5" />
            </button>

            {/* Everything scrolls — nothing is pinned */}
            <div className="flex-1 min-h-0 overflow-y-auto bg-bg-base">
            {/* Header: cover banner, overlapping avatar, headline, quick actions */}
            <div className="relative border-b border-border-light">

              {/* Cover — full "Akshardham" image (tagline kept visible) */}
              <div className="bg-[#2a2550]">
                <img src={`${import.meta.env.BASE_URL}images/profile-cover.jpg`} alt="Binsharti Jivan etle Akshardham"
                  className="block w-full h-auto" loading="lazy" />
              </div>

              <div className="px-5 sm:px-7 pb-4 flex flex-col items-center text-center">
                {/* Big centered avatar overlapping the cover (#99). Editing is done in the gradient wizard. */}
                <div className="relative -mt-24 sm:-mt-32">
                  <img src={selectedDevotee.photo || selectedDevotee.avatar || 'https://ui-avatars.com/api/?background=FF862A&color=ffffff&bold=true&size=400&name=' + encodeURIComponent(selectedDevotee.name || '?')}
                    alt={selectedDevotee.name}
                    className="h-44 w-44 sm:h-56 sm:w-56 max-w-[70vw] rounded-3xl object-cover ring-4 ring-surface shadow-2xl bg-surface" />
                </div>

                <h2 className="mt-3 text-2xl sm:text-3xl font-black text-text-main leading-tight break-words">{selectedDevotee.name}</h2>
                {(() => {
                  const age = deriveAge(selectedDevotee.dob);
                  const headline = [selectedDevotee.yuvakType, selectedDevotee.professionField || selectedDevotee.profession, age !== '' ? `${age} yrs` : '']
                    .filter(Boolean).join('  ·  ');
                  return headline ? <p className="mt-1 text-sm font-semibold text-text-muted">{headline}</p> : null;
                })()}

                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  {selectedDevotee.type && (
                    <span className="text-[10px] sm:text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full" title="Family membership">
                      {selectedDevotee.type === 'Primary' ? 'Head of family' : 'Family member'}
                    </span>
                  )}
                  {selectedDevotee.area && <span className="text-[10px] sm:text-[11px] font-semibold text-text-muted bg-bg-base border border-border-light px-2.5 py-1 rounded-full">{selectedDevotee.area}</span>}
                  <span className="text-[10px] sm:text-[11px] font-bold text-text-muted bg-bg-base border border-border-light px-2.5 py-1 rounded-full">{selectedDevotee.id}</span>
                </div>

                {/* Quick actions */}
                {canSeeMobileOf(selectedDevotee) && val(selectedDevotee.mobile) !== '—' && (
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

                {/* Key satsang-contact info — left-aligned (#115) */}
                <div className="mt-3 space-y-1.5 self-stretch text-left">
                  {canSeeMobileOf(selectedDevotee) && selectedDevotee.mobile && (
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
              <div className="w-full p-3 sm:p-4 space-y-3" data-enter-nav onKeyDown={focusNextOnEnter}>
                {PROFILE_SECTION_ORDER.map((sec) => {
                  // ── Family members card ──
                  if (sec === 'Family') {
                    return (
                      <div key="Family" className="rounded-2xl border border-border-light bg-surface p-4 sm:p-5 shadow-xs">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-black text-text-main">👨‍👩‍👧 Family <span className="text-text-muted font-bold">· {familyMembers.length}</span></h3>
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
                                {mobileOf(m) && (
                                  <a href={`tel:${mobileOf(m)}`} onClick={(e) => e.stopPropagation()}
                                    className="shrink-0 grid h-9 w-9 place-items-center rounded-xl bg-bg-base text-primary hover:bg-primary hover:text-white transition-colors" title={mobileOf(m)}>
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
                    const activeTags = selectedDevotee.tags || [];
                    return (
                      <div key="Tags" className="rounded-2xl border border-border-light bg-surface p-4 sm:p-5 shadow-xs">
                        <h3 className="text-sm font-black text-text-main mb-3">🏷️ Tags</h3>
                        <div className="mb-1">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Active Tags</div>
                          {activeTags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {activeTags.map((key) => (
                                <span key={key} style={tagChipStyle(key)} className="rounded-full px-2.5 py-0.5 text-[11px] font-bold">{tagLabel(key)}</span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm font-semibold text-text-muted">No tags yet.</p>
                          )}
                        </div>
                        {canEdit && <p className="mt-3 text-[11px] font-semibold text-text-muted">Edit tags from <strong>Edit Profile</strong>.</p>}
                      </div>
                    );
                  }

                  // ── Field section card (Personal / Contact / Satsang / Education / Profession / System) ──
                  const pdata = selectedDevotee;
                  const isBalP = pdata.yuvakType === 'Bal';
                  const showGradeP = isBalP || pdata.educationStatus === 'Pursuing';
                  const fields = (TABS[sec] || []).filter(([f]) => {
                    if (sec === 'Satsang' && SATSANG_ROLE_FIELDS.has(f)) return false;
                    // Bal: no college qualification/stream/status; Grade only for Bal or students (#90/#97)
                    if (sec === 'Education') {
                      if (isBalP && (f === 'qualification' || f === 'education' || f === 'educationStatus')) return false;
                      if (f === 'grade' && !showGradeP) return false;
                    }
                    return true;
                  });
                  // Profile view mirrors the Add/Edit wizard Review tab (#106):
                  // single-column (two on wide screens) icon-chip tiles, for fields
                  // that have a value. Editing happens in the gradient wizard.
                  const filled = fields.filter(([f]) => {
                    const v = val(fieldDisplay(selectedDevotee, f), f);
                    return v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '—';
                  });
                  const showFamily = sec === 'Satsang';
                  if (!filled.length && !showFamily && sec !== 'System') return null;
                  return (
                    <div key={sec} className="rounded-2xl border border-border-light bg-surface p-4 sm:p-5 shadow-xs">
                      <h3 className="text-sm font-black text-text-main mb-3">{SECTION_EMOJI[sec] ? `${SECTION_EMOJI[sec]} ` : ''}{sec}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filled.map(([f, label]) => (
                          <div key={f} className={`flex items-center gap-3 rounded-2xl border border-border-light bg-bg-base/60 px-3 py-2.5 ${FULL_WIDTH_FIELDS.has(f) ? 'sm:col-span-2' : ''}`}>
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl">{FIELD_EMOJI[f] || '•'}</span>
                            <div className="min-w-0 text-left">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</div>
                              <div className="text-sm font-bold text-text-main break-words whitespace-pre-wrap text-left">{val(fieldDisplay(selectedDevotee, f), f)}</div>
                            </div>
                          </div>
                        ))}
                        {showFamily && renderFamilyRoleView()}
                      </div>
                      {sec === 'System' && <AuditFooter d={selectedDevotee} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer actions — safe-area handled by the overlay padding now */}
            {canEditProfile && (
              <div className="flex items-center gap-2 px-4 py-3.5 border-t border-border-light bg-surface shrink-0">
                <button onClick={() => setEditWizard(selectedDevotee)} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-xs font-bold text-white hover:bg-[#00223f]"><Pencil className="h-4 w-4" /> Edit Profile</button>
                {canDelete && (
                  <button onClick={() => handleDelete(selectedDevotee.id)} className="rounded-2xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>
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
