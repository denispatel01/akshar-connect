import React, { useMemo } from 'react';
import { Download, Users, Briefcase, MapPin, Activity, Calendar, ShieldCheck, Heart } from 'lucide-react';
import { dataService } from '../services/dataService';
import { isBirthdayWithin } from '../utils/birthdays';

export default function ReportsPage() {
  const devotees = dataService.getDevotees();

  const stats = useMemo(() => {
    const s = {
      total: devotees.length,
      active: 0,
      karyakartaStats: {},
      areaStats: {},
      wingStats: {},
      bloodGroups: {},
      upcomingBirthdays: 0,
    };

    devotees.forEach(d => {
      if (d.status !== 'Inactive') s.active++;
      
      if (d.followupKaryakarta) {
        s.karyakartaStats[d.followupKaryakarta] = (s.karyakartaStats[d.followupKaryakarta] || 0) + 1;
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

  const Card = ({ title, count, icon: Icon, color }) => (
    <div className="bg-surface rounded-3xl p-5 border border-border-light shadow-sm flex items-start gap-4">
      <div className={`p-3 rounded-2xl ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs font-semibold text-text-muted mb-1">{title}</p>
        <p className="text-2xl font-black text-text-main leading-none">{count}</p>
      </div>
    </div>
  );

  const StatList = ({ title, data, icon: Icon }) => {
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
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
                <li key={key} className="flex justify-between items-center px-3 py-2 hover:bg-bg-base rounded-xl transition-colors">
                  <span className="text-sm font-semibold text-text-main truncate pr-4">{key}</span>
                  <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">{val}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-muted p-4 text-center">No data available.</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-text-main tracking-tight">Reports & Insights</h1>
          <p className="text-sm font-semibold text-text-muted mt-1">Analytics and data export for your mandal.</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary-hover shadow-sm transition-all"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card title="Total Devotees" count={stats.total} icon={Users} color="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <Card title="Active Devotees" count={stats.active} icon={Activity} color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" />
        <Card title="Upcoming Birthdays" count={stats.upcomingBirthdays} icon={Calendar} color="bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400" />
        <Card title="Total Areas" count={Object.keys(stats.areaStats).length} icon={MapPin} color="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatList title="By Karyakarta" data={stats.karyakartaStats} icon={ShieldCheck} />
        <StatList title="By Area" data={stats.areaStats} icon={MapPin} />
        <StatList title="By Wing" data={stats.wingStats} icon={Users} />
      </div>
    </div>
  );
}
