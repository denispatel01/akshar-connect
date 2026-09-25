const fs = require('fs');

// --- APP.JSX ---
let appContent = fs.readFileSync('src/App.jsx', 'utf8');

if (!appContent.includes('filterPreset')) {
  appContent = appContent.replace(
    "const [devoteesPreset, setDevoteesPreset] = useState(null);",
    "const [devoteesPreset, setDevoteesPreset] = useState(null);\n  const [filterPreset, setFilterPreset] = useState(null);"
  );

  appContent = appContent.replace(
    "if (page === activePage && !options?.devoteesPreset && !options?.openDevoteeId) return;",
    "if (page === activePage && !options?.devoteesPreset && !options?.openDevoteeId && !options?.filterPreset) return;"
  );

  appContent = appContent.replace(
    "else if (!options?.keepDevoteesPreset) setDevoteesPreset(null);",
    "else if (!options?.keepDevoteesPreset) setDevoteesPreset(null);\n\n      if (options?.filterPreset) setFilterPreset(options.filterPreset);\n      else if (!options?.keepFilterPreset) setFilterPreset(null);"
  );

  appContent = appContent.replace(
    "<DevoteesPage\n            user={user}\n            devoteesPreset={devoteesPreset}",
    "<DevoteesPage\n            user={user}\n            devoteesPreset={devoteesPreset}\n            filterPreset={filterPreset}"
  );

  appContent = appContent.replace(
    "{activePage === 'reports' && <ReportsPage />}",
    "{activePage === 'reports' && <ReportsPage setActivePage={navigate} />}"
  );

  fs.writeFileSync('src/App.jsx', appContent, 'utf8');
}

// --- REPORTSPAGE.JSX ---
let reportsContent = fs.readFileSync('src/pages/ReportsPage.jsx', 'utf8');

reportsContent = reportsContent.replace(
  "export default function ReportsPage() {",
  "export default function ReportsPage({ setActivePage }) {"
);

const oldStatList = `  const StatList = ({ title, data, icon: Icon, isComplex }) => {
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
                <li key={key} className="flex justify-between items-center px-3 py-2 hover:bg-bg-base rounded-xl transition-colors">`;

const newStatList = `  const StatList = ({ title, data, icon: Icon, isComplex, onRowClick }) => {
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
                <li key={key} onClick={() => onRowClick && onRowClick(key)} className={\`flex justify-between items-center px-3 py-2 hover:bg-bg-base rounded-xl transition-colors \${onRowClick ? 'cursor-pointer hover:border-primary/30 border border-transparent' : ''}\`}>`;

reportsContent = reportsContent.replace(oldStatList, newStatList);

reportsContent = reportsContent.replace(
  '<StatList title="By Karyakarta" data={stats.karyakartaStats} icon={ShieldCheck} isComplex={true} />',
  '<StatList title="By Karyakarta" data={stats.karyakartaStats} icon={ShieldCheck} isComplex={true} onRowClick={(k) => setActivePage?.("devotees", { filterPreset: { karyakarta: k } })} />'
);
reportsContent = reportsContent.replace(
  '<StatList title="By Area" data={stats.areaStats} icon={MapPin} />',
  '<StatList title="By Area" data={stats.areaStats} icon={MapPin} onRowClick={(k) => setActivePage?.("devotees", { filterPreset: { area: k } })} />'
);
reportsContent = reportsContent.replace(
  '<StatList title="By Wing" data={stats.wingStats} icon={Users} />',
  '<StatList title="By Wing" data={stats.wingStats} icon={Users} onRowClick={(k) => setActivePage?.("devotees", { filterPreset: { wing: k } })} />'
);

fs.writeFileSync('src/pages/ReportsPage.jsx', reportsContent, 'utf8');

// --- DEVOTEESPAGE.JSX ---
let devsContent = fs.readFileSync('src/pages/DevoteesPage.jsx', 'utf8');

devsContent = devsContent.replace(
  "export default function DevoteesPage({ user, devoteesPreset, onClearDevoteesPreset, openDevoteeId, onClearOpenDevotee, refreshing }) {",
  "export default function DevoteesPage({ user, devoteesPreset, filterPreset, onClearDevoteesPreset, openDevoteeId, onClearOpenDevotee, refreshing }) {"
);

const oldUseEffectPreset = `  useEffect(() => {
    if (!devoteesPreset || !PRESET_META[devoteesPreset]) return;
    const { tags } = PRESET_META[devoteesPreset];
    setSelectedTags(tags || []);
    setFilterKaryakarta('');
    setFilterArea('');
    setFilterWing('');
    setFilterBlood('');
    setFilterGender('');
    setSearchQuery('');
    setShowTagFilter(devoteesPreset === 'ambrish');
  }, [devoteesPreset]);`;

const newUseEffectPreset = `  useEffect(() => {
    if (devoteesPreset && PRESET_META[devoteesPreset]) {
      const { tags } = PRESET_META[devoteesPreset];
      setSelectedTags(tags || []);
      setFilterKaryakarta('');
      setFilterArea('');
      setFilterWing('');
      setFilterBlood('');
      setFilterGender('');
      setSearchQuery('');
      setShowTagFilter(devoteesPreset === 'ambrish');
    }
  }, [devoteesPreset]);

  useEffect(() => {
    if (filterPreset) {
      if (filterPreset.karyakarta) setFilterKaryakarta(filterPreset.karyakarta);
      if (filterPreset.area) setFilterArea(filterPreset.area);
      if (filterPreset.wing) setFilterWing(filterPreset.wing);
      setShowTagFilter(true);
    }
  }, [filterPreset]);`;

devsContent = devsContent.replace(oldUseEffectPreset, newUseEffectPreset);

fs.writeFileSync('src/pages/DevoteesPage.jsx', devsContent, 'utf8');
console.log('Navigation patched');
