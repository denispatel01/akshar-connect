const fs = require('fs');
let content = fs.readFileSync('src/pages/DevoteesPage.jsx', 'utf8');

// 1. Add COMBO_FIELDS and manual override state
content = content.replace(
  "const DATALIST_FIELDS = new Set(['area']);",
  "const COMBO_FIELDS = new Set(['area', 'followupKaryakarta', 'reference']);"
);

content = content.replace(
  "const [addWhatsappSameAsMobile, setAddWhatsappSameAsMobile] = useState(false);",
  "const [addWhatsappSameAsMobile, setAddWhatsappSameAsMobile] = useState(false);\n  const [manualOverride, setManualOverride] = useState({});"
);

content = content.replace(
  "const uniqueAreas = useMemo(() => [...new Set(devotees.map(d => d.area).filter(Boolean))].sort(), [devotees]);",
  "const uniqueAreas = useMemo(() => [...new Set(devotees.map(d => d.area).filter(Boolean))].sort(), [devotees]);\n  const uniqueReferences = useMemo(() => [...new Set(devotees.map(d => d.reference).filter(Boolean))].sort(), [devotees]);"
);

// 2. Update renderEditField to handle COMBO_FIELDS
const oldDatalistLogic = `    // Datalist fields (dropdown + manual entry combo)
    if (DATALIST_FIELDS.has(f) && options) {
      const listId = \`dl-\${f}\`;
      return (
        <>
          <input list={listId} value={value} onChange={onChange} className={inputCls} />
          <datalist id={listId}>
            {options.map(o => <option key={o} value={o} />)}
          </datalist>
        </>
      );
    }`;

const newComboLogic = `    // Dropdown with manual entry fallback
    if (COMBO_FIELDS.has(f)) {
      const listOptions = f === 'followupKaryakarta' ? uniqueKaryakartas : f === 'reference' ? uniqueReferences : (FIELD_OPTIONS[f] || []);
      const isManual = manualOverride[f];
      return (
        <div>
          {isManual ? (
            <input value={value} onChange={onChange} className={inputCls} placeholder="Type manually..." />
          ) : (
            <select value={value} onChange={onChange} className={inputCls + ' bg-surface'}>
              <option value="">- Select -</option>
              {listOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5 mt-1.5 text-[10px] font-bold text-text-muted cursor-pointer hover:text-text-main">
            <input type="checkbox" checked={!!isManual} onChange={(e) => {
               setManualOverride({...manualOverride, [f]: e.target.checked});
               if (!e.target.checked && value && !listOptions.includes(value)) {
                 setData({ ...data, [f]: '' });
               }
            }} className="rounded focus:ring-primary" />
            If not listed then tick here
          </label>
        </div>
      );
    }`;

content = content.replace(oldDatalistLogic, newComboLogic);

// 3. Update the Add Devotee Form to include these fields
const oldAddArea = `                <input list="dl-add-area" value={formData.area} onChange={(e)=>setFormData({...formData,area:e.target.value})} className={inputCls + ' text-xs p-2.5'} />
                  <datalist id="dl-add-area">{AREAS.map(o=><option key={o} value={o} />)}</datalist></div>`;

const newAddFields = `                {manualOverride['add_area'] ? (
                    <input value={formData.area || ''} onChange={(e)=>setFormData({...formData,area:e.target.value})} className={inputCls + ' text-xs p-2.5'} />
                  ) : (
                    <select value={formData.area || ''} onChange={(e)=>setFormData({...formData,area:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-surface'}>
                      <option value="">- Select -</option>{AREAS.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                  <label className="flex items-center gap-1 mt-1 text-[10px] font-bold text-text-muted cursor-pointer"><input type="checkbox" checked={!!manualOverride['add_area']} onChange={(e) => setManualOverride({...manualOverride, add_area: e.target.checked})} className="rounded"/> If not listed then tick here</label>
                </div>
                
                <div><label className="block text-xs font-bold text-text-main mb-1">Follow-up Karkayakarta</label>
                  {manualOverride['add_karyakarta'] ? (
                    <input value={formData.followupKaryakarta || ''} onChange={(e)=>setFormData({...formData,followupKaryakarta:e.target.value})} className={inputCls + ' text-xs p-2.5'} />
                  ) : (
                    <select value={formData.followupKaryakarta || ''} onChange={(e)=>setFormData({...formData,followupKaryakarta:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-surface'}>
                      <option value="">- Select -</option>{uniqueKaryakartas.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                  <label className="flex items-center gap-1 mt-1 text-[10px] font-bold text-text-muted cursor-pointer"><input type="checkbox" checked={!!manualOverride['add_karyakarta']} onChange={(e) => setManualOverride({...manualOverride, add_karyakarta: e.target.checked})} className="rounded"/> If not listed then tick here</label>
                </div>
                
                <div><label className="block text-xs font-bold text-text-main mb-1">Reference</label>
                  {manualOverride['add_ref'] ? (
                    <input value={formData.reference || ''} onChange={(e)=>setFormData({...formData,reference:e.target.value})} className={inputCls + ' text-xs p-2.5'} />
                  ) : (
                    <select value={formData.reference || ''} onChange={(e)=>setFormData({...formData,reference:e.target.value})} className={inputCls + ' text-xs p-2.5 bg-surface'}>
                      <option value="">- Select -</option>{uniqueReferences.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                  <label className="flex items-center gap-1 mt-1 text-[10px] font-bold text-text-muted cursor-pointer"><input type="checkbox" checked={!!manualOverride['add_ref']} onChange={(e) => setManualOverride({...manualOverride, add_ref: e.target.checked})} className="rounded"/> If not listed then tick here</label>
                </div>`;

content = content.replace(oldAddArea, newAddFields);

// 4. Update the Karyakarta filter banner (Task 2)
// Insert right after `{showTagFilter && (...)}` block ends, and before `{familyFilter && (...)}`
const filterBannerLogic = `
      {filterKaryakarta && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-2.5 mb-2 animate-slide-up">
          <p className="text-sm font-bold text-text-main flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">Karyakarta: {filterKaryakarta}</span>
          </p>
          <div className="flex items-center gap-2 text-xs font-bold text-text-main shrink-0">
            <span className="bg-surface px-2 py-1 rounded-md border border-border-light shadow-sm">{filteredDevotees.length} Devotees</span>
            <span className="bg-surface px-2 py-1 rounded-md border border-border-light shadow-sm">{new Set(filteredDevotees.map(d => d.familyId || d.id)).size} Families</span>
            <button onClick={() => setFilterKaryakarta('')} className="text-red-500 hover:bg-red-50 px-2 py-1 rounded-md ml-1 transition-colors">Clear</button>
          </div>
        </div>
      )}
`;

content = content.replace(
  "{familyFilter && (",
  filterBannerLogic + "\n      {familyFilter && ("
);

// Make sure ShieldCheck is imported
if (!content.includes("ShieldCheck")) {
  content = content.replace("Search, Plus, Filter", "Search, Plus, Filter, ShieldCheck");
}

fs.writeFileSync('src/pages/DevoteesPage.jsx', content, 'utf8');
console.log('karyakarta and reference form patched');
