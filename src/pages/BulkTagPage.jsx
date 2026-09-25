import React, { useState, useMemo } from 'react';
import { Tag, Search, CheckSquare, Save, UserCheck, User, Calendar, MapPin } from 'lucide-react';
import { dataService } from '../services/dataService';
import { hasAnyTag, deriveAge } from '../services/devoteeSchema';
import { tagsByCategory, tagLabel } from '../services/tagCatalog';

export default function BulkTagPage({ user }) {
  const devotees = dataService.getDevotees();
  const [selectedTag, setSelectedTag] = useState('');
  const [actionType, setActionType] = useState('add');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const tagGroups = useMemo(() => tagsByCategory(), []);

  const filteredDevotees = useMemo(() => {
    return devotees
      .filter(d => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          (d.name || '').toLowerCase().includes(q) ||
          (d.followupKaryakarta || '').toLowerCase().includes(q) ||
          (d.reference || '').toLowerCase().includes(q) ||
          (d.address || '').toLowerCase().includes(q) ||
          (d.mobile || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [devotees, searchQuery]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDevotees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDevotees.map(d => d.id)));
    }
  };

  const handleUpdate = async () => {
    if (!selectedTag || selectedIds.size === 0) return;
    setSaving(true);
    setSuccessMsg('');
    try {
      const idsArr = Array.from(selectedIds);
      const toAdd = actionType === 'add' ? [selectedTag] : [];
      const toRemove = actionType === 'remove' ? [selectedTag] : [];
      await dataService.bulkUpdateTagsAndSync(idsArr, toAdd, toRemove, user?.name);
      setSuccessMsg(`Successfully updated ${selectedIds.size} devotees!`);
      setSelectedIds(new Set());
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      alert('Failed to update tags: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 animate-slide-up">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-text-main tracking-tight flex items-center gap-2">
          <Tag className="h-6 w-6 text-primary" /> Fast Bulk Tagger
        </h1>
        <p className="text-sm font-semibold text-text-muted mt-1">Quickly assign or remove tags for multiple devotees at once.</p>
      </div>

      <div className="bg-surface rounded-3xl p-5 border border-border-light shadow-sm mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-xs font-bold text-text-main mb-1">Action</label>
          <select value={actionType} onChange={e => setActionType(e.target.value)} className="w-full rounded-xl border border-border-light p-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary bg-bg-base">
            <option value="add">Add Tag</option>
            <option value="remove">Remove Tag</option>
          </select>
        </div>
        <div className="flex-[2]">
          <label className="block text-xs font-bold text-text-main mb-1">Select Tag</label>
          <select value={selectedTag} onChange={e => setSelectedTag(e.target.value)} className="w-full rounded-xl border border-border-light p-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary bg-bg-base">
            <option value="">-- Choose a Tag --</option>
            {tagGroups.map(({ category, tags }) => (
              <optgroup key={category.key} label={category.label}>
                {tags.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-text-muted" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name, karyakarta, reference, address..."
            className="w-full rounded-xl border border-border-light bg-surface pl-10 pr-4 py-2 text-sm font-semibold text-text-main outline-none focus:border-primary" />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-text-main">{selectedIds.size} selected</span>
          <button onClick={toggleSelectAll} className="text-xs font-bold text-primary hover:underline">
            {selectedIds.size === filteredDevotees.length && filteredDevotees.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold border border-emerald-200">
          {successMsg}
        </div>
      )}

      <div className="mb-24 sm:mb-20 space-y-2.5">
        {filteredDevotees.map(d => {
          const isSelected = selectedIds.has(d.id);
          const hasTheTag = selectedTag ? hasAnyTag(d, [selectedTag]) : false;
          const dimmed = actionType === 'add'
            ? (hasTheTag ? 'opacity-45' : '')
            : (!hasTheTag && selectedTag ? 'opacity-45' : '');
          const age = deriveAge(d.dob);

          return (
            <div key={d.id}
              onClick={() => {
                const next = new Set(selectedIds);
                if (next.has(d.id)) next.delete(d.id);
                else next.add(d.id);
                setSelectedIds(next);
              }}
              className={`rounded-2xl border bg-surface p-3.5 cursor-pointer transition-all ${isSelected ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border-light hover:border-primary/40'} ${dimmed}`}
            >
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={isSelected} readOnly
                  className="mt-1 h-4 w-4 shrink-0 rounded border-border-light text-primary focus:ring-primary pointer-events-none" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-text-main truncate">{d.name || 'Unnamed'}</p>
                    <span className="text-[10px] font-bold text-text-muted bg-bg-base border border-border-light rounded-full px-2 py-0.5 shrink-0">{d.id}</span>
                  </div>

                  {/* Identifying details */}
                  <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    {d.reference && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted min-w-0">
                        <UserCheck className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                        <span className="truncate"><span className="text-text-muted/70">Ref:</span> {d.reference}</span>
                      </span>
                    )}
                    {d.followupKaryakarta && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted min-w-0">
                        <User className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                        <span className="truncate"><span className="text-text-muted/70">K.K:</span> {d.followupKaryakarta}</span>
                      </span>
                    )}
                    {d.dob && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted min-w-0">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                        <span className="truncate">{d.dob}{age !== '' ? ` (${age} yrs)` : ''}</span>
                      </span>
                    )}
                    {d.address && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted min-w-0 sm:col-span-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                        <span className="truncate">{d.address}</span>
                      </span>
                    )}
                  </div>

                  {/* Current tags */}
                  {(d.tags || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(d.tags || []).slice(0, 6).map(t => (
                        <span key={t} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${t === selectedTag ? 'bg-primary text-white' : 'bg-border-light/50 text-text-muted'}`}>{tagLabel(t)}</span>
                      ))}
                      {(d.tags || []).length > 6 && <span className="text-[10px] font-semibold text-text-muted">+{d.tags.length - 6}</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filteredDevotees.length === 0 && (
          <div className="p-8 text-center text-sm font-semibold text-text-muted">No devotees found.</div>
        )}
      </div>

      <div className="fixed bottom-16 sm:bottom-0 inset-x-0 p-4 bg-surface border-t border-border-light flex justify-end z-20">
        <button
          disabled={!selectedTag || selectedIds.size === 0 || saving}
          onClick={handleUpdate}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all w-full sm:w-auto"
        >
          {saving ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-5 w-5" />}
          {saving ? 'Updating...' : `Update ${selectedIds.size} Devotees`}
        </button>
      </div>
    </div>
  );
}
