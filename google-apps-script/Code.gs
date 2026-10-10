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
  // `modules` = comma-separated extra module grants (e.g. "ghari") so an Admin can
  // give a non-admin access to a specific module like Ghari Seva.
  Users:      ['mobile','pin','password','role','name','modules'],
  Devotees:   ['id','name','firstName','middleName','lastName','gender','dob','bloodGroup','maritalStatus','anniversary','mobile','whatsapp','email','mandal','area','address','education','ambrish','familyId','relation','type','dateOfJoining','attendanceRate','status','tags','qualification','grade','gradeAsOf','educationStatus','school','profession','professionField','companyName','areaRoute','reference','followupKaryakarta','followupKaryakartaMobile','yuvakType','photo','notes','createdBy','createdOn','updatedBy','updatedOn','oldNew'],
  Sabhas:     ['id','title','date','time','venue','presentCount','totalCount','status','type','description','tags'],
  Attendance: ['id','sabhaId','devoteeId','present','timestamp','markedBy'],
  Followups:  ['id','eventId','devoteeId','assignedTo','call','inPerson','message','outcome','remark','contactedOn','contactedBy'],
  Thoughts:   ['id','author','thought','date'],
  Areas:      ['name','number','notes'],
  Activity:   ['ts','actor','actorMobile','action','target','detail','device'],
  Changes:    ['ts','action','collection','summary','emailed'],
  // ── Ghari Seva (fundraising ledger) ──────────────────────────────────────
  // Catalog of sellable items. `category` ∈ ghee|noghee|sf|bhusu. Prices are
  // editable (they change year to year), so each ORDER snapshots the unit price.
  GhariProducts: ['sku','name','size','category','unitPrice','sortOrder','active'],
  // One row per customer order. `itemsJson` is the authoritative line-item list
  // (each line snapshots its unit price); the flattened amount columns are a
  // human-readable denormalization so the Sheet still reads like a ledger.
  // `status` ∈ active|void (soft delete — orders are never hard-deleted: money).
  GhariOrders: ['id','season','customerName','customerMobile','devoteeId','karyakarta','karyakartaId','itemsJson','itemsSummary','total','withGheeAmt','withoutGheeAmt','sugarFreeAmt','bhusuAmt','delivered','paymentReceived','balance','paymentType','status','remarks','createdBy','createdOn','updatedBy','updatedOn'],
  // Procurement (the "buy" side): boxes bought from a supplier on a date, with an
  // optional cost and a challan (bill/delivery note) photo URL. `boxes` = total
  // boxes across items; `itemsJson` holds per-item qty. status ∈ active|void.
  GhariPurchases: ['id','season','date','supplier','itemsJson','itemsSummary','boxes','amount','challan','remarks','status','createdBy','createdOn','updatedBy','updatedOn'],
  // One row per device registered for push. Keyed by the FCM token. A devotee /
  // staff member can have several devices (several rows).
  PushTokens: ['token','devoteeId','mobile','name','platform','updatedOn'],
  // Admin-posted announcements, shown in-app and sent as a push notification.
  // audience ∈ all | staff | devotees (who it targets).
  Announcements: ['id','title','body','audience','createdBy','createdOn','sentCount'],
  // Each person's notification-permission response (so admins can see who allowed /
  // rejected). Keyed by devoteeId (or mobile). status ∈ granted|denied|default|unsupported.
  PushStatus: ['key','devoteeId','mobile','name','status','platform','updatedOn'],
  // Daily Swadhyay log — one row per devotee per day. Minutes of Bhajan (with the
  // time of day), Shravan (listening to discourses) and Vachan (reading).
  Swadhyay: ['key','devoteeId','mobile','name','date','bhajanMin','bhajanTime','listenMin','readMin','createdOn','updatedOn']
};
// Bump when HEADERS change so ensureSheets_ re-runs the schema migration once.
var SCHEMA_VERSION = '2026-10-11-swadhyay';

// Columns stored/returned as booleans (coerced on read).
var BOOL_COLS = { present:true, call:true, inPerson:true, message:true, delivered:true, active:true };

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
// Ghari challans live under akshar-connect/ghari-challan and keep their real file
// type (image or PDF), unlike profile photos which are always re-saved as JPEG.
function challanFolder_(){
  var root = subFolder_(DriveApp.getRootFolder(), 'akshar-connect');
  return subFolder_(root, 'ghari-challan');
}
function doUploadChallan_(p){
  try{
    var dataUri = String(p.dataUri || '');
    var m = /^data:([^;,]+)?/.exec(dataUri);
    var ct = (m && m[1]) ? m[1] : 'image/jpeg';
    var isPdf = ct.toLowerCase().indexOf('pdf') >= 0;
    var ext = isPdf ? 'pdf' : (ct.toLowerCase().indexOf('png') >= 0 ? 'png' : 'jpg');
    var blob = dataUriToBlob_(dataUri, (p.id || 'challan') + '_' + Date.now() + '.' + ext);
    if(!blob) return json_({ ok:false, error:'bad file data' });
    var file = challanFolder_().createFile(blob);
    try{ file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }catch(e){}
    var id = file.getId();
    // Images render inline via lh3; PDFs open in the Drive viewer.
    var url = isPdf ? ('https://drive.google.com/file/d/' + id + '/view') : photoUrl_(id);
    return json_({ ok:true, id:id, url:url, type:ct });
  }catch(e){ return json_({ ok:false, error:String(e) }); }
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

// One-time migration (#107): upload every devotee photo still stored as base64 to
// Drive and replace the cell with the Drive URL. Safe to run repeatedly — it only
// touches cells that still start with "data:". Hit `?action=migrateBase64Photos`
// or run migrateBase64Photos() in the editor.
function doMigrateBase64Photos_(){
  var sh = tab_('Devotees');
  var last = sh.getLastRow(); if(last < 2) return json_({ ok:true, migrated:0 });
  var pIdx = HEADERS.Devotees.indexOf('photo');
  var iIdx = HEADERS.Devotees.indexOf('id');
  if(pIdx < 0) return json_({ ok:false, error:'no photo column' });
  var rng = sh.getRange(2, pIdx+1, last-1, 1);
  var vals = rng.getValues();
  var ids = iIdx >= 0 ? sh.getRange(2, iIdx+1, last-1, 1).getValues() : null;
  var migrated = 0, failed = 0;
  for(var i=0;i<vals.length;i++){
    var v = String(vals[i][0]||'');
    if(v.indexOf('data:') !== 0) continue;
    try{
      var id = ids ? String(ids[i][0]||('row'+(i+2))) : ('row'+(i+2));
      var blob = dataUriToBlob_(v, id + '_' + Date.now() + '.jpg');
      if(!blob){ failed++; continue; }
      var file = photoFolder_().createFile(blob);
      try{ file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }catch(e){}
      vals[i][0] = photoUrl_(file.getId());
      migrated++;
    }catch(e){ failed++; }
  }
  if(migrated) rng.setValues(vals);
  return json_({ ok:true, migrated:migrated, failed:failed });
}
function migrateBase64Photos(){ Logger.log(doMigrateBase64Photos_().getContent()); }

// Remap family ids in bulk (e.g. to close gaps) WITHOUT splitting families: every
// row whose familyId matches a `from` is set to the matching `to`. A timestamped
// backup of the Devotees tab is saved first, so it is fully reversible.
// p.map = [{ from:'FAM202', to:'FAM024' }, ...]
function doRemapFamilyIds_(p){
  var map = p.map || [];
  if(!map.length) return json_({ ok:false, error:'empty map' });
  var lookup = {}; map.forEach(function(m){ if(m && m.from && m.to) lookup[String(m.from)] = String(m.to); });
  var sh = tab_('Devotees');
  var last = sh.getLastRow(); if(last < 2) return json_({ ok:true, changed:0 });
  var fIdx = HEADERS.Devotees.indexOf('familyId');
  if(fIdx < 0) return json_({ ok:false, error:'no familyId column' });
  // Backup first (reversible).
  try { sh.copyTo(ss_()).setName('Devotees_bak_fam_' + Utilities.formatDate(new Date(),'GMT','yyyyMMdd_HHmmss')); } catch(e){}
  var rng = sh.getRange(2, fIdx+1, last-1, 1);
  var vals = rng.getValues(), changed = 0;
  for(var i=0;i<vals.length;i++){
    var cur = String(vals[i][0]||'');
    if(lookup.hasOwnProperty(cur)){ vals[i][0] = lookup[cur]; changed++; }
  }
  if(changed) rng.setValues(vals);
  return json_({ ok:true, changed:changed });
}

// ── Push notifications via Firebase Cloud Messaging (HTTP v1) ─────────────────
// Setup (one time, by the project owner):
//   1. Firebase console → create project → add Android app id in.aksharmandal.aksharconnect.
//   2. Project settings → Service accounts → Generate new private key (JSON).
//   3. Here: Project Settings (gear) → Script properties, add:
//        FCM_SERVICE_ACCOUNT = <paste the WHOLE service-account JSON>
//      (project_id, client_email and private_key are read from it.)
// Nothing secret ever lives in this file or in git.

// Register / refresh a device's FCM token (one row per device, keyed by token).
function doRegisterPushToken_(p){
  var token = String(p.token || '').trim();
  if(!token) return json_({ ok:false, error:'no token' });
  var row = {
    token: token,
    devoteeId: String(p.devoteeId || ''),
    mobile: String(p.mobile || ''),
    name: String(p.name || ''),
    platform: String(p.platform || ''),
    updatedOn: new Date().toISOString()
  };
  var rn = findRow_('PushTokens', 'token', token);
  if(rn > 0) tab_('PushTokens').getRange(rn,1,1,HEADERS.PushTokens.length).setValues([rowFromObj_('PushTokens', row)]);
  else appendRows_('PushTokens', [row]);
  return json_({ ok:true });
}

// Record a person's notification-permission response (upsert by key).
function doLogPushStatus_(p){
  var key = String(p.key || p.devoteeId || p.mobile || '').trim();
  if(!key) return json_({ ok:false, error:'no key' });
  var row = {
    key: key, devoteeId: String(p.devoteeId||''), mobile: String(p.mobile||''),
    name: String(p.name||''), status: String(p.status||''), platform: String(p.platform||''),
    updatedOn: new Date().toISOString()
  };
  var rn = findRow_('PushStatus', 'key', key);
  if(rn > 0) tab_('PushStatus').getRange(rn,1,1,HEADERS.PushStatus.length).setValues([rowFromObj_('PushStatus', row)]);
  else appendRows_('PushStatus', [row]);
  return json_({ ok:true });
}
function doGetPushStatus_(){ return json_({ ok:true, status: readAll_('PushStatus') }); }

// ── Swadhyay daily log ───────────────────────────────────────────────────────
function doSaveSwadhyay_(p){
  var devoteeId = String(p.devoteeId || '').trim();
  var date = String(p.date || '').trim();
  if(!devoteeId || !date) return json_({ ok:false, error:'devoteeId and date required' });
  var key = devoteeId + '|' + date;
  var now = new Date().toISOString();
  var existing = findRow_('Swadhyay', 'key', key);
  var row = {
    key: key, devoteeId: devoteeId, mobile: String(p.mobile||''), name: String(p.name||''), date: date,
    bhajanMin: Number(p.bhajanMin)||0, bhajanTime: String(p.bhajanTime||''),
    listenMin: Number(p.listenMin)||0, readMin: Number(p.readMin)||0,
    createdOn: now, updatedOn: now
  };
  if(existing > 0){
    // keep original createdOn
    var curCreated = tab_('Swadhyay').getRange(existing, HEADERS.Swadhyay.indexOf('createdOn')+1).getValue();
    row.createdOn = curCreated || now;
    tab_('Swadhyay').getRange(existing,1,1,HEADERS.Swadhyay.length).setValues([rowFromObj_('Swadhyay', row)]);
  } else {
    appendRows_('Swadhyay', [row]);
  }
  return json_({ ok:true, row: row });
}
// Return a devotee's own entries (most recent first). With all=1 (admin), returns everyone's.
function doGetSwadhyay_(p){
  var all = readAll_('Swadhyay');
  if(String(p.all||'') !== '1'){
    var id = String(p.devoteeId||'');
    all = all.filter(function(r){ return String(r.devoteeId) === id; });
  }
  all.sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); });
  return json_({ ok:true, entries: all.slice(0, Number(p.limit)||120) });
}

// Daily 8 PM reminder (Asia/Kolkata). Run installSwadhyayReminder() ONCE in the
// editor to schedule it; it pushes to every device that enabled notifications.
function swadhyayReminder_(){
  try { sendPush_('🙏 Swadhyay time', 'How much Bhajan, Shravan & Vachan did you do today? Tap to add — it takes 10 seconds.', 'all', { type:'swadhyay' }); }
  catch(e){ Logger.log('swadhyay reminder failed: ' + e); }
}
function installSwadhyayReminder(){
  // Remove any existing copy first so re-running doesn't stack duplicates.
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction() === 'swadhyayReminder_') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('swadhyayReminder_').timeBased().atHour(20).everyDays(1).create();
  Logger.log('Swadhyay 8 PM daily reminder installed.');
}

function doGetAnnouncements_(){
  var list = readAll_('Announcements');
  list.sort(function(a,b){ return String(b.createdOn).localeCompare(String(a.createdOn)); });
  return json_({ ok:true, announcements: list.slice(0, 50) });
}

// Create an announcement: save it, then push it to every matching device.
function doCreateAnnouncement_(p){
  var id = 'ANN-' + Date.now().toString(36);
  var rec = {
    id: id,
    title: String(p.title || '').slice(0, 120),
    body: String(p.body || '').slice(0, 2000),
    audience: (['all','staff','devotees'].indexOf(p.audience) >= 0 ? p.audience : 'all'),
    createdBy: String(p.createdBy || ''),
    createdOn: new Date().toISOString(),
    sentCount: 0
  };
  var sent = 0;
  try { sent = sendPush_(rec.title, rec.body, rec.audience, { announcementId: id }); } catch(e) { /* save even if push fails */ }
  rec.sentCount = sent;
  appendRows_('Announcements', [rec]);
  return json_({ ok:true, id:id, sent:sent });
}

// Mint a short-lived OAuth access token for the FCM HTTP v1 API from the stored
// service-account key (signed JWT → Google token endpoint).
function fcmAccessToken_(sa){
  var now = Math.floor(Date.now()/1000);
  var header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  var claim = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  var toSign = header + '.' + claim;
  var sig = Utilities.computeRsaSha256Signature(toSign, sa.private_key);
  var jwt = toSign + '.' + Utilities.base64EncodeWebSafe(sig);
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true
  });
  var data = JSON.parse(res.getContentText());
  if(!data.access_token) throw new Error('FCM auth failed: ' + res.getContentText());
  return data.access_token;
}

// Send a push to every device whose audience matches. Returns how many were sent.
// Prunes tokens FCM reports as permanently invalid (UNREGISTERED / NOT_FOUND).
function sendPush_(title, body, audience, data){
  var saRaw = PropertiesService.getScriptProperties().getProperty('FCM_SERVICE_ACCOUNT');
  if(!saRaw) throw new Error('FCM_SERVICE_ACCOUNT not set');
  var sa = JSON.parse(saRaw);
  var token = fcmAccessToken_(sa);
  var url = 'https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send';

  var staffMobiles = {}; readAll_('Users').forEach(function(u){ staffMobiles[normMob_(u.mobile)] = true; });
  var rows = readAll_('PushTokens');
  var targets = rows.filter(function(r){
    if(audience === 'all') return true;
    var isStaff = !!staffMobiles[normMob_(r.mobile)];
    return audience === 'staff' ? isStaff : !isStaff;
  });
  if(!targets.length) return 0;

  var msgData = { type: 'announcement' };
  if(data) for(var k in data) msgData[k] = String(data[k]);

  var sent = 0, toDelete = [];
  // UrlFetchApp.fetchAll batches the HTTP calls so hundreds of devices stay fast.
  for(var i=0;i<targets.length;i+=100){
    var chunk = targets.slice(i, i+100);
    var reqs = chunk.map(function(r){
      return {
        url: url, method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true,
        payload: JSON.stringify({ message: {
          token: r.token,
          notification: { title: title, body: body },
          data: msgData,
          android: { priority: 'high' }
        }})
      };
    });
    var resps = UrlFetchApp.fetchAll(reqs);
    for(var j=0;j<resps.length;j++){
      var code = resps[j].getResponseCode();
      if(code === 200) sent++;
      else if(code === 404 || code === 400){
        var txt = resps[j].getContentText();
        if(/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(txt)) toDelete.push(chunk[j].token);
      }
    }
  }
  // Remove dead tokens so the list stays clean.
  toDelete.forEach(function(tok){ var rn = findRow_('PushTokens','token',tok); if(rn>0) try{ tab_('PushTokens').deleteRow(rn); }catch(e){} });
  return sent;
}
function normMob_(m){ return String(m||'').replace(/\D/g,'').slice(-10); }

// Editor helper: send yourself a test push to confirm the FCM setup works.
function testPush(){ Logger.log('sent to ' + sendPush_('Test push', 'If you see this, FCM works 🎉', 'all', {})); }

// RUN ONCE from the editor to grant the "connect to an external service" permission
// (needed to call FCM). Approve the prompt; afterwards push works from the web app.
function authorizeFcm(){
  var sa = JSON.parse(PropertiesService.getScriptProperties().getProperty('FCM_SERVICE_ACCOUNT'));
  var tok = fcmAccessToken_(sa);
  Logger.log('FCM OK — minted access token: ' + String(tok).slice(0,16) + '…');
}


/** RUN ONCE from the editor to grant the Drive permission (like testMail). */
function authorizeDrive(){
  var pf = photoFolder_();
  var cf = challanFolder_();
  Logger.log('Drive OK — profile-photo id: ' + pf.getId() + ' | ghari-challan id: ' + cf.getId());
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
  ['Users','Devotees','Sabhas','Attendance','Followups','Thoughts','Areas','Activity','Changes','GhariProducts','GhariOrders','GhariPurchases','PushTokens','Announcements','PushStatus','Swadhyay'].forEach(function(n){ tab_(n); migrateHeaders_(n); });
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
      sabhas:readAll_('Sabhas'), thoughts:readAll_('Thoughts'), attendance:readAll_('Attendance'), followups:readAll_('Followups'), areas:readAll_('Areas'),
      announcements:(function(){ try{ var l=readAll_('Announcements'); l.sort(function(a,b){return String(b.createdOn).localeCompare(String(a.createdOn));}); return l.slice(0,50);}catch(e){return [];} })() });
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
    // ── Ghari Seva ───────────────────────────────────────────────────────────
    // All ghari writes are IDEMPOTENT upserts keyed by id/sku, so the client's
    // durable offline outbox can safely replay an op whose ack was lost without
    // ever creating a duplicate row (critical: this module handles money).
    if(action==='ghariBootstrap') return json_({ ok:true, products: readAll_('GhariProducts'), orders: readAll_('GhariOrders'), purchases: readAll_('GhariPurchases') });
    if(action==='ghariUpsertOrder')   return doGhariUpsertOrder_(p);
    if(action==='ghariUpsertProduct') return doGhariUpsert_('GhariProducts', p.row || {}, 'sku');
    if(action==='ghariDeleteOrder')   return doGhariDelete_('GhariOrders', p.id, 'id');
    if(action==='ghariDeleteProduct') return doGhariDelete_('GhariProducts', p.sku, 'sku');
    if(action==='ghariUpsertPurchase') return doGhariUpsert_('GhariPurchases', p.row || {}, 'id');
    if(action==='ghariDeletePurchase') return doGhariDelete_('GhariPurchases', p.id, 'id');
    if(action==='ghariImportOrders'){ var _r=p.rows||[]; if(_r.length) appendRows_('GhariOrders', _r); return json_({ ok:true, count:_r.length }); }
    if(action==='uploadPhoto') return doUploadPhoto_(p);
    if(action==='uploadChallan') return doUploadChallan_(p);
    if(action==='remapFamilyIds') return doRemapFamilyIds_(p);
    if(action==='registerPushToken') return doRegisterPushToken_(p);
    if(action==='getAnnouncements') return doGetAnnouncements_();
    if(action==='createAnnouncement') return doCreateAnnouncement_(p);
    if(action==='logPushStatus') return doLogPushStatus_(p);
    if(action==='getPushStatus') return doGetPushStatus_();
    if(action==='saveSwadhyay') return doSaveSwadhyay_(p);
    if(action==='getSwadhyay') return doGetSwadhyay_(p);
    if(action==='clearBase64Photos') return doClearBase64Photos_();
    if(action==='migrateBase64Photos') return doMigrateBase64Photos_();
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
  var cur={ mobile:p.mobile, pin:'', password:'', role:'Devotee', name:'Satsangi Devotee', modules:'' };
  if(rn>0){ var v=sh.getRange(rn,1,1,HEADERS.Users.length).getValues()[0];
    HEADERS.Users.forEach(function(h,i){ cur[h]=v[i]; }); }
  var row={
    mobile:p.mobile,
    pin: (p.pin!==undefined && p.pin!=='') ? p.pin : cur.pin,
    password: (p.password!==undefined && p.password!=='') ? p.password : cur.password,
    role: p.role || cur.role || 'Devotee',
    name: p.name || cur.name || 'Satsangi Devotee',
    modules: (p.modules!==undefined) ? p.modules : (cur.modules||'')
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

// Idempotent upsert for the Ghari collections: find the row by its key (id/sku)
// and overwrite it, else append. A LockService guard serializes concurrent
// writes so two near-simultaneous saves can't both append the same id. Because
// the key is client-generated and stable, replaying a lost op is a no-op update
// rather than a duplicate — no money row is ever doubled or lost.
function doGhariUpsert_(collection, row, keyField){
  var lock=LockService.getScriptLock(); try{ lock.waitLock(20000); }catch(e){}
  try{
    if(!row || !row[keyField]) return json_({ ok:false, error:'missing '+keyField });
    var rn=findRow_(collection, keyField, row[keyField]);
    if(rn>0) tab_(collection).getRange(rn,1,1,HEADERS[collection].length).setValues([rowFromObj_(collection,row)]);
    else appendRows_(collection,[row]);
    return json_({ ok:true });
  } finally { try{ lock.releaseLock(); }catch(e){} }
}

// Idempotent order upsert that ALSO emails the mandal on a brand-new order (when
// the client asks via notify:true and mail is globally on). Email fires only on
// INSERT (rn<0), so a replayed op or a later edit never re-sends — protecting the
// Gmail quota. The 2025 bulk import uses ghariImportOrders instead (no email).
function doGhariUpsertOrder_(p){
  var row = p.row || {};
  var lock=LockService.getScriptLock(); try{ lock.waitLock(20000); }catch(e){}
  try{
    if(!row.id) return json_({ ok:false, error:'missing id' });
    var rn=findRow_('GhariOrders','id',row.id);
    var isNew = rn<0;
    if(rn>0) tab_('GhariOrders').getRange(rn,1,1,HEADERS.GhariOrders.length).setValues([rowFromObj_('GhariOrders',row)]);
    else appendRows_('GhariOrders',[row]);
    // Email the mandal on add / edit / delete (delete = soft-void). The client
    // asks via notify:true and passes the intended act; a replay of the same op
    // is de-duped by a per-(id, updatedOn, act) key so a retry never re-sends.
    if((p.notify===true || p.notify==='true') && mailEnabled_()){
      var act = p.act || (isNew ? 'INSERT' : (String(row.status).toLowerCase()==='void' ? 'DELETE' : 'UPDATE'));
      var key = 'O:'+row.id+':'+(row.updatedOn||'')+':'+act;
      if(emailOnce_(key)){ try{ sendGhariOrderMail_(row, act); }catch(e){} }
    }
    return json_({ ok:true });
  } finally { try{ lock.releaseLock(); }catch(e){} }
}

// Returns true the first time a given email key is seen, false on repeats — so a
// replayed/offline-retried write never emails twice. Keeps the last ~200 keys.
function emailOnce_(key){
  try{
    var props=PropertiesService.getScriptProperties();
    var arr; try{ arr=JSON.parse(props.getProperty('ghariMailKeys')||'[]'); }catch(e){ arr=[]; }
    if(arr.indexOf(key)>=0) return false;
    arr.push(key); if(arr.length>200) arr=arr.slice(arr.length-200);
    props.setProperty('ghariMailKeys', JSON.stringify(arr));
    return true;
  }catch(e){ return true; } // never let the de-dup store block a notification
}

// Pretty HTML notification for a new Ghari order.
function sendGhariOrderMail_(row, act){
  act = String(act||'INSERT').toUpperCase();
  var label = act==='DELETE' ? 'Order deleted' : (act==='UPDATE' ? 'Order updated' : 'New order');
  var band  = act==='DELETE' ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : (act==='UPDATE' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#FF9D52,#E56F18)');
  var who   = (act==='DELETE' ? (row.updatedBy||row.createdBy) : (act==='UPDATE' ? row.updatedBy : row.createdBy)) || '';
  var items=[]; try{ items=JSON.parse(row.itemsJson||'[]'); }catch(e){}
  var itemRows = items.map(function(it){
    return '<tr><td style="padding:6px 12px;border-bottom:1px solid #F0E6DC;font-size:13px;color:#26303B">'+(it.qty)+'× '+(it.name||'')+' '+(it.size||'')+'</td>'
      +'<td style="padding:6px 12px;border-bottom:1px solid #F0E6DC;font-size:13px;color:#26303B;text-align:right">₹'+((it.qty||0)*(it.unitPrice||0))+'</td></tr>';
  }).join('');
  var bal = (Number(row.total)||0) - (Number(row.paymentReceived)||0);
  var payLine = bal>0 ? ('Balance due ₹'+bal) : ('Paid'+(row.paymentType?(' · '+row.paymentType):''));
  var html = ''
    + '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#FBF5EF;padding:18px;border-radius:16px">'
    + '<div style="background:'+band+';color:#fff;padding:16px 20px;border-radius:14px 14px 0 0">'
    +   '<div style="font-size:11px;font-weight:800;letter-spacing:1px;opacity:.9">AKSHAR CONNECT · GHARI SEVA '+(row.season||'')+'</div>'
    +   '<div style="font-size:20px;font-weight:800;margin-top:2px">🪔 '+(row.customerName||'Order')+'</div>'
    +   '<div style="font-size:12px;opacity:.95;margin-top:2px">'+label+(who?(' by '+who):'')+'</div>'
    + '</div>'
    + '<table style="width:100%;border-collapse:collapse;background:#fff">'+itemRows+'</table>'
    + '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:0 0 14px 14px;overflow:hidden">'
    +   '<tr><td style="padding:8px 12px;font-size:13px;font-weight:800;color:#26303B">Total</td><td style="padding:8px 12px;font-size:15px;font-weight:900;color:#E56F18;text-align:right">₹'+(row.total||0)+'</td></tr>'
    +   '<tr><td style="padding:4px 12px 8px;font-size:12px;color:#7A7369" colspan="2">'+payLine+' · '+(row.delivered?'Delivered':'Not delivered')+(row.karyakarta?(' · via '+row.karyakarta):'')+(row.customerMobile?(' · 📱 '+row.customerMobile):'')+(row.remarks?(' · '+row.remarks):'')+'</td></tr>'
    + '</table>'
    + '<div style="color:#9b9183;font-size:11px;text-align:center;margin-top:12px">Sent automatically by Akshar Connect</div>'
    + '</div>';
  sendMail_('Ghari Seva: '+label+' — '+(row.customerName||'')+' — ₹'+(row.total||0), label+': '+(row.customerName||'')+' ₹'+(row.total||0), null, html);
}

// Delete one Ghari row by key. Used for catalog items (products admin removes)
// and for cleanup. Orders in the app are soft-voided, not deleted, so this is
// not reachable from normal order flow. Missing key is a safe no-op.
function doGhariDelete_(collection, keyVal, keyField){
  var lock=LockService.getScriptLock(); try{ lock.waitLock(20000); }catch(e){}
  try{
    if(keyVal===undefined || keyVal===null || keyVal==='') return json_({ ok:false, error:'missing '+keyField });
    var rn=findRow_(collection, keyField, keyVal);
    if(rn>0) tab_(collection).deleteRow(rn);
    return json_({ ok:true });
  } finally { try{ lock.releaseLock(); }catch(e){} }
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
