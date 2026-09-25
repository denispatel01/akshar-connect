const fs = require('fs');
let content = fs.readFileSync('public/sw.js', 'utf8');
content = content.replace("const CACHE_NAME = 'akshar-connect-v1';", "const CACHE_NAME = 'akshar-connect-v2';");
fs.writeFileSync('public/sw.js', content, 'utf8');
console.log('sw updated');
