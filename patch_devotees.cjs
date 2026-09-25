const fs = require('fs');
let content = fs.readFileSync('src/pages/DevoteesPage.jsx', 'utf8');

// Add states
content = content.replace(
  "const [showTagFilter, setShowTagFilter] = useState(false);",
  "const [showTagFilter, setShowTagFilter] = useState(false);\n  const [filterKaryakarta, setFilterKaryakarta] = useState('');\n  const [filterArea, setFilterArea] = useState('');\n  const [filterWing, setFilterWing] = useState('');\n  const [filterBlood, setFilterBlood] = useState('');\n  const [filterGender, setFilterGender] = useState('');"
);

// Add unique lists for dropdowns
content = content.replace(
  "  const blankForm = {",
  "  const uniqueKaryakartas = useMemo(() => [...new Set(devotees.map(d => d.followupKaryakarta).filter(Boolean))].sort(), [devotees]);\n  const uniqueAreas = useMemo(() => [...new Set(devotees.map(d => d.area).filter(Boolean))].sort(), [devotees]);\n\n  const blankForm = {"
);

// Add clear all filters logic
content = content.replace(
  "onClearDevoteesPreset(); setSelectedTags([]); setShowTagFilter(false);",
  "onClearDevoteesPreset(); setSelectedTags([]); setFilterKaryakarta(''); setFilterArea(''); setFilterWing(''); setFilterBlood(''); setFilterGender(''); setShowTagFilter(false);"
);

// Add filtering logic in useMemo
content = content.replace(
  "return hasAnyTag(d, selectedTags) && presetMatch(d);",
  "if (filterKaryakarta && d.followupKaryakarta !== filterKaryakarta) return false;\n      if (filterArea && d.area !== filterArea) return false;\n      if (filterWing && d.wing !== filterWing) return false;\n      if (filterBlood && d.bloodGroup !== filterBlood) return false;\n      if (filterGender && d.gender !== filterGender) return false;\n      return hasAnyTag(d, selectedTags) && presetMatch(d);"
);
// Dependencies of useMemo
content = content.replace(
  "}, [devotees, query, selectedTags, familyFilter, devoteesPreset, isPlainBrowse]);",
  "}, [devotees, query, selectedTags, filterKaryakarta, filterArea, filterWing, filterBlood, filterGender, familyFilter, devoteesPreset, isPlainBrowse]);"
);

// Update filter button text
content = content.replace(
  "Filter by tag{selectedTags.length ? ` (${selectedTags.length})` : ''}",
  "Filters{(selectedTags.length || filterKaryakarta || filterArea || filterWing || filterBlood || filterGender) ? ' (Active)' : ''}"
);

// Add WINGS to import if needed
if (!content.includes(" WINGS,")) {
  content = content.replace(" BLOOD_GROUPS,", " BLOOD_GROUPS, WINGS,");
}

// Add the FilterPanel UI
const filterUI = `
      {showTagFilter && (
        <div className="mb-4 rounded-2xl border border-border-light bg-surface p-4 shadow-sm animate-slide-up">
          <div className="flex items-center justify-between mb-3 border-b border-border-light pb-2">
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /> Advanced Filters</h3>
            <button onClick={() => { setSelectedTags([]); setFilterKaryakarta(''); setFilterArea(''); setFilterWing(''); setFilterBlood(''); setFilterGender(''); }} className="text-xs font-bold text-red-500 hover:bg-red-50 px-2 py-1 rounded-md">Clear All</button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Follow-up Karyakarta</label>
              <select value={filterKaryakarta} onChange={(e) => setFilterKaryakarta(e.target.value)} className="w-full rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary">
                <option value="">All Karyakartas</option>
                {uniqueKaryakartas.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Area</label>
              <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} className="w-full rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary">
                <option value="">All Areas</option>
                {uniqueAreas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Wing</label>
              <select value={filterWing} onChange={(e) => setFilterWing(e.target.value)} className="w-full rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary">
                <option value="">All Wings</option>
                {WINGS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Blood Group</label>
              <select value={filterBlood} onChange={(e) => setFilterBlood(e.target.value)} className="w-full rounded-xl border border-border-light bg-bg-base px-3 py-2 text-xs font-semibold text-text-main outline-none focus:border-primary">
                <option value="">All Blood Groups</option>
                {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-border-light">
            <label className="block text-xs font-bold text-text-muted mb-2">Filter by Tags</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(tagsByCategory).map(([cat, tags]) => (
                <div key={cat} className="flex flex-wrap gap-1.5 items-center border-r border-border-light pr-3 mr-1">
                  {tags.map((t) => {
                    const sel = selectedTags.includes(t.key);
                    return (
                      <button key={t.key} onClick={() => toggleFilterTag(t.key)}
                        style={sel ? tagChipStyle(t.key) : {}}
                        className={\`rounded-full border px-2.5 py-1 text-[10.5px] font-bold transition-all \${sel ? 'border-transparent shadow-sm scale-105' : 'border-border-light bg-surface text-text-muted hover:bg-bg-base'}\`}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
`;

content = content.replace(
  /\{showTagFilter && \([\s\S]*?\)\}/,
  filterUI.trim()
);

fs.writeFileSync('src/pages/DevoteesPage.jsx', content, 'utf8');
console.log('patched devotees');
