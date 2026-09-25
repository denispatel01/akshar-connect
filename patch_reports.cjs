const fs = require('fs');
let content = fs.readFileSync('src/pages/ReportsPage.jsx', 'utf8');

content = content.replace(
  "s.karyakartaStats[d.followupKaryakarta] = (s.karyakartaStats[d.followupKaryakarta] || 0) + 1;",
  "if (!s.karyakartaStats[d.followupKaryakarta]) s.karyakartaStats[d.followupKaryakarta] = { devotees: 0, families: new Set() };\n        s.karyakartaStats[d.followupKaryakarta].devotees++;\n        if (d.familyId) s.karyakartaStats[d.followupKaryakarta].families.add(d.familyId);\n        else s.karyakartaStats[d.followupKaryakarta].families.add('ID_'+d.id);"
);

const newExportButtons = `
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-surface border border-border-light px-4 py-2 text-sm font-bold text-text-main shadow-sm hover:bg-bg-base transition-colors">
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
          <button onClick={handleExportCSV} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-hover transition-colors">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export Excel/CSV</span>
          </button>
        </div>
`;

content = content.replace(
  /<button onClick=\{handleExportCSV\}[\s\S]*?<\/button>/,
  newExportButtons
);

const oldStatList = `  const StatList = ({ title, data, icon: Icon }) => {
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
    return (
      <div className="bg-surface rounded-3xl border border-border-light shadow-sm overflow-hidden flex flex-col h-full animate-fade-in">
        <div className="px-5 py-4 border-b border-border-light flex items-center gap-2 bg-bg-base">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-text-main">{title}</h3>
        </div>
        <div className="p-2 flex-1 overflow-auto max-h-[300px]">
          {sorted.length > 0 ? (
            <ul className="space-y-1">
              {sorted.map(([key, val]) => (
                <li key={key} className="flex justify-between items-center px-3 py-2 hover:bg-bg-base rounded-xl transition-colors">
                  <span className="text-sm font-semibold text-text-main truncate pr-4">{key}</span>
                  <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">{val}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-muted p-4 text-center">No data available.</p>
          )}
        </div>
      </div>
    );
  };`;

const newStatList = `  const StatList = ({ title, data, icon: Icon, isComplex }) => {
    const sorted = Object.entries(data).sort((a, b) => {
      const aVal = isComplex ? a[1].devotees : a[1];
      const bVal = isComplex ? b[1].devotees : b[1];
      return bVal - aVal;
    });
    return (
      <div className="bg-surface rounded-3xl border border-border-light shadow-sm overflow-hidden flex flex-col h-full animate-fade-in">
        <div className="px-5 py-4 border-b border-border-light flex items-center gap-2 bg-bg-base">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-text-main">{title}</h3>
        </div>
        <div className="p-2 flex-1 overflow-auto max-h-[300px]">
          {sorted.length > 0 ? (
            <ul className="space-y-1">
              {sorted.map(([key, val]) => (
                <li key={key} className="flex justify-between items-center px-3 py-2 hover:bg-bg-base rounded-xl transition-colors">
                  <span className="text-sm font-semibold text-text-main truncate pr-4">{key}</span>
                  {isComplex ? (
                    <div className="flex gap-1">
                      <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-md" title="Devotees">{val.devotees} D</span>
                      <span className="text-[10px] font-bold bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-md" title="Families">{val.families.size} F</span>
                    </div>
                  ) : (
                    <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">{val}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-muted p-4 text-center">No data available.</p>
          )}
        </div>
      </div>
    );
  };`;

content = content.replace(oldStatList, newStatList);
content = content.replace(
  '<StatList title="By Karyakarta" data={stats.karyakartaStats} icon={ShieldCheck} />',
  '<StatList title="By Karyakarta" data={stats.karyakartaStats} icon={ShieldCheck} isComplex={true} />'
);

fs.writeFileSync('src/pages/ReportsPage.jsx', content, 'utf8');
console.log('Reports patched');
