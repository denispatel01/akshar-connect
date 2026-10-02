/**
 * Akshar Connect - Live Backend (Google Apps Script)
 * Create a NEW blank Google Sheet, then Extensions > Apps Script, paste this,
 * Save, then Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 * Copy the /exec URL and give it to the app (API_URL in dataService.js).
 *
 * Tabs are auto-created and seeded on first call:
 *   Users | Devotees | Sabhas | Attendance | Thoughts
 */

var HEADERS = {
  Users:      ['mobile','pin','password','role','name'],
  Devotees:   ['id','name','firstName','middleName','lastName','gender','dob','bloodGroup','maritalStatus','anniversary','mobile','secondaryMobile','whatsapp','email','mandal','wing','area','city','address','education','occupation','ambrish','gharNo','familyId','relation','type','dateOfJoining','createdBy','attendanceRate','status','tags','qualification','educationStatus','school','profession','professionField','companyName','areaRoute','reference','followupKaryakarta','followupKaryakartaMobile','yuvakType','photo','notes','createdOn','updatedOn','updatedBy','oldNew'],
  Sabhas:     ['id','title','date','time','venue','presentCount','totalCount','status','type'],
  Attendance: ['id','sabhaId','devoteeId','present','timestamp','markedBy'],
  Followups:  ['id','eventId','devoteeId','assignedTo','call','inPerson','message','outcome','remark','contactedOn','contactedBy'],
  Thoughts:   ['id','author','thought','date']
};

// Columns stored/returned as booleans (coerced on read).
var BOOL_COLS = { present:true, call:true, inPerson:true, message:true };

var SEED_USERS = [
  { mobile:'9924598434', pin:'170853', password:'', role:'Admin', name:'Denis Patel' }
];
var SEED_SABHAS = [
  { id:'SAB-2026-01', title:'Weekly Yuva Sabha - Samskara & Seva', date:'2026-09-20', time:'06:00 PM', venue:'Akshar Hall, Ahmedabad', presentCount:0, totalCount:0, status:'Scheduled' }
];
var SEED_THOUGHTS = [
  { id:'TH-1', author:'Mahant Swami Maharaj', thought:'Ekta, Samp, and Suhradbhav are the true ornaments of a Satsangi.', date:'2026-09-19' },
  { id:'TH-2', author:'Pramukh Swami Maharaj', thought:'In the joy of others lies our own. In the progress of others lies our own.', date:'2026-09-18' }
];

function ss_(){ return SpreadsheetApp.getActive(); }
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function tab_(name){
  var ss = ss_(); var sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    sh.getRange(1,1,sh.getMaxRows(),HEADERS[name].length).setNumberFormat('@'); // force ALL as text
    sh.appendRow(HEADERS[name]);
  } else if(sh.getLastRow() === 0){
    sh.getRange(1,1,sh.getMaxRows(),HEADERS[name].length).setNumberFormat('@');
    sh.appendRow(HEADERS[name]);
  }
  return sh;
}

/** Wipe our tabs, force text format, reseed defaults. Fixes any auto-parsed values. */
function resetAll_(){
  ['Users','Devotees','Sabhas','Attendance','Followups','Thoughts'].forEach(function(n){
    var sh = ss_().getSheetByName(n);
    if(sh){
      sh.clear();
      sh.getRange(1,1,sh.getMaxRows(),HEADERS[n].length).setNumberFormat('@');
      sh.appendRow(HEADERS[n]);
    } else { tab_(n); }
  });
  appendRows_('Users', SEED_USERS);
  appendRows_('Sabhas', SEED_SABHAS);
  appendRows_('Thoughts', SEED_THOUGHTS);
}

/**
 * Non-destructive schema migration: widen an existing tab so it has every
 * column in HEADERS[name], and refresh the header row. New columns are simply
 * appended (blank for existing rows); column 1..N positions are unchanged, so
 * no data is lost. Safe to run on every request.
 */
function migrateHeaders_(name){
  var sh = ss_().getSheetByName(name); if(!sh) return;
  var target = HEADERS[name];
  var need = target.length;
  var maxCols = sh.getMaxColumns();
  if(maxCols < need) sh.insertColumnsAfter(maxCols, need - maxCols);
  var lastCol = sh.getLastColumn();
  var cur = (lastCol > 0 ? sh.getRange(1,1,1,lastCol).getValues()[0] : []).map(function(x){ return String(x==null?'':x); });
  while(cur.length && cur[cur.length-1] === '') cur.pop(); // drop trailing blanks

  // Already exactly right? Nothing to do.
  var exact = cur.length === need;
  for(var i=0;i<need && exact;i++){ if(cur[i] !== target[i]) exact = false; }
  if(exact) return;

  // Any structural change (reorder, added or removed columns): rebuild the whole
  // tab in the target column order, matching each column by its header NAME. Because
  // every value is moved by name — never by position — data can never be scrambled.
  // New columns arrive blank; a timestamped backup tab is saved first so the change
  // is fully reversible. A LockService guard prevents a concurrent request from
  // reading a half-rewritten sheet.
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch(e) {}
  try {
    // Re-check under the lock in case another request already migrated.
    var lastCol2 = sh.getLastColumn();
    var cur2 = (lastCol2 > 0 ? sh.getRange(1,1,1,lastCol2).getValues()[0] : []).map(function(x){ return String(x==null?'':x); });
    while(cur2.length && cur2[cur2.length-1] === '') cur2.pop();
    var ok = cur2.length === need;
    for(var k=0;k<need && ok;k++){ if(cur2[k] !== target[k]) ok = false; }
    if(ok) return;

    var last = sh.getLastRow();
    var width = Math.max(cur2.length, 1);
    try {
      sh.copyTo(ss_()).setName(name + '_bak_' + Utilities.formatDate(new Date(), 'GMT', 'yyyyMMdd_HHmmss'));
    } catch(e) {}
    var block = last >= 1 ? sh.getRange(1,1,last,width).getValues() : [[]];
    var pos = {}; cur2.forEach(function(h,idx){ pos[h] = idx; });
    var out = block.map(function(row, r){
      return target.map(function(h){
        if(r === 0) return h;                 // header row -> target names
        var idx = pos[h]; return idx === undefined ? '' : row[idx];
      });
    });
    sh.getRange(1,1,sh.getMaxRows(),need).setNumberFormat('@'); // keep all-text
    sh.getRange(1,1,out.length,need).setValues(out);
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function ensureSheets_(){
  var first = ss_().getSheets()[0];
  ['Users','Devotees','Sabhas','Attendance','Followups','Thoughts'].forEach(function(n){ tab_(n); migrateHeaders_(n); });
  // remove default empty "Sheet1" if it isn't one of ours
  if(first && ['Sheet1','Sheet 1'].indexOf(first.getName())>=0 && HEADERS[first.getName()]===undefined){
    try{ ss_().deleteSheet(first); }catch(e){}
  }
  if(readAll_('Users').length===0)    appendRows_('Users', SEED_USERS);
  if(readAll_('Sabhas').length===0)   appendRows_('Sabhas', SEED_SABHAS);
  if(readAll_('Thoughts').length===0) appendRows_('Thoughts', SEED_THOUGHTS);
}

function readAll_(name){
  var sh = tab_(name); var last = sh.getLastRow(); if(last<2) return [];
  var head = HEADERS[name]; var v = sh.getRange(2,1,last-1,head.length).getValues();
  var out=[];
  for(var i=0;i<v.length;i++){
    var o={}; var blank=true;
    for(var c=0;c<head.length;c++){ var val=v[i][c]; if(val!=='' && val!==null) blank=false; o[head[c]]= (val===null?'':val); }
    if(!blank){
      for(var bc in BOOL_COLS){ if(head.indexOf(bc)>=0){ var bv=o[bc]; o[bc]=(bv===true||bv==='true'||bv==='TRUE'||bv==='1'); } }
      out.push(o);
    }
  }
  return out;
}

function rowFromObj_(name, obj){ return HEADERS[name].map(function(h){ var x=obj[h]; return (x===undefined||x===null)?'':x; }); }
function appendRows_(name, arr){
  if(!arr || !arr.length) return;
  var sh = tab_(name); var rows = arr.map(function(o){ return rowFromObj_(name,o); });
  sh.getRange(sh.getLastRow()+1,1,rows.length,HEADERS[name].length).setValues(rows);
}
function findRow_(name, keyField, keyVal){
  var sh = tab_(name); var last=sh.getLastRow(); if(last<2) return -1;
  var col = HEADERS[name].indexOf(keyField)+1; if(col<1) return -1;
  var v = sh.getRange(2,col,last-1,1).getValues();
  for(var i=0;i<v.length;i++){ if(String(v[i][0])===String(keyVal)) return i+2; }
  return -1;
}

function doGet(e){ return handle_(e && e.parameter ? e.parameter : {}); }
function doPost(e){
  var p={};
  if(e && e.postData && e.postData.contents){ try{ p=JSON.parse(e.postData.contents); }catch(err){} }
  if(e && e.parameter) for(var k in e.parameter) if(!(k in p)) p[k]=e.parameter[k];
  return handle_(p);
}

function handle_(p){
  var action = p.action || 'bootstrap';
  try{
    if(action==='ping') return json_({ ok:true, ts:Date.now() });
    ensureSheets_();
    if(action==='classifyOldNew') return json_({ ok:true, result: classifyOldNewNow() });
    if(action==='markReference') return json_({ ok:true, result: markReferenceNow() });
    if(action==='syncFamilyFields') return json_({ ok:true, result: syncFamilyFieldsNow() });
    if(action==='reset'){ resetAll_(); return json_({ ok:true, msg:'reset done' }); }
    if(action==='bootstrap') return json_({ ok:true,
      users:readAll_('Users'), devotees:readAll_('Devotees'),
      sabhas:readAll_('Sabhas'), thoughts:readAll_('Thoughts'), attendance:readAll_('Attendance'), followups:readAll_('Followups') });
    if(action==='seedDevotees'){
      if(readAll_('Devotees').length===0) appendRows_('Devotees', p.rows||[]);
      return json_({ ok:true, count:readAll_('Devotees').length });
    }
    if(action==='replaceDevotees'){
      var sh=tab_('Devotees'); sh.clear();
      sh.getRange(1,1,sh.getMaxRows(),HEADERS.Devotees.length).setNumberFormat('@');
      sh.appendRow(HEADERS.Devotees);
      appendRows_('Devotees', p.rows||[]);
      return json_({ ok:true, count:readAll_('Devotees').length });
    }
    if(action==='insert'){ appendRows_(p.collection, [p.row]); sendNotificationEmail_('INSERT', p.collection, p.row); return json_({ ok:true, row:p.row }); }
    if(action==='bulkUpdateTags') return doBulkUpdateTags_(p);
    if(action==='update'){
      var rn=findRow_(p.collection, p.keyField||'id', p.key);
      if(rn<0) return json_({ ok:false, error:'not found' });
      tab_(p.collection).getRange(rn,1,1,HEADERS[p.collection].length).setValues([rowFromObj_(p.collection,p.row)]);
      sendNotificationEmail_('UPDATE', p.collection, p.row);
      return json_({ ok:true });
    }
    if(action==='remove'){
      var r=findRow_(p.collection, p.keyField||'id', p.key);
      if(r>0) { tab_(p.collection).deleteRow(r); sendNotificationEmail_('DELETE', p.collection, { key: p.key }); }
      return json_({ ok:true });
    }
    if(action==='markAttendance') { var res = doMark_(p); sendNotificationEmail_('MARK_ATTENDANCE', 'Attendance', p); return res; }
    if(action==='saveFollowup') return doSaveFollowup_(p);
    if(action==='upsertUser') return doUpsertUser_(p);
    if(action==='deleteUser') return doDeleteUser_(p);
    if(action==='logError'){ sendErrorEmail_(p); return json_({ ok:true }); }
    return json_({ ok:false, error:'unknown action: '+action });
  }catch(err){ return json_({ ok:false, error:String(err) }); }
}

function doMark_(p){
  var lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    var sh=tab_('Attendance');
    // find existing by sabhaId+devoteeId
    var last=sh.getLastRow(); var found=-1;
    if(last>=2){ var v=sh.getRange(2,1,last-1,HEADERS.Attendance.length).getValues();
      for(var i=0;i<v.length;i++){ if(String(v[i][1])===String(p.sabhaId) && String(v[i][2])===String(p.devoteeId)){ found=i+2; break; } } }
    var now=new Date().toISOString();
    var row={ id:'ATT-'+Date.now(), sabhaId:p.sabhaId, devoteeId:p.devoteeId, present:(p.present!==false), timestamp:now, markedBy:p.markedBy||'' };
    if(found>0){ sh.getRange(found,1,1,HEADERS.Attendance.length).setValues([rowFromObj_('Attendance',row)]); }
    else appendRows_('Attendance',[row]);
    // recompute sabha presentCount
    var atts=readAll_('Attendance').filter(function(a){ return String(a.sabhaId)===String(p.sabhaId) && a.present; });
    var srn=findRow_('Sabhas','id',p.sabhaId);
    if(srn>0){ var pc=HEADERS.Sabhas.indexOf('presentCount')+1; tab_('Sabhas').getRange(srn,pc).setValue(atts.length); }
    return json_({ ok:true, presentCount:atts.length });
  } finally { lock.releaseLock(); }
}

function doSaveFollowup_(p){
  var lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    var sh=tab_('Followups');
    var H=HEADERS.Followups;
    var last=sh.getLastRow(); var found=-1;
    if(last>=2){ var v=sh.getRange(2,1,last-1,H.length).getValues();
      for(var i=0;i<v.length;i++){ if(String(v[i][1])===String(p.eventId) && String(v[i][2])===String(p.devoteeId)){ found=i+2; break; } } }
    var now=new Date().toISOString();
    var row={
      id: (found>0 ? (sh.getRange(found,1).getValue()||('FUP-'+Date.now())) : ('FUP-'+Date.now())),
      eventId:p.eventId, devoteeId:p.devoteeId,
      assignedTo:p.assignedTo||'',
      call:(p.call===true||p.call==='true'), inPerson:(p.inPerson===true||p.inPerson==='true'), message:(p.message===true||p.message==='true'),
      outcome:p.outcome||'', remark:p.remark||'',
      contactedOn:now, contactedBy:p.contactedBy||''
    };
    if(found>0){ sh.getRange(found,1,1,H.length).setValues([rowFromObj_('Followups',row)]); }
    else appendRows_('Followups',[row]);
    return json_({ ok:true, row:row });
  } finally { lock.releaseLock(); }
}

function doUpsertUser_(p){
  var sh=tab_('Users'), rn=findRow_('Users','mobile',p.mobile);
  // Merge with the existing row so a partial update (e.g. only password) does
  // not wipe the other fields.
  var cur={ mobile:p.mobile, pin:'', password:'', role:'Devotee', name:'Satsangi Devotee' };
  if(rn>0){ var v=sh.getRange(rn,1,1,HEADERS.Users.length).getValues()[0];
    HEADERS.Users.forEach(function(h,i){ cur[h]=v[i]; }); }
  var row={
    mobile:p.mobile,
    pin: (p.pin!==undefined && p.pin!=='') ? p.pin : cur.pin,
    password: (p.password!==undefined && p.password!=='') ? p.password : cur.password,
    role: p.role || cur.role || 'Devotee',
    name: p.name || cur.name || 'Satsangi Devotee'
  };
  if(rn>0) sh.getRange(rn,1,1,HEADERS.Users.length).setValues([rowFromObj_('Users',row)]);
  else appendRows_('Users',[row]);
  return json_({ ok:true, user:row });
}

function doDeleteUser_(p){
  var rn=findRow_('Users','mobile',p.mobile);
  if(rn>0) tab_('Users').deleteRow(rn);
  return json_({ ok:true });
}

function sendNotificationEmail_(action, collection, row) {
  try {
    var email = 'denispatel01@gmail.com';
    var subject = 'Akshar Connect: ' + action + ' on ' + collection;
    var body = 'An action (' + action + ') was performed on the ' + collection + ' collection.\n\n';
    
    if (row && typeof row === 'object') {
      body += 'Details:\n';
      for (var key in row) {
        if (row[key]) {
          body += key + ': ' + row[key] + '\n';
        }
      }
    } else {
      body += 'Row data: ' + JSON.stringify(row);
    }
    
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body
    });
  } catch(e) {
  }
}

// Mail shooter: email the admin when a user hits a runtime error in the app.
function sendErrorEmail_(p){
  try{
    var email='denispatel01@gmail.com';
    var who=(p && (p.user||p.mobile)) || 'unknown user';
    var subject='Akshar Connect ERROR — '+String(p && p.message || 'app error').slice(0,120);
    var body='A user hit an error in Akshar Connect.\n\n'
      +'User: '+who+'\n'
      +'When: '+(p && p.time || new Date().toISOString())+'\n'
      +'Page: '+(p && p.page || '')+'\n'
      +'Message: '+(p && p.message || '')+'\n\n'
      +'Stack:\n'+String(p && p.stack || '').slice(0,4000)+'\n\n'
      +'UserAgent: '+(p && p.ua || '');
    MailApp.sendEmail({ to: email, subject: subject, body: body });
  }catch(e){}
}

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

// Copy each family head's (Primary member's) address, follow-up karyakarta and
// karyakarta mobile down to every member of that family — a family shares one
// address and one karyakarta. Only non-empty head values overwrite; the head's
// own row is never changed. Saves a timestamped backup tab first.
function syncFamilyFieldsNow(){
  var name='Devotees', sh=tab_(name), H=HEADERS[name], last=sh.getLastRow();
  if(last<2) return 'no rows';
  try{ sh.copyTo(ss_()).setName(name+'_bak_'+Utilities.formatDate(new Date(),'GMT','yyyyMMdd_HHmmss')); }catch(e){}
  var famI=H.indexOf('familyId'), typeI=H.indexOf('type'),
      addrI=H.indexOf('address'), areaI=H.indexOf('area'),
      kkI=H.indexOf('followupKaryakarta'), kkmI=H.indexOf('followupKaryakartaMobile');
  var rng=sh.getRange(2,1,last-1,H.length), v=rng.getValues();
  var head={};
  for(var i=0;i<v.length;i++){
    var fid=v[i][famI]; if(!fid) continue;
    if(String(v[i][typeI])==='Primary'){
      head[fid]={ a:v[i][addrI], ar:v[i][areaI], k:v[i][kkI], m:v[i][kkmI] };
    }
  }
  var changed=0, families={};
  for(var i=0;i<v.length;i++){
    var fid=v[i][famI]; if(!fid) continue;
    if(String(v[i][typeI])==='Primary') continue;
    var h=head[fid]; if(!h) continue;
    var did=false;
    if(h.a!==''  && h.a!=null  && v[i][addrI]!==h.a){ v[i][addrI]=h.a; did=true; }
    if(h.ar!=='' && h.ar!=null && v[i][areaI]!==h.ar){ v[i][areaI]=h.ar; did=true; }
    if(h.k!==''  && h.k!=null  && v[i][kkI]!==h.k){ v[i][kkI]=h.k; did=true; }
    if(h.m!==''  && h.m!=null  && v[i][kkmI]!==h.m){ v[i][kkmI]=h.m; did=true; }
    if(did){ changed++; families[fid]=1; }
  }
  rng.setValues(v);
  return 'updated '+changed+' members across '+Object.keys(families).length+' families';
}

// ── One-time Old/New classification (run via clasp) ─────────────────────────
// Marks the listed people and their whole family as "Old", everyone else "New".
function classifyOldNewNow(){
  ensureSheets_();
  var name='Devotees', sh=tab_(name), head=HEADERS[name];
  var last=sh.getLastRow(); if(last<2) return 'no rows';
  var idI=head.indexOf('id'), nmI=head.indexOf('name'), fI=head.indexOf('firstName'),
      lI=head.indexOf('lastName'), famI=head.indexOf('familyId'), onI=head.indexOf('oldNew');
  var rng=sh.getRange(2,1,last-1,head.length), v=rng.getValues();
  var OLD=[['Hemant','Ahir'],['Hasmukh','Chandegara'],['Suketu','Thakor'],['Vrajesh','Panchal'],
    ['Pratik','Patel'],['Ashwin','Patel'],['Aman','Jadav'],['Prerak','Ariwala'],
    ['Nirdosh','Patel'],['Ashish','Makwana'],['Rigal','Patel'],['Girish','Bodiwala'],
    ['Jenish','Bodiwala'],['Nanu','Ahir'],['Bhadresh','Gandhi'],['Mehul','Gandhi'],
    ['Akshit','Panchal'],['Yogesh','Panchal'],['Yogesh','Bhagat'],['Kanti','Sakanwala'],
    ['Nilesh','Chapaneriya'],['Digesh','Patel'],['Priyank','Mistry'],['Milan','Bhatt'],
    ['Ravi','Papoliwala']];
  function nn(s){return String(s||'').toLowerCase().replace(/bhai|kumar/g,'').replace(/[^a-z]/g,'');}
  function fm(a,b){return a&&b&&(a===b||a.indexOf(b)===0||b.indexOf(a)===0);}
  var oldFam={};
  for(var i=0;i<v.length;i++){
    var r=v[i], parts=String(r[nmI]||'').trim().split(/\s+/);
    var f=nn(r[fI]||parts[0]||''), l=nn(r[lI]||(parts.length>1?parts[parts.length-1]:''));
    for(var j=0;j<OLD.length;j++){ if(l===nn(OLD[j][1]) && fm(f,nn(OLD[j][0]))){ oldFam[r[famI]||r[idI]]=1; break; } }
  }
  var oldN=0,newN=0;
  for(var i=0;i<v.length;i++){
    var r=v[i]; if(oldFam[r[famI]||r[idI]]){ r[onI]='Old'; oldN++; } else { r[onI]='New'; newN++; }
  }
  rng.setValues(v);
  return 'Old='+oldN+' New='+newN+' families='+Object.keys(oldFam).length;
}

// One-time Reference marking. Idempotent: resets every current "Reference" back
// to "New", then re-marks. Each listed person's family (its "New" members) is
// set to "Reference"; Old rows are never touched. Where a name matches more than
// one family, the newest record (highest HPP number) wins — that is the freshly
// entered reference contact rather than an established namesake family.
// [first, last, middle?] — middle only where needed to disambiguate.
var REF_PEOPLE = [
  ['Rajesh','Surati'],['Kamlesh','Gajjar'],['Mitesh','Patel','Govind'],['Pravin','Bhajiwala'],
  ['Smit','Pastagiya'],['Mehul','Pastagiya'],['Heena','Hajariwala'],['Priti','Gandhi'],
  ['Kumarkant','Bakariwala'],['Lata','Rathod'],['Nehal','Modi'],['Pinkesh','Ganjawala'],
  ['Jenish','Ganjawala'],['Parth','Modi'],['Kamlesh','Oza'],
  ['Vijay','Patel'],['Bhavesh','Rathod'],['Jayesh','Shivde'],['Bharat','Bakariwala'],
  ['Ashish','Bhatia'],['Rakesh','Lad'],['Parth','Gandhi']
];
// People with no usable surname — identified directly by their record id.
var REF_IDS = ['HPP-548','HPP-552','HPP-554','HPP-555','HPP-556','HPP-557'];
function _nn(s){return String(s||'').toLowerCase().replace(/bhai|kumar|ben/g,'').replace(/[^a-z]/g,'');}
function _fm(a,b){return a&&b&&(a===b||a.indexOf(b)===0||b.indexOf(a)===0);}
function _idNum(id){var m=String(id||'').match(/(\d+)/);return m?parseInt(m[1],10):-1;}
function markReferenceNow(){
  var name='Devotees', sh=tab_(name), head=HEADERS[name];
  var last=sh.getLastRow(); if(last<2) return 'no rows';
  var idI=head.indexOf('id'), nmI=head.indexOf('name'), fI=head.indexOf('firstName'),
      lI=head.indexOf('lastName'), famI=head.indexOf('familyId'), onI=head.indexOf('oldNew');
  var rng=sh.getRange(2,1,last-1,head.length), v=rng.getValues();
  var rows=v.map(function(r){
    var full=String(r[nmI]||''), parts=full.trim().split(/\s+/);
    return { id:r[idI], f:_nn(r[fI]||parts[0]||''), l:_nn(r[lI]||(parts.length>1?parts[parts.length-1]:'')),
             full:_nn(full), fam:(r[famI]||r[idI]), num:_idNum(r[idI]) };
  });
  // reset previous Reference -> New for idempotency
  for(var i=0;i<v.length;i++){ if(String(v[i][onI]||'').toLowerCase()==='reference') v[i][onI]='New'; }
  var refFam={}, unmatched=[];
  for(var j=0;j<REF_PEOPLE.length;j++){
    var of=_nn(REF_PEOPLE[j][0]), ol=_nn(REF_PEOPLE[j][1]), om=_nn(REF_PEOPLE[j][2]||'');
    var cand=null;
    for(var i=0;i<rows.length;i++){
      if(rows[i].l===ol && _fm(rows[i].f,of) && (!om || rows[i].full.indexOf(om)>=0)){
        if(!cand || rows[i].num>cand.num) cand=rows[i]; // newest wins
      }
    }
    if(!cand) unmatched.push(REF_PEOPLE[j].join(' ')); else refFam[cand.fam]=1;
  }
  // explicit ids (no-surname people) -> their family
  for(var q=0;q<REF_IDS.length;q++){
    for(var i=0;i<rows.length;i++){ if(rows[i].id===REF_IDS[q]){ refFam[rows[i].fam]=1; break; } }
  }
  var setN=0;
  for(var i=0;i<v.length;i++){
    if(refFam[rows[i].fam] && String(v[i][onI]||'').toLowerCase()==='new'){ v[i][onI]='Reference'; setN++; }
  }
  rng.setValues(v);
  return 'set='+setN+' | UNMATCHED: '+(unmatched.join(', ')||'none');
}
