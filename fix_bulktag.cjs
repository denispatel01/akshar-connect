const fs = require('fs');
let content = fs.readFileSync('src/pages/BulkTagPage.jsx', 'utf8');
content = content.replace(/\\`/g, '`');
content = content.replace(/\\\$/g, '$');
fs.writeFileSync('src/pages/BulkTagPage.jsx', content, 'utf8');
console.log('Fixed escape chars');
