import React, { useMemo, useState } from 'react';
import { Download, Users, MapPin, Activity, Calendar, ShieldCheck, User, FileText, Loader2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { deriveAge } from '../services/devoteeSchema';
import { isBirthdayWithin } from '../utils/birthdays';
import { downloadReportPdf } from '../utils/reportPdf';

// DOB (YYYY-MM-DD) → dd-MMM-yyyy for the PDF, e.g. 01-Dec-1995.
const reportDob = (dob) => {
  if (!dob) return '';
  const [y, m, d] = String(dob).split('-');
  if (!y) return '';
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] || '';
  return `${d}-${mon}-${y}`;
};

const isYuva = (d) => {
  const g = String(d.gender || '').toLowerCase();
  if (g !== 'male' && g !== 'm') return false;
  const age = deriveAge(d.dob);
  return age !== '' && age >= 15 && age <= 45;
};

// Defined at module scope (NOT inside ReportsPage) so their identity is stable
// across renders — otherwise a state change on click remounts the list and the
// first click is lost, forcing a double-click.
function Card({ title, count, icon: Icon, color, onClick, hint }) {
  return (
    <div onClick={onClick}
      className={`bg-surface rounded-3xl p-5 border shadow-sm flex items-start gap-4 transition-all ${onClick ? 'cursor-pointer border-primary/30 hover:border-primary hover:shadow-md active:scale-[.99]' : 'border-border-light'}`}>
      <div className={`p-3 rounded-2xl ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-text-muted mb-1 truncate">{title}</p>
        <p className="text-2xl font-black text-text-main leading-none">{count}</p>
        {hint && <p className="text-[10px] font-semibold text-primary mt-1.5">{hint}</p>}
      </div>
    </div>
  );
}

function StatList({ title, data, icon: Icon, isComplex, onRowClick }) {
  const sorted = Object.entries(data).sort((a, b) => {
    const aVal = isComplex ? a[1].devotees : a[1];
    const bVal = isComplex ? b[1].devotees : b[1];
    return bVal - aVal;
  });
  return (
    <div className="bg-surface rounded-3xl border border-border-light shadow-sm overflow-hidden flex flex-col h-full animate-fade-in">
      <div className="px-5 py-4 border-b border-border-light flex items-center gap-2 bg-bg-base">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-text-main">{title}</h3>
      </div>
      <div className="p-2 flex-1 overflow-auto max-h-[300px]">
        {sorted.length > 0 ? (
          <ul className="space-y-1">
            {sorted.map(([key, val]) => (
              <li key={key} onClick={() => onRowClick && onRowClick(key)} className={`flex justify-between items-center px-3 py-2 hover:bg-bg-base rounded-xl transition-colors ${onRowClick ? 'cursor-pointer hover:border-primary/30 border border-transparent' : ''}`}>
                <span className="text-sm font-semibold text-text-main truncate pr-4">{key}</span>
                {isComplex ? (
                  <div className="flex gap-1">
                    <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-md" title="Devotees">{val.devotees} D</span>
                    <span className="text-[10px] font-bold bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-md" title="Families">{val.families.size} F</span>
                  </div>
                ) : (
                  <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">{val}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted p-4 text-center">No data available.</p>
        )}
      </div>
    </div>
  );
}

export default function ReportsPage({ setActivePage }) {
  const devotees = dataService.getDevotees();

  // Which report is currently being generated (its label), for the busy overlay.
  const [busy, setBusy] = useState(null);

  // Tap a row / card → build and download an attractive PDF of that group.
  const makeReport = async (rows, title, subtitle, columns) => {
    if (busy) return;
    if (!rows || rows.length === 0) return;
    setBusy(title);
    try {
      await downloadReportPdf({ title, subtitle, rows, columns });
    } catch (e) {
      // Email the admin the detail so it can be diagnosed.
      dataService.reportError({ message: 'PDF report failed: ' + (e?.message || e), stack: e?.stack, page: 'reports:' + title });
      alert('Could not generate PDF: ' + (e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const stats = useMemo(() => {
    const s = {
      total: devotees.length,
      active: 0,
      yuva: 0,
      karyakartaStats: {},
      areaStats: {},
      wingStats: {},
      bloodGroups: {},
      upcomingBirthdays: 0,
    };

    devotees.forEach(d => {
      if (d.status !== 'Inactive') s.active++;
      if (isYuva(d)) s.yuva++;

      if (d.followupKaryakarta) {
        if (!s.karyakartaStats[d.followupKaryakarta]) s.karyakartaStats[d.followupKaryakarta] = { devotees: 0, families: new Set() };
        s.karyakartaStats[d.followupKaryakarta].devotees++;
        if (d.familyId) s.karyakartaStats[d.followupKaryakarta].families.add(d.familyId);
        else s.karyakartaStats[d.followupKaryakarta].families.add('ID_'+d.id);
      }
      
      if (d.area) {
        s.areaStats[d.area] = (s.areaStats[d.area] || 0) + 1;
      }
      
      if (d.wing) {
        s.wingStats[d.wing] = (s.wingStats[d.wing] || 0) + 1;
      }

      if (d.bloodGroup) {
        s.bloodGroups[d.bloodGroup] = (s.bloodGroups[d.bloodGroup] || 0) + 1;
      }

      if (d.dob && isBirthdayWithin(d.dob, 30)) {
        s.upcomingBirthdays++;
      }
    });

    return s;
  }, [devotees]);

  const exportCSV = () => {
    if (devotees.length === 0) return;
    const headers = ['ID', 'Name', 'Mobile', 'Area', 'Blood Group', 'Wing', 'Follow-up Karyakarta', 'Status', 'Updated By'];
    const rows = devotees.map(d => [
      d.id,
      `"${(d.name || '').replace(/"/g, '""')}"`,
      d.mobile || '',
      `"${(d.area || '').replace(/"/g, '""')}"`,
      d.bloodGroup || '',
      d.wing || '',
      `"${(d.followupKaryakarta || '').replace(/"/g, '""')}"`,
      d.status || '',
      `"${(d.updatedBy || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `devotees_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-none px-4 py-6 sm:px-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-text-main tracking-tight">📊 Reports & Insights</h1>
          <p className="text-sm font-semibold text-text-muted mt-1">Analytics and data export for your mandal.</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary-hover shadow-sm transition-all"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <Card title="Total Devotees" count={stats.total} icon={Users} color="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <Card title="Active Devotees" count={stats.active} icon={Activity} color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" />
        <Card title="Yuva (Male 15–45)" count={stats.yuva} icon={User} color="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
          hint="Tap to download PDF"
          onClick={() => makeReport(devotees.filter(isYuva), 'Yuva Report (Male 15-45)', 'Adajan Satsang Mandal')} />
        <Card title="Upcoming Birthdays" count={stats.upcomingBirthdays} icon={Calendar} color="bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400" />
        <Card title="Total Areas" count={Object.keys(stats.areaStats).length} icon={MapPin} color="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-text-muted">Tap any name below to download an attractive PDF report of that group.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatList title="By Karyakarta" data={stats.karyakartaStats} icon={ShieldCheck} isComplex={true}
          onRowClick={(k) => makeReport(
            devotees.filter(d => (d.followupKaryakarta || '') === k),
            `Karyakarta — ${k}`,
            'Devotees under this karyakarta',
            [
              { header: '#', get: (_d, i) => String(i + 1), width: 26, halign: 'center' },
              { header: 'Full Name', get: (d) => d.name || '' },
              { header: 'Date of Birth', get: (d) => reportDob(d.dob), width: 88 },
              { header: 'Mobile', get: (d) => d.mobile || '', width: 78 },
              { header: 'Address', get: (d) => [d.address, d.area].filter(Boolean).join(', ') },
            ],
          )} />
        <StatList title="By Area" data={stats.areaStats} icon={MapPin}
          onRowClick={(k) => makeReport(devotees.filter(d => (d.area || '') === k), `Area — ${k}`, 'Devotees in this area')} />
        <StatList title="By Wing" data={stats.wingStats} icon={Users}
          onRowClick={(k) => makeReport(devotees.filter(d => (d.wing || '') === k), `Wing — ${k}`, 'Devotees in this wing')} />
      </div>

      {busy && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface px-8 py-6 shadow-2xl">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm font-bold text-text-main">Preparing PDF…</p>
            <p className="text-xs text-text-muted">{busy}</p>
          </div>
        </div>
      )}
    </div>
  );
}
