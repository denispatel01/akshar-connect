import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Users, Briefcase, MapPin, Activity, Calendar, ShieldCheck, Heart, Phone, X, ArrowRight, User } from 'lucide-react';
import { dataService } from '../services/dataService';
import { isBirthdayWithin } from '../utils/birthdays';

export default function ReportsPage({ setActivePage }) {
  const devotees = dataService.getDevotees();

  // Drill-down bottom sheet: { field: 'followupKaryakarta'|'area'|'wing', value, label }
  const [drill, setDrill] = useState(null);

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

  const StatList = ({ title, data, icon: Icon, isComplex, onRowClick }) => {
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
        <StatList title="By Karyakarta" data={stats.karyakartaStats} icon={ShieldCheck} isComplex={true} onRowClick={(k) => setDrill({ field: 'followupKaryakarta', value: k, label: k })} />
        <StatList title="By Area" data={stats.areaStats} icon={MapPin} onRowClick={(k) => setDrill({ field: 'area', value: k, label: k })} />
        <StatList title="By Wing" data={stats.wingStats} icon={Users} onRowClick={(k) => setDrill({ field: 'wing', value: k, label: k })} />
      </div>

      {drill && (
        <DrillSheet
          drill={drill}
          devotees={devotees}
          onClose={() => setDrill(null)}
          onViewAll={() => {
            const preset = drill.field === 'followupKaryakarta' ? { karyakarta: drill.value }
              : drill.field === 'area' ? { area: drill.value }
              : { wing: drill.value };
            setActivePage?.("devotees", { filterPreset: preset });
          }}
        />
      )}
    </div>
  );
}

// ── Drill-down bottom sheet (mobile) / side drawer (desktop) ──────────────────
function DrillSheet({ drill, devotees, onClose, onViewAll }) {
  const list = useMemo(
    () => devotees
      .filter(d => (d[drill.field] || '') === drill.value)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [devotees, drill]
  );
  const families = new Set(list.map(d => d.familyId || ('ID_' + d.id))).size;
  const heading = drill.field === 'followupKaryakarta' ? 'Karyakarta' : drill.field === 'area' ? 'Area' : 'Wing';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center sm:justify-end"
      style={{ animation: 'drillFade .2s ease-out' }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full sm:w-[420px] sm:h-full bg-surface shadow-2xl flex flex-col
          rounded-t-3xl sm:rounded-none sm:rounded-l-3xl max-h-[85vh] sm:max-h-none"
        style={{ animation: 'drillUp .28s cubic-bezier(.22,1,.36,1)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* Grab handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="h-1.5 w-10 rounded-full bg-border-light" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-3 sm:pt-5 pb-4 border-b border-border-light">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary">{heading}</p>
            <h3 className="text-lg font-black text-text-main truncate">{drill.label}</h3>
            <div className="flex gap-1.5 mt-1.5">
              <span className="text-[11px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md">{list.length} devotees</span>
              <span className="text-[11px] font-bold bg-purple-50 text-purple-600 px-2 py-0.5 rounded-md">{families} families</span>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 grid h-9 w-9 place-items-center rounded-xl hover:bg-bg-base text-text-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto px-3 py-3 space-y-1.5">
          {list.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-10">No devotees found.</p>
          ) : list.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-bg-base transition-colors">
              <img src={d.avatar || `https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name=${encodeURIComponent(d.name||'?')}`}
                alt={d.name} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-2 ring-border-light" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-main truncate">{d.name}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                  {d.area && <span className="flex items-center gap-1 text-[11px] text-text-muted"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{d.area}</span></span>}
                  {d.type === 'Primary' || !d.type ? <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Head</span> : null}
                </div>
              </div>
              {d.mobile && (
                <a href={`tel:${d.mobile}`} onClick={e => e.stopPropagation()}
                  className="shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border-light p-3">
          <button onClick={onViewAll}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-white hover:bg-primary-hover transition-colors">
            View all in Directory <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes drillFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes drillUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @media (min-width: 640px) {
          @keyframes drillUp { from { transform: translateX(100%) } to { transform: translateX(0) } }
        }
      `}</style>
    </div>,
    document.body
  );
}
