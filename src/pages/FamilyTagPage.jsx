import React, { useState, useMemo } from 'react';
import { Users, Search, Tag, CheckSquare, Square, ChevronDown, ChevronUp, Save, X, ShieldCheck, UserCheck, User, Calendar, MapPin, Filter } from 'lucide-react';
import { dataService } from '../services/dataService';
import { tagsByCategory, tagLabel, tagChipStyle, getMutuallyExclusiveKeys, TAG_CATEGORIES } from '../services/tagCatalog';
import { alertDevoteeSaved, alertDevoteeSaveFailed } from '../utils/sweetAlert';

// ─── helpers ────────────────────────────────────────────────────────────────
const dobShort = (dob) => {
  if (!dob) return '';
  const [y, m, d] = dob.split('-');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1];
  return `${d}-${mon}-${y}`;
};

// Display a full name as first + last only (drop middle name(s)) for compact labels.
const firstLastName = (full) => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return parts.length <= 2 ? parts.join(' ') : `${parts[0]} ${parts[parts.length - 1]}`;
};

export default function FamilyTagPage({ user }) {
  const isAdmin = user?.role === 'Admin';

  // ── data ──────────────────────────────────────────────────────────────────
  const [devotees, setDevotees] = useState(() => dataService.getDevotees());
  const reload = () => setDevotees(dataService.getDevotees());

  // Only primary members (family heads)
  const primaryDevotees = useMemo(() =>
    devotees
      .filter(d => d.type === 'Primary' || !d.type) // Primary or no type set
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [devotees]
  );

  // ── filter dropdown options ────────────────────────────────────────────────
  const uniqueKaryakartas = useMemo(() => [...new Set(devotees.map(d => d.followupKaryakarta).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [devotees]);
  const uniqueAreas = useMemo(() => [...new Set(devotees.map(d => d.area).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [devotees]);
  const uniqueWings = useMemo(() => [...new Set(devotees.map(d => d.wing).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [devotees]);

  // ── filter state ───────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [filterKaryakarta, setFilterKaryakarta] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterWing, setFilterWing] = useState('');
  const [filterBlood, setFilterBlood] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterType, setFilterType] = useState(''); // '' = heads only (default) | Family | all
  const [selectedTags, setSelectedTags] = useState([]);
  const toggleFilterTag = (key) => setSelectedTags(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  const anyFilterActive = selectedTags.length > 0 || filterArea || filterKaryakarta || filterGender || filterBlood || filterWing || filterType;

  // ── UI state ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  // draft tags for the expanded individual editor: { [devoteeId]: Set<tagKey> }
  const [draftTags, setDraftTags] = useState({});
  const [savingIndividual, setSavingIndividual] = useState(false);

  // Tag panel state — which tags to add / remove in bulk
  const [panelOpen, setPanelOpen] = useState(false);
  const [toAdd, setToAdd] = useState([]);
  const [toRemove, setToRemove] = useState([]);

  // ── derived list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devotees
      .filter(d => {
        // membership filter — default '' shows only family heads (Self)
        if (filterType === '' && !(d.type === 'Primary' || !d.type)) return false;
        if (filterType === 'Family' && d.type !== 'Family') return false;
        // filterType === 'all' → everyone
        if (filterKaryakarta && d.followupKaryakarta !== filterKaryakarta) return false;
        if (filterArea && d.area !== filterArea) return false;
        if (filterWing && d.wing !== filterWing) return false;
        if (filterBlood && d.bloodGroup !== filterBlood) return false;
        if (filterGender && d.gender !== filterGender) return false;
        if (selectedTags.length && !selectedTags.every(t => (d.tags || []).includes(t))) return false;
        if (q) {
          const hay = [d.name, d.area, d.mobile, d.reference, d.followupKaryakarta, d.address]
            .map(x => String(x || '').toLowerCase()).join(' ');
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [devotees, search, filterType, filterKaryakarta, filterArea, filterWing, filterBlood, filterGender, selectedTags]);

  // ── selection helpers ─────────────────────────────────────────────────────
  const toggleId = (id) => setSelectedIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const selectAll = () => setSelectedIds(new Set(filtered.map(d => d.id)));
  const clearAll  = () => setSelectedIds(new Set());
  const allSelected = filtered.length > 0 && filtered.every(d => selectedIds.has(d.id));

  // ── tag panel helpers ─────────────────────────────────────────────────────
  const cycleTag = (key) => {
    // neutral → add → remove → neutral
    if (toAdd.includes(key)) {
      setToAdd(p => p.filter(k => k !== key));
      setToRemove(p => [...p, key]);
      return;
    }
    if (toRemove.includes(key)) {
      setToRemove(p => p.filter(k => k !== key));
      return;
    }
    setToAdd(p => [...p, key]);
  };

  const tagState = (key) => {
    if (toAdd.includes(key)) return 'add';
    if (toRemove.includes(key)) return 'remove';
    return 'neutral';
  };

  const clearTagPanel = () => { setToAdd([]); setToRemove([]); };

  // ── apply bulk tags ───────────────────────────────────────────────────────
  const applyTags = async () => {
    if (selectedIds.size === 0 || (toAdd.length === 0 && toRemove.length === 0)) return;
    setSaving(true);
    try {
      await dataService.bulkUpdateTagsAndSync(Array.from(selectedIds), toAdd, toRemove, user?.name);
      reload();
      setToast(`Tags updated for ${selectedIds.size} family head${selectedIds.size > 1 ? 's' : ''} ✓`);
      clearTagPanel();
      setSelectedIds(new Set());
      setTimeout(() => setToast(null), 3500);
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── individual tag draft helpers ──────────────────────────────────────────
  const openExpand = (devotee) => {
    const id = devotee.id;
    // init draft from current saved tags
    if (!draftTags[id]) {
      setDraftTags(prev => ({ ...prev, [id]: new Set(devotee.tags || []) }));
    }
    setExpandedId(prev => prev === id ? null : id);
  };

  const toggleDraftTag = (devoteeId, tagKey) => {
    setDraftTags(prev => {
      const current = new Set(prev[devoteeId] || []);
      if (current.has(tagKey)) {
        current.delete(tagKey);
      } else {
        // enforce mutual exclusivity
        getMutuallyExclusiveKeys(tagKey).forEach(k => current.delete(k));
        current.add(tagKey);
      }
      return { ...prev, [devoteeId]: current };
    });
  };

  const saveIndividualTags = async (devotee) => {
    const draft = draftTags[devotee.id];
    if (!draft) return;
    setSavingIndividual(true);
    try {
      const newTags = Array.from(draft);
      await dataService.updateDevotee(devotee.id, { tags: newTags });
      reload();
      setExpandedId(null);
      setDraftTags(prev => { const n = { ...prev }; delete n[devotee.id]; return n; });
      setToast(`Tags saved for ${devotee.name} ✓`);
      setTimeout(() => setToast(null), 3500);
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      setSavingIndividual(false);
    }
  };

  const discardDraft = (devoteeId) => {
    setDraftTags(prev => { const n = { ...prev }; delete n[devoteeId]; return n; });
    setExpandedId(null);
  };

  // ── guard ─────────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <ShieldCheck className="h-12 w-12 text-red-400" />
        <h2 className="text-xl font-bold text-text-main">Admin Only</h2>
        <p className="text-sm text-text-muted text-center">You need Admin access to use this feature.</p>
      </div>
    );
  }

  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Admin Only</span>
          </div>
          <h1 className="text-2xl font-black text-text-main">Family Tag Manager</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Update tags on primary family heads — {primaryDevotees.length} families total.
          </p>
        </div>
        <Users className="h-8 w-8 text-primary shrink-0 mt-1" />
      </div>

      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700 animate-slide-up">
          <CheckSquare className="h-4 w-4 shrink-0" /> {toast}
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-text-muted" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, area, mobile…"
            className="w-full rounded-2xl border border-border-light bg-surface pl-10 pr-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3.5 top-3 text-text-muted hover:text-text-main">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button onClick={() => setShowFilters(s => !s)}
          className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold shrink-0 ' +
            (anyFilterActive ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-main hover:bg-bg-base')}>
          <Filter className="h-4 w-4" /> Filters{anyFilterActive ? ' (Active)' : ''}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-2xl border border-border-light bg-surface shadow-sm p-4 space-y-4 animate-slide-up">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
              className="rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary">
              <option value="">All Areas</option>
              {uniqueAreas.map(a => <option key={a}>{a}</option>)}
            </select>
            <select value={filterKaryakarta} onChange={e => setFilterKaryakarta(e.target.value)}
              className="rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary">
              <option value="">All Karyakartas</option>
              {uniqueKaryakartas.map(k => <option key={k} value={k}>{firstLastName(k)}</option>)}
            </select>
            <select value={filterGender} onChange={e => setFilterGender(e.target.value)}
              className="rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary">
              <option value="">All Genders</option>
              <option>Male</option><option>Female</option>
            </select>
            <select value={filterBlood} onChange={e => setFilterBlood(e.target.value)}
              className="rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary">
              <option value="">All Blood Groups</option>
              {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b}>{b}</option>)}
            </select>
            <select value={filterWing} onChange={e => setFilterWing(e.target.value)}
              className="rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary">
              <option value="">All Wings</option>
              {uniqueWings.map(w => <option key={w}>{w}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary">
              <option value="">Family Heads (Self)</option>
              <option value="Family">Family Members</option>
              <option value="all">All Members</option>
            </select>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Filter by Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {tagsByCategory().flatMap(({ tags }) => tags).map((t) => {
                const active = selectedTags.includes(t.key);
                return (
                  <button key={t.key} onClick={() => toggleFilterTag(t.key)}
                    style={active ? tagChipStyle(t.key) : undefined}
                    className={'rounded-full px-3 py-1 text-[11px] font-bold border transition-all ' +
                      (active ? '' : 'border-border-light bg-bg-base text-text-muted hover:border-primary/50 hover:text-text-main')}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {anyFilterActive && (
            <button onClick={() => { setSelectedTags([]); setFilterArea(''); setFilterKaryakarta(''); setFilterGender(''); setFilterBlood(''); setFilterWing(''); setFilterType(''); }}
              className="text-xs font-bold text-red-500 hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Selection toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-light bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={allSelected ? clearAll : selectAll}
            className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">
            {allSelected
              ? <><CheckSquare className="h-4 w-4" /> Deselect All</>
              : <><Square className="h-4 w-4" /> Select All ({filtered.length})</>
            }
          </button>
          {selectedIds.size > 0 && (
            <span className="text-sm font-bold text-text-main">
              {selectedIds.size} selected
            </span>
          )}
        </div>

        <button
          onClick={() => setPanelOpen(o => !o)}
          disabled={selectedIds.size === 0}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all
            ${selectedIds.size === 0
              ? 'opacity-40 cursor-not-allowed border border-border-light text-text-muted'
              : hasChanges
                ? 'bg-primary text-white shadow-sm'
                : 'bg-bg-base border border-border-light text-text-main hover:border-primary'
            }`}>
          <Tag className="h-4 w-4" />
          {hasChanges ? `Tags set (${toAdd.length + toRemove.length})` : 'Set Tags'}
          {panelOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Bulk tag panel */}
      {panelOpen && (
        <div className="rounded-2xl border border-primary/30 bg-surface shadow-lg p-5 space-y-5 animate-slide-up">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-text-main">Bulk Tag Operation</p>
              <p className="text-xs text-text-muted mt-0.5">
                Tap once = <span className="text-emerald-600 font-bold">Add ✓</span> &nbsp;·&nbsp;
                Tap again = <span className="text-red-500 font-bold">Remove ✗</span> &nbsp;·&nbsp;
                Tap again = Neutral
              </p>
            </div>
            {hasChanges && (
              <button onClick={clearTagPanel} className="text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-1">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {tagsByCategory().map(({ category, tags }) => (
            <div key={category.key}>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: category.color.dot }} />
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-main">{category.label}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map(t => {
                  const state = tagState(t.key);
                  return (
                    <button key={t.key} onClick={() => cycleTag(t.key)} title={t.desc}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold border transition-all ${
                        state === 'add'
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : state === 'remove'
                            ? 'bg-red-100 border-red-300 text-red-600 line-through'
                            : 'border-border-light bg-bg-base text-text-muted hover:border-primary/50 hover:text-text-main'
                      }`}>
                      {state === 'add' && '+ '}
                      {state === 'remove' && '− '}
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <button
            onClick={applyTags}
            disabled={saving || !hasChanges || selectedIds.size === 0}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-white hover:bg-[#00223f] disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-colors">
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : `Apply to ${selectedIds.size} family head${selectedIds.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Devotee list */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-text-muted">
          Showing {filtered.length} of {primaryDevotees.length} family heads
        </p>

        {filtered.map(d => {
          const selected = selectedIds.has(d.id);
          const expanded = expandedId === d.id;
          const familySize = devotees.filter(x => (x.familyId || x.id) === d.id).length;

          return (
            <div key={d.id}
              className={`rounded-2xl border transition-all ${selected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border-light bg-surface'}`}>

              {/* Main row */}
              <div className="flex items-center gap-3 p-3.5 cursor-pointer" onClick={() => toggleId(d.id)}>
                {/* Checkbox */}
                <div className={`shrink-0 flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${selected ? 'border-primary bg-primary' : 'border-border-light'}`}>
                  {selected && <CheckSquare className="h-3.5 w-3.5 text-white fill-white" strokeWidth={3} />}
                </div>

                {/* Avatar */}
                <img src={d.avatar || `https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name=${encodeURIComponent(d.name||'?')}`}
                  alt={d.name} className="h-11 w-11 shrink-0 rounded-xl object-cover ring-2 ring-border-light" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text-main truncate">{d.name}</p>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5">
                    {d.mobile && <span className="text-[11px] text-text-muted">{d.mobile}</span>}
                    {d.area && <span className="text-[11px] text-text-muted">{d.area}</span>}
                    {familySize > 1 && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{familySize} members</span>}
                  </div>
                  {/* Identifying details — helps recognise devotees you don't know by name */}
                  {(d.reference || d.followupKaryakarta || d.dob || d.address) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      {d.reference && (
                        <span className="flex items-center gap-1 text-[11px] text-text-muted min-w-0 max-w-full">
                          <UserCheck className="h-3 w-3 shrink-0 text-primary/70" />
                          <span className="truncate"><span className="opacity-60">Ref:</span> {d.reference}</span>
                        </span>
                      )}
                      {d.followupKaryakarta && (
                        <span className="flex items-center gap-1 text-[11px] text-text-muted min-w-0 max-w-full">
                          <User className="h-3 w-3 shrink-0 text-primary/70" />
                          <span className="truncate"><span className="opacity-60">K.K:</span> {d.followupKaryakarta}</span>
                        </span>
                      )}
                      {d.dob && (
                        <span className="flex items-center gap-1 text-[11px] text-text-muted shrink-0">
                          <Calendar className="h-3 w-3 shrink-0 text-primary/70" />
                          {dobShort(d.dob)}
                        </span>
                      )}
                      {d.address && (
                        <span className="flex items-center gap-1 text-[11px] text-text-muted min-w-0 max-w-full basis-full">
                          <MapPin className="h-3 w-3 shrink-0 text-primary/70" />
                          <span className="truncate">{d.address}</span>
                        </span>
                      )}
                    </div>
                  )}
                  {/* Active tags preview */}
                  {Array.isArray(d.tags) && d.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {d.tags.slice(0, 4).map(key => (
                        <span key={key} style={tagChipStyle(key)} className="rounded-full px-2 py-0.5 text-[10px] font-bold">{tagLabel(key)}</span>
                      ))}
                      {d.tags.length > 4 && (
                        <span className="rounded-full bg-bg-base px-2 py-0.5 text-[10px] font-bold text-text-muted border border-border-light">+{d.tags.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Expand toggle */}
                <button
                  onClick={e => { e.stopPropagation(); openExpand(d); }}
                  className="shrink-0 grid h-8 w-8 place-items-center rounded-xl hover:bg-bg-base text-text-muted transition-colors">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>

              {/* Expanded — draft tag editor */}
              {expanded && (() => {
                const draft = draftTags[d.id] || new Set(d.tags || []);
                const saved = new Set(d.tags || []);
                const changed = draft.size !== saved.size || [...draft].some(k => !saved.has(k)) || [...saved].some(k => !draft.has(k));
                return (
                  <div className="border-t border-border-light px-4 pb-4 pt-3 space-y-4 animate-slide-up">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Tap tags to toggle · then Save</p>
                      {changed && (
                        <button onClick={() => discardDraft(d.id)} className="text-xs text-text-muted hover:text-text-main flex items-center gap-1">
                          <X className="h-3 w-3" /> Discard
                        </button>
                      )}
                    </div>

                    {tagsByCategory().map(({ category, tags }) => (
                      <div key={category.key}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: category.color.dot }} />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{category.label}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map(t => {
                            const active = draft.has(t.key);
                            const wasOn = saved.has(t.key);
                            const added   = active && !wasOn;
                            const removed = !active && wasOn;
                            return (
                              <button key={t.key}
                                onClick={() => toggleDraftTag(d.id, t.key)}
                                title={t.desc}
                                style={active ? tagChipStyle(t.key) : undefined}
                                className={`rounded-full px-3 py-1 text-[11px] font-bold border transition-all ${
                                  active
                                    ? added ? 'ring-2 ring-emerald-400 ring-offset-1' : ''
                                    : removed
                                      ? 'border-red-300 bg-red-50 text-red-400 line-through'
                                      : 'border-border-light bg-bg-base text-text-muted hover:border-primary hover:text-text-main'
                                }`}>
                                {t.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => saveIndividualTags(d)}
                        disabled={savingIndividual || !changed}
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-white hover:bg-[#00223f] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-colors">
                        <Save className="h-4 w-4" />
                        {savingIndividual ? 'Saving…' : changed ? 'Save Changes' : 'No Changes'}
                      </button>
                      <button
                        onClick={() => discardDraft(d.id)}
                        className="flex items-center justify-center h-12 w-12 rounded-2xl border border-border-light bg-bg-base text-text-muted hover:bg-border-light transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Users className="h-10 w-10 text-text-muted opacity-40" />
            <p className="text-sm font-semibold text-text-muted">No family heads match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
