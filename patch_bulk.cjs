const fs = require('fs');
let content = fs.readFileSync('src/services/dataService.js', 'utf8');

const bulkLogic = `  bulkUpdateTagsAndSync: async (ids, tagsToAdd, tagsToRemove) => {
    const now = new Date().toISOString();
    const user = JSON.parse(localStorage.getItem('ac-session') || '{}')?.name || 'System';
    const toSync = [];
    ids.forEach(id => {
      const idx = DB.devotees.findIndex(d => d.id === id);
      if (idx !== -1) {
        let tags = DB.devotees[idx].tags || [];
        tags = [...new Set([...tags, ...tagsToAdd])];
        tags = tags.filter(t => !tagsToRemove.includes(t));
        DB.devotees[idx] = normalizeDevotee({ ...DB.devotees[idx], tags, updatedOn: now, updatedBy: user });
        toSync.push(DB.devotees[idx]);
      }
    });
    saveCache();
    if (hasBackend()) {
       for (const d of toSync) {
         await api('update', { collection: 'Devotees', keyField: 'id', key: d.id, row: toBackendRow(d) });
       }
    }
  },

  setDevoteeTag:`;

content = content.replace("  setDevoteeTag:", bulkLogic);
fs.writeFileSync('src/services/dataService.js', content, 'utf8');
console.log('bulk logic patched');
