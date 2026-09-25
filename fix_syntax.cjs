const fs = require('fs');
let lines = fs.readFileSync('src/pages/DevoteesPage.jsx', 'utf8').split('\n');
if (lines[480].trim() === ')}' && lines[481].trim() === ')}') {
  lines.splice(481, 1);
}
fs.writeFileSync('src/pages/DevoteesPage.jsx', lines.join('\n'), 'utf8');
console.log('fixed syntax');
