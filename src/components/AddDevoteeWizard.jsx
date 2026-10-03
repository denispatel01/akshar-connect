import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Check, Camera, Phone, MapPin, User, UserCheck, AlertTriangle, UserPlus, Save } from 'lucide-react';
import { dataService } from '../services/dataService';
import {
  AREAS, GENDERS, BLOOD_GROUPS, MARITAL_STATUS, YUVAK_TYPES,
  QUALIFICATIONS, EDUCATION_STATUS, PROFESSIONS, RELATIONS, deriveAge,
} from '../services/devoteeSchema';
import { tagsByCategory, tagChipStyle, tagLabel } from '../services/tagCatalog';
import AutoResizeTextarea from './AutoResizeTextarea';
import { alertDevoteeSaveFailed } from '../utils/sweetAlert';

const STEPS = ['Basics', 'Details', 'Family & Satsang', 'Review'];
const todayISO = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  firstName: '', middleName: '', lastName: '', name: '', gender: 'Male', dob: '', bloodGroup: '',
  maritalStatus: '', anniversary: '', yuvakType: '', photo: '',
  mobile: '', whatsapp: '', email: '', area: '', city: 'Surat', address: '', mandal: 'Adajan',
  qualification: '', education: '', educationStatus: 'Completed', school: '',
  profession: '', professionField: '', companyName: '',
  followupKaryakarta: '', followupKaryakartaMobile: '', reference: '', notes: '', tags: [],
  familyId: '', type: 'Primary', relation: 'Self', dateOfJoining: todayISO(),
});

const inputCls = 'w-full rounded-xl border border-border-light bg-surface px-3 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary';
const Label = ({ children }) => <label className="block text-xs font-bold text-text-main mb-1">{children}</label>;

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
function Combo({ options, value, onChange, placeholder }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ql = q.trim().toLowerCase();
  const matches = (ql ? options.filter((o) => String(o).toLowerCase().includes(ql)) : options).slice(0, 50);
  return (
    <div className="relative">
      <input value={open ? q : (value || '')}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
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

export default function AddDevoteeWizard({ user, devotees, familyHeads, karyakartaOptions, karyakartaMobileFor, referenceOptions, headRecordByFamilyId, onClose, onCreated }) {
  const [form, setForm] = useState(blank());
  const [step, setStep] = useState(0);
  const [waSame, setWaSame] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ');

  const dupMobile = useMemo(
    () => (form.mobile.length === 10 ? devotees.find((d) => String(d.mobile) === form.mobile) : null),
    [form.mobile, devotees]);
  const dupNames = useMemo(() => {
    const fn = form.firstName.trim().toLowerCase(), ln = form.lastName.trim().toLowerCase();
    if (!fn || !ln) return [];
    return devotees.filter((d) => (d.firstName || '').toLowerCase() === fn && (d.lastName || '').toLowerCase() === ln).slice(0, 3);
  }, [form.firstName, form.lastName, devotees]);

  const pickHead = (fid) => {
    if (!fid) { set({ familyId: '', type: 'Primary', relation: 'Self' }); return; }
    const h = headRecordByFamilyId.get(fid);
    set({
      familyId: fid, type: 'Family', relation: form.relation === 'Self' ? '' : form.relation,
      ...(h ? {
        address: h.address || form.address, area: h.area || form.area, city: h.city || form.city,
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
      img.onload = () => {
        const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
        const ctx = c.getContext('2d');
        const m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2;
        ctx.drawImage(img, sx, sy, m, m, 0, 0, S, S);
        set({ photo: c.toDataURL('image/jpeg', 0.72) });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const step0Valid = form.firstName.trim() && form.mobile.length === 10;
  const canNext = step === 0 ? step0Valid : true;

  const buildPayload = () => ({
    ...form, name: fullName || form.name,
    whatsapp: waSame ? form.mobile : form.whatsapp,
    mandal: form.mandal || 'Adajan',
  });

  const save = async (addAnother) => {
    if (!step0Valid) { setStep(0); return; }
    setSaving(true);
    try {
      const created = await dataService.addDevoteeAndSync(buildPayload());
      if (addAnother) {
        const keep = {
          familyId: (!form.familyId && created.familyId) ? created.familyId : form.familyId,
          address: form.address, area: form.area, city: form.city, mandal: form.mandal,
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
    <div className="fixed inset-0 z-[60] bg-bg-base flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>

      <div className="border-b border-border-light bg-surface px-4 sm:px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-black text-text-main">Add New Devotee</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-text-muted hover:bg-bg-base hover:text-text-main"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <button type="button" onClick={() => (i < step || canNext) && setStep(i)}
                className={`flex items-center gap-1.5 text-[11px] font-bold ${i === step ? 'text-primary' : i < step ? 'text-emerald-600' : 'text-text-muted'}`}>
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${i === step ? 'bg-primary text-white' : i < step ? 'bg-emerald-500 text-white' : 'bg-bg-base border border-border-light'}`}>
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s}</span>
              </button>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < step ? 'bg-emerald-500' : 'bg-border-light'}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {savedMsg && <div className="shrink-0 bg-emerald-50 text-emerald-700 text-xs font-bold px-4 py-2 border-b border-emerald-200">{savedMsg}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 space-y-4">

          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <img src={avatar} alt="" className="h-20 w-20 rounded-2xl object-cover border-2 border-border-light bg-surface" />
                <div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhotoFile(e.target.files && e.target.files[0])} />
                  <button type="button" onClick={() => fileRef.current && fileRef.current.click()} className="inline-flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-3 py-2 text-xs font-bold text-text-main hover:border-primary">
                    <Camera className="h-4 w-4" /> {form.photo ? 'Change photo' : 'Upload photo'}
                  </button>
                  {form.photo && <button type="button" onClick={() => set({ photo: '' })} className="ml-2 text-xs font-bold text-red-500">Remove</button>}
                  <p className="mt-1 text-[10px] text-text-muted">Auto-cropped to a square.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div><Label>First Name *</Label><input value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} className={inputCls} /></div>
                <div><Label>Middle Name</Label><input value={form.middleName} onChange={(e) => set({ middleName: e.target.value })} className={inputCls} /></div>
                <div><Label>Last Name</Label><input value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} className={inputCls} /></div>
                <div><Label>Mobile *</Label><input required maxLength={10} inputMode="numeric" value={form.mobile} onChange={(e) => set({ mobile: e.target.value.replace(/\D/g, '') })} className={inputCls} /></div>
                <div><Label>Date of Birth</Label><input type="date" value={form.dob} onChange={(e) => set({ dob: e.target.value })} className={inputCls} /></div>
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

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-text-main">WhatsApp</label>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted cursor-pointer">
                      <input type="checkbox" checked={waSame} onChange={(e) => { setWaSame(e.target.checked); if (e.target.checked) set({ whatsapp: form.mobile }); }} className="rounded" /> Same as mobile
                    </label>
                  </div>
                  <input maxLength={10} inputMode="numeric" value={form.whatsapp} disabled={waSame} onChange={(e) => set({ whatsapp: e.target.value.replace(/\D/g, '') })} className={inputCls + (waSame ? ' bg-bg-base opacity-80' : '')} />
                </div>
                <div><Label>Email</Label><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} /></div>
                <div><Label>Area</Label>
                  <Combo options={AREAS} value={form.area} onChange={(v) => set({ area: v })} placeholder="Select or type" /></div>
                <div><Label>City</Label><input value={form.city} onChange={(e) => set({ city: e.target.value })} className={inputCls} /></div>
                <div><Label>Blood Group</Label>
                  <select value={form.bloodGroup} onChange={(e) => set({ bloodGroup: e.target.value })} className={inputCls}>
                    <option value="">— Select —</option>{BLOOD_GROUPS.map((o) => <option key={o}>{o}</option>)}</select></div>
                <div><Label>Marital Status</Label>
                  <select value={form.maritalStatus} onChange={(e) => set({ maritalStatus: e.target.value })} className={inputCls}>
                    <option value="">— Select —</option>{MARITAL_STATUS.map((o) => <option key={o}>{o}</option>)}</select></div>
                <div><Label>Yuvak Type</Label>
                  <select value={form.yuvakType} onChange={(e) => set({ yuvakType: e.target.value })} className={inputCls}>
                    <option value="">— Select —</option>{YUVAK_TYPES.map((o) => <option key={o}>{o}</option>)}</select></div>
              </div>
              <div><Label>Address</Label><AutoResizeTextarea value={form.address} onChange={(e) => set({ address: e.target.value })} minRows={2} className={inputCls} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div><Label>Qualification</Label>
                  <select value={form.qualification} onChange={(e) => set({ qualification: e.target.value })} className={inputCls}>
                    <option value="">— Select —</option>{QUALIFICATIONS.map((o) => <option key={o}>{o}</option>)}</select></div>
                <div><Label>Education / Stream</Label><input value={form.education} onChange={(e) => set({ education: e.target.value })} placeholder="e.g. B.Tech Computer" className={inputCls} /></div>
                <div><Label>Education Status</Label>
                  <select value={form.educationStatus} onChange={(e) => set({ educationStatus: e.target.value })} className={inputCls}>{EDUCATION_STATUS.map((o) => <option key={o}>{o}</option>)}</select></div>
                <div><Label>School / College</Label><input value={form.school} onChange={(e) => set({ school: e.target.value })} className={inputCls} /></div>
                <div><Label>Profession</Label>
                  <select value={form.profession} onChange={(e) => set({ profession: e.target.value })} className={inputCls}>
                    <option value="">— Select —</option>{PROFESSIONS.map((o) => <option key={o}>{o}</option>)}</select></div>
                <div><Label>Field</Label><input value={form.professionField} onChange={(e) => set({ professionField: e.target.value })} placeholder="e.g. Software Developer" className={inputCls} /></div>
                <div><Label>Company</Label><input value={form.companyName} onChange={(e) => set({ companyName: e.target.value })} className={inputCls} /></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border-light bg-surface p-3 space-y-2">
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
                <div><Label>Karyakarta Mobile</Label><input maxLength={10} inputMode="numeric" value={form.followupKaryakartaMobile} onChange={(e) => set({ followupKaryakartaMobile: e.target.value.replace(/\D/g, '') })} placeholder="Auto-fills on select" className={inputCls} /></div>
                <div><Label>Reference / Introduced By</Label>
                  <Combo options={referenceOptions} value={form.reference} onChange={(v) => set({ reference: v })} placeholder="Select or type" /></div>
              </div>
              <div>
                <Label>🏷️ Tags</Label>
                <div className="space-y-3 max-h-64 overflow-y-auto rounded-xl border border-border-light bg-surface p-3">
                  {tagsByCategory().map(({ category, tags }) => {
                    const keys = tags.map((t) => t.key);
                    const allOn = keys.length > 0 && keys.every((k) => form.tags.includes(k));
                    const toggleAll = () => set({
                      tags: allOn
                        ? form.tags.filter((k) => !keys.includes(k))
                        : [...new Set([...form.tags, ...keys])],
                    });
                    return (
                      <div key={category.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-text-main">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color?.dot }} />
                            {category.label}
                          </span>
                          <button type="button" onClick={toggleAll}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border transition-colors ${allOn ? 'border-primary bg-primary/10 text-primary' : 'border-border-light text-text-muted hover:border-primary hover:text-primary'}`}>
                            {allOn ? '✓ All selected' : 'Select all'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((t) => {
                            const on = form.tags.includes(t.key);
                            return <button type="button" key={t.key} onClick={() => set({ tags: on ? form.tags.filter((k) => k !== t.key) : [...form.tags, t.key] })}
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
                    <p className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-primary/70" />{form.familyId ? `Member (${form.relation || 'relation?'})` : 'Head of own family'}</p>
                  </div>
                  {form.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">{form.tags.map((k) => <span key={k} style={tagChipStyle(k)} className="rounded-full px-2 py-0.5 text-[10px] font-bold">{tagLabel(k)}</span>)}</div>
                  )}
                </div>
              </div>

              {/* Full entered-details review so nothing is hidden before saving. */}
              {(() => {
                const age = deriveAge(form.dob);
                const rows = [
                  ['👤', 'Gender', form.gender],
                  ['🎂', 'Date of Birth', form.dob ? `${form.dob}${age !== '' ? `  ·  ${age} yrs` : ''}` : ''],
                  ['🩸', 'Blood Group', form.bloodGroup],
                  ['💍', 'Marital Status', form.maritalStatus],
                  ['📅', 'Anniversary', form.anniversary],
                  ['📱', 'Mobile', form.mobile],
                  ['💬', 'WhatsApp', waSame ? `${form.mobile} (same)` : form.whatsapp],
                  ['📧', 'Email', form.email],
                  ['📍', 'Address', form.address],
                  ['🗺️', 'Area', form.area],
                  ['🏙️', 'City', form.city],
                  ['🎓', 'Qualification', form.qualification],
                  ['📚', 'Education / Stream', [form.education, form.educationStatus].filter(Boolean).join('  ·  ')],
                  ['🏫', 'School / College', form.school],
                  ['💼', 'Profession', form.profession],
                  ['🛠️', 'Field', form.professionField],
                  ['🏢', 'Company', form.companyName],
                  ['🧑‍🤝‍🧑', 'Yuvak Type', form.yuvakType],
                  ['👨‍👩‍👧', 'Family Role', form.familyId ? `Member (${form.relation || '—'})` : 'Head of own family'],
                  ['🙏', 'Follow-up Karyakarta', [form.followupKaryakarta, form.followupKaryakartaMobile].filter(Boolean).join('  ·  ')],
                  ['🔗', 'Reference', form.reference],
                  ['🗓️', 'Date of Joining', form.dateOfJoining],
                  ['📝', 'Notes', form.notes],
                ].filter(([, , v]) => v && String(v).trim());
                if (!rows.length) return null;
                return (
                  <div className="rounded-2xl border border-border-light bg-surface p-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-wider text-text-main">📋 All entered details</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                      {rows.map(([icon, label, value]) => (
                        <div key={label} className="flex items-start gap-2">
                          <span className="text-sm leading-5 shrink-0">{icon}</span>
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</div>
                            <div className="text-sm font-semibold text-text-main break-words whitespace-pre-wrap">{value}</div>
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
            <button type="button" disabled={saving} onClick={() => save(true)}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-primary bg-surface px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/5 disabled:opacity-50">
              <UserPlus className="h-4 w-4" /> Save &amp; add another
            </button>
            <button type="button" disabled={saving} onClick={() => save(false)}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-[#00223f] disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Devotee'}
            </button>
          </div>
        )}
      </div>
    </div>
  , document.body);
}
