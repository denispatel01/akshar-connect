const fs = require('fs');
let content = fs.readFileSync('src/services/dataService.js', 'utf8');

content = content.replace(
  "      createdOn: now, updatedOn: now,",
  "      createdOn: now, updatedOn: now, createdBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System', updatedBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System',"
);

content = content.replace(
  "      createdOn: now, updatedOn: now,",
  "      createdOn: now, updatedOn: now, createdBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System', updatedBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System',"
); 

content = content.replace(
  "updatedOn: new Date().toISOString()",
  "updatedOn: new Date().toISOString(), updatedBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System'"
);

content = content.replace(
  "updatedOn: new Date().toISOString()",
  "updatedOn: new Date().toISOString(), updatedBy: JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System'"
); 

fs.writeFileSync('src/services/dataService.js', content, 'utf8');
console.log('patched');
