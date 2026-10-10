import React, { useEffect, useMemo, useState } from 'react';
import {
  Database, Search, AlertTriangle, Trash2, Phone, CalendarDays, CheckCircle2,
  ChevronRight, Copy, X, Users, TrendingUp, ShieldAlert, HeartPulse,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { alertError, alertSuccess } from '../utils/sweetAlert';
import Swal from 'sweetalert2';

// ── Completeness model ─────────────────────────────────────────────────────────
// IMPORTANT: this MUST match the profile wizard's completion % (AddDevoteeWizard
// `completionPct`) so "100%" means the same thing here and on the edit screen.
const filled = (d, key) => {
  const v = d[key];
  if (Array.isArray(v)) return v.length > 0;
  return String(v == null ? '' : v).trim() !== '';
};
const str_ = (v) => String(v == null ? '' : v).trim() !== '';

// Same 12 checks the wizard uses for its overall completion bar.
const COMPLETENESS_CHECKS = [
  { key: 'firstName', label: 'First name', ok: (d) => str_(d.firstName) },
  { key: 'lastName', label: 'Last name', ok: (d) => str_(d.lastName) },
  { key: 'mobile', label: 'Mobile', ok: (d) => str_(d.mobile) },
  { key: 'dob', label: 'Date of birth', ok: (d) => str_(d.dob) },
  { key: 'gender', label: 'Gender', ok: (d) => str_(d.gender) },
  { key: 'area', label: 'Area', ok: (d) => str_(d.area) },
  { key: 'address', label: 'Address', ok: (d) => str_(d.address) },
  { key: 'yuvakType', label: 'Yuvak type', ok: (d) => str_(d.yuvakType) },
  { key: 'eduWork', label: 'Education / Profession', ok: (d) => str_(d.school) || str_(d.profession) || str_(d.qualification) },
  { key: 'karyaRef', label: 'Karyakarta / Reference', ok: (d) => str_(d.followupKaryakarta) || str_(d.reference) },
  { key: 'photo', label: 'Photo', ok: (d) => str_(d.photo) },
  { key: 'tags', label: 'Tags', ok: (d) => Array.isArray(d.tags) && d.tags.length > 0 },
];

const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);
// Normalise a name for duplicate matching: lowercase, drop honorific suffixes,
// keep letters only, collapse spaces.
const normName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/(bhai|ben|kumar)$/i, ''))
    .join(' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const BUCKETS = [
  { key: 'full', label: '100%', min: 100, max: 100, color: 'emerald' },
  { key: 'high', label: '80–99%', min: 80, max: 99, color: 'lime' },
  { key: 'mid', label: '50–79%', min: 50, max: 79, color: 'amber' },
  { key: 'low', label: '20–49%', min: 20, max: 49, color: 'orange' },
  { key: 'vlow', label: '< 20%', min: 0, max: 19, color: 'rose' },
];
const bucketTone = {
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  lime: 'bg-lime-50 dark:bg-lime-950/40 text-lime-700 dark:text-lime-300 border-lime-200 dark:border-lime-900',
  amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  orange: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900',
  rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900',
};
const barColor = (pct) =>
  pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-lime-500' : pct >= 50 ? 'bg-amber-500' : pct >= 20 ? 'bg-orange-500' : 'bg-rose-500';

export default function DataQualityPage({ user, setActivePage }) {
  const isAdmin = user?.role === 'Admin';
  const [tab, setTab] = useState('complete'); // complete | duplicates | insights
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState(''); // '' | incomplete | nomobile | nodob
  const [version, setVersion] = useState(0); // bump to recompute after a delete
  const [deleting, setDeleting] = useState('');

  // Re-read devotees whenever a background refresh lands, so the review reflects edits.
  useEffect(() => {
    const onRefresh = () => setVersion((v) => v + 1);
    window.addEventListener('ac-data-refreshed', onRefresh);
    return () => window.removeEventListener('ac-data-refreshed', onRefresh);
  }, []);

  const devotees = useMemo(() => dataService.getDevotees() || [], [version]);

  // Completeness scored per devotee.
  const scored = useMemo(() => {
    return devotees.map((d) => {
      const missing = COMPLETENESS_CHECKS.filter((c) => !c.ok(d));
      const pct = Math.round(((COMPLETENESS_CHECKS.length - missing.length) / COMPLETENESS_CHECKS.length) * 100);
      return { d, pct, missing };
    });
  }, [devotees]);

  const bucketCounts = useMemo(() => {
    const c = { full: 0, high: 0, mid: 0, low: 0, vlow: 0 };
    scored.forEach(({ pct }) => {
      const b = BUCKETS.find((x) => pct >= x.min && pct <= x.max);
      if (b) c[b.key]++;
    });
    return c;
  }, [scored]);

  const missingMobile = useMemo(() => scored.filter(({ d }) => !last10(d.mobile)).length, [scored]);
  const missingDob = useMemo(() => scored.filter(({ d }) => !filled(d, 'dob')).length, [scored]);

  // Filtered + sorted completeness list (descending — 100% first, as requested).
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = scored;
    if (quick === 'incomplete') rows = rows.filter((r) => r.pct < 100);
    else if (quick === 'nomobile') rows = rows.filter((r) => !last10(r.d.mobile));
    else if (quick === 'nodob') rows = rows.filter((r) => !filled(r.d, 'dob'));
    if (q) {
      rows = rows.filter((r) => {
        const d = r.d;
        return (
          String(d.name || '').toLowerCase().includes(q) ||
          last10(d.mobile).includes(q.replace(/\D/g, '')) ||
          String(d.area || '').toLowerCase().includes(q) ||
          String(d.familyId || '').toLowerCase().includes(q)
        );
      });
    }
    return [...rows].sort((a, b) => b.pct - a.pct || String(a.d.name).localeCompare(String(b.d.name)));
  }, [scored, query, quick]);

  // ── Duplicate detection ──────────────────────────────────────────────────────
  const dupGroups = useMemo(() => {
    const byMobile = new Map();
    const byNameDob = new Map();
    const byNameFam = new Map();
    devotees.forEach((d) => {
      const m = last10(d.mobile);
      if (m) {
        if (!byMobile.has(m)) byMobile.set(m, []);
        byMobile.get(m).push(d);
      }
      const nn = normName(d.name);
      if (nn && filled(d, 'dob')) {
        const k = nn + '|' + d.dob;
        if (!byNameDob.has(k)) byNameDob.set(k, []);
        byNameDob.get(k).push(d);
      }
      if (nn && filled(d, 'familyId')) {
        const k = nn + '|' + d.familyId;
        if (!byNameFam.has(k)) byNameFam.set(k, []);
        byNameFam.get(k).push(d);
      }
    });
    const groups = [];
    const push = (recs, reason) => { if (recs.length >= 2) groups.push({ recs, reason }); };
    byMobile.forEach((recs) => push(recs, 'Same mobile number'));
    byNameDob.forEach((recs) => push(recs, 'Same name & date of birth'));
    byNameFam.forEach((recs) => push(recs, 'Same name & family'));

    // De-duplicate overlapping groups: drop any whose member-set is a subset of
    // another group's, and collapse exact duplicates (keep the first reason).
    const withKey = groups.map((g) => ({ ...g, ids: new Set(g.recs.map((r) => r.id)), key: g.recs.map((r) => r.id).sort().join(',') }));
    const kept = [];
    withKey
      .sort((a, b) => b.recs.length - a.recs.length)
      .forEach((g) => {
        const subsumed = kept.some((k) => [...g.ids].every((id) => k.ids.has(id)));
        if (!subsumed) kept.push(g);
      });
    return kept;
  }, [devotees, version]);

  const openProfile = (id) => {
    if (setActivePage) setActivePage('devotees', { openDevoteeId: id });
  };

  const handleDelete = async (d) => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Delete this devotee?',
      html: `<div style="text-align:left;font-size:14px">
        <b>${(d.name || '—').replace(/</g, '&lt;')}</b><br>
        ${d.mobile ? '📱 ' + d.mobile + '<br>' : ''}
        ${d.familyId ? '👨‍👩‍👧 ' + d.familyId + '<br>' : ''}
        <span style="color:#dc2626">This permanently removes the record. This cannot be undone.</span>
      </div>`,
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc2626',
      cancelButtonText: 'Cancel',
      customClass: { popup: 'rounded-3xl font-sans', confirmButton: 'rounded-2xl px-6 py-2.5 font-bold', cancelButton: 'rounded-2xl px-6 py-2.5 font-bold' },
    });
    if (!res.isConfirmed) return;
    setDeleting(d.id);
    try {
      await dataService.deleteDevotee(d.id);
      setVersion((v) => v + 1);
      alertSuccess('Deleted', `${d.name || 'Record'} was removed.`);
    } catch (e) {
      alertError('Could not delete', e.message);
    } finally {
      setDeleting('');
    }
  };

  // ── Insights ─────────────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const total = devotees.length || 1;
    const avg = Math.round(scored.reduce((s, r) => s + r.pct, 0) / total);
    const genders = { Male: 0, Female: 0, Other: 0 };
    let noFamily = 0, noCreatedBy = 0;
    const areaCount = new Map();
    devotees.forEach((d) => {
      const g = d.gender === 'Male' ? 'Male' : d.gender === 'Female' ? 'Female' : 'Other';
      genders[g]++;
      if (!filled(d, 'familyId')) noFamily++;
      if (!filled(d, 'createdBy')) noCreatedBy++;
      const a = String(d.area || '').trim() || '—';
      areaCount.set(a, (areaCount.get(a) || 0) + 1);
    });
    const areas = [...areaCount.entries()].sort((a, b) => b[1] - a[1]);
    // Data-health score: average completeness, lightly penalised for duplicates.
    const dupPenalty = Math.min(15, dupGroups.length);
    const health = Math.max(0, Math.min(100, avg - dupPenalty));
    return { total: devotees.length, avg, genders, noFamily, noCreatedBy, areas, health };
  }, [devotees, scored, dupGroups]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-text-muted" />
        <h2 className="mt-4 text-lg font-bold text-text-main">Admins only</h2>
        <p className="mt-1 text-sm text-text-muted">The Data Quality tools are available to administrators.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow-md shadow-primary/30">
          <Database className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-text-main leading-tight">Data Quality</h1>
          <p className="text-xs text-text-muted">Complete profiles · find duplicates · health insights</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-2xl border border-border-light bg-bg-base p-1">
        {[
          { id: 'complete', label: 'Completeness', icon: CheckCircle2 },
          { id: 'duplicates', label: `Duplicates${dupGroups.length ? ` (${dupGroups.length})` : ''}`, icon: Copy },
          { id: 'insights', label: 'Insights', icon: TrendingUp },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${tab === id ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
            <Icon className="h-4 w-4" /> <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Completeness tab ──────────────────────────────────────────────────── */}
      {tab === 'complete' && (
        <div className="mt-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {BUCKETS.map((b) => (
              <button key={b.key}
                onClick={() => { setQuick(b.key === 'full' ? '' : 'incomplete'); }}
                className={`rounded-2xl border p-3 text-left transition-transform active:scale-95 ${bucketTone[b.color]}`}>
                <p className="text-2xl font-extrabold leading-none">{bucketCounts[b.key]}</p>
                <p className="mt-1 text-[11px] font-bold opacity-80">{b.label}</p>
              </button>
            ))}
          </div>

          {/* Search + quick filters */}
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, mobile, area, family ID…"
              className="w-full bg-transparent text-sm text-text-main outline-none placeholder:text-text-muted" />
            {query && <button onClick={() => setQuery('')}><X className="h-4 w-4 text-text-muted" /></button>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { id: '', label: 'All' },
              { id: 'incomplete', label: 'Incomplete only' },
              { id: 'nomobile', label: `No mobile · ${missingMobile}`, icon: Phone },
              { id: 'nodob', label: `No DOB · ${missingDob}`, icon: CalendarDays },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id || 'all'} onClick={() => setQuick(id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${quick === id ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-muted hover:text-text-main'}`}>
                {Icon && <Icon className="h-3.5 w-3.5" />} {label}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-text-muted">{list.length} profile{list.length === 1 ? '' : 's'}</p>

          {/* List */}
          <div className="mt-2 space-y-2">
            {list.map(({ d, pct, missing }) => (
              <button key={d.id} onClick={() => openProfile(d.id)}
                className="group flex w-full items-center gap-3 rounded-2xl border border-border-light bg-surface p-3 text-left transition-colors hover:border-primary">
                {/* Percent ring-ish badge */}
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bg-base">
                  <span className={`text-sm font-extrabold ${pct >= 100 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{pct}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-text-main">{d.name || '—'}</p>
                    {pct >= 100 && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  </div>
                  <p className="truncate text-[11px] text-text-muted">{d.area || 'No area'}{d.familyId ? ` · ${d.familyId}` : ''}</p>
                  {/* progress bar */}
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-base">
                    <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                  </div>
                  {/* missing chips */}
                  {missing.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {missing.slice(0, 6).map((f) => (
                        <span key={f.key} className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">{f.label}</span>
                      ))}
                      {missing.length > 6 && <span className="text-[10px] font-semibold text-text-muted">+{missing.length - 6}</span>}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-muted group-hover:text-primary" />
              </button>
            ))}
            {list.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border-light bg-surface p-8 text-center text-sm text-text-muted">
                No profiles match this filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Duplicates tab ────────────────────────────────────────────────────── */}
      {tab === 'duplicates' && (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Possible duplicates grouped by shared mobile, matching name + DOB, or name + family. Review each group and delete only the records you're sure about — a shared family phone is normal, so judge before removing.</p>
          </div>

          {dupGroups.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border-light bg-surface p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-text-main">No duplicates found</p>
              <p className="text-xs text-text-muted">Every record looks unique.</p>
            </div>
          )}

          {dupGroups.map((g, gi) => (
            <div key={gi} className="rounded-2xl border border-border-light bg-surface p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{g.reason}</span>
                <span className="text-[11px] text-text-muted">{g.recs.length} records</span>
              </div>
              <div className="space-y-2">
                {g.recs.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border-light bg-bg-base p-2.5">
                    <button onClick={() => openProfile(d.id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-bold text-text-main">{d.name || '—'}</p>
                      <p className="truncate text-[11px] text-text-muted">
                        {d.mobile ? `📱 ${d.mobile}` : 'No mobile'} · {fmtDate(d.dob)} · {d.area || 'No area'}
                        {d.familyId ? ` · ${d.familyId}` : ''}
                      </p>
                      <p className="truncate text-[10px] text-text-muted">Added {fmtDate(d.createdOn)}{d.createdBy ? ` by ${d.createdBy}` : ''}</p>
                    </button>
                    <button onClick={() => handleDelete(d)} disabled={deleting === d.id}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 transition-colors hover:bg-red-100 disabled:opacity-40 dark:border-red-900 dark:bg-red-950">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Insights tab ──────────────────────────────────────────────────────── */}
      {tab === 'insights' && (
        <div className="mt-4 space-y-4">
          {/* Health score headline */}
          <div className="flex items-center gap-4 rounded-3xl border border-border-light bg-gradient-to-br from-primary/5 to-accent/5 p-5">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(${insights.health >= 70 ? '#10b981' : insights.health >= 40 ? '#f59e0b' : '#ef4444'} ${insights.health * 3.6}deg, rgba(148,163,184,0.25) 0deg)` }}>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface">
                <span className="text-xl font-extrabold text-text-main">{insights.health}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-text-muted"><HeartPulse className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">Data health</span></div>
              <p className="mt-0.5 text-sm text-text-main">Average profile completeness <b>{insights.avg}%</b> across <b>{insights.total}</b> devotees.</p>
              <p className="text-xs text-text-muted">{dupGroups.length} possible duplicate group{dupGroups.length === 1 ? '' : 's'}.</p>
            </div>
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Total devotees', value: insights.total, icon: Users },
              { label: 'Missing mobile', value: missingMobile, icon: Phone, warn: missingMobile > 0 },
              { label: 'Missing DOB', value: missingDob, icon: CalendarDays, warn: missingDob > 0 },
              { label: 'No family linked', value: insights.noFamily, icon: Users, warn: insights.noFamily > 0 },
            ].map((s) => (
              <div key={s.label} className={`rounded-2xl border p-3 ${s.warn ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40' : 'border-border-light bg-surface'}`}>
                <s.icon className={`h-4 w-4 ${s.warn ? 'text-amber-600' : 'text-text-muted'}`} />
                <p className="mt-1.5 text-2xl font-extrabold text-text-main">{s.value}</p>
                <p className="text-[11px] font-semibold text-text-muted">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Gender split */}
          <div className="rounded-2xl border border-border-light bg-surface p-4">
            <p className="mb-3 text-sm font-bold text-text-main">Gender split</p>
            <div className="flex gap-2">
              {[['Male', 'bg-indigo-500'], ['Female', 'bg-rose-500'], ['Other', 'bg-slate-400']].map(([g, c]) => {
                const n = insights.genders[g] || 0;
                const pct = Math.round((n / (insights.total || 1)) * 100);
                return (
                  <div key={g} className="flex-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-main">{g}</span>
                      <span className="text-text-muted">{n}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg-base">
                      <div className={`h-full rounded-full ${c}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Area coverage */}
          <div className="rounded-2xl border border-border-light bg-surface p-4">
            <p className="mb-3 text-sm font-bold text-text-main">Devotees per area</p>
            <div className="space-y-2">
              {insights.areas.map(([area, n]) => {
                const max = insights.areas[0]?.[1] || 1;
                return (
                  <div key={area} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-xs font-semibold text-text-main">{area}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-base">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((n / max) * 100)}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs text-text-muted">{n}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
