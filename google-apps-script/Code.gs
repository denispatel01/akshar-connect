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
  Devotees:   ['id','name','firstName','middleName','lastName','gender','dob','bloodGroup','maritalStatus','anniversary','mobile','secondaryMobile','whatsapp','email','mandal','wing','area','city','address','education','occupation','reference','ambrish','gharNo','familyId','relation','type','dateOfJoining','createdBy','attendanceRate','status','tags','qualification','educationStatus','school','profession','professionField','companyName','areaRoute','followupKaryakarta','followupKaryakartaMobile','yuvakType','photo','notes','createdOn','updatedOn','updatedBy'],
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
  var need = HEADERS[name].length;
  var maxCols = sh.getMaxColumns();
  if(maxCols < need) sh.insertColumnsAfter(maxCols, need - maxCols);
  var lastCol = sh.getLastColumn();
  var cur = lastCol > 0 ? sh.getRange(1,1,1,Math.max(lastCol,need)).getValues()[0] : [];
  var changed = lastCol < need;
  for(var i=0;i<need && !changed;i++){ if(String(cur[i]==null?'':cur[i]) !== HEADERS[name][i]) changed = true; }
  if(changed){
    sh.getRange(1,1,sh.getMaxRows(),need).setNumberFormat('@'); // keep all-text
    sh.getRange(1,1,1,need).setValues([HEADERS[name]]);
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
  var rn=findRow_('Users','mobile',p.mobile);
  var row={ mobile:p.mobile, pin:p.pin||'', password:p.password||'', role:p.role||'Devotee', name:p.name||'Satsangi Devotee' };
  if(rn>0) tab_('Users').getRange(rn,1,1,HEADERS.Users.length).setValues([rowFromObj_('Users',row)]);
  else appendRows_('Users',[row]);
  return json_({ ok:true, user:row });
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
