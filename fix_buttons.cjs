const fs = require('fs');
let content = fs.readFileSync('src/pages/DevoteesPage.jsx', 'utf8');

const oldHeader = `      <div className="sticky top-[64px] z-30 bg-bg-base pt-2 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pt-0 border-b sm:border-0 border-border-light shadow-sm sm:shadow-none mb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-text-muted" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, mobile, address, area, DOB - any order"
              className="w-full rounded-2xl border border-border-light bg-surface pl-10 pr-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary dark:focus:border-primary-hover" />
          </div>
          <button onClick={() => setShowTagFilter((s) => !s)}
            className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold ' +
              ((selectedTags.length || filterKaryakarta || filterArea || filterWing || filterBlood || filterGender) ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-main hover:bg-bg-base')}>
            <Filter className="h-4 w-4" /> Filters{(selectedTags.length || filterKaryakarta || filterArea || filterWing || filterBlood || filterGender) ? ' (Active)' : ''}
          </button>
        </div>
      </div>`;

const newHeader = `      <div className="sticky top-[64px] z-30 bg-bg-base pt-2 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pt-0 border-b sm:border-0 border-border-light shadow-sm sm:shadow-none mb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-text-muted" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, mobile, address, area, DOB - any order"
              className="w-full rounded-2xl border border-border-light bg-surface pl-10 pr-4 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary dark:focus:border-primary-hover" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowTagFilter((s) => !s)}
              className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold ' +
                ((selectedTags.length || filterKaryakarta || filterArea || filterWing || filterBlood || filterGender) ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-main hover:bg-bg-base')}>
              <Filter className="h-4 w-4" /> Filters{(selectedTags.length || filterKaryakarta || filterArea || filterWing || filterBlood || filterGender) ? ' (Active)' : ''}
            </button>
            
            {canEdit && (
              <button onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
                className={\`flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold transition-colors \${selectMode ? 'border-primary bg-primary text-white' : 'border-border-light bg-surface text-text-main hover:bg-bg-base'}\`}>
                <CheckSquare className="h-4 w-4" /> {selectMode ? 'Cancel Select' : 'Bulk Select'}
              </button>
            )}

            <div className="flex gap-2">
               <button onClick={() => window.print()} title="Print / PDF" className="flex items-center justify-center p-2.5 rounded-2xl border border-border-light bg-surface text-text-main hover:bg-bg-base transition-colors">
                 <Printer className="h-4 w-4" />
               </button>
               <button onClick={() => {
                  const headers = ['ID', 'Name', 'Mobile', 'WhatsApp', 'Area', 'Karyakarta', 'Blood Group', 'Gender', 'Wing'];
                  const csvRows = [headers.join(',')];
                  filteredDevotees.forEach(d => {
                    const row = [d.id, d.name, d.mobile, d.whatsapp, d.area, d.followupKaryakarta, d.bloodGroup, d.gender, d.wing].map(v => \`"\${(v||'').replace(/"/g, '""')}"\`);
                    csvRows.push(row.join(','));
                  });
                  const blob = new Blob([csvRows.join('\\n')], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = \`Devotees_Export_\${new Date().toISOString().slice(0,10)}.csv\`;
                  a.click();
               }} title="Export CSV" className="flex items-center justify-center gap-2 rounded-2xl border border-border-light bg-surface px-4 py-2.5 text-sm font-bold text-text-main hover:bg-bg-base transition-colors">
                 <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
               </button>
            </div>
          </div>
        </div>
      </div>
      
      {selectMode && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 animate-slide-up">
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

content = content.replace(oldHeader, newHeader);
fs.writeFileSync('src/pages/DevoteesPage.jsx', content, 'utf8');
console.log('buttons fixed');
