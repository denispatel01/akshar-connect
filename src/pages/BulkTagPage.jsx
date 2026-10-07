import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Tag, Save, Search, ChevronLeft, ChevronRight, User, UserCheck,
  Calendar, MapPin, Phone, Check, X,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { deriveAge, QUALIFICATIONS } from '../services/devoteeSchema';
import { tagsByCategory, tagChipStyle, tagLabel } from '../services/tagCatalog';
import { devoteeMatches } from '../utils/search';
import MultiSelect from '../components/MultiSelect';
import { Filter } from 'lucide-react';

const AGE_BANDS = {
  under15: { label: 'Under 15', test: (a) => a !== '' && a < 15 },
  '15to45': { label: '15 – 45', test: (a) => a !== '' && a >= 15 && a <= 45 },
  over45: { label: 'Over 45', test: (a) => a !== '' && a > 45 },
};

export default function BulkTagPage() {
  const tagGroups = useMemo(() => tagsByCategory(), []);

  // Working deck of devotees (sorted by name) + search / karyakarta narrowing.
  const [searchQuery, setSearchQuery] = useState('');
  const [karyakarta, setKaryakarta] = useState('');
  // Full Devotee-style filters (#141).
  const [showFilters, setShowFilters] = useState(false);
  const [filterAreas, setFilterAreas] = useState([]);
  const [filterReferences, setFilterReferences] = useState([]);
  const [filterQualifications, setFilterQualifications] = useState([]);
  const [filterAges, setFilterAges] = useState([]);
  const [filterGenders, setFilterGenders] = useState([]);
  const [filterTypes, setFilterTypes] = useState([]);
  const [filterOldNews, setFilterOldNews] = useState([]);
  const allDevotees = useMemo(
    () => [...dataService.getDevotees()].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [],
  );
  const karyakartaOptions = useMemo(() => {
    const set = new Set();
    allDevotees.forEach(d => { const k = (d.followupKaryakarta || '').trim(); if (k) set.add(k); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allDevotees]);
  const uniqueAreas = useMemo(() => [...new Set(allDevotees.map(d => d.area).filter(Boolean))].sort(), [allDevotees]);
  const uniqueReferences = useMemo(() => [...new Set(allDevotees.map(d => d.reference).filter(Boolean))].sort(), [allDevotees]);
  const anyFilter = filterAreas.length || filterReferences.length || filterQualifications.length || filterAges.length || filterGenders.length || filterTypes.length || filterOldNews.length;
  const deck = useMemo(() => {
    return allDevotees.filter(d => {
      if (karyakarta && (d.followupKaryakarta || '').trim() !== karyakarta) return false;
      // Search matches name / DOB / mobile only (never karyakarta/reference).
      if (searchQuery.trim() && !devoteeMatches(d, searchQuery)) return false;
      if (filterAreas.length && !filterAreas.includes(d.area)) return false;
      if (filterReferences.length && !filterReferences.includes(d.reference)) return false;
      if (filterQualifications.length && !filterQualifications.includes(d.qualification)) return false;
      if (filterAges.length && !filterAges.some(a => AGE_BANDS[a]?.test(deriveAge(d.dob)))) return false;
      if (filterGenders.length && !filterGenders.includes(d.gender)) return false;
      if (filterTypes.length && !filterTypes.includes(d.type)) return false;
      if (filterOldNews.length && !filterOldNews.some(v => {
        const val = v.toLowerCase();
        if (val === 'reference') return String(d.oldNew || '').toLowerCase() === 'reference' || !!String(d.reference || '').trim();
        return String(d.oldNew || '').toLowerCase() === val;
      })) return false;
      return true;
    });
  }, [allDevotees, searchQuery, karyakarta, filterAreas, filterReferences, filterQualifications, filterAges, filterGenders, filterTypes, filterOldNews]);

  // Per-devotee draft tag sets: { [id]: string[] }. Seeded from current tags.
  const [draft, setDraft] = useState(() => {
    const m = {};
    allDevotees.forEach(d => { m[d.id] = [...(d.tags || [])]; });
    return m;
  });

  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Reset the pointer when the filtered deck changes.
  useEffect(() => { setIndex(0); }, [searchQuery, karyakarta, filterAreas, filterReferences, filterQualifications, filterAges, filterGenders, filterTypes, filterOldNews]);

  const current = deck[index] || null;

  // Count how many devotees have changed vs their stored tags.
  const changedCount = useMemo(() => {
    let n = 0;
    allDevotees.forEach(d => {
      const next = draft[d.id] || [];
      const prev = d.tags || [];
      if (prev.length !== next.length || prev.some(t => !next.includes(t))) n++;
    });
    return n;
  }, [draft, allDevotees]);

  const toggleTag = (id, key) => {
    setDraft(prev => {
      const cur = prev[id] || [];
      const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
      return { ...prev, [id]: next };
    });
  };

  const go = (dir) => {
    setIndex(i => Math.min(Math.max(i + dir, 0), Math.max(deck.length - 1, 0)));
  };

  // Swipe handling — swipe left = next, swipe right = previous.
  const touchX = useRef(null);
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  // Keyboard arrows for desktop.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deck.length]);

  const handleSaveAll = async () => {
    if (changedCount === 0) return;
    setSaving(true);
    setSuccessMsg('');
    try {
      const entries = allDevotees.map(d => ({ id: d.id, tags: draft[d.id] || [] }));
      const n = await dataService.bulkSetTagsAndSync(entries);
      setSuccessMsg(`Saved tags for ${n} devotee${n === 1 ? '' : 's'}.`);
      // Reseed draft from the now-updated records so changedCount resets to 0.
      const fresh = {};
      dataService.getDevotees().forEach(d => { fresh[d.id] = [...(d.tags || [])]; });
      setDraft(fresh);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      alert('Failed to save tags: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const age = current ? deriveAge(current.dob) : '';
  const curTags = current ? (draft[current.id] || []) : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 animate-slide-up pb-28">
      {/* Header + sticky Save */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-bg-base/95 backdrop-blur border-b border-border-light">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-black text-text-main tracking-tight flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" /> Bulk Tagger
          </h1>
          <button
            disabled={changedCount === 0 || saving}
            onClick={handleSaveAll}
            className="flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-hover shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : `Save${changedCount ? ` (${changedCount})` : ''}`}
          </button>
        </div>
        {successMsg && (
          <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 border border-emerald-200">
            {successMsg}
          </div>
        )}
      </div>

      {/* Search + karyakarta filter */}
      <div className="mt-4 mb-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-text-muted" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name, DOB (dd-MM-yyyy) or mobile"
            className="w-full rounded-xl border border-border-light bg-surface pl-10 pr-10 py-2 text-sm font-semibold text-text-main outline-none focus:border-primary" />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} title="Clear search"
              className="absolute right-2 top-1.5 grid h-7 w-7 place-items-center rounded-full text-text-muted hover:bg-bg-base hover:text-text-main">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {karyakartaOptions.length > 0 && (
          <select value={karyakarta} onChange={e => setKaryakarta(e.target.value)}
            title="Filter to one karyakarta's devotees"
            className={`rounded-xl border px-3 py-2 text-sm font-bold outline-none ${karyakarta ? 'border-primary bg-primary/5 text-text-main' : 'border-border-light bg-surface text-text-muted'}`}>
            <option value="">All karyakartas</option>
            {karyakartaOptions.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        <button type="button" onClick={() => setShowFilters(v => !v)}
          className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold ${anyFilter ? 'border-primary bg-primary/5 text-text-main' : 'border-border-light bg-surface text-text-muted'}`}>
          <Filter className="h-4 w-4" /> Filters{anyFilter ? ` (${[filterAreas,filterReferences,filterQualifications,filterAges,filterGenders,filterTypes,filterOldNews].reduce((n,a)=>n+a.length,0)})` : ''}
        </button>
      </div>

      {/* Full Devotee-style filter panel (#141) */}
      {showFilters && (
        <div className="mb-3 rounded-2xl border border-border-light bg-surface shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <MultiSelect label="All Areas" options={uniqueAreas} selected={filterAreas} onChange={setFilterAreas} />
            <MultiSelect label="All References" options={uniqueReferences} selected={filterReferences} onChange={setFilterReferences} />
            <MultiSelect label="All Qualifications" options={QUALIFICATIONS} selected={filterQualifications} onChange={setFilterQualifications} />
            <MultiSelect label="All Ages" options={Object.entries(AGE_BANDS).map(([key, b]) => ({ value: key, label: b.label }))} selected={filterAges} onChange={setFilterAges} />
            <MultiSelect label="All Genders" options={['Male', 'Female']} selected={filterGenders} onChange={setFilterGenders} />
            <MultiSelect label="All Members" options={[{ value: 'Primary', label: 'Family Heads' }, { value: 'Family', label: 'Family Members' }]} selected={filterTypes} onChange={setFilterTypes} />
            <MultiSelect label="All (Old/Ref/New)" options={['Old', 'Reference', 'New']} selected={filterOldNews} onChange={setFilterOldNews} />
          </div>
          {anyFilter ? (
            <button onClick={() => { setFilterAreas([]); setFilterReferences([]); setFilterQualifications([]); setFilterAges([]); setFilterGenders([]); setFilterTypes([]); setFilterOldNews([]); }}
              className="text-xs font-bold text-red-500 hover:underline">Clear all filters</button>
          ) : null}
        </div>
      )}

      {deck.length === 0 || !current ? (
        <div className="p-10 text-center text-sm font-semibold text-text-muted">No devotees found.</div>
      ) : (
        <>
          {/* Progress */}
          <div className="mb-3 flex items-center justify-between text-xs font-bold text-text-muted">
            <span>{index + 1} of {deck.length}</span>
            <span className="text-text-muted/70">Swipe or use ← → to move</span>
          </div>

          {/* Devotee card */}
          <div
            key={current.id}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="rounded-3xl border border-border-light bg-surface p-5 shadow-sm animate-fade-in">
            {/* Identity */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-lg font-black text-text-main truncate">{current.name || 'Unnamed'}</p>
                <span className="text-[10px] font-bold text-text-muted bg-bg-base border border-border-light rounded-full px-2 py-0.5">{current.id}</span>
              </div>
            </div>

            {/* Details */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {current.mobile && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted min-w-0">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-primary/70" /><span className="truncate">{current.mobile}</span>
                </span>
              )}
              {current.dob && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted min-w-0">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="truncate">{current.dob}{age !== '' ? ` (${age} yrs)` : ''}</span>
                </span>
              )}
              {current.reference && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted min-w-0">
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="truncate"><span className="text-text-muted/70">Ref:</span> {current.reference}</span>
                </span>
              )}
              {current.followupKaryakarta && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted min-w-0">
                  <User className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="truncate"><span className="text-text-muted/70">K.K:</span> {current.followupKaryakarta}</span>
                </span>
              )}
              {current.address && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted min-w-0 sm:col-span-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="truncate">{current.address}</span>
                </span>
              )}
            </div>

            {/* Tags — tap to toggle, grouped by category */}
            <div className="mt-4 space-y-3 border-t border-border-light pt-4">
              {tagGroups.map(({ category, tags }) => (
                <div key={category.key}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{category.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => {
                      const on = curTags.includes(t.key);
                      return (
                        <button key={t.key} onClick={() => toggleTag(current.id, t.key)}
                          style={on ? tagChipStyle(t.key) : undefined}
                          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${on ? '' : 'border border-border-light text-slate-500 hover:border-primary/50 hover:text-text-main'}`}>
                          {on && <Check className="h-3 w-3" />}{t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prev / Next */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button onClick={() => go(-1)} disabled={index === 0}
              className="flex items-center gap-1.5 rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-bold text-text-main disabled:opacity-40 hover:border-primary transition-all">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button onClick={() => go(1)} disabled={index >= deck.length - 1}
              className="flex items-center gap-1.5 rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-bold text-text-main disabled:opacity-40 hover:border-primary transition-all">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
