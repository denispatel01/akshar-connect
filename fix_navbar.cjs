const fs = require('fs');
let content = fs.readFileSync('src/components/Navbar.jsx', 'utf8');
content = content.replace(
  "{ id: 'followups', label: 'Calls', icon: PhoneCall },",
  "{ id: 'followups', label: 'Calls', icon: PhoneCall },\n          { id: 'reports', label: 'Reports', icon: FileSpreadsheet },"
);
fs.writeFileSync('src/components/Navbar.jsx', content, 'utf8');
console.log('navbar fixed');
