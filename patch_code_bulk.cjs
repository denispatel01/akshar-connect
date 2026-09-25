const fs = require('fs');
let code = fs.readFileSync('google-apps-script/Code.gs', 'utf8');

const bulkUpdateFn = `
function doBulkUpdateTags_(p) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = tab_('Devotees');
    var H = HEADERS.Devotees;
    var last = sh.getLastRow();
    if (last < 2) return json_({ok: true, count: 0});
    var data = sh.getRange(2, 1, last-1, H.length).getValues();
    var idIndex = H.indexOf('id');
    var tagsIndex = H.indexOf('tags');
    var updatedByIndex = H.indexOf('updatedBy');
    
    var idsToUpdate = p.ids || [];
    var tagsToAdd = p.tagsToAdd || [];
    var tagsToRemove = p.tagsToRemove || [];
    
    var updatedCount = 0;
    for (var i = 0; i < data.length; i++) {
      var rowId = String(data[i][idIndex]);
      if (idsToUpdate.indexOf(rowId) >= 0) {
        var currentTags = data[i][tagsIndex] ? String(data[i][tagsIndex]).split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
        
        for(var j=0; j<tagsToRemove.length; j++) {
          var idx = currentTags.indexOf(tagsToRemove[j]);
          if (idx >= 0) currentTags.splice(idx, 1);
        }
        
        for(var j=0; j<tagsToAdd.length; j++) {
          if (currentTags.indexOf(tagsToAdd[j]) < 0) currentTags.push(tagsToAdd[j]);
        }
        
        data[i][tagsIndex] = currentTags.join(',');
        if (updatedByIndex >= 0 && p.updatedBy) data[i][updatedByIndex] = p.updatedBy;
        updatedCount++;
      }
    }
    if (updatedCount > 0) {
       sh.getRange(2, 1, last-1, H.length).setValues(data);
    }
    return json_({ok: true, count: updatedCount});
  } finally {
    lock.releaseLock();
  }
}
`;

if (!code.includes('doBulkUpdateTags_')) {
  code += bulkUpdateFn;
  code = code.replace(
    "if(action==='update'){",
    "if(action==='bulkUpdateTags') return doBulkUpdateTags_(p);\n    if(action==='update'){"
  );
  fs.writeFileSync('google-apps-script/Code.gs', code, 'utf8');
  console.log('Backend patched for bulk update.');
} else {
  console.log('Backend already patched.');
}
