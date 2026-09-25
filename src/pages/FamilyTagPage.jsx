import React, { useState, useMemo, useCallback } from 'react';
import { Users, Search, Tag, CheckSquare, Square, ChevronDown, ChevronUp, Save, X, ShieldCheck } from 'lucide-react';
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

  // ── UI state ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Tag panel state — which tags to add / remove in bulk
  const [panelOpen, setPanelOpen] = useState(false);
  const [toAdd, setToAdd] = useState([]);
  const [toRemove, setToRemove] = useState([]);

  // ── derived list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return primaryDevotees;
    const q = search.toLowerCase();
    return primaryDevotees.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.area || '').toLowerCase().includes(q) ||
      (d.mobile || '').includes(q)
    );
  }, [primaryDevotees, search]);

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

  // ── single devotee tag toggle ─────────────────────────────────────────────
  const toggleOneTag = useCallback((devoteeId, tagKey, currentlyOn) => {
    const exclusiveKeys = currentlyOn ? [] : getMutuallyExclusiveKeys(tagKey);
    const updated = dataService.setDevoteeTag(devoteeId, tagKey, !currentlyOn, exclusiveKeys);
    if (updated) reload();
  }, []);

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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 h-4 w-4 text-text-muted" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search family head by name, area, mobile…"
          className="w-full rounded-2xl border border-border-light bg-surface pl-10 pr-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3.5 top-3 text-text-muted hover:text-text-main">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

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
          const familySize = devotees.filter(x => x.familyId === d.familyId).length;

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
                  onClick={e => { e.stopPropagation(); setExpandedId(expanded ? null : d.id); }}
                  className="shrink-0 grid h-8 w-8 place-items-center rounded-xl hover:bg-bg-base text-text-muted transition-colors">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>

              {/* Expanded — individual tag editor */}
              {expanded && (
                <div className="border-t border-border-light px-4 pb-4 pt-3 space-y-4 animate-slide-up">
                  <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Edit tags individually</p>
                  {tagsByCategory().map(({ category, tags }) => (
                    <div key={category.key}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: category.color.dot }} />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{category.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map(t => {
                          const active = (d.tags || []).includes(t.key);
                          return (
                            <button key={t.key}
                              onClick={() => toggleOneTag(d.id, t.key, active)}
                              style={active ? tagChipStyle(t.key) : undefined}
                              title={t.desc}
                              className={`rounded-full px-3 py-1 text-[11px] font-bold transition-all ${
                                active ? '' : 'border border-border-light bg-bg-base text-text-muted hover:border-primary hover:text-text-main'
                              }`}>
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
