import React, { useState, useEffect } from 'react';
import { Settings, Shield, KeyRound, Database, RefreshCw, CheckCircle, Info } from 'lucide-react';
import { dataService } from '../services/dataService';

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [liveCount, setLiveCount] = useState(dataService.getDevotees().length);
  const bundledCount = dataService.bundledDevoteeCount();
  const isAdmin = user?.role === 'Admin';

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('ac_users_v1') || '[]');
    setUsers(u);
  }, []);

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

      {/* Access Codes Card */}
      <div className="rounded-3xl border border-[#E0EAF4] bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-[#003158] uppercase tracking-wider">
          <KeyRound className="h-4 w-4 text-[#FF862A]" /> Current System PIN Access Codes
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4">
            <span className="text-xs font-bold text-red-600 block">Admin Access PIN</span>
            <p className="text-3xl font-extrabold text-[#003158] mt-1 tracking-widest">109</p>
            <p className="text-[11px] text-slate-500 mt-1">Full system administration and database access</p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
            <span className="text-xs font-bold text-amber-600 block">Sevak Access PIN</span>
            <p className="text-3xl font-extrabold text-[#003158] mt-1 tracking-widest">369</p>
            <p className="text-[11px] text-slate-500 mt-1">Attendance marking & devotee directory access</p>
          </div>
        </div>
      </div>

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
                <p className="text-[10px] text-slate-400">PIN: {u.pin} • Password: ••••••••</p>
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
