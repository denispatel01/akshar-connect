import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, QrCode, X, MapPin, Phone, Trash2, Pencil, Save } from 'lucide-react';
import { dataService } from '../services/dataService';
import AutoResizeTextarea from '../components/AutoResizeTextarea';
import { alertDevoteeCreated, alertDevoteeSaved, alertDevoteeSaveFailed } from '../utils/sweetAlert';
import { tagsByCategory, tagLabel, tagChipStyle } from '../services/tagCatalog';
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
const DATALIST_FIELDS = new Set(['area']);

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
    match: (d) => d.flags?.includes('Birthday Today'),
    banner: "Showing devotees with a birthday today",
  },
};

export default function DevoteesPage({ user, devoteesPreset, onClearDevoteesPreset }) {
  const [devotees, setDevotees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDevotee, setSelectedDevotee] = useState(null);
  const [qrModalDevotee, setQrModalDevotee] = useState(null);
  const [activeTab, setActiveTab] = useState('Personal');
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [selectedTags, setSelectedTags] = useState([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [whatsappSameAsMobile, setWhatsappSameAsMobile] = useState(false);
  const [addWhatsappSameAsMobile, setAddWhatsappSameAsMobile] = useState(false);
  const [saving, setSaving] = useState(false);

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
    setSelectedTags(tags);
    setSearchQuery('');
    setShowTagFilter(devoteesPreset === 'ambrish');
  }, [devoteesPreset]);

  const loadDevotees = () => setDevotees([...dataService.getDevotees()]);

  const presetMeta = devoteesPreset ? PRESET_META[devoteesPreset] : null;
  const presetMatch = presetMeta?.match ?? (() => true);

  const canEdit = user?.role === 'Admin' || user?.role === 'Sevak';

  const filteredDevotees = devotees.filter((d) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (d.name || '').toLowerCase().includes(q)
      || String(d.mobile || '').includes(searchQuery)
      || (d.city || '').toLowerCase().includes(q)
      || (d.mandal || '').toLowerCase().includes(q);
    return matchesSearch && hasAnyTag(d, selectedTags) && presetMatch(d);
  });

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

  const inputCls = 'w-full rounded-xl border border-[#E0EAF4] p-2 text-sm font-semibold text-[#003158] outline-none focus:border-[#003158]';

  // Smart field renderer for edit mode — dropdowns, datalist, textarea, date, tel as appropriate
  const renderEditField = (f, data, setData) => {
    if (READ_ONLY_FIELDS.has(f)) {
      return (
        <div className="rounded-xl border border-[#E4EBF3] bg-[#F0F4F8] px-3 py-2 text-sm font-semibold text-[#003158] break-words">
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

    // Datalist fields (dropdown + manual entry combo)
    if (DATALIST_FIELDS.has(f) && options) {
      const listId = `dl-${f}`;
      return (
        <>
          <input list={listId} value={value} onChange={onChange} className={inputCls} />
          <datalist id={listId}>
            {options.map(o => <option key={o} value={o} />)}
          </datalist>
        </>
      );
    }
    // Pure select dropdown
    if (options) {
      const labelFor = (o) => (f === 'type' ? formatFamilyRecordType(o) : o);
      return (
        <select value={value} onChange={onChange} className={inputCls + ' bg-white'}>
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
            className={inputCls + (f === 'whatsapp' && whatsappSameAsMobile ? ' bg-[#F0F4F8] opacity-80' : '')}
          />
          {f === 'whatsapp' && (
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-[#9BB5CB] cursor-pointer hover:text-[#003158] w-fit">
              <input type="checkbox" checked={whatsappSameAsMobile} onChange={(e) => {
                setWhatsappSameAsMobile(e.target.checked);
                if (e.target.checked) setData(prev => ({ ...prev, whatsapp: prev.mobile }));
              }} className="rounded text-[#003158] focus:ring-[#003158]" />
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
          <h1 className="text-2xl font-bold text-[#003158]">Devotee Directory</h1>
          <p className="text-sm font-medium text-[#9BB5CB]">
            {filteredDevotees.length === devotees.length
              ? `${devotees.length} members`
              : `${filteredDevotees.length} of ${devotees.length} members`}
            {' '}· view profiles, edit details, generate QR passes.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => { setFormData(blankForm); setShowAddModal(true); }}
            className="flex items-center gap-2 rounded-2xl bg-[#003158] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#00223f]">
            <Plus className="h-4 w-4" /> Add New Devotee
          </button>
        )}
      </div>

      {presetMeta && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#003158]/20 bg-[#003158]/5 px-4 py-3">
          <p className="text-xs font-bold text-[#003158]">{presetMeta.banner}</p>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#9BB5CB]" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, mobile, city, or mandal..."
            className="w-full rounded-2xl border border-[#E0EAF4] bg-white pl-10 pr-4 py-2.5 text-sm font-semibold text-[#003158] outline-none focus:border-[#003158]" />
        </div>
        <button onClick={() => setShowTagFilter((s) => !s)}
          className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold ' +
            (selectedTags.length ? 'border-[#003158] bg-[#003158] text-white' : 'border-[#E0EAF4] bg-white text-[#003158] hover:bg-[#F0F4F8]')}>
          <Filter className="h-4 w-4" /> Filter by tag{selectedTags.length ? ` (${selectedTags.length})` : ''}
        </button>
      </div>

      {showTagFilter && (
        <div className="rounded-3xl border border-[#E4EBF3] bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#9BB5CB]">Showing devotees with ANY selected tag.</p>
            {selectedTags.length > 0 && (
              <button onClick={() => setSelectedTags([])} className="text-xs font-bold text-[#FF862A] hover:underline">Clear</button>
            )}
          </div>
          {tagsByCategory().map(({ category, tags }) => (
            <div key={category.key}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#003158] mb-2">{category.label}</div>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const active = selectedTags.includes(t.key);
                  return (
                    <button key={t.key} onClick={() => toggleFilterTag(t.key)}
                      style={active ? tagChipStyle(t.key) : undefined}
                      className={'rounded-full px-3 py-1 text-[11px] font-bold ' +
                        (active ? '' : 'border border-[#E4EBF3] bg-white text-[#9BB5CB] hover:border-[#003158] hover:text-[#003158]')}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredDevotees.map((devotee) => (
          <div key={devotee.id} className="rounded-3xl border border-[#E4EBF3] bg-white p-5 shadow-xs hover:border-[#003158] hover:shadow-md">
            <div className="flex items-start gap-4">
              <img src={devotee.avatar || 'https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name='+encodeURIComponent(devotee.name||'?')}
                alt={devotee.name} className="h-14 w-14 rounded-2xl object-cover border border-[#E4EBF3]" />
              <div className="min-w-0 flex-1">
                {devotee.wing && <span className="text-[10px] font-bold text-[#FF862A] uppercase tracking-wider block">{devotee.wing}</span>}
                <h3 className="text-base font-bold text-[#003158] truncate">{devotee.name}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3 text-[#9BB5CB]" /> {val(devotee.mobile)}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3 text-[#9BB5CB]" /> {[devotee.area, devotee.city].filter(Boolean).join(', ') || val('')}</p>
              </div>
            </div>
            {Array.isArray(devotee.tags) && devotee.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {devotee.tags.slice(0, 3).map((key) => (
                  <span key={key} style={tagChipStyle(key)} className="rounded-full px-2 py-0.5 text-[10px] font-bold">{tagLabel(key)}</span>
                ))}
                {devotee.tags.length > 3 && (
                  <span className="rounded-full bg-[#F0F4F8] px-2 py-0.5 text-[10px] font-bold text-[#003158]">+{devotee.tags.length - 3}</span>
                )}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-[#F0F4F8] flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#003158] bg-[#F0F4F8] px-2.5 py-1 rounded-full">{devotee.id}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setQrModalDevotee(devotee)} title="QR Pass" className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-[#FF862A] hover:bg-amber-100"><QrCode className="h-4 w-4" /></button>
                <button onClick={() => openProfile(devotee)} className="rounded-xl border border-[#E4EBF3] px-3 py-1 text-xs font-bold text-[#003158] hover:bg-[#F0F4F8]">View Profile</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {filteredDevotees.length === 0 && (
        <p className="text-center text-sm font-semibold text-[#9BB5CB] py-12">No devotees match this view.</p>
      )}

      {/* Add Devotee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 sm:p-6 shadow-2xl max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between border-b border-[#E0EAF4] pb-4 mb-4">
              <h2 className="text-lg font-bold text-[#003158]">Add New Devotee</h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#9BB5CB] hover:text-[#003158]"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[['firstName','First Name'],['middleName','Middle Name'],['lastName','Last Name']].map(([f,l]) => (
                  <div key={f}><label className="block text-xs font-bold text-[#003158] mb-1">{l}</label>
                    <input value={formData[f]} onChange={(e)=>setFormData({...formData,[f]:e.target.value})}
                      className={inputCls + ' text-xs p-2.5'} /></div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#003158] mb-1">Mobile *</label>
                  <input required maxLength={10} inputMode="numeric" value={formData.mobile} onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setFormData({ ...formData, mobile: val, ...(addWhatsappSameAsMobile ? { whatsapp: val } : {}) });
                  }} className={inputCls + ' text-xs p-2.5'} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#003158]">WhatsApp</label>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-[#9BB5CB] cursor-pointer hover:text-[#003158]">
                      <input type="checkbox" checked={addWhatsappSameAsMobile} onChange={(e) => {
                        setAddWhatsappSameAsMobile(e.target.checked);
                        if (e.target.checked) setFormData(prev => ({ ...prev, whatsapp: prev.mobile }));
                      }} className="rounded text-[#003158] focus:ring-[#003158]" />
                      Same as mobile
                    </label>
                  </div>
                  <input maxLength={10} inputMode="numeric" value={formData.whatsapp || ''} disabled={addWhatsappSameAsMobile} onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value.replace(/\D/g, '') })}
                    className={inputCls + ' text-xs p-2.5 ' + (addWhatsappSameAsMobile ? 'bg-[#F0F4F8] opacity-80' : '')} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Date of Birth</label>
                  <input type="date" value={formData.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className={inputCls + ' text-xs p-2.5'} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Gender</label>
                  <select value={formData.gender} onChange={(e)=>setFormData({...formData,gender:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-white'}>
                    <option value="">— Select —</option>{GENDERS.map(o=><option key={o}>{o}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Blood Group</label>
                  <select value={formData.bloodGroup} onChange={(e)=>setFormData({...formData,bloodGroup:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-white'}>
                    <option value="">— Select —</option>{BLOOD_GROUPS.map(o=><option key={o}>{o}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Marital Status</label>
                  <select value={formData.maritalStatus || ''} onChange={(e)=>setFormData({...formData,maritalStatus:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-white'}>
                    <option value="">— Select —</option>{MARITAL_STATUS.map(o=><option key={o}>{o}</option>)}</select></div>
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Profession</label>
                  <select value={formData.profession || ''} onChange={(e)=>setFormData({...formData,profession:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-white'}>
                    <option value="">— Select —</option>{PROFESSIONS.map(o=><option key={o}>{o}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Education</label>
                  <input value={formData.education} onChange={(e)=>setFormData({...formData,education:e.target.value})}
                    placeholder="e.g. B.Tech Computer"
                    className={inputCls + ' text-xs p-2.5'} /></div>
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Occupation</label>
                  <input value={formData.occupation} onChange={(e)=>setFormData({...formData,occupation:e.target.value})}
                    className={inputCls + ' text-xs p-2.5'} /></div>
              </div>
              <div><label className="block text-xs font-bold text-[#003158] mb-1">Address</label>
                <AutoResizeTextarea value={formData.address} onChange={(e)=>setFormData({...formData,address:e.target.value})} minRows={2}
                  className={inputCls + ' text-xs p-2.5'} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Area</label>
                  <input list="dl-add-area" value={formData.area} onChange={(e)=>setFormData({...formData,area:e.target.value})} className={inputCls + ' text-xs p-2.5'} />
                  <datalist id="dl-add-area">{AREAS.map(o=><option key={o} value={o} />)}</datalist></div>
                <div><label className="block text-xs font-bold text-[#003158] mb-1">City</label>
                  <input value={formData.city} onChange={(e)=>setFormData({...formData,city:e.target.value})} className={inputCls + ' text-xs p-2.5'} /></div>
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Wing</label>
                  <select value={formData.wing} onChange={(e)=>setFormData({...formData,wing:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-white'}>
                    {WINGS.map(o=><option key={o}>{o}</option>)}</select></div>
              </div>
              <button type="submit" className="w-full rounded-2xl bg-[#003158] py-3 text-xs font-bold text-white shadow-md hover:bg-[#00223f] mt-2">Save Devotee</button>
            </form>
          </div>
        </div>
      )}

      {/* Profile Modal (tabbed + edit) */}
      {selectedDevotee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden">
            <button onClick={() => { setSelectedDevotee(null); setEditing(false); }} className="absolute right-4 top-4 text-[#9BB5CB] hover:text-[#003158] z-10"><X className="h-5 w-5" /></button>

            {/* Header */}
            <div className="flex items-center gap-3 p-4 sm:p-6 sm:pb-4 border-b border-[#F0F4F8]">
              <img src={selectedDevotee.avatar || 'https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name='+encodeURIComponent(selectedDevotee.name||'?')}
                alt={selectedDevotee.name} className="h-14 w-14 sm:h-20 sm:w-20 rounded-2xl sm:rounded-3xl object-cover border-2 border-[#003158] shadow-md shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-xl font-bold text-[#003158] truncate">{selectedDevotee.name}</h2>
                <p className="text-xs sm:text-sm text-slate-500">{val(selectedDevotee.mobile)}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {selectedDevotee.type && (
                    <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full" title="Family membership">
                      {formatFamilyMembershipContext(selectedDevotee.name, selectedDevotee.type)}
                    </span>
                  )}
                  {selectedDevotee.area && <span className="text-[10px] sm:text-[11px] font-semibold text-[#003158] bg-[#F0F4F8] px-2 py-0.5 rounded-full">{selectedDevotee.area}</span>}
                  {selectedDevotee.mandal && <span className="text-[10px] sm:text-[11px] font-semibold text-[#003158] bg-[#F0F4F8] px-2 py-0.5 rounded-full">{selectedDevotee.mandal}</span>}
                  <span className="text-[10px] sm:text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{selectedDevotee.id}</span>
                </div>
              </div>
            </div>

            {/* Scrollable Tab Bar */}
            <div className="flex overflow-x-auto no-scrollbar gap-1 px-4 sm:px-6 py-2 border-b border-[#F0F4F8] bg-[#FAFBFC]">
              {Object.keys(TABS).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={'shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ' +
                    (activeTab === tab
                      ? 'bg-[#003158] text-white shadow-sm'
                      : 'text-[#9BB5CB] hover:text-[#003158] hover:bg-[#F0F4F8]')}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Body — filtered by active tab */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {(TABS[activeTab] || []).map(([f, label]) => (
                  <div key={f} className={FULL_WIDTH_FIELDS.has(f) ? 'sm:col-span-2' : ''}>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#9BB5CB] mb-1">{label}</div>
                    {editing ? (
                      renderEditField(f, editData, setEditData)
                    ) : (
                      <div className="text-sm font-semibold text-[#003158] break-words whitespace-pre-wrap">{val(selectedDevotee[f], f)}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Tags section — show only on the last tab (System) */}
              {activeTab === 'System' && (
                <div className="mt-4 pt-4 border-t border-[#F0F4F8]">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#9BB5CB] mb-2">Tags</div>
                  {Array.isArray(selectedDevotee.tags) && selectedDevotee.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDevotee.tags.map((key) => (
                        <span key={key} style={tagChipStyle(key)} className="rounded-full px-2.5 py-0.5 text-[11px] font-bold">{tagLabel(key)}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-[#9BB5CB]">No tags yet.</p>
                  )}

                  {canEdit && (
                    <div className="mt-4 space-y-4">
                      <p className="text-[11px] font-bold text-[#9BB5CB]">Tap a tag to add or remove it.</p>
                      {tagsByCategory().map(({ category, tags }) => (
                        <div key={category.key}>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-[#003158] mb-2">{category.label}</div>
                          <div className="flex flex-wrap gap-2">
                            {tags.map((t) => {
                              const active = (selectedDevotee.tags || []).includes(t.key);
                              return (
                                <button key={t.key} onClick={() => toggleProfileTag(t.key, !active)}
                                  style={active ? tagChipStyle(t.key) : undefined}
                                  className={'rounded-full px-3 py-1 text-[11px] font-bold ' +
                                    (active ? '' : 'border border-[#E4EBF3] bg-white text-[#9BB5CB] hover:border-[#003158] hover:text-[#003158]')}>
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
              <div className="flex items-center gap-2 p-4 border-t border-[#F0F4F8]">
                {editing ? (
                  <>
                    <button onClick={saveEdit} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-[#003158] py-2.5 text-xs font-bold text-white hover:bg-[#00223f]"><Save className="h-4 w-4" /> Save Changes</button>
                    <button onClick={() => setEditing(false)} className="rounded-2xl border border-[#E4EBF3] px-4 py-2.5 text-xs font-bold text-[#003158] hover:bg-[#F0F4F8]">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={startEdit} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-[#003158] py-2.5 text-xs font-bold text-white hover:bg-[#00223f]"><Pencil className="h-4 w-4" /> Edit Profile</button>
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
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center relative">
            <button onClick={() => setQrModalDevotee(null)} className="absolute right-4 top-4 text-[#9BB5CB] hover:text-[#003158]"><X className="h-5 w-5" /></button>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#FF862A] block mb-1">Akshar Connect Pass</span>
            <h3 className="text-lg font-bold text-[#003158] mb-4">{qrModalDevotee.name}</h3>
            <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-2xl border-4 border-[#003158] bg-slate-950 p-4 shadow-inner">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrModalDevotee.id)}`} alt="QR" className="h-full w-full rounded-xl bg-white p-2" />
            </div>
            <p className="mt-4 text-xs font-bold text-[#003158]">{qrModalDevotee.id}</p>
            <p className="text-[11px] text-slate-400 mt-1">Scan at sabha entry for instant attendance</p>
          </div>
        </div>
      )}
    </div>
  );
}
