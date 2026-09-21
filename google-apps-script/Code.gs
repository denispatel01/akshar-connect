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
  Devotees:   ['id','name','mobile','mandal','wing','area','city','bloodGroup','dob','occupation','attendanceRate','status','familyId','relation','gender','type'],
  Sabhas:     ['id','title','date','time','venue','presentCount','totalCount','status'],
  Attendance: ['id','sabhaId','devoteeId','present','timestamp','markedBy'],
  Thoughts:   ['id','author','thought','date']
};

var SEED_USERS = [
  { mobile:'9876543210', pin:'786109', password:'adminpassword', role:'Admin',   name:'Administrator' },
  { mobile:'9876543211', pin:'786369', password:'sevakpassword', role:'Sevak',   name:'Jignesh Sevak' },
  { mobile:'9876543212', pin:'123456', password:'devoteepassword', role:'Devotee', name:'Amit Patel' }
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
  ['Users','Devotees','Sabhas','Attendance','Thoughts'].forEach(function(n){
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

function ensureSheets_(){
  var first = ss_().getSheets()[0];
  ['Users','Devotees','Sabhas','Attendance','Thoughts'].forEach(function(n){ tab_(n); });
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
    if(!blank) { o.present = (o.present===true||o.present==='true'||o.present==='TRUE'); out.push(o); }
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
      sabhas:readAll_('Sabhas'), thoughts:readAll_('Thoughts'), attendance:readAll_('Attendance') });
    if(action==='seedDevotees'){
      if(readAll_('Devotees').length===0) appendRows_('Devotees', p.rows||[]);
      return json_({ ok:true, count:readAll_('Devotees').length });
    }
    if(action==='insert'){ appendRows_(p.collection, [p.row]); return json_({ ok:true, row:p.row }); }
    if(action==='update'){
      var rn=findRow_(p.collection, p.keyField||'id', p.key);
      if(rn<0) return json_({ ok:false, error:'not found' });
      tab_(p.collection).getRange(rn,1,1,HEADERS[p.collection].length).setValues([rowFromObj_(p.collection,p.row)]);
      return json_({ ok:true });
    }
    if(action==='remove'){
      var r=findRow_(p.collection, p.keyField||'id', p.key);
      if(r>0) tab_(p.collection).deleteRow(r);
      return json_({ ok:true });
    }
    if(action==='markAttendance') return doMark_(p);
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

function doUpsertUser_(p){
  var rn=findRow_('Users','mobile',p.mobile);
  var row={ mobile:p.mobile, pin:p.pin||'', password:p.password||'', role:p.role||'Devotee', name:p.name||'Satsangi Devotee' };
  if(rn>0) tab_('Users').getRange(rn,1,1,HEADERS.Users.length).setValues([rowFromObj_('Users',row)]);
  else appendRows_('Users',[row]);
  return json_({ ok:true, user:row });
}
