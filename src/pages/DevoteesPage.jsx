import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, QrCode, X, MapPin, Phone, Trash2, Pencil, Save } from 'lucide-react';
import { dataService } from '../services/dataService';

// Profile tabs -> [field, label]
const TABS = {
  Personal: [['firstName','First Name'],['middleName','Middle Name'],['lastName','Last Name'],['gender','Gender'],['dob','Date of Birth'],['bloodGroup','Blood Group'],['maritalStatus','Marital Status'],['anniversary','Anniversary']],
  Contact: [['mobile','Mobile'],['secondaryMobile','Secondary Mobile'],['whatsapp','WhatsApp'],['email','Email']],
  Address: [['address','Address'],['area','Area'],['city','City'],['mandal','Mandal']],
  'Education & Job': [['education','Education'],['occupation','Occupation']],
  Family: [['familyId','Family ID'],['relation','Relation'],['reference','Reference'],['ambrish','Ambrish'],['gharNo','Ghar No.'],['type','Type']],
};
const ALL_FIELDS = Object.values(TABS).flat();

export default function DevoteesPage({ user }) {
  const [devotees, setDevotees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDevotee, setSelectedDevotee] = useState(null);
  const [qrModalDevotee, setQrModalDevotee] = useState(null);
  const [activeTab, setActiveTab] = useState('Personal');
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});

  const blankForm = { name:'', firstName:'', middleName:'', lastName:'', mobile:'', gender:'', dob:'',
    bloodGroup:'', mandal:'Akshar Mandal Surat', wing:'Yuva Wing', area:'', city:'Surat',
    address:'', education:'', occupation:'' };
  const [formData, setFormData] = useState(blankForm);

  useEffect(() => { loadDevotees(); }, []);
  const loadDevotees = () => setDevotees([...dataService.getDevotees()]);

  const canEdit = user?.role === 'Admin' || user?.role === 'Sevak';

  const filteredDevotees = devotees.filter((d) => {
    const q = searchQuery.toLowerCase();
    return (d.name || '').toLowerCase().includes(q)
      || String(d.mobile || '').includes(searchQuery)
      || (d.city || '').toLowerCase().includes(q)
      || (d.mandal || '').toLowerCase().includes(q);
  });

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    const name = formData.name || [formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(' ');
    if (!name || !formData.mobile) return;
    dataService.addDevotee({ ...formData, name });
    loadDevotees(); setShowAddModal(false); setFormData(blankForm);
  };

  const openProfile = (d) => { setSelectedDevotee(d); setActiveTab('Personal'); setEditing(false); };

  const startEdit = () => {
    const seed = {}; ALL_FIELDS.forEach(([f]) => seed[f] = selectedDevotee[f] ?? '');
    setEditData(seed); setEditing(true);
  };
  const saveEdit = () => {
    const name = [editData.firstName, editData.middleName, editData.lastName].filter(Boolean).join(' ') || selectedDevotee.name;
    const updated = dataService.updateDevotee(selectedDevotee.id, { ...editData, name });
    setSelectedDevotee(updated); setEditing(false); loadDevotees();
  };

  const handleDelete = (id) => {
    if (window.confirm('Delete this devotee record?')) { dataService.deleteDevotee(id); loadDevotees(); setSelectedDevotee(null); }
  };

  const val = (v) => (v === undefined || v === null || v === '') ? '—' : v;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#003158]">Devotee Directory</h1>
          <p className="text-sm font-medium text-[#9BB5CB]">{devotees.length} members · view profiles, edit details, generate QR passes.</p>
        </div>
        {canEdit && (
          <button onClick={() => { setFormData(blankForm); setShowAddModal(true); }}
            className="flex items-center gap-2 rounded-2xl bg-[#003158] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#00223f]">
            <Plus className="h-4 w-4" /> Add New Devotee
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#9BB5CB]" />
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, mobile, city, or mandal..."
          className="w-full rounded-2xl border border-[#E0EAF4] bg-white pl-10 pr-4 py-2.5 text-sm font-semibold text-[#003158] outline-none focus:border-[#003158]" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredDevotees.slice(0, 300).map((devotee) => (
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
      {filteredDevotees.length > 300 && <p className="text-center text-xs text-[#9BB5CB]">Showing first 300 of {filteredDevotees.length}. Refine your search to see more.</p>}

      {/* Add Devotee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between border-b border-[#E0EAF4] pb-4 mb-4">
              <h2 className="text-lg font-bold text-[#003158]">Add New Devotee</h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#9BB5CB] hover:text-[#003158]"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[['firstName','First Name'],['middleName','Middle Name'],['lastName','Last Name']].map(([f,l]) => (
                  <div key={f}><label className="block text-xs font-bold text-[#003158] mb-1">{l}</label>
                    <input value={formData[f]} onChange={(e)=>setFormData({...formData,[f]:e.target.value})}
                      className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none focus:border-[#003158]" /></div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Mobile *</label>
                  <input required maxLength={10} value={formData.mobile} onChange={(e)=>setFormData({...formData,mobile:e.target.value.replace(/\D/g,'')})}
                    className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none focus:border-[#003158]" /></div>
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Date of Birth</label>
                  <input type="date" value={formData.dob} onChange={(e)=>setFormData({...formData,dob:e.target.value})}
                    className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none focus:border-[#003158]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Gender</label>
                  <select value={formData.gender} onChange={(e)=>setFormData({...formData,gender:e.target.value})} className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none">
                    <option value="">—</option><option>Male</option><option>Female</option></select></div>
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Blood Group</label>
                  <input value={formData.bloodGroup} onChange={(e)=>setFormData({...formData,bloodGroup:e.target.value})} placeholder="e.g. B+"
                    className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none focus:border-[#003158]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Education</label>
                  <input value={formData.education} onChange={(e)=>setFormData({...formData,education:e.target.value})}
                    className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none focus:border-[#003158]" /></div>
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Occupation</label>
                  <input value={formData.occupation} onChange={(e)=>setFormData({...formData,occupation:e.target.value})}
                    className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none focus:border-[#003158]" /></div>
              </div>
              <div><label className="block text-xs font-bold text-[#003158] mb-1">Address</label>
                <input value={formData.address} onChange={(e)=>setFormData({...formData,address:e.target.value})}
                  className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none focus:border-[#003158]" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Area</label>
                  <input value={formData.area} onChange={(e)=>setFormData({...formData,area:e.target.value})} className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none focus:border-[#003158]" /></div>
                <div><label className="block text-xs font-bold text-[#003158] mb-1">City</label>
                  <input value={formData.city} onChange={(e)=>setFormData({...formData,city:e.target.value})} className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none focus:border-[#003158]" /></div>
                <div><label className="block text-xs font-bold text-[#003158] mb-1">Wing</label>
                  <select value={formData.wing} onChange={(e)=>setFormData({...formData,wing:e.target.value})} className="w-full rounded-xl border border-[#E0EAF4] p-2.5 text-xs font-semibold outline-none">
                    <option>Yuva Wing</option><option>Kishore Wing</option><option>Bal Wing</option><option>Seniors Wing</option></select></div>
              </div>
              <button type="submit" className="w-full rounded-2xl bg-[#003158] py-3 text-xs font-bold text-white shadow-md hover:bg-[#00223f] mt-2">Save Devotee</button>
            </form>
          </div>
        </div>
      )}

      {/* Profile Modal (tabbed + edit) */}
      {selectedDevotee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl relative max-h-[88vh] flex flex-col">
            <button onClick={() => { setSelectedDevotee(null); setEditing(false); }} className="absolute right-4 top-4 text-[#9BB5CB] hover:text-[#003158] z-10"><X className="h-5 w-5" /></button>

            {/* Header */}
            <div className="flex items-center gap-4 p-6 pb-4 border-b border-[#F0F4F8]">
              <img src={selectedDevotee.avatar || 'https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name='+encodeURIComponent(selectedDevotee.name||'?')}
                alt={selectedDevotee.name} className="h-20 w-20 rounded-3xl object-cover border-2 border-[#003158] shadow-md" />
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-[#003158] truncate">{selectedDevotee.name}</h2>
                <p className="text-sm text-slate-500">{val(selectedDevotee.mobile)}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {selectedDevotee.wing && <span className="text-[11px] font-bold text-[#FF862A] bg-amber-50 px-2.5 py-0.5 rounded-full">{selectedDevotee.wing}</span>}
                  {selectedDevotee.mandal && <span className="text-[11px] font-semibold text-[#003158] bg-[#F0F4F8] px-2.5 py-0.5 rounded-full">{selectedDevotee.mandal}</span>}
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">{selectedDevotee.id}</span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-4 pt-3 overflow-x-auto border-b border-[#F0F4F8]">
              {Object.keys(TABS).map((t) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={'whitespace-nowrap px-3 py-2 text-xs font-bold rounded-t-lg ' + (activeTab === t ? 'text-[#003158] border-b-2 border-[#003158]' : 'text-[#9BB5CB] hover:text-[#003158]')}>{t}</button>
              ))}
            </div>

            {/* Body */}
            <div className="p-6 overflow-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {TABS[activeTab].map(([f, label]) => (
                  <div key={f}>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#9BB5CB] mb-1">{label}</div>
                    {editing ? (
                      <input
                        type={f === 'dob' || f === 'anniversary' ? 'date' : 'text'}
                        value={editData[f] ?? ''}
                        onChange={(e) => setEditData({ ...editData, [f]: e.target.value })}
                        className="w-full rounded-xl border border-[#E0EAF4] p-2 text-sm font-semibold text-[#003158] outline-none focus:border-[#003158]" />
                    ) : (
                      <div className="text-sm font-semibold text-[#003158] break-words">{val(selectedDevotee[f])}</div>
                    )}
                  </div>
                ))}
              </div>
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
