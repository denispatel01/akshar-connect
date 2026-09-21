import React, { useState, useEffect } from 'react';
import { Settings, Shield, KeyRound, Database, RefreshCw, CheckCircle, Info } from 'lucide-react';
import { dataService } from '../services/dataService';

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('ac_users_v1') || '[]');
    setUsers(u);
  }, []);

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
