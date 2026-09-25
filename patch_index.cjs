const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Remove the svg favicon
content = content.replace('<link rel="icon" type="image/svg+xml" href="favicon.svg" />\n', '');
// Ensure png favicon is the primary
if (!content.includes('<link rel="icon" href="icons/favicon-32.png" />')) {
    content = content.replace(
      '<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png" />',
      '<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png" />\n    <link rel="icon" href="icons/favicon-32.png" />'
    );
}

fs.writeFileSync('index.html', content, 'utf8');
console.log('index.html patched');
