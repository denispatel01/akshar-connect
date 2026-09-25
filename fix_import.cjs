const fs = require('fs');
let c = fs.readFileSync('src/pages/BulkTagPage.jsx', 'utf8');
c = c.replace('import { TAG_KEYS, hasAnyTag }', 'import { _TAG_KEYS as TAG_KEYS, hasAnyTag }');
fs.writeFileSync('src/pages/BulkTagPage.jsx', c, 'utf8');
console.log('Fixed import');
