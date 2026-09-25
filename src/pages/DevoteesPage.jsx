import React, { useState, useEffect, useMemo } from 'react';
import { Search, Download, Printer, MessageCircle, Mail, Plus, Filter, QrCode, CheckSquare, X, MapPin, Phone, Trash2, Pencil, Save, Droplet, Briefcase, GraduationCap, User, Users, Home, Calendar, ChevronDown, MessageSquare } from 'lucide-react';
import { dataService } from '../services/dataService';
import AutoResizeTextarea from '../components/AutoResizeTextarea';
import { alertDevoteeCreated, alertDevoteeSaved, alertDevoteeSaveFailed } from '../utils/sweetAlert';
import { tagsByCategory, tagLabel, tagChipStyle } from '../services/tagCatalog';
import { isBirthdayToday, isBirthdayWithin } from '../utils/birthdays';
import { scoreMatch, dateSearchForms } from '../utils/search';
import EmptyState from '../components/EmptyState';
import { ListSkeleton } from '../components/SkeletonLoader';
import {
  hasAnyTag, AREAS, GENDERS, QUALIFICATIONS, EDUCATION_STATUS,
  PROFESSIONS, MARITAL_STATUS, RELATIONS, YUVAK_TYPES, STATUSES, BLOOD_GROUPS,
  FAMILY_RECORD_TYPES, formatFamilyRecordType, formatFamilyMembershipContext
} from '../services/devoteeSchema';

// Profile tabs -> [field, label]
const TABS = {
  'Personal': [['firstName','First Name'],['middleName','Middle Name'],['lastName','Last Name'],['gender','Gender'],['dob','Date of Birth'],['bloodGroup','Blood Group'],['maritalStatus','Marital Status'],['anniversary','Anniversary']],
  'Contact & Address': [['mobile','Mobile'],['whatsapp','WhatsApp'],['secondaryMobile','Secondary Mobile'],['email','Email'],['address','Address'],['area','Area'],['city','City'],['areaRoute','Area Route No.']],
  'Education': [['qualification','Qualification'],['education','Education / Stream'],['educationStatus','Education Status'],['school','School / College']],
  'Profession': [['profession','Profession'],['professionField','Field'],['companyName','Company'],['occupation','Occupation (legacy)']],
  'Satsang & Follow-up': [['yuvakType','Yuvak Type'],['familyId','Family ID'],['relation','Relation to family head'],['followupKaryakarta','Follow-up Karyakarta'],['followupKaryakartaMobile','Karyakarta Mobile'],['reference','Reference'],['mandal','Mandal'],['type','Family membership']],
  'System': [['id','Yuvak ID'],['status','Status'],['dateOfJoining','Date of Joining'],['notes','Notes']],
};
const ALL_FIELDS = Object.values(TABS).flat();
const READ_ONLY_FIELDS = new Set(['id', 'familyId']);
const FULL_WIDTH_FIELDS = new Set(['address', 'notes']);

const WINGS = ['Yuva Wing', 'Kishore Wing', 'Bal Wing', 'Seniors Wing'];

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
  const [filterKaryakarta, setFilterKaryakarta] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterWing, setFilterWing] = useState('');
  const [filterBlood, setFilterBlood] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [whatsappSameAsMobile, setWhatsappSameAsMobile] = useState(false);
  const [addWhatsappSameAsMobile, setAddWhatsappSameAsMobile] = useState(false);
  const [manualOverride, setManualOverride] = useState({});
  const [saving, setSaving] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagsToAdd, setBulkTagsToAdd] = useState([]);
  const [bulkTagsToRemove, setBulkTagsToRemove] = useState([]);
  const [familyFilter, setFamilyFilter] = useState(null); // familyId -> show all its members
  const [expandedCard, setExpandedCard] = useState(null); // devotee id expanded inline

  const uniqueKaryakartas = useMemo(() => [...new Set(devotees.map(d => d.followupKaryakarta).filter(Boolean))].sort(), [devotees]);
  const uniqueAreas = useMemo(() => [...new Set(devotees.map(d => d.area).filter(Boolean))].sort(), [devotees]);
  const uniqueReferences = useMemo(() => [...new Set(devotees.map(d => d.reference).filter(Boolean))].sort(), [devotees]);
  const uniqueWings = useMemo(() => [...new Set(devotees.map(d => d.wing).filter(Boolean))].sort(), [devotees]);

  const toggleFilterTag = (key) => setSelectedTags((prev) =>
    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  const blankForm = { name:'', firstName:'', middleName:'', lastName:'', mobile:'', whatsapp:'', gender:'', dob:'',
    bloodGroup:'', maritalStatus:'', profession:'', mandal:'Akshar Mandal Surat', wing:'Yuva Wing', area:'', city:'Surat',
    address:'', education:'', occupation:'' };
  const [formData, setFormData] = useState(blankForm);

  useEffect(() => { loadDevotees(); }, []);

  useEffect(() => {
    if (!devoteesPreset || !PRESET_META[devoteesPreset]) return;
    const { tags } = PRESET_META[devoteesPreset];
    setSelectedTags(tags || []);
    setFilterKaryakarta('');
    setFilterArea('');
    setFilterWing('');
    setFilterBlood('');
    setFilterGender('');
    setSearchQuery('');
    setShowTagFilter(devoteesPreset === 'ambrish');
  }, [devoteesPreset]);

  const loadDevotees = () => setDevotees([...dataService.getDevotees()]);

  const presetMeta = devoteesPreset ? PRESET_META[devoteesPreset] : null;
  const presetMatch = presetMeta?.match ?? (() => true);

  const canEdit = user?.role === 'Admin' || user?.role === 'Sevak';

  // Count members per family (to show a "Family (N)" chip on head cards).
  const familySizes = useMemo(() => {
    const m = {};
    devotees.forEach((d) => { if (d.familyId) m[d.familyId] = (m[d.familyId] || 0) + 1; });
    return m;
  }, [devotees]);

  // Plain browsing (no query/tag/preset) lists heads only — family members are
  // hidden until you open their family or search for them.
  const isPlainBrowse = !searchQuery && selectedTags.length === 0 && !filterKaryakarta && !filterArea && !filterWing && !filterBlood && !filterGender && !devoteesPreset;

  // Build the lowercased searchable text for a devotee (name, contacts, address,
  // area, dob variants, karyakarta, tags…).
  const searchText = (d) => [
    d.name, d.firstName, d.middleName, d.lastName,
    d.mobile, d.whatsapp, d.secondaryMobile,
    d.address, d.area, d.city, d.mandal,
    dateSearchForms(d.dob), d.yuvakType, d.followupKaryakarta,
    d.education, d.profession, d.reference,
    ...((d.tags || []).map(tagLabel)),
  ].filter(Boolean).join(' ').toLowerCase();

  const query = searchQuery.trim();
  const filteredDevotees = useMemo(() => {
    let base = devotees.filter((d) => {
      if (familyFilter) return d.familyId === familyFilter; // family view: every member
      if (isPlainBrowse && d.type === 'Family') return false; // hide dependents by default
      if (filterKaryakarta && d.followupKaryakarta !== filterKaryakarta) return false;
      if (filterArea && d.area !== filterArea) return false;
      if (filterWing && d.wing !== filterWing) return false;
      if (filterBlood && d.bloodGroup !== filterBlood) return false;
      if (filterGender && d.gender !== filterGender) return false;
      return hasAnyTag(d, selectedTags) && presetMatch(d);
    });
    if (query) {
      base = base
        .map((d) => ({ d, s: scoreMatch(searchText(d), d.name || '', query) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s) // exact first, then partial, then fuzzy
        .map((x) => x.d);
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devotees, query, selectedTags, filterKaryakarta, filterArea, filterWing, filterBlood, filterGender, familyFilter, devoteesPreset, isPlainBrowse]);

  const familyName = familyFilter
    ? (devotees.find((d) => d.familyId === familyFilter && d.type === 'Primary')?.name
        || devotees.find((d) => d.familyId === familyFilter)?.name || familyFilter)
    : '';

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const name = formData.name || [formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(' ');
    if (!name || !formData.mobile) return;
    const whatsapp = addWhatsappSameAsMobile ? formData.mobile : formData.whatsapp;
    setSaving(true);
    try {
      await dataService.addDevoteeAndSync({ ...formData, whatsapp, name });
      loadDevotees();
      setShowAddModal(false);
      setFormData(blankForm);
      setAddWhatsappSameAsMobile(false);
      await alertDevoteeCreated(name);
    } catch (err) {
      loadDevotees();
      await alertDevoteeSaveFailed(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openProfile = (d) => { setSelectedDevotee(d); setActiveTab('Personal'); setEditing(false); };

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
    payload.familyId = selectedDevotee.familyId;
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
    const updated = dataService.setDevoteeTag(selectedDevotee.id, key, nextOn);
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
      const listOptions = f === 'followupKaryakarta' ? uniqueKaryakartas : f === 'reference' ? uniqueReferences : (FIELD_OPTIONS[f] || []);
      const isManual = manualOverride[f];
      return (
        <div>
          {isManual ? (
            <input value={value} onChange={onChange} className={inputCls} placeholder="Type manually..." />
          ) : (
            <select value={value} onChange={onChange} className={inputCls + ' bg-surface'}>
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


  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
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
              placeholder="Search name, mobile, address, area, DOB - any order"
              className="w-full rounded-2xl border border-border-light bg-surface pl-10 pr-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary dark:focus:border-primary-hover" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowTagFilter((s) => !s)}
              className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold ' +
                ((selectedTags.length || filterKaryakarta || filterArea || filterWing || filterBlood || filterGender) ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-main hover:bg-bg-base')}>
              <Filter className="h-4 w-4" /> Filters{(selectedTags.length || filterKaryakarta || filterArea || filterWing || filterBlood || filterGender) ? ' (Active)' : ''}
            </button>
            
            {canEdit && (
              <button onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
                className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold transition-colors ${selectMode ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-main hover:bg-bg-base'}`}>
                <CheckSquare className="h-4 w-4" /> {selectMode ? 'Cancel Select' : 'Bulk Select'}
              </button>
            )}

            <div className="flex gap-2">
               <button onClick={() => window.print()} title="Print / PDF" className="flex items-center justify-center p-2.5 rounded-2xl border border-border-light bg-surface text-text-main hover:bg-bg-base transition-colors">
                 <Printer className="h-4 w-4" />
               </button>
               <button onClick={() => {
                  const headers = ['ID', 'Name', 'Mobile', 'WhatsApp', 'Area', 'Karyakarta', 'Blood Group', 'Gender', 'Wing'];
                  const csvRows = [headers.join(',')];
                  filteredDevotees.forEach(d => {
                    const row = [d.id, d.name, d.mobile, d.whatsapp, d.area, d.followupKaryakarta, d.bloodGroup, d.gender, d.wing].map(v => `"${(v||'').replace(/"/g, '""')}"`);
                    csvRows.push(row.join(','));
                  });
                  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Devotees_Export_${new Date().toISOString().slice(0,10)}.csv`;
                  a.click();
               }} title="Export CSV" className="flex items-center justify-center gap-2 rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-bold text-text-main hover:bg-bg-base transition-colors">
                 <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
               </button>
            </div>
          </div>
        </div>
      </div>
      
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
          <button 
            disabled={selectedIds.size === 0}
            onClick={() => setShowBulkTagModal(true)}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed">
            Apply Tags
          </button>
        </div>
      )}

      
      {filterKaryakarta && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-2.5 mb-2 animate-slide-up">
          <p className="text-sm font-bold text-text-main flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">Karyakarta: {filterKaryakarta}</span>
          </p>
          <div className="flex items-center gap-2 text-xs font-bold text-text-main shrink-0">
            <span className="bg-surface px-2 py-1 rounded-md border border-border-light shadow-sm">{filteredDevotees.length} Devotees</span>
            <span className="bg-surface px-2 py-1 rounded-md border border-border-light shadow-sm">{new Set(filteredDevotees.map(d => d.familyId || d.id)).size} Families</span>
            <button onClick={() => setFilterKaryakarta('')} className="text-red-500 hover:bg-red-50 px-2 py-1 rounded-md ml-1 transition-colors">Clear</button>
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

      {refreshing ? (
        <ListSkeleton count={6} />
      ) : filteredDevotees.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <img src={devotee.avatar || 'https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name='+encodeURIComponent(devotee.name||'?')}
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

                  {Array.isArray(devotee.tags) && devotee.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {devotee.tags.slice(0, 3).map((key) => (
                        <span key={key} style={tagChipStyle(key)} className="rounded-full px-2 py-0.5 text-[10px] font-bold">{tagLabel(key)}</span>
                      ))}
                      {devotee.tags.length > 3 && (
                        <span className="rounded-full bg-bg-base px-2 py-0.5 text-[10px] font-bold text-text-main">+{devotee.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded inline details */}
              {expanded && (
                <div className="mt-3 rounded-2xl bg-bg-base border border-border-light p-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11.5px] animate-slide-up">
                  {[devotee.area, devotee.city].filter(Boolean).length > 0 && (
                    <p className="flex items-center gap-1.5 text-text-main"><MapPin className="h-3 w-3 text-text-muted shrink-0" /> {[devotee.area, devotee.city].filter(Boolean).join(', ')}</p>
                  )}
                  {devotee.gender && <p className="flex items-center gap-1.5 text-text-main"><User className="h-3 w-3 text-text-muted shrink-0" /> {devotee.gender}</p>}
                  {(devotee.profession || devotee.education) && <p className="flex items-center gap-1.5 text-text-main col-span-2"><Briefcase className="h-3 w-3 text-amber-500 shrink-0" /> <span className="truncate">{[devotee.profession, devotee.education].filter(Boolean).join(' · ')}</span></p>}
                  {devotee.bloodGroup && <p className="flex items-center gap-1.5 text-text-main"><Droplet className="h-3 w-3 text-red-400 shrink-0" /> {devotee.bloodGroup}</p>}
                  {devotee.yuvakType && <p className="flex items-center gap-1.5 text-text-main"><GraduationCap className="h-3 w-3 text-emerald-500 shrink-0" /> {devotee.yuvakType}</p>}
                  {devotee.followupKaryakartaMobile && <p className="flex items-center gap-1.5 text-text-main col-span-2"><Phone className="h-3 w-3 text-blue-500 shrink-0" /> Karyakarta: {devotee.followupKaryakartaMobile}</p>}
                  {devotee.reference && <p className="flex items-center gap-1.5 text-text-main col-span-2 truncate"><Users className="h-3 w-3 text-text-muted shrink-0" /> Ref: {devotee.reference}</p>}
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

      
      {showBulkTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-surface p-5 sm:p-6 shadow-2xl">
            <h2 className="text-xl font-black text-text-main mb-1">Bulk Update Tags</h2>
            <p className="text-sm font-medium text-text-muted mb-4">Assign or remove tags for {selectedIds.size} selected devotees.</p>
            
            <div className="max-h-[50vh] overflow-auto mb-4 border border-border-light rounded-2xl p-4 bg-bg-base">
              {tagsByCategory().map(({ category, tags }) => (
                <div key={category.key} className="mb-4 last:mb-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-text-main mb-2">{category.label}</div>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t) => {
                      const isAdd = bulkTagsToAdd.includes(t.key);
                      const isRem = bulkTagsToRemove.includes(t.key);
                      
                      return (
                        <button key={t.key} 
                          onClick={() => {
                            if (isAdd) { setBulkTagsToAdd(p => p.filter(x => x !== t.key)); setBulkTagsToRemove(p => [...p, t.key]); }
                            else if (isRem) { setBulkTagsToRemove(p => p.filter(x => x !== t.key)); }
                            else { setBulkTagsToAdd(p => [...p, t.key]); }
                          }}
                          className={`rounded-full px-3 py-1 text-[11px] font-bold transition-all border ${isAdd ? 'border-primary bg-primary text-white' : isRem ? 'border-red-500 bg-red-50 text-red-600 line-through' : 'border-border-light bg-surface text-text-muted hover:border-primary/50'}`}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowBulkTagModal(false); setBulkTagsToAdd([]); setBulkTagsToRemove([]); }} className="rounded-xl px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-base">Cancel</button>
              <button 
                disabled={saving || (bulkTagsToAdd.length === 0 && bulkTagsToRemove.length === 0)}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await dataService.bulkUpdateTagsAndSync(Array.from(selectedIds), bulkTagsToAdd, bulkTagsToRemove);
                    loadDevotees();
                    setShowBulkTagModal(false);
                    setSelectMode(false);
                    setSelectedIds(new Set());
                    setBulkTagsToAdd([]);
                    setBulkTagsToRemove([]);
                  } catch (e) {
                    alert('Error updating tags: ' + e.message);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary-hover shadow-sm disabled:opacity-50">
                {saving ? 'Updating...' : 'Update Tags'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Devotee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-surface p-5 sm:p-6 shadow-2xl max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between border-b border-border-light pb-4 mb-4">
              <h2 className="text-lg font-bold text-text-main">Add New Devotee</h2>
              <button onClick={() => setShowAddModal(false)} className="text-text-muted hover:text-text-main"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[['firstName','First Name'],['middleName','Middle Name'],['lastName','Last Name']].map(([f,l]) => (
                  <div key={f}><label className="block text-xs font-bold text-text-main mb-1">{l}</label>
                    <input value={formData[f]} onChange={(e)=>setFormData({...formData,[f]:e.target.value})}
                      className={inputCls + ' text-xs p-2.5'} /></div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-text-main mb-1">Mobile *</label>
                  <input required maxLength={10} inputMode="numeric" value={formData.mobile} onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setFormData({ ...formData, mobile: val, ...(addWhatsappSameAsMobile ? { whatsapp: val } : {}) });
                  }} className={inputCls + ' text-xs p-2.5'} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-text-main">WhatsApp</label>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted cursor-pointer hover:text-text-main">
                      <input type="checkbox" checked={addWhatsappSameAsMobile} onChange={(e) => {
                        setAddWhatsappSameAsMobile(e.target.checked);
                        if (e.target.checked) setFormData(prev => ({ ...prev, whatsapp: prev.mobile }));
                      }} className="rounded text-text-main focus:ring-[#003158]" />
                      Same as mobile
                    </label>
                  </div>
                  <input maxLength={10} inputMode="numeric" value={formData.whatsapp || ''} disabled={addWhatsappSameAsMobile} onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value.replace(/\D/g, '') })}
                    className={inputCls + ' text-xs p-2.5 ' + (addWhatsappSameAsMobile ? 'bg-bg-base opacity-80' : '')} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div><label className="block text-xs font-bold text-text-main mb-1">Date of Birth</label>
                  <input type="date" value={formData.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className={inputCls + ' text-xs p-2.5'} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-text-main mb-1">Gender</label>
                  <select value={formData.gender} onChange={(e)=>setFormData({...formData,gender:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-surface'}>
                    <option value="">— Select —</option>{GENDERS.map(o=><option key={o}>{o}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-text-main mb-1">Blood Group</label>
                  <select value={formData.bloodGroup} onChange={(e)=>setFormData({...formData,bloodGroup:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-surface'}>
                    <option value="">— Select —</option>{BLOOD_GROUPS.map(o=><option key={o}>{o}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-text-main mb-1">Marital Status</label>
                  <select value={formData.maritalStatus || ''} onChange={(e)=>setFormData({...formData,maritalStatus:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-surface'}>
                    <option value="">— Select —</option>{MARITAL_STATUS.map(o=><option key={o}>{o}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-text-main mb-1">Profession</label>
                  <select value={formData.profession || ''} onChange={(e)=>setFormData({...formData,profession:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-surface'}>
                    <option value="">— Select —</option>{PROFESSIONS.map(o=><option key={o}>{o}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-text-main mb-1">Education</label>
                  <input value={formData.education} onChange={(e)=>setFormData({...formData,education:e.target.value})}
                    placeholder="e.g. B.Tech Computer"
                    className={inputCls + ' text-xs p-2.5'} /></div>
                <div><label className="block text-xs font-bold text-text-main mb-1">Occupation</label>
                  <input value={formData.occupation} onChange={(e)=>setFormData({...formData,occupation:e.target.value})}
                    className={inputCls + ' text-xs p-2.5'} /></div>
              </div>
              <div><label className="block text-xs font-bold text-text-main mb-1">Address</label>
                <AutoResizeTextarea value={formData.address} onChange={(e)=>setFormData({...formData,address:e.target.value})} minRows={2}
                  className={inputCls + ' text-xs p-2.5'} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="block text-xs font-bold text-text-main mb-1">Area</label>
                  <input list="dl-add-area" value={formData.area} onChange={(e)=>setFormData({...formData,area:e.target.value})} className={inputCls + ' text-xs p-2.5'} />
                  <datalist id="dl-add-area">{AREAS.map(o=><option key={o} value={o} />)}</datalist></div>
                <div><label className="block text-xs font-bold text-text-main mb-1">City</label>
                  <input value={formData.city} onChange={(e)=>setFormData({...formData,city:e.target.value})} className={inputCls + ' text-xs p-2.5'} /></div>
                <div><label className="block text-xs font-bold text-text-main mb-1">Wing</label>
                  <select value={formData.wing} onChange={(e)=>setFormData({...formData,wing:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-surface'}>
                    {WINGS.map(o=><option key={o}>{o}</option>)}</select></div>
              </div>
              <button type="submit" className="w-full rounded-2xl bg-primary py-3 text-xs font-bold text-white shadow-md hover:bg-[#00223f] mt-2">Save Devotee</button>
            </form>
          </div>
        </div>
      )}

      {/* Profile Modal (tabbed + edit) */}
      {selectedDevotee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-surface shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden">
            <button onClick={() => { setSelectedDevotee(null); setEditing(false); }} className="absolute right-4 top-4 text-text-muted hover:text-text-main z-10"><X className="h-5 w-5" /></button>

            {/* Header */}
            <div className="flex items-center gap-3 p-4 sm:p-6 sm:pb-4 border-b border-border-light">
              <img src={selectedDevotee.avatar || 'https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name='+encodeURIComponent(selectedDevotee.name||'?')}
                alt={selectedDevotee.name} className="h-14 w-14 sm:h-20 sm:w-20 rounded-2xl sm:rounded-3xl object-cover border-2 border-primary shadow-md shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-xl font-bold text-text-main truncate">{selectedDevotee.name}</h2>
                <p className="text-xs sm:text-sm text-slate-500">{val(selectedDevotee.mobile)}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {selectedDevotee.type && (
                    <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full" title="Family membership">
                      {formatFamilyMembershipContext(selectedDevotee.name, selectedDevotee.type)}
                    </span>
                  )}
                  {selectedDevotee.area && <span className="text-[10px] sm:text-[11px] font-semibold text-text-main bg-bg-base px-2 py-0.5 rounded-full">{selectedDevotee.area}</span>}
                  {selectedDevotee.mandal && <span className="text-[10px] sm:text-[11px] font-semibold text-text-main bg-bg-base px-2 py-0.5 rounded-full">{selectedDevotee.mandal}</span>}
                  <span className="text-[10px] sm:text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{selectedDevotee.id}</span>
                </div>
              </div>
            </div>

            {/* Scrollable Tab Bar */}
            <div className="flex overflow-x-auto no-scrollbar gap-1 px-4 sm:px-6 py-2 border-b border-border-light bg-[#FAFBFC]">
              {Object.keys(TABS).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={'shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ' +
                    (activeTab === tab
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-text-muted hover:text-text-main hover:bg-bg-base')}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Body — filtered by active tab */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {(TABS[activeTab] || []).map(([f, label]) => (
                  <div key={f} className={FULL_WIDTH_FIELDS.has(f) ? 'sm:col-span-2' : ''}>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">{label}</div>
                    {editing ? (
                      renderEditField(f, editData, setEditData)
                    ) : (
                      <div className="text-sm font-semibold text-text-main break-words whitespace-pre-wrap">{val(selectedDevotee[f], f)}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Tags section — show only on the last tab (System) */}
              {activeTab === 'System' && (
                <div className="mt-4 pt-4 border-t border-border-light">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Tags</div>
                  {Array.isArray(selectedDevotee.tags) && selectedDevotee.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDevotee.tags.map((key) => (
                        <span key={key} style={tagChipStyle(key)} className="rounded-full px-2.5 py-0.5 text-[11px] font-bold">{tagLabel(key)}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-text-muted">No tags yet.</p>
                  )}

                  {canEdit && (
                    <div className="mt-4 space-y-4">
                      <p className="text-[11px] font-bold text-text-muted">Tap a tag to add or remove it.</p>
                      {tagsByCategory().map(({ category, tags }) => (
                        <div key={category.key}>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-text-main mb-2">{category.label}</div>
                          <div className="flex flex-wrap gap-2">
                            {tags.map((t) => {
                              const active = (selectedDevotee.tags || []).includes(t.key);
                              return (
                                <button key={t.key} onClick={() => toggleProfileTag(t.key, !active)}
                                  style={active ? tagChipStyle(t.key) : undefined}
                                  className={'rounded-full px-3 py-1 text-[11px] font-bold ' +
                                    (active ? '' : 'border border-border-light bg-surface text-text-muted hover:border-primary hover:text-text-main')}>
                                  {t.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            {canEdit && (
              <div className="flex items-center gap-2 p-4 border-t border-border-light">
                {editing ? (
                  <>
                    <button onClick={saveEdit} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-xs font-bold text-white hover:bg-[#00223f]"><Save className="h-4 w-4" /> Save Changes</button>
                    <button onClick={() => setEditing(false)} className="rounded-2xl border border-border-light px-4 py-2.5 text-xs font-bold text-text-main hover:bg-bg-base">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={startEdit} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-xs font-bold text-white hover:bg-[#00223f]"><Pencil className="h-4 w-4" /> Edit Profile</button>
                    <button onClick={() => handleDelete(selectedDevotee.id)} className="rounded-2xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrModalDevotee && (
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
      )}
    </div>
  );
}
