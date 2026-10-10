import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Check, Camera, Phone, MapPin, User, UserCheck, AlertTriangle, UserPlus, Save, Calendar } from 'lucide-react';
import { dataService } from '../services/dataService';
import {
  AREAS, GENDERS, BLOOD_GROUPS, MARITAL_STATUS, YUVAK_TYPES,
  QUALIFICATIONS, EDUCATION_STATUS, PROFESSIONS, RELATIONS, GRADES, deriveAge, gradeDisplay,
} from '../services/devoteeSchema';
import { tagsByCategory, tagChipStyle, tagLabel, getMutuallyExclusiveKeys } from '../services/tagCatalog';
import AutoResizeTextarea from './AutoResizeTextarea';
import { focusNextOnEnter } from '../utils/formNav';
import { alertDevoteeSaveFailed } from '../utils/sweetAlert';

const STEPS = ['Basics', 'Additional', 'Satsang', 'Review'];
const todayISO = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  firstName: '', middleName: '', lastName: '', name: '', gender: 'Male', dob: '', bloodGroup: '',
  maritalStatus: '', anniversary: '', yuvakType: '', photo: '',
  mobile: '', whatsapp: '', email: '', area: '', address: '', mandal: 'Adajan',
  qualification: '', education: '', educationStatus: 'Completed', school: '', grade: '', gradeAsOf: '',
  profession: '', professionField: '', companyName: '',
  followupKaryakarta: '', followupKaryakartaMobile: '', reference: '', notes: '', tags: [],
  familyId: '', type: 'Primary', relation: 'Self', dateOfJoining: todayISO(), oldNew: 'New',
});

const inputCls = 'w-full rounded-2xl border border-border-light bg-surface px-4 py-3 text-sm font-semibold text-text-main outline-none transition-colors placeholder:font-medium placeholder:text-text-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/15';

// Colorful section cards (#56) — each step section gets its own soft gradient wash
// and matching border so the Add form isn't a wall of white. Dark mode falls back
// to a subtle slate tint. Inputs stay white for contrast.
// The wizard is force-rendered in the LIGHT gradient theme (see the root --color-*
// overrides), so the section cards keep their light gradients even in dark mode —
// no dark: variants here, guaranteeing it always matches the target design.
const DARK_CARD = '';
const CARD_BASE = 'rounded-3xl border bg-gradient-to-br p-5 sm:p-6 shadow-xs space-y-5';
const CARD = {
  basics:     `${CARD_BASE} from-orange-50 to-amber-50 border-orange-200/70 ${DARK_CARD}`,
  contact:    `${CARD_BASE} from-sky-50 to-cyan-50 border-sky-200/70 ${DARK_CARD}`,
  education:  `${CARD_BASE} from-emerald-50 to-teal-50 border-emerald-200/70 ${DARK_CARD}`,
  profession: `${CARD_BASE} from-violet-50 to-fuchsia-50 border-violet-200/70 ${DARK_CARD}`,
  family:     `${CARD_BASE} from-rose-50 to-pink-50 border-rose-200/70 ${DARK_CARD}`,
};
const Label = ({ children, req }) => (
  <label className="block text-sm font-bold text-text-main mb-1.5">
    {children}{req && <span className="text-red-500"> *</span>}
  </label>
);

// Small searchable family-head picker.
function HeadPicker({ heads, value, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const selected = heads.find((h) => h.familyId === value);
  const ql = q.trim().toLowerCase();
  const matches = (ql ? heads.filter((h) => (h.name || '').toLowerCase().includes(ql) || (h.area || '').toLowerCase().includes(ql)) : heads).slice(0, 40);
  return (
    <div className="relative">
      <input value={open ? q : (selected ? `${selected.name}${selected.area ? ` — ${selected.area}` : ''}` : '')}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setQ(''); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Search head by name or area…" className={inputCls} />
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border-light bg-surface shadow-lg">
          {value ? <button type="button" onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); }} className="block w-full text-left px-3 py-2 text-xs font-bold text-red-500 hover:bg-bg-base border-b border-border-light">Clear</button> : null}
          {matches.length === 0 && <p className="px-3 py-2 text-xs font-semibold text-text-muted">No matching head</p>}
          {matches.map((h) => (
            <button type="button" key={h.familyId} onMouseDown={(e) => { e.preventDefault(); onChange(h.familyId); setOpen(false); }}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-bg-base ${h.familyId === value ? 'bg-primary/5 font-bold text-primary' : 'text-text-main'}`}>
              {h.name}{h.area ? <span className="text-text-muted"> — {h.area}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Searchable combo that works on iOS (real dropdown, unlike <datalist>). Allows
// free typing AND picking from the list.
// Capitalize the first letter of every word (#89/#110).
const capWordsFn = (s) => String(s).replace(/(^|\s)([a-z])/g, (m, sp, c) => sp + c.toUpperCase());
// Keep the last 10 digits of a phone value, so pasting "+91 83472 29948" cleans
// to "8347229948" (drops country code / spaces automatically).
const last10 = (s) => { const d = String(s).replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };

// Date of birth input (#127): type it as DD-MM-YYYY (free text) OR pick from the
// calendar. Stores ISO (yyyy-mm-dd) internally. The 📅 button opens the native picker.
const isoToDisplay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (iso || '');
};
const displayToIso = (s) => {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(String(s || '').trim());
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = (parseInt(y, 10) > 30 ? '19' : '20') + y;
  d = d.padStart(2, '0'); mo = mo.padStart(2, '0');
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${mo}-${d}`;
};
function DobField({ value, onChange }) {
  const [text, setText] = useState(isoToDisplay(value));
  useEffect(() => { setText(isoToDisplay(value)); }, [value]);
  // Auto-format digits as DD-MM-YYYY while typing (#127): "01121995" → "01-12-1995".
  const handleType = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = digits.slice(0, 2) + '-' + digits.slice(2, 4) + '-' + digits.slice(4);
    else if (digits.length > 2) out = digits.slice(0, 2) + '-' + digits.slice(2);
    setText(out);
    const iso = displayToIso(out);
    if (iso) onChange(iso);
  };
  return (
    <div className="relative">
      <input value={text} inputMode="numeric" placeholder="DD-MM-YYYY"
        onChange={handleType}
        onBlur={(e) => { const iso = displayToIso(e.target.value); if (iso) onChange(iso); }}
        className={inputCls + ' pr-11'} />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center text-text-muted pointer-events-none">
        <Calendar className="h-4 w-4" />
      </span>
      {/* A real date input sits (invisibly) over the icon, so tapping it opens the
          native calendar reliably across browsers. */}
      <input type="date" value={value || ''} max="2100-12-31"
        onChange={(e) => onChange(e.target.value)}
        className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 cursor-pointer opacity-0"
        aria-label="Pick date from calendar" />
    </div>
  );
}

function Combo({ options, value, onChange, placeholder, capitalize }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ql = q.trim().toLowerCase();
  const matches = (ql ? options.filter((o) => String(o).toLowerCase().includes(ql)) : options).slice(0, 50);
  // When typing a value that isn't in the list, title-case it so manually added
  // areas stay consistent with the dropdown ones (#110).
  const emit = (raw) => onChange(capitalize ? capWordsFn(raw) : raw);
  return (
    <div className="relative">
      <input value={open ? q : (value || '')}
        onChange={(e) => { const v = capitalize ? capWordsFn(e.target.value) : e.target.value; setQ(v); emit(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(value || ''); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder} className={inputCls} />
      {open && matches.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-border-light bg-surface shadow-lg">
          {matches.map((o) => (
            <button type="button" key={o} onMouseDown={(e) => { e.preventDefault(); onChange(o); setQ(o); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-sm text-text-main hover:bg-bg-base">{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AddDevoteeWizard({ user, devotees, familyHeads, karyakartaOptions, karyakartaMobileFor, referenceOptions, headRecordByFamilyId, areaOptions = AREAS, onClose, onCreated, editDevotee, onSaved }) {
  const isEdit = !!editDevotee;
  // Seed the form from an existing devotee when editing (#edit-wizard).
  const initialForm = () => {
    if (!editDevotee) return blank();
    const b = blank();
    Object.keys(b).forEach((k) => { if (editDevotee[k] !== undefined && editDevotee[k] !== null) b[k] = editDevotee[k]; });
    b.tags = Array.isArray(editDevotee.tags) ? [...editDevotee.tags] : [];
    b.name = editDevotee.name || b.name;
    // A family head's familyId points at their own record. Show the head picker as
    // blank ("heads own family"); buildPayload restores the id on save.
    if (editDevotee.type === 'Primary' || (editDevotee.familyId && editDevotee.familyId === editDevotee.id)) {
      b.familyId = ''; b.type = 'Primary'; b.relation = 'Self';
    }
    return b;
  };
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(0);
  const [waSame, setWaSame] = useState(() => {
    if (!editDevotee) return false;
    const m = String(editDevotee.mobile || '');
    return !!(m && String(editDevotee.whatsapp || '') === m);
  });
  const [savedMsg, setSavedMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  // Capitalize the first letter of every word (#89) — for name/text fields.
  const capWords = (s) => String(s).replace(/(^|\s)([a-z])/g, (m, sp, c) => sp + c.toUpperCase());
  const setCap = (key) => (e) => set({ [key]: capWords(e.target.value) });
  // Distinct school names already in use — so new entries can reuse them for
  // consistency instead of re-typing "Radiant" five different ways (#111).
  const schoolOptions = useMemo(() => {
    const set = new Set();
    (devotees || []).forEach((d) => { const s = String(d.school || '').trim(); if (s) set.add(s); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [devotees]);
  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ');
  // Profile completion % across the key fields (#114).
  const completionPct = useMemo(() => {
    const checks = [
      form.firstName, form.lastName, form.mobile, form.dob, form.gender, form.area, form.address,
      form.yuvakType, (form.school || form.profession || form.qualification),
      (form.followupKaryakarta || form.reference), form.photo, (form.tags && form.tags.length),
    ];
    const filled = checks.filter((v) => Array.isArray(v) ? v.length : String(v || '').trim()).length;
    return Math.round((filled / checks.length) * 100);
  }, [form]);

  // Per-step completion % shown inside each step circle (#114 reference).
  const STEP_FIELDS = [
    ['firstName', 'lastName', 'dob', 'gender', 'mobile', 'photo'],
    ['area', 'address', 'yuvakType', 'bloodGroup', 'maritalStatus',
      'qualification', 'education', 'school', 'profession', 'whatsapp', 'email'],
    ['followupKaryakarta', 'reference', 'tags'],
  ];
  const stepPct = (i) => {
    if (i >= 3) return completionPct; // Review step mirrors the overall completion
    const f = STEP_FIELDS[i] || [];
    const filled = f.filter((k) => k === 'tags' ? (form.tags && form.tags.length) : String(form[k] || '').trim()).length;
    return f.length ? Math.round((filled / f.length) * 100) : 0;
  };
  // Name of the chosen family head, for the review summary (#92).
  const headName = (familyHeads.find((h) => h.familyId === form.familyId) || {}).name || '';

  const selfId = editDevotee?.id;
  const dupMobile = useMemo(
    () => (form.mobile.length === 10 ? devotees.find((d) => String(d.mobile) === form.mobile && d.id !== selfId) : null),
    [form.mobile, devotees, selfId]);
  const dupNames = useMemo(() => {
    const fn = form.firstName.trim().toLowerCase(), ln = form.lastName.trim().toLowerCase();
    if (!fn || !ln) return [];
    return devotees.filter((d) => d.id !== selfId && (d.firstName || '').toLowerCase() === fn && (d.lastName || '').toLowerCase() === ln).slice(0, 3);
  }, [form.firstName, form.lastName, devotees, selfId]);

  const pickHead = (fid) => {
    if (!fid) { set({ familyId: '', type: 'Primary', relation: 'Self' }); return; }
    const h = headRecordByFamilyId.get(fid);
    set({
      familyId: fid, type: 'Family', relation: form.relation === 'Self' ? '' : form.relation,
      ...(h ? {
        address: h.address || form.address, area: h.area || form.area,
        followupKaryakarta: h.followupKaryakarta || form.followupKaryakarta,
        followupKaryakartaMobile: h.followupKaryakartaMobile || form.followupKaryakartaMobile,
        lastName: form.lastName || h.lastName || '',
      } : {}),
    });
  };

  const onPhotoFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
        const ctx = c.getContext('2d');
        const m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2;
        ctx.drawImage(img, sx, sy, m, m, 0, 0, S, S);
        const dataUri = c.toDataURL('image/jpeg', 0.72);
        // Instant: keep the photo locally and let Save return immediately. The
        // heavy Drive upload happens in the background after save, and only the
        // Drive URL is written to the sheet (never the base64). (#107)
        set({ photo: dataUri });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  // Mobile is optional for female devotees (#114); for others it must be 10 digits.
  // A partial number (1–9 digits) is always invalid.
  const mobileOk = form.gender === 'Female'
    ? (form.mobile.length === 0 || form.mobile.length === 10)
    : form.mobile.length === 10;
  const step0Valid = !!form.firstName.trim() && mobileOk;
  const canNext = step === 0 ? step0Valid : true;

  const SECTION_TITLE = ['Personal Details', 'Contact & Background', 'Family, Satsang & Tags', 'Review & Save'];

  const buildPayload = () => {
    const p = {
      ...form, name: fullName || form.name,
      whatsapp: waSame ? form.mobile : form.whatsapp,
      mandal: form.mandal || 'Adajan',
    };
    // On edit, a self-headed devotee keeps their own family id even though the
    // picker showed blank; don't wipe it.
    if (isEdit && !p.familyId && (p.type === 'Primary' || !p.type)) {
      p.familyId = editDevotee.familyId || editDevotee.id;
      p.type = 'Primary'; p.relation = 'Self';
    }
    return p;
  };

  const save = async (addAnother) => {
    if (!step0Valid) { setStep(0); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const updated = await dataService.updateDevoteeAndSync(editDevotee.id, buildPayload());
        onSaved?.(updated);
        return;
      }
      const created = await dataService.addDevoteeAndSync(buildPayload());
      if (addAnother) {
        const keep = {
          familyId: (!form.familyId && created.familyId) ? created.familyId : form.familyId,
          address: form.address, area: form.area, mandal: form.mandal,
          followupKaryakarta: form.followupKaryakarta, followupKaryakartaMobile: form.followupKaryakartaMobile,
          reference: form.reference,
        };
        setForm({ ...blank(), ...keep, type: keep.familyId ? 'Family' : 'Primary', relation: keep.familyId ? '' : 'Self' });
        setWaSame(false); setStep(0);
        setSavedMsg(`Saved ${created.name}. Add the next family member →`);
        setTimeout(() => setSavedMsg(''), 4000);
      } else {
        onCreated?.(created);
      }
    } catch (err) {
      await alertDevoteeSaveFailed(err.message);
    } finally { setSaving(false); }
  };

  const avatar = form.photo || 'https://ui-avatars.com/api/?background=003158&color=fff&bold=true&size=128&name=' + encodeURIComponent(fullName || '?');

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col"
      style={{
        // Light-blue background, and force the LIGHT theme for the whole wizard
        // (override the theme tokens) so it stays light even in dark mode.
        background: '#EAF4FF',
        // Override the resolved --color-* tokens (what Tailwind utilities read) so
        // the whole wizard renders LIGHT even when the app is in dark mode.
        '--color-surface': '#FFFFFF', '--color-surface-hover': '#F3F8FF', '--color-bg-base': '#EAF4FF',
        '--color-text-main': '#26303B', '--color-text-muted': '#6B7684', '--color-border-light': '#DCE8F5',
        '--color-primary': '#FF862A', '--color-primary-hover': '#E56F18', '--color-accent': '#FF862A',
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)',
      }}
      onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>

      <div className="border-b border-border-light bg-surface px-4 sm:px-6 py-4 shrink-0">
        {/* Header: back + title + Cancel */}
        <div className="mx-auto w-full max-w-3xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button type="button" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border-light bg-surface text-text-main hover:bg-bg-base hover:border-primary transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg sm:text-xl font-black text-text-main truncate">{isEdit ? 'Edit Devotee' : 'Add New Devotee'}</h2>
          </div>
          <button type="button" onClick={onClose}
            className="shrink-0 rounded-2xl border border-border-light bg-surface px-4 sm:px-5 py-2.5 text-sm font-bold text-text-main hover:bg-bg-base hover:border-primary transition-colors">
            Cancel
          </button>
        </div>

        {/* Step rail — label on top, each circle shows that step's completion %. */}
        <div className="mx-auto w-full max-w-3xl mt-4 flex items-end">
          {STEPS.map((s, i) => {
            const active = i === step;
            const pct = stepPct(i);
            return (
              <React.Fragment key={s}>
                <button type="button" onClick={() => (i < step || canNext) && setStep(i)}
                  className="flex flex-col items-center gap-1.5 w-16 sm:w-20 shrink-0 focus:outline-none">
                  <span className={`text-[10px] sm:text-[11px] font-bold text-center leading-tight ${active ? 'text-[#E5741F]' : 'text-text-muted'}`}>{s}</span>
                  <span className={`grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-full text-[11px] sm:text-xs font-black transition-all
                    ${active
                      ? 'bg-[#FF862A] text-white ring-4 ring-[#FF862A]/20 shadow-md'
                      : pct === 100
                      ? 'bg-emerald-500 text-white'
                      : 'bg-surface text-text-muted border border-border-light'}`}>
                    {pct === 100 ? <Check className="h-4 w-4" /> : `${pct}%`}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className="h-0.5 flex-1 rounded-full mb-5 bg-border-light overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${i < step ? 'w-full bg-[#FF862A]' : 'w-0'}`} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Profile completion (#114) */}
        <div className="mx-auto w-full max-w-3xl mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-border-light overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#FF9D52] to-[#E5741F] transition-all duration-300" style={{ width: completionPct + '%' }} />
          </div>
          <span className="text-[11px] font-bold text-text-muted shrink-0">{completionPct}% complete</span>
        </div>
      </div>

      {savedMsg && <div className="shrink-0 bg-emerald-50 text-emerald-700 text-xs font-bold px-4 py-2 border-b border-emerald-200">{savedMsg}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 space-y-4" data-enter-nav onKeyDown={focusNextOnEnter}>

          {step === 0 && (
            <div className={CARD.basics}>
              <h3 className="flex items-center gap-2 text-lg font-black text-orange-700">👤 {SECTION_TITLE[0]}</h3>
              <div className="flex items-center gap-4">
                <img src={avatar} alt="" className="h-20 w-20 rounded-2xl object-cover border-2 border-border-light bg-surface" />
                <div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhotoFile(e.target.files && e.target.files[0])} />
                  <button type="button" onClick={() => fileRef.current && fileRef.current.click()} className="inline-flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-3 py-2 text-xs font-bold text-text-main hover:border-primary">
                    <Camera className="h-4 w-4" /> {form.photo ? '📷 Change photo' : '📷 Upload photo'}
                  </button>
                  {form.photo && <button type="button" onClick={() => set({ photo: '' })} className="ml-2 text-xs font-bold text-red-500">Remove</button>}
                  <p className="mt-1 text-[10px] text-text-muted">Auto-cropped to a square. Uploads to Drive in the background.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label req>First Name</Label><input value={form.firstName} onChange={setCap('firstName')} placeholder="Enter first name" className={inputCls} /></div>
                <div><Label>Middle Name</Label><input value={form.middleName} onChange={setCap('middleName')} placeholder="Enter middle name" className={inputCls} /></div>
                <div><Label>Last Name</Label><input value={form.lastName} onChange={setCap('lastName')} placeholder="Enter surname" className={inputCls} /></div>
                <div><Label>Date of Birth</Label><DobField value={form.dob} onChange={(v) => set({ dob: v })} /></div>
                <div><Label req={form.gender !== 'Female'}>Mobile Number {form.gender === 'Female' && <span className="font-semibold text-text-muted">(optional)</span>}</Label><input required={form.gender !== 'Female'} inputMode="numeric" value={form.mobile} onChange={(e) => set({ mobile: last10(e.target.value) })} placeholder="10-digit mobile number" className={inputCls} /></div>
                <div><Label>Gender</Label>
                  <select value={form.gender} onChange={(e) => set({ gender: e.target.value })} className={inputCls}>
                    <option value="">— Select —</option>{GENDERS.map((o) => <option key={o}>{o}</option>)}</select></div>
              </div>
              {dupMobile && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> A devotee with this mobile already exists: {dupMobile.name} ({dupMobile.id}).
                </div>
              )}
              {dupNames.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> Same name already exists: {dupNames.map((d) => `${d.name} (${d.id})`).join(', ')}.
                </div>
              )}
            </div>
          )}

          {step === 1 && (() => {
            const isBal = form.yuvakType === 'Bal';
            const YT_META = { Ambrish: '🙏', Yuvak: '🧑', Bal: '🧒', New: '🌱' };
            return (
            <div className="space-y-4">
              {/* Yuvak type — prominent, drives which fields show below */}
              <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-amber-50 p-5 shadow-xs">
                <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-primary mb-3">🧑‍🤝‍🧑 Yuvak Type</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {YUVAK_TYPES.map((t) => {
                    const on = form.yuvakType === t;
                    return (
                      <button type="button" key={t} onClick={() => set({ yuvakType: t })}
                        className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-3 py-3 text-sm font-bold transition-all ${on ? 'border-primary bg-primary text-white shadow-md' : 'border-border-light bg-surface text-text-main hover:border-primary/50'}`}>
                        <span className="text-xl">{YT_META[t] || '•'}</span>{t}
                      </button>
                    );
                  })}
                </div>
                {isBal && <p className="mt-2 text-[11px] font-bold text-primary">🧒 Bal selected — job/company fields are hidden; add their school grade below.</p>}
              </div>

              {/* Contact & personal */}
              <div className={CARD.contact}>
                <h3 className="flex items-center gap-2 text-lg font-black text-sky-700">📞 Contact & Personal</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-bold text-text-main">💬 WhatsApp Number</label>
                      <label className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted cursor-pointer">
                        <input type="checkbox" checked={waSame} onChange={(e) => { setWaSame(e.target.checked); if (e.target.checked) set({ whatsapp: form.mobile }); }} className="rounded" /> Same as mobile
                      </label>
                    </div>
                    <input inputMode="numeric" value={form.whatsapp} disabled={waSame} onChange={(e) => set({ whatsapp: last10(e.target.value) })} placeholder="10-digit WhatsApp number" className={inputCls + (waSame ? ' bg-bg-base opacity-80' : '')} />
                  </div>
                  <div><Label>📧 Email</Label><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@example.com" className={inputCls} /></div>
                  <div><Label>🗺️ Area</Label>
                    <Combo options={areaOptions} value={form.area} onChange={(v) => set({ area: v })} placeholder="Select or type" capitalize /></div>
                  <div><Label>🩸 Blood Group</Label>
                    <select value={form.bloodGroup} onChange={(e) => set({ bloodGroup: e.target.value })} className={inputCls}>
                      <option value="">— Select —</option>{BLOOD_GROUPS.map((o) => <option key={o}>{o}</option>)}</select></div>
                  <div><Label>💍 Marital Status</Label>
                    <select value={form.maritalStatus} onChange={(e) => set({ maritalStatus: e.target.value })} className={inputCls}>
                      <option value="">— Select —</option>{MARITAL_STATUS.map((o) => <option key={o}>{o}</option>)}</select></div>
                </div>
                <div><Label>📍 Address</Label><AutoResizeTextarea value={form.address} onChange={setCap('address')} minRows={2} className={inputCls} /></div>
              </div>

              {/* Education — Bal & students see Grade; only non-Bal see college qualification */}
              {(() => {
                const showGrade = isBal || form.educationStatus === 'Pursuing';
                return (
                  <div className={CARD.education}>
                    <h3 className="flex items-center gap-2 text-lg font-black text-emerald-700">🎓 Education</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {!isBal && (
                        <div><Label>🎓 Qualification</Label>
                          <select value={form.qualification} onChange={(e) => set({ qualification: e.target.value })} className={inputCls}>
                            <option value="">— Select —</option>{QUALIFICATIONS.map((o) => <option key={o}>{o}</option>)}</select></div>
                      )}
                      {!isBal && (
                        <div><Label>⏳ Education Status</Label>
                          <select value={form.educationStatus} onChange={(e) => set({ educationStatus: e.target.value })} className={inputCls}>{EDUCATION_STATUS.map((o) => <option key={o}>{o}</option>)}</select></div>
                      )}
                      {showGrade && (
                        isBal ? (
                          <div><Label>📘 Grade / Standard</Label>
                            {/* Stamp the date the grade is recorded so it can auto-advance by academic year (#138/#139). */}
                            <select value={form.grade} onChange={(e) => set({ grade: e.target.value, gradeAsOf: e.target.value ? todayISO() : '' })} className={inputCls}>
                              <option value="">— Select —</option>{GRADES.map((o) => <option key={o}>{o}</option>)}</select></div>
                        ) : (
                          <div><Label>📘 Grade / Standard</Label><input value={form.grade} onChange={(e) => set({ grade: capWords(e.target.value), gradeAsOf: e.target.value ? todayISO() : '' })} placeholder="e.g. 8th std, FY B.Com" className={inputCls} /></div>
                        )
                      )}
                      {!isBal && (
                        <div><Label>📚 Education / Stream</Label><input value={form.education} onChange={setCap('education')} placeholder="e.g. B.Tech Computer" className={inputCls} /></div>
                      )}
                      <div><Label>🏫 School / College</Label><Combo options={schoolOptions} value={form.school} onChange={(v) => set({ school: v })} placeholder="Select or type" capitalize /></div>
                    </div>
                  </div>
                );
              })()}

              {/* Profession — hidden for Bal (children) */}
              {!isBal && (
                <div className={CARD.profession}>
                  <h3 className="flex items-center gap-2 text-lg font-black text-violet-700">💼 Profession</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div><Label>💼 Profession</Label>
                      <select value={form.profession} onChange={(e) => set({ profession: e.target.value })} className={inputCls}>
                        <option value="">— Select —</option>{PROFESSIONS.map((o) => <option key={o}>{o}</option>)}</select></div>
                    <div><Label>🛠️ Field</Label><input value={form.professionField} onChange={setCap('professionField')} placeholder="e.g. Software Developer" className={inputCls} /></div>
                    <div><Label>🏢 Company</Label><input value={form.companyName} onChange={setCap('companyName')} className={inputCls} /></div>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {step === 2 && (
            <div className={CARD.family}>
              <h3 className="flex items-center gap-2 text-lg font-black text-rose-700">🙏 {SECTION_TITLE[2]}</h3>
              <div className="rounded-2xl border border-border-light bg-bg-base p-3 space-y-2">
                <Label>Family Head <span className="font-semibold text-text-muted">(leave blank if this person heads their own family)</span></Label>
                <HeadPicker heads={familyHeads} value={form.familyId} onChange={pickHead} />
                {form.familyId && (
                  <>
                    <select value={form.relation} onChange={(e) => set({ relation: e.target.value })} className={inputCls}>
                      <option value="">— Relation to head —</option>{RELATIONS.filter((r) => r !== 'Self').map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <p className="text-[10px] font-semibold text-text-muted">Address, area, karyakarta &amp; surname were suggested from the family head — edit anywhere if needed.</p>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div><Label>Follow-up Karyakarta</Label>
                  <Combo options={karyakartaOptions} value={form.followupKaryakarta} placeholder="Select or type"
                    onChange={(name) => set({ followupKaryakarta: name, followupKaryakartaMobile: karyakartaMobileFor(name) || (karyakartaOptions.includes(name) ? '' : form.followupKaryakartaMobile) })} /></div>
                <div><Label>Karyakarta Mobile</Label><input inputMode="numeric" value={form.followupKaryakartaMobile} onChange={(e) => set({ followupKaryakartaMobile: last10(e.target.value) })} placeholder="Auto-fills on select" className={inputCls} /></div>
                <div><Label>Reference / Introduced By</Label>
                  <Combo options={referenceOptions} value={form.reference} onChange={(v) => set({ reference: v })} placeholder="Select or type" /></div>
                <div><Label>🏷️ Devotee Type</Label>
                  <select value={form.oldNew || 'New'} onChange={(e) => set({ oldNew: e.target.value })} className={inputCls}>
                    <option value="New">New</option>
                    <option value="Old">Old</option>
                    <option value="Reference">Reference</option>
                  </select></div>
              </div>
              <div>
                <Label>🏷️ Tags</Label>
                <div className="space-y-3 rounded-xl border border-border-light bg-surface p-3">
                  {tagsByCategory().map(({ category, tags }) => {
                    const keys = tags.map((t) => t.key);
                    const hasMutex = tags.some((t) => t.mutuallyExclusiveGroup);
                    const allOn = keys.length > 0 && keys.every((k) => form.tags.includes(k));
                    const toggleAll = () => set({
                      tags: allOn
                        ? form.tags.filter((k) => !keys.includes(k))
                        : [...new Set([...form.tags, ...keys])],
                    });
                    // Toggle one tag, clearing any mutually-exclusive siblings (#91).
                    const toggleTag = (t) => {
                      const on = form.tags.includes(t.key);
                      if (on) { set({ tags: form.tags.filter((k) => k !== t.key) }); return; }
                      const excl = getMutuallyExclusiveKeys(t.key);
                      set({ tags: [...form.tags.filter((k) => !excl.includes(k)), t.key] });
                    };
                    return (
                      <div key={category.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-text-main">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color?.dot }} />
                            {category.label}{hasMutex && <span className="normal-case font-semibold text-text-muted">(pick one)</span>}
                          </span>
                          {!hasMutex && (
                            <button type="button" onClick={toggleAll}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border transition-colors ${allOn ? 'border-primary bg-primary/10 text-primary' : 'border-border-light text-text-muted hover:border-primary hover:text-primary'}`}>
                              {allOn ? '✓ All selected' : 'Select all'}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((t) => {
                            const on = form.tags.includes(t.key);
                            return <button type="button" key={t.key} onClick={() => toggleTag(t)}
                              style={on ? tagChipStyle(t.key) : undefined} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${on ? '' : 'border border-border-light text-slate-500'}`}>{t.label}</button>;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div><Label>Notes</Label><AutoResizeTextarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} minRows={2} className={inputCls} /></div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs font-bold text-text-muted">Review — this is how the profile will look:</p>
              <div className="rounded-3xl border border-border-light bg-surface overflow-hidden shadow-sm">
                <div className="h-16 bg-gradient-to-br from-[#FF9D52] to-[#E56F18]" />
                <div className="px-5 pb-4">
                  <img src={avatar} alt="" className="h-20 w-20 rounded-2xl object-cover ring-4 ring-surface -mt-10 bg-surface" />
                  <h3 className="mt-2 text-lg font-black text-text-main">{fullName || '—'}</h3>
                  <p className="text-xs font-semibold text-text-muted">{[form.yuvakType, form.professionField || form.profession, deriveAge(form.dob) !== '' ? `${deriveAge(form.dob)} yrs` : ''].filter(Boolean).join('  ·  ')}</p>
                  <div className="mt-3 space-y-1.5 text-xs font-semibold text-text-muted">
                    {form.mobile && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-primary/70" />{form.mobile}</p>}
                    {form.address && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary/70" />{form.address}</p>}
                    {form.followupKaryakarta && <p className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-primary/70" />Karyakarta: {form.followupKaryakarta}</p>}
                    {form.reference && <p className="flex items-center gap-2"><UserCheck className="h-3.5 w-3.5 text-primary/70" />Reference: {form.reference}</p>}
                    <p className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-primary/70" />{form.familyId ? `${form.relation || 'Member'} of ${headName || 'family head'}` : 'Head of own family'}</p>
                  </div>
                  {form.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">{form.tags.map((k) => <span key={k} style={tagChipStyle(k)} className="rounded-full px-2 py-0.5 text-[10px] font-bold">{tagLabel(k)}</span>)}</div>
                  )}
                </div>
              </div>

              {/* Full entered-details review so nothing is hidden before saving. */}
              {(() => {
                const age = deriveAge(form.dob);
                // [icon, label, value, wide?] — wide items span the full width.
                const rows = [
                  ['👤', 'Gender', form.gender],
                  ['🎂', 'Date of Birth', form.dob ? `${form.dob}${age !== '' ? `  ·  ${age} yrs` : ''}` : ''],
                  ['🩸', 'Blood Group', form.bloodGroup],
                  ['💍', 'Marital Status', form.maritalStatus],
                  ['📅', 'Anniversary', form.anniversary],
                  ['📱', 'Mobile', form.mobile],
                  ['💬', 'WhatsApp', waSame ? `${form.mobile} (same)` : form.whatsapp],
                  ['📧', 'Email', form.email],
                  ['📍', 'Address', form.address, true],
                  ['🗺️', 'Area', form.area],
                  ['🧑‍🤝‍🧑', 'Yuvak Type', form.yuvakType],
                  ['🎓', 'Qualification', form.qualification],
                  ['📘', 'Grade / Standard', gradeDisplay(form.grade, form.gradeAsOf)],
                  ['📚', 'Education / Stream', [form.education, form.educationStatus].filter(Boolean).join('  ·  '), true],
                  ['🏫', 'School / College', form.school, true],
                  ['💼', 'Profession', form.profession],
                  ['🛠️', 'Field', form.professionField],
                  ['🏢', 'Company', form.companyName],
                  ['👨‍👩‍👧', 'Family Role', form.familyId ? `${form.relation || 'Member'} of ${headName || 'family head'}` : 'Head of own family', true],
                  ['🙏', 'Follow-up Karyakarta', [form.followupKaryakarta, form.followupKaryakartaMobile].filter(Boolean).join('  ·  '), true],
                  ['🔗', 'Reference', form.reference, true],
                  ['🗓️', 'Date of Joining', form.dateOfJoining],
                  ['📝', 'Notes', form.notes, true],
                ].filter(([, , v]) => v && String(v).trim());
                if (!rows.length) return null;
                return (
                  <div className="rounded-2xl border border-border-light bg-surface p-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-wider text-text-main">📋 All entered details</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {rows.map(([icon, label, value, wide]) => (
                        <div key={label} className={`flex items-center gap-3 rounded-2xl border border-border-light bg-bg-base/60 px-3 py-2.5 ${wide ? 'sm:col-span-2' : ''}`}>
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl">{icon}</span>
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</div>
                            <div className="text-sm font-bold text-text-main break-words whitespace-pre-wrap">{value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {(dupMobile || dupNames.length > 0) && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> Possible duplicate — {dupMobile ? `mobile matches ${dupMobile.name}` : `name matches ${dupNames[0].name}`}. Save anyway if this is a different person.
                </div>
              )}
              <p className="text-[11px] font-semibold text-text-muted">Mandal <strong>Adajan</strong> and created-by ({user?.name || 'you'}) are set automatically.</p>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border-light bg-surface px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-bold text-text-main hover:bg-bg-base">
          <ChevronLeft className="h-4 w-4" /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40 hover:bg-[#00223f]">
            Next <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {!isEdit && (
              <button type="button" disabled={saving} onClick={() => save(true)}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-primary bg-surface px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/5 disabled:opacity-50">
                <UserPlus className="h-4 w-4" /> Save &amp; add another
              </button>
            )}
            <button type="button" disabled={saving} onClick={() => save(false)}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-[#00223f] disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Save Devotee')}
            </button>
          </div>
        )}
      </div>
    </div>
  , document.body);
}
