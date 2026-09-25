const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

function replaceColorsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replacements mapping
  content = content.replace(/bg-white/g, 'bg-surface');
  content = content.replace(/text-\[\#003158\]/g, 'text-text-main');
  content = content.replace(/bg-\[\#003158\]/g, 'bg-primary');
  content = content.replace(/border-\[\#003158\]/g, 'border-primary');
  content = content.replace(/text-\[\#9BB5CB\]/g, 'text-text-muted');
  content = content.replace(/border-\[\#E4EBF3\]/g, 'border-border-light');
  content = content.replace(/border-\[\#E0EAF4\]/g, 'border-border-light');
  content = content.replace(/border-\[\#F0F4F8\]/g, 'border-border-light');
  content = content.replace(/bg-\[\#F0F4F8\]/g, 'bg-bg-base');
  
  fs.writeFileSync(filePath, content, 'utf8');
}

function walkDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    let fullPath = path.join(dir, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
      replaceColorsInFile(fullPath);
    }
  });
}

walkDir(directoryPath);
console.log('Colors refactored.');
