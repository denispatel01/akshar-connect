const fs = require('fs');
let appContent = fs.readFileSync('src/App.jsx', 'utf8');

if (!appContent.includes('BulkTagPage')) {
  appContent = appContent.replace(
    "import ReportsPage from './pages/ReportsPage';",
    "import ReportsPage from './pages/ReportsPage';\nimport BulkTagPage from './pages/BulkTagPage';"
  );
  appContent = appContent.replace(
    "{activePage === 'reports' && <ReportsPage setActivePage={navigate} />}",
    "{activePage === 'reports' && <ReportsPage setActivePage={navigate} />}\n        {activePage === 'bulk-tags' && <BulkTagPage user={user} />}"
  );
  fs.writeFileSync('src/App.jsx', appContent, 'utf8');
}

let navContent = fs.readFileSync('src/components/Navbar.jsx', 'utf8');
if (!navContent.includes('bulk-tags')) {
  const newNavItem = `                <button
                  onClick={() => { setActivePage('bulk-tags'); setShowAdminMenu(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-text-main transition-colors hover:bg-bg-base"
                >
                  <Tag className="h-4 w-4 text-[#FF862A]" /> Bulk Tag Editor
                </button>`;
  
  navContent = navContent.replace(
    '<Settings className="h-4 w-4 text-purple-500" /> Admin Console\n                </button>',
    '<Settings className="h-4 w-4 text-purple-500" /> Admin Console\n                </button>\n' + newNavItem
  );
  
  if (!navContent.includes('import {')) {
     // fallback
  } else if (!navContent.includes('Tag,')) {
    navContent = navContent.replace('import {', 'import { Tag,');
  }
  
  fs.writeFileSync('src/components/Navbar.jsx', navContent, 'utf8');
}
console.log('Nav and App patched');
