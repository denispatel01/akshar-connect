const fs = require('fs');
let content = fs.readFileSync('src/components/DarshanSlider.jsx', 'utf8');
content = content.replace("'15.webp', ", "");
content = content.replace("'11.webp', ", ""); // Just in case
fs.writeFileSync('src/components/DarshanSlider.jsx', content, 'utf8');
console.log('Slider patched');
