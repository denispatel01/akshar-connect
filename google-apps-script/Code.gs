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
  Devotees:   ['id','name','firstName','middleName','lastName','gender','dob','bloodGroup','maritalStatus','anniversary','mobile','whatsapp','email','mandal','area','address','education','ambrish','familyId','relation','type','dateOfJoining','attendanceRate','status','tags','qualification','grade','gradeAsOf','educationStatus','school','profession','professionField','companyName','areaRoute','reference','followupKaryakarta','followupKaryakartaMobile','yuvakType','photo','notes','createdBy','createdOn','updatedBy','updatedOn','oldNew'],
  Sabhas:     ['id','title','date','time','venue','presentCount','totalCount','status','type','description','tags'],
  Attendance: ['id','sabhaId','devoteeId','present','timestamp','markedBy'],
  Followups:  ['id','eventId','devoteeId','assignedTo','call','inPerson','message','outcome','remark','contactedOn','contactedBy'],
  Thoughts:   ['id','author','thought','date'],
  Areas:      ['name','number','notes'],
  Activity:   ['ts','actor','actorMobile','action','target','detail','device'],
  Changes:    ['ts','action','collection','summary','emailed']
};
// Bump when HEADERS change so ensureSheets_ re-runs the schema migration once.
var SCHEMA_VERSION = '2026-10-07b';

// Columns stored/returned as booleans (coerced on read).
var BOOL_COLS = { present:true, call:true, inPerson:true, message:true };

// Where all notification mail goes. Change here only.
var MAIL_TO = 'aksharconnect01@gmail.com';
// Send AS this address, shown with this display name. `from` only works once it
// is a verified "Send mail as" alias on the script owner's Gmail (see DEPLOY.md).
var MAIL_FROM = 'aksharconnect01@gmail.com';
var MAIL_FROM_NAME = 'Akshar Connect';

// Admin ON/OFF switch for all notification mail (#100). Stored in Script Properties.
function mailEnabled_(){ return PropertiesService.getScriptProperties().getProperty('mailEnabled') !== 'false'; }

// Central mailer — always shows "Akshar Connect" as the sender name, and sends
// AS aksharconnect01 when the alias is verified. Falls back (keeps the name) if
// the alias isn't set up yet, so mail is never lost. Supports an optional HTML body.
function sendMail_(subject, body, toOverride, htmlBody, inlineImages){
  var to = toOverride || MAIL_TO;
  var opts = { to: to, subject: subject, body: body, name: MAIL_FROM_NAME };
  if (htmlBody) opts.htmlBody = htmlBody;
  if (inlineImages) opts.inlineImages = inlineImages;
  try {
    opts.from = MAIL_FROM;
    MailApp.sendEmail(opts);
    return MAIL_FROM;
  } catch (e) {
    delete opts.from;
    MailApp.sendEmail(opts); // alias not ready yet
    return 'owner-fallback';
  }
}

// Decode a data: URI (base64 or url-encoded) into a Blob for use as an inline
// email image (#108). Gmail strips <img src="data:..."> for security, so the
// photo must be attached and referenced by Content-ID instead.
function dataUriToBlob_(dataUri, name){
  try{
    var m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataUri));
    if(!m) return null;
    var contentType = m[1] || 'image/jpeg';
    var bytes = m[2] ? Utilities.base64Decode(m[3]) : Utilities.newBlob(decodeURIComponent(m[3])).getBytes();
    return Utilities.newBlob(bytes, contentType, name || 'photo');
  }catch(e){ return null; }
}

// ── Photo storage on Google Drive (#107) ────────────────────────────────────
// Instead of storing a big base64 string on every devotee row (bloats the Sheet,
// slows bootstrap, and Gmail won't render it), the photo is saved as a file in a
// dedicated Drive folder and only its URL is kept on the record.
// Photos live in Drive under akshar-connect/profile-photo (#124).
function subFolder_(parent, name){
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function photoFolder_(){
  var root = subFolder_(DriveApp.getRootFolder(), 'akshar-connect');
  return subFolder_(root, 'profile-photo');
}
// A URL that renders reliably both in the app and inside Gmail.
function photoUrl_(id){ return 'https://lh3.googleusercontent.com/d/' + id; }
// Extract a Drive file id from a photo value (our stored URL forms).
function photoIdFromUrl_(u){
  var s = String(u || '');
  var m = /lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]+)/.exec(s)
       || /[?&]id=([A-Za-z0-9_-]+)/.exec(s)
       || /\/d\/([A-Za-z0-9_-]+)/.exec(s);
  return m ? m[1] : '';
}
function doUploadPhoto_(p){
  try{
    var blob = dataUriToBlob_(p.dataUri, (p.id || 'photo') + '_' + Date.now() + '.jpg');
    if(!blob) return json_({ ok:false, error:'bad image data' });
    var file = photoFolder_().createFile(blob);
    try{ file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }catch(e){}
    var id = file.getId();
    return json_({ ok:true, id:id, url:photoUrl_(id) });
  }catch(e){ return json_({ ok:false, error:String(e) }); }
}
// One-time cleanup (#107): blank every devotee photo still stored as base64, so
// the Sheet shrinks and photos get re-added as Drive URLs going forward. Hit
// `?action=clearBase64Photos` or run clearBase64Photos() in the editor.
function doClearBase64Photos_(){
  var sh = tab_('Devotees');
  var last = sh.getLastRow(); if(last < 2) return json_({ ok:true, cleared:0 });
  var pIdx = HEADERS.Devotees.indexOf('photo');
  if(pIdx < 0) return json_({ ok:false, error:'no photo column' });
  var rng = sh.getRange(2, pIdx+1, last-1, 1);
  var vals = rng.getValues(), cleared = 0;
  for(var i=0;i<vals.length;i++){
    if(String(vals[i][0]||'').indexOf('data:') === 0){ vals[i][0] = ''; cleared++; }
  }
  if(cleared) rng.setValues(vals);
  return json_({ ok:true, cleared:cleared });
}
function clearBase64Photos(){ Logger.log(doClearBase64Photos_().getContent()); }

/** RUN ONCE from the editor to grant the Drive permission (like testMail). */
function authorizeDrive(){
  var f = photoFolder_();
  Logger.log('Drive OK — folder "' + PHOTO_FOLDER_NAME + '" id: ' + f.getId());
}

// Pretty, profile-style HTML email for a devotee add/edit (#93).
// `changedKeys` (edit only) highlights exactly what was updated (#108).
// `hasPhoto` embeds the uploaded photo as an inline image (cid:devpic) (#108).
function devoteeEmailHtml_(action, row, changedKeys, hasPhoto){
  var changed = {};
  if (changedKeys && changedKeys.length) for (var c=0;c<changedKeys.length;c++) changed[changedKeys[c]] = true;
  var isEdit = action === 'UPDATE';
  var FIELDS = [
    ['mobile','📱 Mobile'],['whatsapp','💬 WhatsApp'],['email','📧 Email'],
    ['gender','⚧ Gender'],['dob','🎂 Date of Birth'],['bloodGroup','🩸 Blood Group'],
    ['maritalStatus','💍 Marital Status'],['anniversary','💕 Anniversary'],
    ['address','📍 Address'],['area','🗺️ Area'],
    ['yuvakType','🧑 Yuvak Type'],['qualification','🎓 Qualification'],['grade','📘 Grade'],
    ['education','📚 Education'],['educationStatus','⏳ Status'],['school','🏫 School'],
    ['profession','💼 Profession'],['professionField','🛠️ Field'],['companyName','🏢 Company'],
    ['relation','🔗 Relation'],['followupKaryakarta','🙏 Karyakarta'],['reference','🤝 Reference'],
    ['tags','🏷️ Tags'],['notes','📝 Notes'],['id','🆔 ID'],
  ];
  var PILL = '<span style="display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;background:#FDBA74;color:#7C2D12;font-size:10px;font-weight:800;letter-spacing:.3px;vertical-align:middle">UPDATED</span>';
  var rows = '', changedLabels = [];
  for (var i=0;i<FIELDS.length;i++){
    var k = FIELDS[i][0], v = row[k];
    if (v === undefined || v === null || v === '') continue;
    var hit = isEdit && changed[k];
    if (hit) changedLabels.push(FIELDS[i][1]);
    var labTd = 'padding:7px 12px;font-size:12px;font-weight:700;white-space:nowrap;border-bottom:1px solid #F0E6DC;vertical-align:top;'
      + (hit ? 'background:#FFF7ED;color:#9A3412' : 'color:#7A7369');
    var valTd = 'padding:7px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #F0E6DC;'
      + (hit ? 'background:#FFF7ED;color:#7C2D12' : 'color:#26303B');
    rows += '<tr>'
      + '<td style="'+labTd+'">'+FIELDS[i][1]+(hit?PILL:'')+'</td>'
      + '<td style="'+valTd+'">'+String(v).replace(/</g,'&lt;')+'</td>'
      + '</tr>';
  }
  // Name & Photo aren't rows in the table above (name is the header, photo is the
  // avatar), so surface them in the "Updated" summary explicitly (#123 follow-up).
  if (isEdit) {
    if (changed['name'] || changed['firstName'] || changed['middleName'] || changed['lastName']) changedLabels.unshift('Name');
    if (changed['photo']) changedLabels.push('Photo');
  }
  var who = row.updatedBy || row.createdBy || '';
  var verb = action === 'INSERT' ? 'added' : 'updated';
  // On an edit, a one-line summary of what changed, right under the header.
  var summaryBar = '';
  if (isEdit) {
    var txt = changedLabels.length
      ? ('✏️ Updated: ' + changedLabels.map(function(s){ return s.replace(/^[^\sA-Za-z]+\s*/, ''); }).join(', '))
      : '✏️ Record updated';
    summaryBar = '<div style="background:#FFEDD5;color:#9A3412;font-size:12px;font-weight:700;padding:9px 20px;border-bottom:1px solid #FED7AA">'+txt+'</div>';
  }
  var photoBlock = hasPhoto
    ? '<div style="text-align:center;background:#fff;padding:16px 0 4px"><img src="cid:devpic" alt="photo" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid #FF9D52"></div>'
    : '';
  return ''
    + '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#FBF5EF;padding:18px;border-radius:16px">'
    + '<div style="background:linear-gradient(135deg,#FF9D52,#E56F18);color:#fff;padding:18px 20px;border-radius:14px 14px 0 0">'
    +   '<div style="font-size:11px;font-weight:800;letter-spacing:1px;opacity:.9">AKSHAR CONNECT</div>'
    +   '<div style="font-size:20px;font-weight:800;margin-top:2px">'+(row.name||'Devotee')+'</div>'
    +   '<div style="font-size:12px;opacity:.95;margin-top:2px">Devotee '+verb+(who?(' by '+who):'')+'</div>'
    + '</div>'
    + summaryBar
    + photoBlock
    + '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:0 0 14px 14px;overflow:hidden">'+rows+'</table>'
    + '<div style="color:#9b9183;font-size:11px;text-align:center;margin-top:12px">Sent automatically by Akshar Connect</div>'
    + '</div>';
}

/**
 * RUN THIS ONCE from the editor to grant the "Send email as you" permission,
 * then approve the prompt. After that, all add/edit/delete emails will work.
 * (Pick `testMail` in the toolbar function dropdown → Run.)
 */
function testMail(){
  var sender = sendMail_('Akshar Connect — test mail', 'Test email from the Apps Script editor at ' + new Date());
  Logger.log('Sent test mail to ' + MAIL_TO + ' (sent as: ' + sender + ', name: "' + MAIL_FROM_NAME + '"). '
    + (sender === 'owner-fallback'
       ? 'NOTE: the aksharconnect01 alias is NOT verified yet, so it went from the owner address. Add & verify the "Send mail as" alias to send as aksharconnect01.'
       : 'The aksharconnect01 alias is working.')
    + ' Remaining daily quota: ' + MailApp.getRemainingDailyQuota());
}
// Alias — same thing, clearer name in the dropdown.
function authorizeEmail(){ return testMail(); }

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
    // When a column was REMOVED, the rebuilt data occupies the first `need`
    // columns but stale orphan columns can linger to the right — delete them so
    // the sheet matches HEADERS exactly (data was already remapped by name above).
    var extra = sh.getMaxColumns() - need;
    if(extra > 0) { try { sh.deleteColumns(need + 1, extra); } catch(e) {} }
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function ensureSheets_(){
  // Heavy schema check/migration runs once per deployment, not on every request.
  // Reads/writes still create a missing tab lazily via tab_(), so this is safe.
  var props = PropertiesService.getScriptProperties();
  if(props.getProperty('ensuredSchema') === SCHEMA_VERSION) return;
  var first = ss_().getSheets()[0];
  ['Users','Devotees','Sabhas','Attendance','Followups','Thoughts','Areas','Activity','Changes'].forEach(function(n){ tab_(n); migrateHeaders_(n); });
  // remove default empty "Sheet1" if it isn't one of ours
  if(first && ['Sheet1','Sheet 1'].indexOf(first.getName())>=0 && HEADERS[first.getName()]===undefined){
    try{ ss_().deleteSheet(first); }catch(e){}
  }
  if(readAll_('Users').length===0)    appendRows_('Users', SEED_USERS);
  if(readAll_('Sabhas').length===0)   appendRows_('Sabhas', SEED_SABHAS);
  if(readAll_('Thoughts').length===0) appendRows_('Thoughts', SEED_THOUGHTS);
  props.setProperty('ensuredSchema', SCHEMA_VERSION);
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
    if(action==='testMail'){
      var to = p.to || MAIL_TO;
      try{
        var sender = sendMail_('Akshar Connect — test mail', 'This is a test from the backend at '+new Date().toISOString(), to);
        return json_({ ok:true, sent:true, to:to, sentAs:sender, fromName:MAIL_FROM_NAME, remainingQuota: MailApp.getRemainingDailyQuota() });
      }catch(err){ return json_({ ok:false, sent:false, to:to, error:String(err), remainingQuota:(function(){try{return MailApp.getRemainingDailyQuota();}catch(e){return 'n/a';}})() }); }
    }
    if(action==='peekHeaders'){ var _sh=tab_('Devotees'); return json_({ ok:true, physical:_sh.getRange(1,1,1,_sh.getLastColumn()).getValues()[0], target:HEADERS.Devotees, ensured:PropertiesService.getScriptProperties().getProperty('ensuredSchema') }); }
    if(action==='listTabs'){ return json_({ ok:true, tabs: ss_().getSheets().map(function(s){ return { name:s.getName(), rows:s.getLastRow(), cols:s.getLastColumn() }; }) }); }
    if(action==='repairFromBackup') return json_({ ok:true, result: repairFromBackup_(p.tab) });
    if(action==='peekTab'){ var _t=ss_().getSheetByName(p.tab); if(!_t) return json_({ok:false,error:'no tab'}); var lc=_t.getLastColumn(); return json_({ ok:true, header:_t.getRange(1,1,1,lc).getValues()[0], row2:_t.getLastRow()>1?_t.getRange(2,1,1,lc).getValues()[0]:[] }); }
    ensureSheets_();
    if(action==='classifyOldNew') return json_({ ok:true, result: classifyOldNewNow() });
    if(action==='markReference') return json_({ ok:true, result: markReferenceNow() });
    if(action==='syncFamilyFields') return json_({ ok:true, result: syncFamilyFieldsNow() });
    if(action==='reset'){ resetAll_(); return json_({ ok:true, msg:'reset done' }); }
    if(action==='bootstrap') return json_({ ok:true,
      users:readAll_('Users'), devotees:readAll_('Devotees'),
      sabhas:readAll_('Sabhas'), thoughts:readAll_('Thoughts'), attendance:readAll_('Attendance'), followups:readAll_('Followups'), areas:readAll_('Areas') });
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
    // Writes return as fast as possible — no synchronous email (it blocked the
    // response by 1-3s). Change notifications are logged and emailed hourly by the
    // emailChangeDigest_ time-trigger instead.
    if(action==='insert'){ appendRows_(p.collection, [p.row]); logChange_('INSERT', p.collection, p.row, mailFlag_(p)); return json_({ ok:true, row:p.row }); }
    if(action==='bulkUpdateTags') return doBulkUpdateTags_(p);
    if(action==='bulkSetTags') return doBulkSetTags_(p);
    if(action==='update'){
      var rn=findRow_(p.collection, p.keyField||'id', p.key);
      if(rn<0) return json_({ ok:false, error:'not found' });
      tab_(p.collection).getRange(rn,1,1,HEADERS[p.collection].length).setValues([rowFromObj_(p.collection,p.row)]);
      logChange_('UPDATE', p.collection, p.row, mailFlag_(p), p.changed);
      return json_({ ok:true });
    }
    if(action==='remove'){
      var r=findRow_(p.collection, p.keyField||'id', p.key);
      if(r>0) { tab_(p.collection).deleteRow(r); logChange_('DELETE', p.collection, { key: p.key, name: p.name, actor: p.actor }, mailFlag_(p)); }
      return json_({ ok:true });
    }
    if(action==='markAttendance') { return doMark_(p); }
    if(action==='saveFollowup') return doSaveFollowup_(p);
    if(action==='upsertUser') return doUpsertUser_(p);
    if(action==='deleteUser') return doDeleteUser_(p);
    if(action==='logActivity'){
      // Fire-and-forget app activity log. Never throws back to the client.
      try{
        var a = p.row || {};
        appendRows_('Activity', [{
          ts: a.ts || new Date().toISOString(), actor: a.actor||'', actorMobile: a.actorMobile||'',
          action: a.action||'', target: a.target||'', detail: a.detail||'', device: a.device||''
        }]);
      }catch(e){}
      return json_({ ok:true });
    }
    if(action==='activity'){
      var all = readAll_('Activity');
      if(p.actor) all = all.filter(function(r){ return String(r.actor)===String(p.actor); });
      var lim = Math.min(parseInt(p.limit,10)||300, 1000);
      var out = all.slice(Math.max(0, all.length-lim)).reverse(); // newest first
      return json_({ ok:true, activity: out });
    }
    if(action==='getUsers') return json_({ ok:true, users: readAll_('Users') });
    if(action==='getMailEnabled') return json_({ ok:true, enabled: mailEnabled_() });
    if(action==='setMailEnabled'){
      PropertiesService.getScriptProperties().setProperty('mailEnabled', (p.enabled===true||p.enabled==='true') ? 'true' : 'false');
      return json_({ ok:true, enabled: mailEnabled_() });
    }
    if(action==='uploadPhoto') return doUploadPhoto_(p);
    if(action==='clearBase64Photos') return doClearBase64Photos_();
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

// Lightweight change log (replaces the slow per-write email). Appends one compact
// row to the Changes tab; emailChangeDigest_ emails these hourly if a trigger is set.
// Per-request mail intent (#104): the client stamps each write with the mail
// on/off state at the MOMENT the user made the change, so optimistic writes that
// reach the server later (after the admin flips the toggle) still honour what was
// true when they acted. `p.mail === false` suppresses; otherwise fall back to the
// global server flag. Returns false only when explicitly suppressed.
function mailFlag_(p){
  if(p && (p.mail === false || p.mail === 'false')) return false;
  if(p && (p.mail === true  || p.mail === 'true'))  return true;
  return null; // not specified → use global
}
function logChange_(action, collection, row, mailAllowed, changedKeys){
  try{
    var who = (row && (row.name || row.updatedBy || row.key)) || '';
    var summary = String(who).slice(0,120);
    tab_('Changes').appendRow([ new Date().toISOString(), action, collection, summary, 'yes' ]);
  }catch(e){}
  // Email runs on the server AFTER the client already got its optimistic response,
  // so the user never waits for it. Wrapped in try/catch so a mail failure never
  // breaks the write. Admin can switch mail OFF (#100). Bulk tag ops don't call this.
  // Area-master edits never email (metadata, protects the Gmail quota) (#104/#105).
  if(collection === 'Areas') return;
  if(mailAllowed === false) return;              // client said mail was OFF when they acted (#104)
  if(mailAllowed !== true && !mailEnabled_()) return; // else honour the global flag
  try{
    if(collection === 'Devotees' && action === 'DELETE'){
      // Delete mail: name + ID + who deleted + when (#95).
      var when = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy hh:mm a');
      var nm = (row && row.name) || '(unknown)';
      var id = (row && (row.key || row.id)) || '';
      var by = (row && row.actor) || '';
      var dbody = 'Devotee deleted\n\nName: ' + nm + '\nID: ' + id + '\nDeleted by: ' + by + '\nWhen: ' + when;
      var dhtml = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#FBF5EF;padding:18px;border-radius:16px">'
        + '<div style="background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;padding:16px 20px;border-radius:14px 14px 0 0">'
        +   '<div style="font-size:11px;font-weight:800;letter-spacing:1px;opacity:.9">AKSHAR CONNECT</div>'
        +   '<div style="font-size:19px;font-weight:800;margin-top:2px">🗑️ Devotee Deleted</div></div>'
        + '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:0 0 14px 14px;overflow:hidden">'
        +   '<tr><td style="padding:8px 12px;color:#7A7369;font-size:12px;font-weight:700;border-bottom:1px solid #F0E6DC">👤 Name</td><td style="padding:8px 12px;color:#26303B;font-size:13px;font-weight:700;border-bottom:1px solid #F0E6DC">'+nm+'</td></tr>'
        +   '<tr><td style="padding:8px 12px;color:#7A7369;font-size:12px;font-weight:700;border-bottom:1px solid #F0E6DC">🆔 ID</td><td style="padding:8px 12px;color:#26303B;font-size:13px;font-weight:600;border-bottom:1px solid #F0E6DC">'+id+'</td></tr>'
        +   '<tr><td style="padding:8px 12px;color:#7A7369;font-size:12px;font-weight:700;border-bottom:1px solid #F0E6DC">🧑 Deleted by</td><td style="padding:8px 12px;color:#26303B;font-size:13px;font-weight:600;border-bottom:1px solid #F0E6DC">'+by+'</td></tr>'
        +   '<tr><td style="padding:8px 12px;color:#7A7369;font-size:12px;font-weight:700">🕒 When</td><td style="padding:8px 12px;color:#26303B;font-size:13px;font-weight:600">'+when+'</td></tr>'
        + '</table></div>';
      sendMail_('Akshar Connect: Deleted — ' + nm + (id?(' ('+id+')'):''), dbody, null, dhtml);
      return;
    }
    if(collection === 'Devotees' && (action === 'INSERT' || action === 'UPDATE')){
      // Profile-style HTML mail with changed-field highlights + inline photo (#108).
      var plain = (action === 'INSERT' ? 'Added' : 'Updated') + ' devotee: ' + ((row && row.name) || '');
      var inline = null;
      var ph = row && row.photo ? String(row.photo) : '';
      if (ph.indexOf('data:') === 0) {
        var blob = dataUriToBlob_(ph, 'photo');
        if (blob) inline = { devpic: blob };
      } else if (ph.indexOf('http') === 0) {
        // New Drive-hosted photo (#107): fetch the file and inline it so it shows
        // in Gmail without relying on remote image loading.
        var pid = photoIdFromUrl_(ph);
        try { if (pid) { var b = DriveApp.getFileById(pid).getBlob(); if (b) inline = { devpic: b }; } } catch (e) {}
      }
      var html = devoteeEmailHtml_(action, row || {}, changedKeys, !!inline);
      sendMail_('Akshar Connect: ' + (action === 'INSERT' ? 'New devotee' : 'Updated') + ' — ' + ((row && row.name) || ''), plain, null, html, inline);
      return;
    }
    // Other collections: simple text (skip base64/huge values).
    var body = action + ' on ' + collection + '\n\n';
    if(row && typeof row === 'object'){ for(var k in row){ var vv=row[k]; if(vv && String(vv).length < 300) body += k + ': ' + vv + '\n'; } }
    sendMail_('Akshar Connect: ' + action + ' ' + collection + (row && row.name ? ' — ' + row.name : ''), body);
  }catch(e){}
}

// Optional hourly digest: email all un-emailed changes, then mark them emailed.
// Enable once by running setupChangeDigest_() in the Apps Script editor.
function emailChangeDigest_(){
  var sh = tab_('Changes'); var last = sh.getLastRow(); if(last<2) return;
  var H = HEADERS.Changes, v = sh.getRange(2,1,last-1,H.length).getValues();
  var eI = H.indexOf('emailed');
  var pending = [], rows = [];
  for(var i=0;i<v.length;i++){ if(!v[i][eI]){ pending.push(v[i]); rows.push(i+2); } }
  if(!pending.length) return;
  var body = 'Akshar Connect — ' + pending.length + ' change(s):\n\n'
    + pending.map(function(r){ return r[0]+'  '+r[1]+' '+r[2]+'  '+r[3]; }).join('\n');
  try{ sendMail_('Akshar Connect — '+pending.length+' changes', body); }catch(e){ return; }
  rows.forEach(function(rn){ sh.getRange(rn, eI+1).setValue('yes'); });
}
function setupChangeDigest_(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==='emailChangeDigest_') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('emailChangeDigest_').timeBased().everyHours(1).create();
}

// Mail shooter: email the admin when a user hits a runtime error in the app.
function sendErrorEmail_(p){
  try{
    var email='aksharconnect01@gmail.com';
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

// Set the full tags value for many devotees in ONE request/write. p.rows is
// [{id, tags}] (tags already serialized). Used by the swipe bulk tagger.
function doBulkSetTags_(p){
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try{
    var sh = tab_('Devotees'); var H = HEADERS.Devotees; var last = sh.getLastRow();
    if(last < 2) return json_({ ok:true, count:0 });
    var data = sh.getRange(2,1,last-1,H.length).getValues();
    var idI = H.indexOf('id'), tagsI = H.indexOf('tags'), ubI = H.indexOf('updatedBy');
    var map = {}; (p.rows||[]).forEach(function(r){ map[String(r.id)] = (r.tags==null?'':String(r.tags)); });
    var n = 0;
    for(var i=0;i<data.length;i++){
      var id = String(data[i][idI]);
      if(map.hasOwnProperty(id)){
        data[i][tagsI] = map[id];
        if(ubI>=0 && p.updatedBy) data[i][ubI] = p.updatedBy;
        n++;
      }
    }
    if(n>0) sh.getRange(2,1,last-1,H.length).setValues(data);
    return json_({ ok:true, count:n });
  } finally { lock.releaseLock(); }
}

// One-time repair: rebuild the Devotees sheet from a known-good backup tab,
// mapping every column BY NAME into the current HEADERS (drops legacy columns,
// fixes any positional shift). Saves the current (corrupt) sheet first.
function repairFromBackup_(bakName){
  var bak = ss_().getSheetByName(bakName); if(!bak) return 'no backup: '+bakName;
  var lc = bak.getLastColumn(), lr = bak.getLastRow();
  var head = bak.getRange(1,1,1,lc).getValues()[0].map(function(x){ return String(x); });
  var data = lr>1 ? bak.getRange(2,1,lr-1,lc).getValues() : [];
  var pos = {}; head.forEach(function(h,i){ if(!(h in pos)) pos[h]=i; });
  var target = HEADERS.Devotees, need = target.length;
  var out = [target.slice()];
  data.forEach(function(r){
    out.push(target.map(function(h){ var i=pos[h]; return (i===undefined||r[i]==null)?'':r[i]; }));
  });
  var sh = tab_('Devotees');
  try{ sh.copyTo(ss_()).setName('Devotees_corrupt_'+Utilities.formatDate(new Date(),'GMT','yyyyMMdd_HHmmss')); }catch(e){}
  sh.clear();
  sh.getRange(1,1,sh.getMaxRows(),need).setNumberFormat('@');
  sh.getRange(1,1,out.length,need).setValues(out);
  var extra = sh.getMaxColumns() - need;
  if(extra>0) sh.deleteColumns(need+1, extra);
  return 'restored '+(out.length-1)+' rows from '+bakName;
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
