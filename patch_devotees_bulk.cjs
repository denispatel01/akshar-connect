const fs = require('fs');
let content = fs.readFileSync('src/pages/DevoteesPage.jsx', 'utf8');

// 1. Add states
content = content.replace(
  "  const [saving, setSaving] = useState(false);",
  "  const [saving, setSaving] = useState(false);\n  const [selectMode, setSelectMode] = useState(false);\n  const [selectedIds, setSelectedIds] = useState(new Set());\n  const [showBulkTagModal, setShowBulkTagModal] = useState(false);\n  const [bulkTagsToAdd, setBulkTagsToAdd] = useState([]);\n  const [bulkTagsToRemove, setBulkTagsToRemove] = useState([]);"
);

// 2. Add Select Mode button and Bulk Actions bar
const selectModeButton = `
          {canEdit && (
            <button onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
              className={\`flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold transition-colors \${selectMode ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-main hover:bg-bg-base'}\`}>
              <CheckSquare className="h-4 w-4" /> {selectMode ? 'Cancel Select' : 'Select'}
            </button>
          )}
        </div>
      </div>
      
      {selectMode && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 animate-slide-up">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-text-main">{selectedIds.size} selected</span>
            <button onClick={() => {
              if (selectedIds.size === filteredDevotees.length) setSelectedIds(new Set());
              else setSelectedIds(new Set(filteredDevotees.map(d => d.id)));
            }} className="text-xs font-bold text-primary hover:underline">
              {selectedIds.size === filteredDevotees.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <button 
            disabled={selectedIds.size === 0}
            onClick={() => setShowBulkTagModal(true)}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed">
            Apply Tags
          </button>
        </div>
      )}`;

content = content.replace(
  "        </div>\n      </div>",
  selectModeButton
);

// Add CheckSquare to imports
if (!content.includes("CheckSquare")) {
  content = content.replace("Search, Plus, Filter, QrCode", "Search, Plus, Filter, QrCode, CheckSquare");
}

// 3. Card click logic
content = content.replace(
  "onClick={() => openProfile(devotee)}",
  "onClick={() => {\n              if (selectMode) {\n                const newSet = new Set(selectedIds);\n                if (newSet.has(devotee.id)) newSet.delete(devotee.id);\n                else newSet.add(devotee.id);\n                setSelectedIds(newSet);\n              } else {\n                openProfile(devotee);\n              }\n            }}"
);

// Card styling for selected state
content = content.replace(
  "className=\"group flex flex-col rounded-3xl border border-border-light bg-surface p-4 sm:p-5 shadow-[0_1px_3px_rgba(16,40,80,0.05)] transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_10px_28px_rgba(16,40,80,0.12)]\">",
  "className={\`relative group flex flex-col rounded-3xl border p-4 sm:p-5 shadow-[0_1px_3px_rgba(16,40,80,0.05)] transition-all duration-200 cursor-pointer hover:-translate-y-0.5 \${selectedIds.has(devotee.id) ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border-light bg-surface hover:border-primary/30 hover:shadow-[0_10px_28px_rgba(16,40,80,0.12)]'}\`}>\n              {selectMode && (\n                <div className=\"absolute top-4 right-4 z-10\">\n                  <div className={\`flex h-6 w-6 items-center justify-center rounded-md border \${selectedIds.has(devotee.id) ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface'}\`}>\n                    {selectedIds.has(devotee.id) && <CheckSquare className=\"h-4 w-4\" />}\n                  </div>\n                </div>\n              )}"
);

// 4. Bulk Modal UI and function
const bulkModalUI = `
      {showBulkTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-surface p-5 sm:p-6 shadow-2xl">
            <h2 className="text-xl font-black text-text-main mb-1">Bulk Update Tags</h2>
            <p className="text-sm font-medium text-text-muted mb-4">Assign or remove tags for {selectedIds.size} selected devotees.</p>
            
            <div className="max-h-[50vh] overflow-auto mb-4 border border-border-light rounded-2xl p-4 bg-bg-base">
              {tagsByCategory().map(({ category, tags }) => (
                <div key={category.key} className="mb-4 last:mb-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-text-main mb-2">{category.label}</div>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t) => {
                      const isAdd = bulkTagsToAdd.includes(t.key);
                      const isRem = bulkTagsToRemove.includes(t.key);
                      
                      return (
                        <button key={t.key} 
                          onClick={() => {
                            if (isAdd) { setBulkTagsToAdd(p => p.filter(x => x !== t.key)); setBulkTagsToRemove(p => [...p, t.key]); }
                            else if (isRem) { setBulkTagsToRemove(p => p.filter(x => x !== t.key)); }
                            else { setBulkTagsToAdd(p => [...p, t.key]); }
                          }}
                          className={\`rounded-full px-3 py-1 text-[11px] font-bold transition-all border \${isAdd ? 'border-primary bg-primary text-white' : isRem ? 'border-red-500 bg-red-50 text-red-600 line-through' : 'border-border-light bg-surface text-text-muted hover:border-primary/50'}\`}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowBulkTagModal(false); setBulkTagsToAdd([]); setBulkTagsToRemove([]); }} className="rounded-xl px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-base">Cancel</button>
              <button 
                disabled={saving || (bulkTagsToAdd.length === 0 && bulkTagsToRemove.length === 0)}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await dataService.bulkUpdateTagsAndSync(Array.from(selectedIds), bulkTagsToAdd, bulkTagsToRemove);
                    loadDevotees();
                    setShowBulkTagModal(false);
                    setSelectMode(false);
                    setSelectedIds(new Set());
                    setBulkTagsToAdd([]);
                    setBulkTagsToRemove([]);
                  } catch (e) {
                    alert('Error updating tags: ' + e.message);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary-hover shadow-sm disabled:opacity-50">
                {saving ? 'Updating...' : 'Update Tags'}
              </button>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace(
  "{/* Add Devotee Modal */}",
  bulkModalUI + "\n      {/* Add Devotee Modal */}"
);

fs.writeFileSync('src/pages/DevoteesPage.jsx', content, 'utf8');
console.log('devotees patched for bulk tags');
