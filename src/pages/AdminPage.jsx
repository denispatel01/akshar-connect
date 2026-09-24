import React, { useState, useEffect } from 'react';
import { Settings, Shield, KeyRound, Database, RefreshCw, CheckCircle, Info, UserPlus } from 'lucide-react';
import { dataService } from '../services/dataService';

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [liveCount, setLiveCount] = useState(dataService.getDevotees().length);
  const bundledCount = dataService.bundledDevoteeCount();
  const isAdmin = user?.role === 'Admin';

  const emptyForm = { mobile: '', name: '', pin: '', role: 'Devotee' };
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState('');
  const [formMsg, setFormMsg] = useState('');

  useEffect(() => {
    setUsers([...dataService.getUsers()]);
  }, []);

  const handleAddUser = (e) => {
    e.preventDefault();
    setFormErr(''); setFormMsg('');
    const mobile = String(form.mobile || '').trim();
    const pin = String(form.pin || '').trim();
    if (!/^\d{10}$/.test(mobile)) { setFormErr('Mobile must be exactly 10 digits.'); return; }
    if (!/^\d{4,6}$/.test(pin)) { setFormErr('PIN must be 4-6 digits.'); return; }
    dataService.addUser({ mobile, name: form.name.trim(), pin, role: form.role });
    setUsers([...dataService.getUsers()]);
    setForm(emptyForm);
    setFormMsg(`User "${form.name.trim() || mobile}" saved.`);
  };

  const handleImport = async () => {
    if (!window.confirm(
      `This will REPLACE all devotee records in the live database with the ${bundledCount} merged devotees bundled in this app.\n\n` +
      `Current records: ${liveCount}. This cannot be undone. Continue?`
    )) return;
    setImporting(true); setImportMsg('');
    try {
      const n = await dataService.importBundledDevotees();
      setLiveCount(n);
      setImportMsg(`Success — ${n} devotees are now loaded.`);
    } catch (e) {
      setImportMsg('Failed: ' + (e.message || 'error') + '. Check backend deployment and try again.');
    } finally { setImporting(false); }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#003158]">Admin Settings & Control</h1>
        <p className="text-sm font-medium text-[#9BB5CB]">
          Access codes, user management, and system database settings.
        </p>
      </div>

      {/* User Management Card (Admin only) */}
      {isAdmin && (
        <div className="rounded-3xl border border-[#E0EAF4] bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[#003158] uppercase tracking-wider">
            <UserPlus className="h-4 w-4 text-[#FF862A]" /> User Management
          </div>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Mobile Number</label>
              <input
                type="tel" inputMode="numeric" maxLength={10} value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
                placeholder="10-digit mobile" required
                className="w-full rounded-2xl border border-[#E0EAF4] bg-[#F0F4F8] px-4 py-2.5 text-sm text-[#003158] focus:outline-none focus:ring-2 focus:ring-[#FF862A]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Name</label>
              <input
                type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name" required
                className="w-full rounded-2xl border border-[#E0EAF4] bg-[#F0F4F8] px-4 py-2.5 text-sm text-[#003158] focus:outline-none focus:ring-2 focus:ring-[#FF862A]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">PIN</label>
              <input
                type="text" inputMode="numeric" maxLength={6} value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
                placeholder="4-6 digit PIN" required
                className="w-full rounded-2xl border border-[#E0EAF4] bg-[#F0F4F8] px-4 py-2.5 text-sm text-[#003158] focus:outline-none focus:ring-2 focus:ring-[#FF862A]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-2xl border border-[#E0EAF4] bg-[#F0F4F8] px-4 py-2.5 text-sm text-[#003158] focus:outline-none focus:ring-2 focus:ring-[#FF862A]"
              >
                <option value="Admin">Admin</option>
                <option value="Sevak">Sevak</option>
                <option value="Devotee">Devotee</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button type="submit"
                className="flex items-center gap-2 rounded-2xl bg-[#FF862A] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#e5741f]">
                <UserPlus className="h-4 w-4" /> Add / Update User
              </button>
              {formErr && <span className="text-xs font-bold text-red-600">{formErr}</span>}
              {formMsg && (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" /> {formMsg}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Devotee Database Card */}
      <div className="rounded-3xl border border-[#E0EAF4] bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-[#003158] uppercase tracking-wider">
          <Database className="h-4 w-4 text-[#FF862A]" /> Devotee Database
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#E4EBF3] bg-[#F0F4F8] p-4">
            <span className="text-xs font-bold text-slate-500 block">Currently Loaded</span>
            <p className="text-3xl font-extrabold text-[#003158] mt-1">{liveCount}</p>
            <p className="text-[11px] text-slate-500 mt-1">devotee records in the app</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
            <span className="text-xs font-bold text-emerald-700 block">Bundled Merged Dataset</span>
            <p className="text-3xl font-extrabold text-[#003158] mt-1">{bundledCount}</p>
            <p className="text-[11px] text-slate-500 mt-1">from AksharConnect + GBM sheets (de-duplicated)</p>
          </div>
        </div>
        {isAdmin ? (
          <div className="space-y-2">
            <button onClick={handleImport} disabled={importing}
              className="flex items-center gap-2 rounded-2xl bg-[#003158] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#00223f] disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${importing ? 'animate-spin' : ''}`} />
              {importing ? 'Importing…' : `Load merged data into live database (${bundledCount})`}
            </button>
            <p className="text-[11px] text-slate-500 flex items-start gap-1">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Replaces the live Devotees sheet with the merged dataset. Redeploy the Apps Script backend first so new columns (tags, education, etc.) are saved. Blank fields are left for you to fill in later.
            </p>
            {importMsg && (
              <p className={`text-xs font-bold flex items-center gap-1 ${importMsg.startsWith('Success') ? 'text-emerald-600' : 'text-red-600'}`}>
                <CheckCircle className="h-4 w-4" /> {importMsg}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Only an Admin can replace the devotee database.</p>
        )}
      </div>

      {/* Registered System Users */}
      <div className="rounded-3xl border border-[#E0EAF4] bg-white p-6 shadow-xs">
        <h2 className="text-base font-bold text-[#003158] mb-4">System User Accounts</h2>

        <div className="space-y-3">
          {users.map((u, i) => (
            <div key={i} className="flex items-center justify-between p-3.5 rounded-2xl border border-[#E4EBF3] bg-[#F0F4F8]">
              <div>
                <p className="text-xs font-bold text-[#003158]">{u.name || 'User'} ({u.mobile})</p>
                <p className="text-[10px] text-slate-400">PIN: •••• • Password: ••••••••</p>
              </div>

              <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                u.role === 'Admin' ? 'bg-red-100 text-red-700' : u.role === 'Sevak' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'
              }`}>
                {u.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
