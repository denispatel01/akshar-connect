const fs = require('fs');
let content = fs.readFileSync('src/pages/DevoteesPage.jsx', 'utf8');

if (!content.includes('Mail,')) {
  content = content.replace("import { Search,", "import { Search, Mail,");
}
if (!content.includes('MessageCircle,')) {
  content = content.replace("import { Search,", "import { Search, MessageCircle,");
}

const oldModalHeader = `              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-xl font-bold text-text-main truncate">{selectedDevotee.name}</h2>
                <p className="text-xs sm:text-sm text-slate-500">{val(selectedDevotee.mobile)}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">`;

const newModalHeader = `              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-xl font-bold text-text-main truncate pr-2">{selectedDevotee.name}</h2>
                
                <div className="flex items-center gap-2 mt-1 mb-2">
                  <span className="text-xs sm:text-sm font-semibold text-slate-600">{val(selectedDevotee.mobile)}</span>
                  
                  {selectedDevotee.mobile && (
                    <div className="flex items-center gap-1.5 ml-2">
                      <a href={\`tel:\${selectedDevotee.mobile}\`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" title="Call">
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                      <a href={\`https://wa.me/91\${selectedDevotee.whatsapp || selectedDevotee.mobile}\`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors" title="WhatsApp">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </a>
                      {selectedDevotee.email && (
                        <a href={\`mailto:\${selectedDevotee.email}\`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors" title="Email">
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">`;

content = content.replace(oldModalHeader, newModalHeader);

// We should also add "Print" to the list of devs? 
// The user asked for "export to excel/pdf options at everywhere".
// Let's add an export to DevoteesPage.jsx
const downloadImport = `import { Download, Printer } from 'lucide-react';\n`;
if (!content.includes('Download,')) {
    content = content.replace("import { Search,", "import { Search, Download, Printer,");
}

const oldSelectModeButton = `              <CheckSquare className="h-4 w-4" /> {selectMode ? 'Cancel Select' : 'Select'}
            </button>
          )}
        </div>
      </div>`;

const newSelectModeButton = `              <CheckSquare className="h-4 w-4" /> {selectMode ? 'Cancel Select' : 'Select'}
            </button>
          )}
          
          {/* Export/Print Button Group */}
          <div className="flex gap-2">
             <button onClick={() => window.print()} title="Print / PDF" className="flex items-center justify-center p-2.5 rounded-2xl border border-border-light bg-surface text-text-main hover:bg-bg-base transition-colors">
               <Printer className="h-4 w-4" />
             </button>
             <button onClick={() => {
                const headers = ['ID', 'Name', 'Mobile', 'WhatsApp', 'Area', 'Karyakarta', 'Blood Group', 'Gender', 'Wing'];
                const csvRows = [headers.join(',')];
                filteredDevotees.forEach(d => {
                  const row = [d.id, d.name, d.mobile, d.whatsapp, d.area, d.followupKaryakarta, d.bloodGroup, d.gender, d.wing].map(v => \`"\${v || ''}"\`);
                  csvRows.push(row.join(','));
                });
                const blob = new Blob([csvRows.join('\\n')], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`Devotees_Export_\${new Date().toISOString().slice(0,10)}.csv\`;
                a.click();
             }} title="Export CSV" className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-hover transition-colors">
               <Download className="h-4 w-4" /> Export
             </button>
          </div>
        </div>
      </div>`;

content = content.replace(oldSelectModeButton, newSelectModeButton);

fs.writeFileSync('src/pages/DevoteesPage.jsx', content, 'utf8');
console.log('modal patched');
