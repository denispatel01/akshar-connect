const fs = require('fs');
let content = fs.readFileSync('src/pages/DevoteesPage.jsx', 'utf8');

const regex = /\/\/ Datalist fields \(dropdown \+ manual entry combo\)[\s\S]*?<\/datalist>[\s\S]*?<\/>[\s\S]*?\);[\s\S]*?\}/g;

const newLogic = `// Dropdown with manual entry fallback
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

content = content.replace(regex, newLogic);
fs.writeFileSync('src/pages/DevoteesPage.jsx', content, 'utf8');
console.log('Fixed renderEditField');
