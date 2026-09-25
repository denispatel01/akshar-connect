const fs = require('fs');
let code = fs.readFileSync('src/services/dataService.js', 'utf8');

const oldBulk = `  async bulkUpdateTagsAndSync(ids, tagsToAdd, tagsToRemove, updatedBy) {
    if (!ids || ids.length === 0) return;
    const devoteesToUpdate = this.devotees.filter(d => ids.includes(d.id));
    for (const d of devoteesToUpdate) {
      const currentTags = d.tags || [];
      const newTags = currentTags.filter(t => !tagsToRemove.includes(t));
      tagsToAdd.forEach(t => { if (!newTags.includes(t)) newTags.push(t); });
      await this.updateDevoteeAndSync(d.id, { tags: newTags }, updatedBy);
    }
  },`;

const newBulk = `  async bulkUpdateTagsAndSync(ids, tagsToAdd, tagsToRemove, updatedBy) {
    if (!ids || ids.length === 0) return;
    
    // Optimistic UI update
    const devoteesToUpdate = this.devotees.filter(d => ids.includes(d.id));
    for (const d of devoteesToUpdate) {
      let currentTags = [...(d.tags || [])];
      currentTags = currentTags.filter(t => !tagsToRemove.includes(t));
      tagsToAdd.forEach(t => { if (!currentTags.includes(t)) currentTags.push(t); });
      d.tags = currentTags;
      if (updatedBy) d.updatedBy = updatedBy;
    }
    this.saveLocal('devotees', this.devotees);
    this.notify();

    // Call single backend API endpoint
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'bulkUpdateTags',
          payload: { ids, tagsToAdd, tagsToRemove, updatedBy }
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Bulk update failed');
      await this.syncDown();
    } catch (e) {
      console.error('Bulk update error:', e);
      await this.syncDown();
      throw e;
    }
  },`;

code = code.replace(oldBulk, newBulk);
fs.writeFileSync('src/services/dataService.js', code, 'utf8');
console.log('dataService patched');
