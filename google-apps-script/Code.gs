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
  Sabhas:     ['id','title','date','time','venue','presentCount','totalCount','status','type','description','tags','outcomes'],
  Attendance: ['id','sabhaId','devoteeId','present','timestamp','markedBy'],
  Followups:  ['id','eventId','devoteeId','assignedTo','call','inPerson','message','outcome','remark','contactedOn','contactedBy'],
  Thoughts:   ['id','author','thought','date'],
  Areas:      ['name','number','notes'],
  Activity:   ['ts','actor','actorMobile','action','target','detail','device'],
  Changes:    ['ts','action','collection','summary','emailed'],
  // Runtime exception log — every error a user hits is stored here (as well as
  // emailed) so it can be pulled into the codebase and fixed. status ∈ open|resolved.
  ErrorLog:   ['id','time','user','mobile','message','page','stack','ua','status','resolvedBy','resolvedOn'],
  // Push-notification delivery log. One PushLog row per notification sent (what it
  // was about + totals); one PushRecipients row per device it reached, flipped to
  // clicked='yes' when that person taps it.
  PushLog:        ['id','title','body','audience','type','sentCount','clickCount','createdBy','createdOn'],
  PushRecipients: ['notifId','devoteeId','name','mobile','platform','sentOn','clicked','clickedOn'],
  // ── Ghari Seva (fundraising ledger) ──────────────────────────────────────
  // Catalog of sellable items. `category` ∈ ghee|noghee|sf|bhusu. Prices are
  // editable (they change year to year), so each ORDER snapshots the unit price.
  GhariProducts: ['sku','name','size','category','unitPrice','costPrice','sortOrder','active'],
  // One row per customer order. `itemsJson` is the authoritative line-item list
  // (each line snapshots its unit price); the flattened amount columns are a
  // human-readable denormalization so the Sheet still reads like a ledger.
  // `status` ∈ active|void (soft delete — orders are never hard-deleted: money).
  GhariOrders: ['id','orderNo','season','customerName','customerMobile','devoteeId','karyakarta','karyakartaId','itemsJson','itemsSummary','subOrdersJson','total','withGheeAmt','withoutGheeAmt','sugarFreeAmt','bhusuAmt','delivered','deliveredBoxes','deliveryDate','paymentReceived','balance','paymentType','status','remarks','createdBy','createdOn','updatedBy','updatedOn','cashReceived','gpayReceived'],
  // Procurement (the "buy" side): boxes bought from a supplier on a date, with an
  // optional cost and a challan (bill/delivery note) photo URL. `boxes` = total
  // boxes across items; `itemsJson` holds per-item qty. status ∈ active|void.
  GhariPurchases: ['id','season','date','supplier','itemsJson','itemsSummary','boxes','amount','challan','remarks','status','createdBy','createdOn','updatedBy','updatedOn'],
  GhariStock: ['id','season','date','karyakarta','karyakartaId','itemsJson','itemsSummary','boxes','remarks','status','createdBy','createdOn','updatedBy','updatedOn'],
  // Mandal payments (the "pay" side of procurement): money we PAID to a mandal /
  // supplier, independent of any single purchase bill. Grouped by `supplier`, the
  // app shows each mandal's total bought (Σ purchase cost) vs total paid vs
  // remaining. `method` ∈ Cash|G-Pay|Cheque|Bank|Other. status ∈ active|void.
  GhariMandalPayments: ['id','season','date','supplier','amount','method','remarks','status','createdBy','createdOn','updatedBy','updatedOn'],
  // ── Ghari Leaders (buyer → leader assignment) ────────────────────────────
  // A STANDALONE map of each Ghari buyer to one of the fixed MandalLeaders, with a
  // snapshot of their season totals (kg/orders/amount) that staff can edit by hand.
  // Deliberately decoupled from GhariOrders — this never reads or writes order
  // money; it's an organising layer ("who belongs to which leader"). Seeded once
  // from the final GHARI SALES 2026 workbook. leaderId references MandalLeaders.id.
  GhariBuyers: ['id','buyer','leaderId','leaderName','ghariKg','orders','amount','updatedBy','updatedOn'],
  // Per-leader Target (kg) for the Mandal Leaders summary. Done = sum of that
  // leader's buyers' ghariKg (computed on the client), so only the target is stored.
  GhariLeaderTargets: ['leaderId','target','updatedBy','updatedOn'],
  // ── Adajan Mandal Leaderboard ────────────────────────────────────────────
  // A reusable progress board for any seva (Ghari now, more later). The mandal's
  // leaders are fixed, so they are seeded ONCE here and every new board prefills
  // from them — the user only does the Target/Done data entry.
  // `MandalLeaders` = the fixed roster (id is stable; editable via add/edit/delete).
  MandalLeaders: ['id','name','sortOrder','active'],
  // One row per board/seva (e.g. "Chandi Padvo - Ghari Seva"). `unit` is the
  // measure (Kg, ₹, count…). status ∈ active|archived.
  LeaderBoards:  ['id','title','subtitle','unit','status','createdBy','createdOn','updatedBy','updatedOn'],
  // One row per leader PER board (its target + done). Decoupled from MandalLeaders
  // so a leader can be renamed/removed later without touching past boards.
  LeaderEntries: ['id','boardId','leaderId','leaderName','target','done','sortOrder'],
  // Day-wise seva log — one row per challan line committed (leader + amount on a
  // date). The leader's `done` total on LeaderEntries is the running sum of these,
  // so the user only adds the day's lines and the app keeps the totals + history.
  LeaderLogs: ['id','boardId','leaderId','leaderName','date','amount','note','createdBy','createdOn'],
  // One row per device registered for push. Keyed by the FCM token. A devotee /
  // staff member can have several devices (several rows).
  PushTokens: ['token','devoteeId','mobile','name','platform','updatedOn'],
  // Admin-posted announcements, shown in-app and sent as a push notification.
  // audience ∈ all | staff | devotees (who it targets).
  Announcements: ['id','title','body','audience','createdBy','createdOn','sentCount'],
  NotifReads: ['id','announcementId','title','mobile','name','readOn'],
  // Each person's notification-permission response (so admins can see who allowed /
  // rejected). Keyed by devoteeId (or mobile). status ∈ granted|denied|default|unsupported.
  PushStatus: ['key','devoteeId','mobile','name','status','platform','updatedOn'],
  // Daily Swadhyay log — one row per devotee per day. Minutes of Bhajan (with the
  // time of day), Shravan (listening to discourses) and Vachan (reading).
  Swadhyay: ['key','devoteeId','mobile','name','date','bhajanMin','bhajanTime','listenMin','readMin','createdOn','updatedOn'],
  // Seva log by karyakartas (Sevak/Admin). Each visit: date, from/to time, what was
  // done, and the devotee whose home was visited — shown on both profiles.
  Seva: ['id','karyakartaId','karyakartaName','karyakartaMobile','date','fromTime','toTime','category','work','visitedId','visitedName','companionsJson','planned','createdBy','createdOn','updatedBy','updatedOn'],
  // Calendar plans — a devotee's planned/done activity on a day. type ∈ seva|bhajan|
  // katha; status ∈ planned|done. "Done" markers also come from Swadhyay & Seva.
  CalPlan: ['id','devoteeId','date','type','note','status','createdOn','updatedOn'],
  // ── Feed (community photo/video posts) ─────────────────────────────────────
  // One row per post. `mediaJson` = JSON array of { type:'image'|'video', url }.
  // Media lives in Drive (akshar-connect/feed-media) — only the URL is stored.
  // `status` ∈ active|removed (soft delete — posts are never hard-deleted).
  FeedPosts: ['id','authorId','authorName','authorMobile','caption','description','mediaJson','likeCount','commentCount','createdOn','status'],
  // One row per like. id = postId + '|' + devoteeId (idempotent — one like per person).
  FeedLikes: ['id','postId','devoteeId','name','createdOn'],
  // One row per comment. status ∈ active|removed (soft delete).
  FeedComments: ['id','postId','authorId','authorName','text','createdOn','status'],
  // ── Email (staff → devotees) ───────────────────────────────────────────────
  // One row per sent email campaign (for the history view).
  EmailCampaigns: ['id','subject','body','audience','recipientCount','sentCount','failedCount','createdBy','createdOn'],
  // Reusable, staff-editable email templates.
  EmailTemplates: ['id','name','subject','body','createdBy','createdOn','updatedBy','updatedOn'],
  // ── Ghari audit log (money — every change is recorded, never silently lost) ──
  // entity ∈ order|purchase|product. action ∈ create|update|void|delete|revert.
  // changesJson = [{field,before,after}]; beforeJson/afterJson = full row snapshots
  // (beforeJson lets an admin revert to the prior state).
  GhariLog: ['id','ts','entity','entityId','action','actor','changesJson','beforeJson','afterJson'],
  // ── Bus Seva (bus bookings for a trip/occasion, e.g. Sharad Purnima) ────────
  // One row per bus trip/occasion. Bookings reference it by eventId. status ∈
  // active|void (soft delete — an event is never hard-deleted so its bookings
  // are recoverable).
  BusEvents: ['id','title','date','destination','remarks','status','createdBy','createdOn','updatedBy','updatedOn'],
  // One booking within an event. A booking can seat several people together, so
  // `passengersJson` = JSON array of { name, devoteeId }. `seatType` describes the
  // berth (single_sofo|double_sofo|single_nosofo|double_nosofo|sharing_sofo).
  // Display seat numbers are a running per-event sequence, computed on the client.
  // status ∈ active|void.
  BusBookings: ['id','eventId','passengersJson','passengerCount','seatType','mobile','karyakarta','karyakartaId','remarks','status','createdBy','createdOn','updatedBy','updatedOn'],
  // Per-karyakarta quick tally for an event (the simple Single/Double/Bhakto count
  // sheet, independent of the detailed per-passenger bookings above). One row per
  // karyakarta per event. status ∈ active|void.
  BusTally: ['id','eventId','karyakarta','karyakartaId','single','double','bhakto','remarks','status','createdBy','createdOn','updatedBy','updatedOn'],
  // ── Vato (daily Gujarati/English teachings, maintained by hand in the sheet) ─
  Vato: ['SN','Gujarati','English'],
  // ── Devotee edit audit (old↔new on every add/edit/delete, revertible) ───────
  // action ∈ create|update|delete|revert. before/afterJson = full row snapshots.
  DevoteeLog: ['id','ts','devoteeId','name','action','actor','changesJson','beforeJson','afterJson']
};
// Bump when HEADERS change so ensureSheets_ re-runs the schema migration once.
var SCHEMA_VERSION = '2026-10-28-ghari-split-payment';

// Default email templates — seeded once when the EmailTemplates tab is empty.
var SEED_EMAIL_TEMPLATES = [
  { id:'TPL-sabha', name:'Sabha Invitation', subject:'You are invited to this week\'s Sabha 🙏', body:'Jai Swaminarayan {firstName},\n\nWe warmly invite you to our weekly Sabha this Sunday at the Mandal. Your presence adds to the divine atmosphere.\n\n🕉️ Day: Sunday\n🕒 Time: 5:00 PM\n📍 Venue: Swaminarayan Mandal, Adajan\n\nPlease do join us with your family.\n\nJai Swaminarayan 🙏', createdOn:new Date().toISOString() },
  { id:'TPL-festival', name:'Festival Greeting', subject:'Festival greetings from Akshar Connect ✨', body:'Jai Swaminarayan {firstName},\n\nMay this festival fill your home with Maharaj and Swami\'s blessings, happiness and good health.\n\nWarm wishes to you and your family. 🪔\n\nJai Swaminarayan 🙏', createdOn:new Date().toISOString() },
  { id:'TPL-seva', name:'Seva Reminder', subject:'A gentle reminder for upcoming Seva', body:'Jai Swaminarayan {firstName},\n\nThis is a gentle reminder about the upcoming seva. Your support means a lot to the Mandal parivar.\n\nPlease reach out if you can help.\n\nJai Swaminarayan 🙏', createdOn:new Date().toISOString() },
  { id:'TPL-thanks', name:'Thank You', subject:'Thank you for your seva 🙏', body:'Jai Swaminarayan {firstName},\n\nThank you for your wonderful seva and dedication. Maharaj and Swami are surely pleased with your efforts.\n\nWith gratitude,\nAkshar Connect', createdOn:new Date().toISOString() },
  { id:'TPL-notice', name:'General Notice', subject:'An update from the Mandal', body:'Jai Swaminarayan {firstName},\n\n[Write your update here.]\n\nJai Swaminarayan 🙏', createdOn:new Date().toISOString() }
];

// Columns stored/returned as booleans (coerced on read).
var BOOL_COLS = { present:true, call:true, inPerson:true, message:true, delivered:true, active:true };
// Exceptions: a column named like a bool column above but which is FREE TEXT in a
// specific sheet, keyed as 'Sheet.column' — these must never be coerced to a
// boolean. (ErrorLog.message is the error text, not a Followups-style
// contacted-via-message flag; coercing it blanked every stored error message.)
var BOOL_COL_EXCEPTIONS = { 'ErrorLog.message': true };

// The installed app URL — tapping a push notification opens this (not the domain root).
var APP_URL = 'https://denispatel01.github.io/akshar-connect/';

// External attendance sheet (maintained by another app). We read it READ-ONLY and
// only surface rows for OUR group (Reference Karyakarta contains this name).
var ATTENDANCE_SHEET_ID = '1j62Jpf8dM4xdPD1afSrB26TMx5ecd6BAbyjD8ljh1zI';
var ATTENDANCE_GROUP_KARYAKARTA = 'digesh'; // normalized substring match

// Where all notification mail goes. Change here only.
var MAIL_TO = 'aksharconnect01@gmail.com';
// Extra recipients for the Ghari delivery reminder emails (comma-separated, added
// to MAIL_TO). Requested by the admin so a second person also gets the reminders.
var GHARI_REMINDER_TO = 'aksharconnect01@gmail.com,adpatel2807@gmail.com';
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

// Backfill blank family-member addresses from their family head (Primary member).
// Creating a devotee already copies the head's address onto a new member; this does
// the same for EXISTING members whose address is still empty. Only blank addresses
// are touched — a member with their own address is never overwritten. A timestamped
// backup of the Devotees tab is saved first, so it is fully reversible.
// p.dryRun = '1' returns the count WITHOUT writing (for a confirmation preview).
function doBackfillFamilyAddresses_(p){
  var sh = tab_('Devotees');
  var last = sh.getLastRow(); if(last < 2) return json_({ ok:true, changed:0 });
  var H = HEADERS.Devotees;
  var fIdx = H.indexOf('familyId'), aIdx = H.indexOf('address'), tIdx = H.indexOf('type');
  if(fIdx < 0 || aIdx < 0) return json_({ ok:false, error:'missing familyId/address column' });
  var rng = sh.getRange(2, 1, last-1, H.length);
  var vals = rng.getValues();
  var trim_ = function(v){ return String(v == null ? '' : v).trim(); };
  // Head address per family: prefer the Primary member's address; fall back to any
  // non-blank address in the family so members still inherit when the head's is empty.
  var headAddr = {}, anyAddr = {};
  for(var i=0;i<vals.length;i++){
    var fam = trim_(vals[i][fIdx]); if(!fam) continue;
    var addr = trim_(vals[i][aIdx]); if(!addr) continue;
    var isHead = tIdx >= 0 ? (trim_(vals[i][tIdx]) === 'Primary') : false;
    if(isHead && !headAddr[fam]) headAddr[fam] = addr;
    if(!anyAddr[fam]) anyAddr[fam] = addr;
  }
  var changed = 0;
  for(var j=0;j<vals.length;j++){
    var f = trim_(vals[j][fIdx]); if(!f) continue;
    if(trim_(vals[j][aIdx])) continue; // already has an address — never overwrite
    var src = headAddr[f] || anyAddr[f];
    if(src){ vals[j][aIdx] = src; changed++; }
  }
  if(String(p && p.dryRun || '') === '1') return json_({ ok:true, changed:changed, dryRun:true });
  if(changed){
    try { sh.copyTo(ss_()).setName('Devotees_bak_addr_' + Utilities.formatDate(new Date(),'GMT','yyyyMMdd_HHmmss')); } catch(e){}
    rng.setValues(vals);
  }
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

// ── Seva log ─────────────────────────────────────────────────────────────────
function doSaveSeva_(p){
  var now = new Date().toISOString();
  var id = String(p.id || '') || ('SEVA-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6));
  var row = {
    id: id,
    karyakartaId: String(p.karyakartaId||''), karyakartaName: String(p.karyakartaName||''), karyakartaMobile: String(p.karyakartaMobile||''),
    date: String(p.date||''), fromTime: String(p.fromTime||''), toTime: String(p.toTime||''),
    category: String(p.category||''), work: String(p.work||''),
    visitedId: String(p.visitedId||''), visitedName: String(p.visitedName||''),
    companionsJson: String(p.companionsJson||'[]'),
    planned: (p.planned === true || String(p.planned||'') === '1' || String(p.planned||'') === 'true') ? '1' : '',
    createdBy: String(p.createdBy||''), createdOn: now, updatedBy: String(p.createdBy||''), updatedOn: now
  };
  var existing = findRow_('Seva', 'id', id);
  if(existing > 0){
    var cIdx = HEADERS.Seva.indexOf('createdOn')+1, bIdx = HEADERS.Seva.indexOf('createdBy')+1;
    row.createdOn = tab_('Seva').getRange(existing, cIdx).getValue() || now;
    row.createdBy = tab_('Seva').getRange(existing, bIdx).getValue() || row.createdBy;
    tab_('Seva').getRange(existing,1,1,HEADERS.Seva.length).setValues([rowFromObj_('Seva', row)]);
  } else {
    appendRows_('Seva', [row]);
  }
  return json_({ ok:true, row: row });
}
function doGetSeva_(p){
  var all = readAll_('Seva');
  var kid = String(p.karyakartaId||''), vid = String(p.visitedId||'');
  if(String(p.all||'') !== '1'){
    all = all.filter(function(r){
      var inComp = kid && String(r.companionsJson||'').indexOf('"'+kid+'"') >= 0;
      return (kid && String(r.karyakartaId) === kid) || inComp || (vid && String(r.visitedId) === vid);
    });
  }
  all.sort(function(a,b){ return String(b.date+ (b.fromTime||'')).localeCompare(String(a.date+(a.fromTime||''))); });
  return json_({ ok:true, entries: all.slice(0, Number(p.limit)||300) });
}
function doDeleteSeva_(p){
  var r = findRow_('Seva','id',String(p.id||''));
  if(r > 0) tab_('Seva').deleteRow(r);
  return json_({ ok:true });
}

// ── Planned-seva reminders (push to everyone included) ───────────────────────
// A planned seva (planned='1') reminds its participants — the creator and every
// companion who is a devotee in the directory (guests have no mobile, so they're
// skipped) — on the MORNING of the seva and the EVENING BEFORE. Each (seva,
// window) reminds at most once, tracked in Script Properties.
// Set up once from the editor: run `setupSevaReminders`.
function sevaDateKey_(v){
  if(v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v||'').slice(0,10);
}
function ymdLocal_(d){ return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function sevaParticipantMobiles_(seva){
  var mobs = {};
  var km = normMob_(seva.karyakartaMobile || '');
  if(km) mobs[km] = true;
  var comps = [];
  try { comps = JSON.parse(seva.companionsJson || '[]'); } catch(e){ comps = []; }
  if(comps.length){
    var byId = {}; readAll_('Devotees').forEach(function(d){ byId[String(d.id)] = d; });
    comps.forEach(function(c){ var d = byId[String(c && c.id)]; var m = normMob_(d && d.mobile || ''); if(m) mobs[m] = true; });
  }
  return Object.keys(mobs);
}
function sevaRemindOnce_(key){
  var props = PropertiesService.getScriptProperties();
  var k = 'sevaReminded:' + key;
  if(props.getProperty(k)) return false;
  props.setProperty(k, '1');
  return true;
}
function sevaRemindersForDate_(dateStr, windowKey, whenWord){
  var rows = readAll_('Seva').filter(function(r){
    return String(r.planned||'') === '1' && sevaDateKey_(r.date) === dateStr;
  });
  var total = 0;
  rows.forEach(function(s){
    if(!sevaRemindOnce_(String(s.id) + ':' + windowKey + ':' + dateStr)) return;
    var who = (s.visitedName ? ("at " + s.visitedName + "'s home") : (s.category || 'Seva'));
    var time = [s.fromTime, s.toTime].filter(Boolean).join(' – ');
    var title = '🤝 Seva ' + whenWord;
    var body = who + (time ? (' · ' + time) : '') + (s.work ? (' — ' + String(s.work).slice(0,80)) : '');
    sevaParticipantMobiles_(s).forEach(function(m){ try { total += pushToMobile_(title, body, m, { type:'seva', sevaId: s.id }); } catch(e){} });
  });
  return total;
}
// Trigger target — runs ~8 AM: reminds participants of TODAY's planned sevas.
function sevaMorningReminders_(){ return sevaRemindersForDate_(ymdLocal_(new Date()), 'morning', 'today'); }
// Trigger target — runs ~6 PM: reminds of TOMORROW's planned sevas (evening before).
function sevaEveningReminders_(){ var t = new Date(); t.setDate(t.getDate() + 1); return sevaRemindersForDate_(ymdLocal_(t), 'eve', 'tomorrow'); }
// Run ONCE from the Apps Script editor to schedule the two daily reminder triggers.
function setupSevaReminders(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    var fn = t.getHandlerFunction();
    if(fn === 'sevaMorningReminders_' || fn === 'sevaEveningReminders_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sevaMorningReminders_').timeBased().atHour(8).everyDays(1).create();
  ScriptApp.newTrigger('sevaEveningReminders_').timeBased().atHour(18).everyDays(1).create();
  return 'Seva reminders scheduled: 8 AM (today) & 6 PM (evening before).';
}

// ── Calendar plans ───────────────────────────────────────────────────────────
function doSavePlan_(p){
  var now = new Date().toISOString();
  var id = String(p.id||'') || ('PLAN-' + Date.now().toString(36) + Math.random().toString(36).slice(2,5));
  var row = {
    id: id, devoteeId: String(p.devoteeId||''), date: String(p.date||''),
    type: String(p.type||''), note: String(p.note||''),
    status: (String(p.status||'planned') === 'done' ? 'done' : 'planned'),
    createdOn: now, updatedOn: now
  };
  var existing = findRow_('CalPlan','id',id);
  if(existing > 0){
    var cIdx = HEADERS.CalPlan.indexOf('createdOn')+1;
    row.createdOn = tab_('CalPlan').getRange(existing, cIdx).getValue() || now;
    tab_('CalPlan').getRange(existing,1,1,HEADERS.CalPlan.length).setValues([rowFromObj_('CalPlan', row)]);
  } else { appendRows_('CalPlan', [row]); }
  return json_({ ok:true, row: row });
}
function doGetPlans_(p){
  var id = String(p.devoteeId||'');
  var all = readAll_('CalPlan').filter(function(r){ return String(r.devoteeId) === id; });
  all.sort(function(a,b){ return String(a.date).localeCompare(String(b.date)); });
  return json_({ ok:true, plans: all });
}
function doDeletePlan_(p){
  var r = findRow_('CalPlan','id',String(p.id||''));
  if(r > 0) tab_('CalPlan').deleteRow(r);
  return json_({ ok:true });
}

// ── Feed module ────────────────────────────────────────────────────────────────
// Media (image/video) is uploaded to Drive under akshar-connect/feed-media and
// keeps its real file type, like a Ghari challan. Only the URL is stored on the post.
function feedFolder_(){
  var root = subFolder_(DriveApp.getRootFolder(), 'akshar-connect');
  return subFolder_(root, 'feed-media');
}
function doUploadFeedMedia_(p){
  try{
    var dataUri = String(p.dataUri || '');
    var m = /^data:([^;,]+)?/.exec(dataUri);
    var ct = (m && m[1]) ? m[1] : 'image/jpeg';
    var lc = ct.toLowerCase();
    var isVideo = lc.indexOf('video') >= 0;
    var ext = isVideo ? (lc.indexOf('webm') >= 0 ? 'webm' : (lc.indexOf('quicktime') >= 0 ? 'mov' : 'mp4'))
                      : (lc.indexOf('png') >= 0 ? 'png' : (lc.indexOf('webp') >= 0 ? 'webp' : 'jpg'));
    var blob = dataUriToBlob_(dataUri, (p.id || 'feed') + '_' + Date.now() + '.' + ext);
    if(!blob) return json_({ ok:false, error:'bad file data' });
    var file = feedFolder_().createFile(blob);
    try{ file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }catch(e){}
    var id = file.getId();
    // Images render inline via lh3; videos stream from the Drive direct-download URL.
    var url = isVideo ? ('https://drive.google.com/uc?export=download&id=' + id) : photoUrl_(id);
    return json_({ ok:true, id:id, url:url, type:ct, mediaType:(isVideo?'video':'image') });
  }catch(e){ return json_({ ok:false, error:String(e) }); }
}

function doCreatePost_(p){
  var now = new Date().toISOString();
  var id = String(p.id || '') || ('POST-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6));
  var media = '[]';
  try{ media = JSON.stringify(JSON.parse(String(p.mediaJson||'[]')).slice(0,10)); }catch(e){ media = '[]'; }
  var row = {
    id: id,
    authorId: String(p.authorId||''), authorName: String(p.authorName||'').slice(0,120), authorMobile: String(p.authorMobile||''),
    caption: String(p.caption||'').slice(0,200), description: String(p.description||'').slice(0,4000),
    mediaJson: media, likeCount: 0, commentCount: 0,
    createdOn: now, status: 'active'
  };
  appendRows_('FeedPosts', [row]);
  // Notify everyone a new post is up (keeps the Feed active).
  try {
    var hasMedia = false; try { hasMedia = JSON.parse(media).length > 0; } catch(e){}
    var body = (row.authorName || 'Someone') + (row.caption ? (': ' + row.caption) : (hasMedia ? ' shared a photo/video' : ' shared an update'));
    sendPush_('🌸 New post on the Feed', body.slice(0,180), 'all', { type:'feed', postId: id });
  } catch(e){}
  return json_({ ok:true, post: row });
}
// Paginated feed, newest first. `before` = createdOn cursor (exclusive). Returns
// active posts and, for the given devoteeId, which of them this person has liked.
function doGetFeed_(p){
  var all = readAll_('FeedPosts').filter(function(r){ return String(r.status||'active') !== 'removed'; });
  all.sort(function(a,b){ return String(b.createdOn).localeCompare(String(a.createdOn)); });
  var before = String(p.before||'');
  if(before) all = all.filter(function(r){ return String(r.createdOn) < before; });
  var limit = Number(p.limit) || 15;
  var page = all.slice(0, limit);
  var hasMore = all.length > limit;
  var liked = [];
  var did = String(p.devoteeId||'');
  if(did && page.length){
    var ids = {}; page.forEach(function(r){ ids[r.id] = true; });
    readAll_('FeedLikes').forEach(function(l){ if(String(l.devoteeId) === did && ids[l.postId]) liked.push(l.postId); });
  }
  return json_({ ok:true, posts: page, hasMore: hasMore, liked: liked });
}
// Edit a post's text (author or admin). Same author double-check as delete so a
// tampered call can't edit someone else's post. Media and counts are untouched.
function doEditPost_(p){
  var rn = findRow_('FeedPosts','id',String(p.id||''));
  if(rn < 1) return json_({ ok:false, error:'not found' });
  var sh = tab_('FeedPosts'); var H = HEADERS.FeedPosts;
  var authorIdCol = H.indexOf('authorId')+1;
  var curAuthor = String(sh.getRange(rn, authorIdCol).getValue()||'');
  if(String(p.isAdmin||'') !== '1' && curAuthor && String(p.requesterId||'') !== curAuthor)
    return json_({ ok:false, error:'not allowed' });
  sh.getRange(rn, H.indexOf('caption')+1).setValue(String(p.caption||'').slice(0,2000));
  sh.getRange(rn, H.indexOf('description')+1).setValue(String(p.description||'').slice(0,5000));
  return json_({ ok:true, post: readRowObj_('FeedPosts', rn) });
}
// Soft-delete a post (author or admin — enforced on the client; we double-check the
// authorId when `isAdmin` isn't set so a tampered call can't delete others' posts).
function doDeletePost_(p){
  var rn = findRow_('FeedPosts','id',String(p.id||''));
  if(rn < 1) return json_({ ok:false, error:'not found' });
  var sh = tab_('FeedPosts'); var H = HEADERS.FeedPosts;
  var authorIdCol = H.indexOf('authorId')+1;
  var curAuthor = String(sh.getRange(rn, authorIdCol).getValue()||'');
  if(String(p.isAdmin||'') !== '1' && curAuthor && String(p.requesterId||'') !== curAuthor)
    return json_({ ok:false, error:'not allowed' });
  sh.getRange(rn, H.indexOf('status')+1).setValue('removed');
  return json_({ ok:true });
}
// Toggle a like. Idempotent via id = postId|devoteeId. Returns the new liked state
// and the post's refreshed like count.
function doToggleLike_(p){
  var postId = String(p.postId||''), did = String(p.devoteeId||'');
  if(!postId || !did) return json_({ ok:false, error:'postId and devoteeId required' });
  var likeId = postId + '|' + did;
  var lrn = findRow_('FeedLikes','id',likeId);
  var want = String(p.on||'') === '1';
  if(want && lrn < 1){
    appendRows_('FeedLikes', [{ id: likeId, postId: postId, devoteeId: did, name: String(p.name||''), createdOn: new Date().toISOString() }]);
  } else if(!want && lrn > 0){
    tab_('FeedLikes').deleteRow(lrn);
  }
  // Recompute the count from the source of truth so it can never drift.
  var count = readAll_('FeedLikes').filter(function(l){ return String(l.postId) === postId; }).length;
  var prn = findRow_('FeedPosts','id',postId);
  if(prn > 0) tab_('FeedPosts').getRange(prn, HEADERS.FeedPosts.indexOf('likeCount')+1).setValue(count);
  return json_({ ok:true, liked: want, likeCount: count });
}
function doGetComments_(p){
  var postId = String(p.postId||'');
  var all = readAll_('FeedComments').filter(function(r){ return String(r.postId) === postId && String(r.status||'active') !== 'removed'; });
  all.sort(function(a,b){ return String(a.createdOn).localeCompare(String(b.createdOn)); });
  return json_({ ok:true, comments: all });
}
function doAddComment_(p){
  var postId = String(p.postId||'');
  var text = String(p.text||'').slice(0,1000).trim();
  if(!postId || !text) return json_({ ok:false, error:'postId and text required' });
  var row = {
    id: 'CMT-' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
    postId: postId, authorId: String(p.authorId||''), authorName: String(p.authorName||'').slice(0,120),
    text: text, createdOn: new Date().toISOString(), status: 'active'
  };
  appendRows_('FeedComments', [row]);
  var count = readAll_('FeedComments').filter(function(c){ return String(c.postId) === postId && String(c.status||'active') !== 'removed'; }).length;
  var prn = findRow_('FeedPosts','id',postId);
  if(prn > 0){
    tab_('FeedPosts').getRange(prn, HEADERS.FeedPosts.indexOf('commentCount')+1).setValue(count);
    // Notify the post's author that someone commented (unless they commented themselves).
    try {
      var post = readRowObj_('FeedPosts', prn);
      if(post.authorMobile && String(post.authorId) !== String(row.authorId)){
        pushToMobile_('💬 New comment on your post', (row.authorName || 'Someone') + ': ' + text.slice(0,100), post.authorMobile, { type:'feed', postId: postId });
      }
    } catch(e){}
  }
  return json_({ ok:true, comment: row, commentCount: count });
}
function doDeleteComment_(p){
  var rn = findRow_('FeedComments','id',String(p.id||''));
  if(rn < 1) return json_({ ok:false, error:'not found' });
  var sh = tab_('FeedComments'); var H = HEADERS.FeedComments;
  var authorIdCol = H.indexOf('authorId')+1;
  var curAuthor = String(sh.getRange(rn, authorIdCol).getValue()||'');
  if(String(p.isAdmin||'') !== '1' && curAuthor && String(p.requesterId||'') !== curAuthor)
    return json_({ ok:false, error:'not allowed' });
  var postId = String(sh.getRange(rn, H.indexOf('postId')+1).getValue()||'');
  sh.getRange(rn, H.indexOf('status')+1).setValue('removed');
  if(postId){
    var count = readAll_('FeedComments').filter(function(c){ return String(c.postId) === postId && String(c.status||'active') !== 'removed'; }).length;
    var prn = findRow_('FeedPosts','id',postId);
    if(prn > 0) tab_('FeedPosts').getRange(prn, HEADERS.FeedPosts.indexOf('commentCount')+1).setValue(count);
  }
  return json_({ ok:true });
}

// ── Email campaigns (staff → devotees) ───────────────────────────────────────
function personalizeEmail_(s, name, first){
  return String(s == null ? '' : s)
    .replace(/\{\s*name\s*\}/gi, name || '')
    .replace(/\{\s*firstName\s*\}/gi, first || name || '');
}
function emailHtmlBody_(text){
  var safe = String(text == null ? '' : text)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#fff">'
    + '<div style="background:linear-gradient(135deg,#E56F18,#FF862A);padding:22px 24px;border-radius:16px 16px 0 0">'
    + '<h1 style="margin:0;color:#fff;font-size:20px;font-weight:800">🙏 Akshar Connect</h1>'
    + '<p style="margin:4px 0 0;color:#ffe8d4;font-size:12px">Swaminarayan Mandal · Adajan, Surat</p></div>'
    + '<div style="padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 16px 16px;color:#222;font-size:15px;line-height:1.65">'
    + safe
    + '<hr style="border:none;border-top:1px solid #eee;margin:24px 0">'
    + '<p style="color:#999;font-size:12px;margin:0">Sent with love from Akshar Connect. If this reached you by mistake, please ignore it.</p>'
    + '</div></div>';
}
function doSendEmail_(p){
  var recipients = [];
  try { recipients = JSON.parse(p.recipients || '[]'); } catch(e){ recipients = []; }
  var subject = String(p.subject || '').slice(0, 200).trim();
  var body = String(p.body || '').trim();
  if(!subject || !body) return json_({ ok:false, error:'Subject and message are required.' });
  if(!recipients.length) return json_({ ok:false, error:'No recipients selected.' });

  var quota = 0;
  try { quota = MailApp.getRemainingDailyQuota(); } catch(e){ quota = 0; }
  if(quota <= 0) return json_({ ok:false, error:'Daily email limit reached. Try again tomorrow.' });

  var seen = {}, sent = 0, failed = 0, skipped = 0;
  for(var i=0;i<recipients.length;i++){
    var r = recipients[i] || {};
    var email = String(r.email || '').trim();
    if(!email || email.indexOf('@') < 1 || seen[email.toLowerCase()]){ skipped++; continue; }
    seen[email.toLowerCase()] = true;
    if(sent >= quota){ skipped++; continue; }
    var name = String(r.name || '');
    var first = (name.split(/\s+/)[0] || name);
    var subj = personalizeEmail_(subject, name, first);
    var text = personalizeEmail_(body, name, first);
    try { sendMail_(subj, text, email, emailHtmlBody_(text)); sent++; }
    catch(e){ failed++; }
  }
  var rec = {
    id: 'EML-' + Date.now().toString(36),
    subject: subject, body: body.slice(0, 4000), audience: String(p.audience || ''),
    recipientCount: recipients.length, sentCount: sent, failedCount: failed,
    createdBy: String(p.createdBy || ''), createdOn: new Date().toISOString()
  };
  appendRows_('EmailCampaigns', [rec]);
  var left = 0; try { left = MailApp.getRemainingDailyQuota(); } catch(e){}
  return json_({ ok:true, sent: sent, failed: failed, skipped: skipped, quotaLeft: left, id: rec.id });
}
function doGetEmailQuota_(){
  var q = 0; try { q = MailApp.getRemainingDailyQuota(); } catch(e){ q = 0; }
  return json_({ ok:true, quotaLeft: q });
}
function doGetEmailCampaigns_(){
  var list = readAll_('EmailCampaigns');
  list.sort(function(a,b){ return String(b.createdOn).localeCompare(String(a.createdOn)); });
  return json_({ ok:true, campaigns: list.slice(0, 50) });
}
function doGetEmailTemplates_(){
  if(readAll_('EmailTemplates').length === 0) appendRows_('EmailTemplates', SEED_EMAIL_TEMPLATES);
  var list = readAll_('EmailTemplates');
  list.sort(function(a,b){ return String(a.name).localeCompare(String(b.name)); });
  return json_({ ok:true, templates: list });
}
function doSaveEmailTemplate_(p){
  var now = new Date().toISOString();
  var id = String(p.id || '') || ('TPL-' + Date.now().toString(36) + Math.random().toString(36).slice(2,5));
  var name = String(p.name || '').slice(0, 80).trim();
  if(!name) return json_({ ok:false, error:'Template name is required.' });
  var row = {
    id: id, name: name, subject: String(p.subject || '').slice(0, 200),
    body: String(p.body || '').slice(0, 4000), createdBy: String(p.actor || ''),
    createdOn: now, updatedBy: String(p.actor || ''), updatedOn: now
  };
  var existing = findRow_('EmailTemplates', 'id', id);
  if(existing > 0){
    var cIdx = HEADERS.EmailTemplates.indexOf('createdOn')+1, bIdx = HEADERS.EmailTemplates.indexOf('createdBy')+1;
    row.createdOn = tab_('EmailTemplates').getRange(existing, cIdx).getValue() || now;
    row.createdBy = tab_('EmailTemplates').getRange(existing, bIdx).getValue() || row.createdBy;
    tab_('EmailTemplates').getRange(existing,1,1,HEADERS.EmailTemplates.length).setValues([rowFromObj_('EmailTemplates', row)]);
  } else {
    appendRows_('EmailTemplates', [row]);
  }
  return json_({ ok:true, template: row });
}
function doDeleteEmailTemplate_(p){
  var r = findRow_('EmailTemplates', 'id', String(p.id||''));
  if(r > 0) tab_('EmailTemplates').deleteRow(r);
  return json_({ ok:true });
}

// Daily 8 PM reminder (Asia/Kolkata). Run installSwadhyayReminder() ONCE in the
// editor to schedule it; it pushes to every device that enabled notifications.
// Record an auto-sent push as an Announcement row so it shows in the in-app
// notification centre (which lists announcements newest-first). De-duped per
// (title, day) so a re-fired trigger never doubles the entry.
function logNotification_(title, body){
  try{
    var day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var id = 'AUTO-' + day + '-' + String(title||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,16);
    if(findRow_('Announcements','id',id) > 0) return;
    appendRows_('Announcements', [{ id:id, title:String(title||''), body:String(body||''), audience:'all', createdBy:'Akshar Connect', createdOn:new Date().toISOString(), sentCount:'' }]);
  }catch(e){}
}

function swadhyayReminder_(){
  try {
    var t = '🙏 Swadhyay time', b = 'How much Bhajan, Shravan & Vachan did you do today? Tap to add — it takes 10 seconds.';
    sendPush_(t, b, 'all', { type:'swadhyay' });
    logNotification_(t, b);
  }
  catch(e){ Logger.log('swadhyay reminder failed: ' + e); }
}
// The hour (0–23, Asia/Kolkata) the daily reminder fires. Stored in Script
// Properties so you can change it without editing code — set 'swadhyayHour' to any
// hour and re-run installSwadhyayReminder(). Defaults to 22 (10 PM).
function swadhyayHour_(){
  var h = parseInt(PropertiesService.getScriptProperties().getProperty('swadhyayHour'), 10);
  return (isNaN(h) || h < 0 || h > 23) ? 21 : h;
}
function swadhyayMinute_(){
  var m = parseInt(PropertiesService.getScriptProperties().getProperty('swadhyayMinute'), 10);
  return (isNaN(m) || m < 0 || m > 59) ? 30 : m;
}
// IMPORTANT: changing the 'swadhyayHour'/'swadhyayMinute' Script Properties does NOT
// move an already-scheduled trigger — you MUST re-run installSwadhyayReminder() after
// changing them, otherwise the push keeps firing at the OLD time (this is why a push
// set to a new hour still arrived ~10 PM). Note GAS fires within a ~15-min window of
// the requested time, so a 21:30 trigger may arrive 21:15–21:45.
function installSwadhyayReminder(){
  // Remove any existing copy first so re-running doesn't stack duplicates.
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction() === 'swadhyayReminder_') ScriptApp.deleteTrigger(t); });
  var h = swadhyayHour_(), m = swadhyayMinute_();
  ScriptApp.newTrigger('swadhyayReminder_').timeBased().atHour(h).nearMinute(m).everyDays(1).create();
  Logger.log('Swadhyay daily reminder installed at ' + h + ':' + (m < 10 ? '0' + m : m) + ' (Asia/Kolkata).');
}

// ── Vato (daily teachings) ────────────────────────────────────────────────────
function doGetVato_(){
  var list = readAll_('Vato').filter(function(r){ return String(r.Gujarati||'').trim() || String(r.English||'').trim(); });
  return json_({ ok:true, vato: list });
}
function dayOfYear_(){ var n=new Date(); var s=new Date(n.getFullYear(),0,0); return Math.floor((n-s)/86400000); }
// Daily 6 AM push of the "Vato of the day" (rotates through the sheet by day).
function vatoReminder_(){
  try{
    var list = readAll_('Vato').filter(function(r){ return String(r.Gujarati||'').trim() || String(r.English||'').trim(); });
    if(!list.length) return;
    var v = list[dayOfYear_() % list.length];
    var guj = String(v.Gujarati||'').split('\n')[0].trim().slice(0,110);
    var eng = String(v.English||'').split('\n')[0].trim().slice(0,150);
    var body = [guj, eng].filter(Boolean).join('\n').slice(0,240);
    var t = '🌸 આજની વાત · Today’s Vato', b = body || 'Open to read today’s teaching 🙏';
    sendPush_(t, b, 'all', { type:'vato' });
    logNotification_(t, b);
  }catch(e){ Logger.log('vato reminder failed: '+e); }
}
function installVatoReminder(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==='vatoReminder_') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('vatoReminder_').timeBased().atHour(6).everyDays(1).create();
  Logger.log('Vato daily reminder installed at 06:00 (Asia/Kolkata).');
}
// Parse a dob into {mm,dd} handling ISO (yyyy-mm-dd) and dd-mm-yyyy.
function birthdayMD_(s){
  s=String(s||'').trim(); if(!s) return null;
  var m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if(m) return { mm:+m[2], dd:+m[3] };
  m=/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/.exec(s); if(m) return { dd:+m[1], mm:+m[2] };
  var dt=new Date(s); if(!isNaN(dt.getTime())) return { mm:dt.getMonth()+1, dd:dt.getDate() };
  return null;
}
// Daily 8 AM push naming everyone whose birthday is today (skips if none).
function birthdayReminder_(){
  try{
    var today=new Date(); var mm=today.getMonth()+1, dd=today.getDate();
    var names=[];
    readAll_('Devotees').forEach(function(d){
      var md=birthdayMD_(d.dob); if(md && md.mm===mm && md.dd===dd){ var nm=String(d.name||'').trim(); if(nm) names.push(nm); }
    });
    if(!names.length) return;
    var body = names.length===1
      ? ('Wish ' + names[0] + ' a very happy birthday today! 🎉🙏')
      : ('Birthdays today: ' + names.slice(0,8).join(', ') + (names.length>8 ? (' +' + (names.length-8) + ' more') : '') + ' 🎉');
    sendPush_('🎂 Happy Birthday!', body.slice(0,240), 'all', { type:'birthday' });
    logNotification_('🎂 Happy Birthday!', body.slice(0,240));
  }catch(e){ Logger.log('birthday reminder failed: '+e); }
}
function installBirthdayReminder(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==='birthdayReminder_') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('birthdayReminder_').timeBased().atHour(8).everyDays(1).create();
  Logger.log('Birthday daily reminder installed at 08:00 (Asia/Kolkata).');
}

// ── Daily backup / archive of the whole spreadsheet to Drive ───────────────────
// Copies the entire Google Sheet (all tabs) into akshar-connect/backups with a
// timestamped name, then prunes to the most recent `keep` copies. Restorable by
// simply opening a copy. Uses the already-granted Drive scope.
function backupFolder_(){
  var root = subFolder_(DriveApp.getRootFolder(), 'akshar-connect');
  return subFolder_(root, 'backups');
}
function backupSpreadsheet_(keep){
  keep = keep || 30;
  var folder = backupFolder_();
  var tz = Session.getScriptTimeZone() || 'Asia/Kolkata';
  var stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd_HHmm');
  var name = 'AksharConnect_backup_' + stamp;
  var copy = DriveApp.getFileById(ss_().getId()).makeCopy(name, folder);
  // Gather existing backups, newest first, and trash any beyond `keep`.
  var files = [], it = folder.getFiles();
  while(it.hasNext()){ var f = it.next(); if(/^AksharConnect_backup_/.test(f.getName())) files.push(f); }
  files.sort(function(a,b){ return b.getDateCreated() - a.getDateCreated(); });
  var pruned = 0;
  for(var i = keep; i < files.length; i++){ try{ files[i].setTrashed(true); pruned++; }catch(e){} }
  return { name: name, id: copy.getId(), kept: Math.min(files.length, keep), pruned: pruned };
}
// Keep 90 backups: at 3 per day that is ~30 days of history retained.
function dailyBackup_(){ try{ backupSpreadsheet_(90); }catch(e){ Logger.log('backup failed: ' + e); } }
// RUN ONCE in the editor to schedule backups 3× a day — 12 AM, 12 PM and 6 PM
// (approve the trigger). Re-running first removes any old backup trigger(s) so it
// never stacks duplicates. NOTE: Apps Script fires a time trigger within a ~15-min
// window of the requested hour, so e.g. the noon backup may land 11:45 AM–12:15 PM.
function installDailyBackup(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==='dailyBackup_') ScriptApp.deleteTrigger(t); });
  [0, 12, 18].forEach(function(h){ ScriptApp.newTrigger('dailyBackup_').timeBased().atHour(h).everyDays(1).create(); });
  Logger.log('Backups scheduled 3×/day at 12 AM, 12 PM & 6 PM (' + (Session.getScriptTimeZone()||'Asia/Kolkata') + ').');
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
  try { sent = sendPush_(rec.title, rec.body, rec.audience, { announcementId: id, by: rec.createdBy }); } catch(e) { /* save even if push fails */ }
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
  targets = dedupeTokens_(targets);
  if(!targets.length) return 0;

  // Every push campaign gets an id (nid) so we can log who it reached and who
  // tapped it. Each device also carries a recipient id (rid = devoteeId or mobile)
  // in the payload, which the service worker echoes back on click.
  var nid = (data && data.nid) || ('PN-' + Date.now().toString(36) + '-' + Math.floor(Math.random()*46656).toString(36));
  var msgData = { type: 'announcement' };
  if(data) for(var k in data) msgData[k] = String(data[k]);
  msgData.nid = nid;
  var link = pushLink_(msgData.type);

  var sent = 0, toDelete = [], recipientRows = [], nowIso = new Date().toISOString();
  // UrlFetchApp.fetchAll batches the HTTP calls so hundreds of devices stay fast.
  for(var i=0;i<targets.length;i+=100){
    var chunk = targets.slice(i, i+100);
    var reqs = chunk.map(function(r){
      var pd = mergeData_(msgData, title, body, link);
      pd.rid = String(r.devoteeId || normMob_(r.mobile) || r.token || '');
      return {
        url: url, method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true,
        payload: JSON.stringify({ message: {
          token: r.token,
          // DATA-ONLY (no notification block) so the browser doesn't show a second
          // notification on top of the one our service worker shows.
          data: pd,
          android: { priority: 'high' },
          webpush: { fcm_options: { link: link } }
        }})
      };
    });
    var resps = UrlFetchApp.fetchAll(reqs);
    for(var j=0;j<resps.length;j++){
      var code = resps[j].getResponseCode();
      if(code === 200){
        sent++;
        var rr = chunk[j];
        recipientRows.push({
          notifId: nid, devoteeId: rr.devoteeId || '', name: rr.name || '',
          mobile: rr.mobile || '', platform: rr.platform || '', sentOn: nowIso,
          clicked: '', clickedOn: ''
        });
      }
      else if(code === 404 || code === 400){
        var txt = resps[j].getContentText();
        if(/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(txt)) toDelete.push(chunk[j].token);
      }
    }
  }
  // Remove dead tokens so the list stays clean.
  toDelete.forEach(function(tok){ var rn = findRow_('PushTokens','token',tok); if(rn>0) try{ tab_('PushTokens').deleteRow(rn); }catch(e){} });

  // Log the campaign + who it reached (best-effort — never fail a send over logging).
  try{
    if(recipientRows.length) appendRows_('PushRecipients', recipientRows);
    appendRows_('PushLog', [{
      id: nid, title: String(title||'').slice(0,160), body: String(body||'').slice(0,500),
      audience: audience, type: msgData.type, sentCount: sent, clickCount: 0,
      createdBy: (data && data.by) || '', createdOn: nowIso
    }]);
    // Keep the recipient sheet bounded (keeps ~last 4000 recipient rows).
    var prSh = tab_('PushRecipients'); var prOver = prSh.getLastRow() - 1 - 4000;
    if(prOver > 0) prSh.deleteRows(2, prOver);
  }catch(e){}
  return sent;
}
function normMob_(m){ return String(m||'').replace(/\D/g,'').slice(-10); }

// A device tapped a notification — mark that recipient clicked and bump the
// campaign's click count. Called by the service worker (nid = campaign, rid =
// devoteeId or mobile). Idempotent: a second tap won't double-count.
function pushClicked_(p){
  var nid = String(p && p.nid || ''), rid = String(p && p.rid || '');
  if(!nid) return { ok:false, error:'no nid' };
  var lock = LockService.getScriptLock(); try{ lock.waitLock(15000); }catch(e){ return { ok:false, error:'busy' }; }
  try{
    var sh = tab_('PushRecipients'); var H = HEADERS.PushRecipients; var last = sh.getLastRow();
    var updated = 0;
    if(last >= 2){
      var data = sh.getRange(2,1,last-1,H.length).getValues();
      var nI=H.indexOf('notifId'), dI=H.indexOf('devoteeId'), mI=H.indexOf('mobile'), cI=H.indexOf('clicked'), coI=H.indexOf('clickedOn');
      for(var i=0;i<data.length;i++){
        if(String(data[i][nI]) === nid && rid && (String(data[i][dI]) === rid || normMob_(data[i][mI]) === normMob_(rid))){
          if(String(data[i][cI]) !== 'yes'){ data[i][cI] = 'yes'; data[i][coI] = new Date().toISOString(); updated++; }
        }
      }
      if(updated > 0) sh.getRange(2,1,last-1,H.length).setValues(data);
    }
    if(updated > 0){
      var lrow = findRow_('PushLog','id',nid);
      if(lrow > 0){ var cc = HEADERS.PushLog.indexOf('clickCount')+1; var s2 = tab_('PushLog'); var cur = Number(s2.getRange(lrow,cc).getValue())||0; s2.getRange(lrow,cc).setValue(cur + updated); }
    }
    return { ok:true, updated:updated };
  } finally { try{ lock.releaseLock(); }catch(e){} }
}

// One-time repair for misaligned GhariOrders rows. An older write path left ~101
// orders shifted by +7 columns: the real order block (season→balance) sits at raw
// indices 9–24 instead of 2–17, so readAll_ saw season="1" and the app hid them.
// This rebuilds each shifted row into the correct 25-col schema WITHOUT losing the
// recoverable data (id, season, customer, mobile, devoteeId, karyakarta, items,
// totals, delivered, paymentReceived, balance). Fields never stored for those rows
// (orderNo, paymentType, status, remarks, created/updated) are set to safe defaults
// (status='active'; orderNo left blank for backfillGhariOrderNos_ to assign).
// Strict: a row is only rewritten when season is a year at idx9 AND itemsJson at
// idx15 is empty or starts with '['; anything else is SKIPPED untouched and
// reported. Pass apply=true to write; otherwise it's a dry run (counts only).
function realignGhariOrders_(apply){
  var sh = ss_().getSheetByName('GhariOrders'); if(!sh) return { error:'no GhariOrders tab' };
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  if(lr < 2) return { fixed:0, aligned:0, skipped:0 };
  var vals = sh.getRange(1,1,lr,lc).getValues();
  var yr = /^20(2[4-9])$/;
  var fixed=0, aligned=0, skipped=[], toWrite=[];
  for(var i=1;i<vals.length;i++){
    var r = vals[i];
    if(yr.test(String(r[2]))){ aligned++; toWrite.push(r.slice(0,25)); continue; } // already correct — keep as-is
    if(!yr.test(String(r[9]))){ skipped.push({ row:i+1, id:r[0], reason:'season not a year at idx9 (col3='+String(r[2])+')' }); toWrite.push(r.slice(0,25)); continue; }
    var ij = String(r[15]||'');
    if(ij && ij.charAt(0) !== '['){ skipped.push({ row:i+1, id:r[0], reason:'itemsJson at idx15 not JSON' }); toWrite.push(r.slice(0,25)); continue; }
    var neo = ['','','','','','','','','','','','','','','','','','','','','','','','',''];
    neo[0]=r[0];            // id
    neo[1]='';             // orderNo → backfill assigns
    neo[2]=r[9];           // season
    neo[3]=r[10];          // customerName
    neo[4]=r[11];          // customerMobile
    neo[5]=r[12];          // devoteeId
    neo[6]=r[13];          // karyakarta
    neo[7]=r[14];          // karyakartaId
    neo[8]=r[15];          // itemsJson
    neo[9]=r[16];          // itemsSummary
    neo[10]=r[17];         // total
    neo[11]=r[18];         // withGheeAmt
    neo[12]=r[19];         // withoutGheeAmt
    neo[13]=r[20];         // sugarFreeAmt
    neo[14]=r[21];         // bhusuAmt
    neo[15]=r[22];         // delivered
    neo[16]=r[23];         // paymentReceived
    neo[17]=r[24];         // balance
    neo[18]='';            // paymentType (unknown → app computes paid/unpaid from amounts)
    neo[19]='active';      // status (none were void)
    neo[20]='';            // remarks
    neo[21]='';            // createdBy (unknown)
    neo[22]='';            // createdOn (unknown)
    neo[23]='';            // updatedBy
    neo[24]='';            // updatedOn
    toWrite.push(neo);
    fixed++;
  }
  if(apply){
    // toWrite holds ONLY the data rows (loop began at i=1), newest schema order.
    // Normalize each to exactly 25 cells and write them starting at sheet row 2.
    var out = toWrite.map(function(row){ var x=row.slice(0,25); while(x.length<25) x.push(''); return x; });
    sh.getRange(2,1,out.length,25).setValues(out);
    if(lc > 25) sh.getRange(2,26,lr-1,lc-25).clearContent(); // drop any stray columns past the schema
  }
  return { applied: !!apply, fixed:fixed, aligned:aligned, skipped:skipped.length, skippedDetails:skipped.slice(0,20) };
}

// One-time repair: the old addSabha id scheme (SAB-2026-0{len+1}) could assign the
// SAME id to two events. Follow-ups are keyed by eventId, so records bled from one
// event into another (phantom "contacted"). Give every DUPLICATE occurrence (keeping
// the FIRST, which is the original owner of that id and its follow-ups) a fresh unique
// id. No follow-up records are moved or deleted, so the first event keeps its history
// and the duplicate becomes a clean, empty event. Idempotent — safe to run repeatedly.
function repairDuplicateSabhaIds_(){
  var sh = ss_().getSheetByName('Sabhas'); if(!sh) return { fixed: 0, details: [] };
  var last = sh.getLastRow(); if(last < 2) return { fixed: 0, details: [] };
  var ids = sh.getRange(2, 1, last-1, 1).getValues(); // column 1 = id
  var seen = {}, details = [], changed = false;
  for(var i=0;i<ids.length;i++){
    var id = String(ids[i][0] || '');
    if(!id) continue;
    if(seen[id]){
      var newId;
      do { newId = 'SAB-' + Date.now() + '-' + Math.floor(Math.random()*100000); } while(seen[newId]);
      seen[newId] = true;
      ids[i][0] = newId;
      details.push({ row: i+2, oldId: id, newId: newId });
      changed = true;
    } else {
      seen[id] = true;
    }
  }
  if(changed) sh.getRange(2, 1, ids.length, 1).setValues(ids);
  return { fixed: details.length, details: details };
}

// Deep-link a push to the right in-app screen based on its type. The app reads
// the ?n= param on launch and opens that page.
// Merge title/body/link into the data payload (all values must be strings for FCM data).
function mergeData_(msgData, title, body, link){
  var out = {}; for(var k in msgData) out[k] = String(msgData[k]);
  out.title = String(title||''); out.body = String(body||''); out.link = String(link||'');
  return out;
}
function pushLink_(type){
  var t = String(type || '').toLowerCase();
  var page = ({ vato:'vato', feed:'feed', swadhyay:'swadhyay', birthday:'dashboard', announcement:'dashboard', activity:'dashboard', seva:'calendar', calendar:'calendar', bus:'bus', followup:'followups', followups:'followups' })[t];
  return page ? (APP_URL + '?n=' + page) : APP_URL;
}

// Collapse duplicate tokens for the SAME device so a person doesn't get the same
// push twice (the PWA can re-register and leave a stale-but-still-valid token).
// Keeps the most recently updated token per (mobile + platform); tokens without a
// mobile are kept as-is. Also de-dupes exact repeated token strings.
function dedupeTokens_(targets){
  var byDevice = {}, noMobile = [], seenTok = {};
  (targets||[]).forEach(function(r){
    if(seenTok[r.token]) return; seenTok[r.token] = true;
    var mob = normMob_(r.mobile);
    if(!mob){ noMobile.push(r); return; }
    var key = mob + '|' + (r.platform || '');
    var cur = byDevice[key];
    if(!cur || String(r.updatedOn||'') > String(cur.updatedOn||'')) byDevice[key] = r;
  });
  var out = noMobile.slice();
  for(var k in byDevice) out.push(byDevice[k]);
  return out;
}

// Cached FCM access token (valid ~1h) so frequent pushes (e.g. activity watch)
// don't mint a fresh JWT every time.
function fcmAccessTokenCached_(sa){
  try {
    var cache = CacheService.getScriptCache();
    var t = cache.get('fcmToken');
    if(t) return t;
    var tok = fcmAccessToken_(sa);
    cache.put('fcmToken', tok, 3000);
    return tok;
  } catch(e) { return fcmAccessToken_(sa); }
}
// Push to all devices registered to ONE mobile number. Returns how many sent.
function pushToMobile_(title, body, mobile, data){
  try {
    var saRaw = PropertiesService.getScriptProperties().getProperty('FCM_SERVICE_ACCOUNT');
    if(!saRaw) return 0;
    var sa = JSON.parse(saRaw);
    var nm = normMob_(mobile);
    if(!nm) return 0;
    var targets = dedupeTokens_(readAll_('PushTokens').filter(function(r){ return normMob_(r.mobile) === nm; }));
    if(!targets.length) return 0;
    var token = fcmAccessTokenCached_(sa);
    var url = 'https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send';
    var msgData = { type:'activity' }; if(data) for(var k in data) msgData[k] = String(data[k]);
    var link = pushLink_(msgData.type);
    var reqs = targets.map(function(r){
      return { url:url, method:'post', contentType:'application/json', headers:{ Authorization:'Bearer '+token }, muteHttpExceptions:true,
        payload: JSON.stringify({ message:{ token:r.token, data: mergeData_(msgData, title, body, link), android:{ priority:'high' }, webpush:{ fcm_options:{ link: link } } }}) };
    });
    var resps = UrlFetchApp.fetchAll(reqs); var sent = 0;
    for(var i=0;i<resps.length;i++){ if(resps[i].getResponseCode() === 200) sent++; }
    return sent;
  } catch(e){ return 0; }
}

// Send a push reminder to a specific list of mobile numbers (a follow-up drive's
// devotees, or their karyakartas). Pushes to each number's registered devices;
// numbers with no device are skipped. Returns how many people were reached and
// the total device count.
function doSendFollowupReminder_(p){
  var title = String(p.title||'').slice(0,120);
  var body = String(p.body||'').slice(0,500);
  var mobiles = p.mobiles || [];
  if(!title) return json_({ ok:false, error:'Title required' });
  if(!mobiles.length) return json_({ ok:false, error:'No recipients' });
  // De-dupe numbers so one person is never pushed twice.
  var seen = {}, sent = 0, reached = 0;
  mobiles.forEach(function(m){
    var nm = normMob_(m); if(!nm || seen[nm]) return; seen[nm] = 1;
    var n = 0; try { n = pushToMobile_(title, body, nm, { type:'followup' }); } catch(e){ n = 0; }
    if(n > 0){ reached++; sent += n; }
  });
  return json_({ ok:true, sent:sent, reached:reached, recipients:Object.keys(seen).length });
}

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

// Cached read: returns a cached JSON response when warm, otherwise builds it, caches
// the string (only if it fits CacheService's ~100KB/key limit) and returns it. Use
// for slow, rarely-changing reads (e.g. the external attendance sheet, Vato). A
// short TTL keeps data fresh enough without re-reading whole sheets every request.
function cachedJson_(key, ttlSec, buildObj){
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if(hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  var obj = buildObj();
  var s = JSON.stringify(obj);
  // Never cache a failure (would persist the error for the whole TTL).
  if(obj && obj.ok !== false){ try { if(s && s.length < 95000) cache.put(key, s, ttlSec); } catch(e){} }
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}

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
  ['Users','Devotees','Sabhas','Attendance','Followups','Thoughts','Areas','Activity','Changes','GhariProducts','GhariOrders','GhariPurchases','GhariStock','GhariMandalPayments','GhariBuyers','GhariLeaderTargets','MandalLeaders','LeaderBoards','LeaderEntries','LeaderLogs','PushTokens','Announcements','PushStatus','Swadhyay','Seva','CalPlan','FeedPosts','FeedLikes','FeedComments','EmailCampaigns','EmailTemplates','GhariLog','BusEvents','BusBookings','BusTally','Vato','DevoteeLog','NotifReads'].forEach(function(n){ tab_(n); migrateHeaders_(n); });
  // remove default empty "Sheet1" if it isn't one of ours
  if(first && ['Sheet1','Sheet 1'].indexOf(first.getName())>=0 && HEADERS[first.getName()]===undefined){
    try{ ss_().deleteSheet(first); }catch(e){}
  }
  backfillGhariOrderNos_();   // give every legacy order a permanent #number
  properCaseNamesOnce_(); // one-time: tidy existing customer/karyakarta/supplier/devotee names
  if(readAll_('Users').length===0)    appendRows_('Users', SEED_USERS);
  if(readAll_('Sabhas').length===0)   appendRows_('Sabhas', SEED_SABHAS);
  if(readAll_('Thoughts').length===0) appendRows_('Thoughts', SEED_THOUGHTS);
  if(readAll_('EmailTemplates').length===0) appendRows_('EmailTemplates', SEED_EMAIL_TEMPLATES);
  props.setProperty('ensuredSchema', SCHEMA_VERSION);
}

// Proper-case an English name however it was typed ("RAVI"/"ravi" → "Ravi").
// Non-Latin scripts (e.g. Gujarati કાર્યકર્તા) have no case, so \w leaves them as-is.
function properName_(s){
  return String(s==null?'':s).trim().toLowerCase().replace(/\b\w/g, function(c){ return c.toUpperCase(); });
}
// Proper-case the given columns on every row of a sheet, in place (no log churn).
function properCaseColumns_(sheetName, colNames){
  var sh = ss_().getSheetByName(sheetName); if(!sh) return;
  var H = HEADERS[sheetName]; if(!H) return;
  var lr = sh.getLastRow(); if(lr < 2) return;
  colNames.forEach(function(name){
    var c = H.indexOf(name) + 1; if(c <= 0) return;
    var vals = sh.getRange(2, c, lr-1, 1).getValues(), changed = false;
    for(var i=0;i<vals.length;i++){ var p = properName_(vals[i][0]); if(p !== String(vals[i][0]==null?'':vals[i][0])){ vals[i][0] = p; changed = true; } }
    if(changed) sh.getRange(2, c, vals.length, 1).setValues(vals);
  });
}
// One-time cleanup (guarded by a Script Property): proper-case existing NAMES across
// orders (customer/karyakarta), purchases (supplier) and the devotee directory.
// Idempotent — the guard value is bumped whenever the set of columns grows.
function properCaseNamesOnce_(){
  var props = PropertiesService.getScriptProperties();
  if(props.getProperty('ghariNamesPropered') === '3') return;
  try {
    properCaseColumns_('GhariOrders', ['customerName','karyakarta']);
    properCaseColumns_('GhariPurchases', ['supplier']);
    properCaseColumns_('Devotees', ['name','firstName','middleName','lastName']);
  } catch(e){ /* non-fatal */ }
  props.setProperty('ghariNamesPropered', '3');
}

function readAll_(name){
  var sh = tab_(name); var last = sh.getLastRow(); if(last<2) return [];
  var head = HEADERS[name]; var v = sh.getRange(2,1,last-1,head.length).getValues();
  var out=[];
  for(var i=0;i<v.length;i++){
    var o={}; var blank=true;
    for(var c=0;c<head.length;c++){ var val=v[i][c]; if(val!=='' && val!==null) blank=false; o[head[c]]= (val===null?'':val); }
    if(!blank){
      for(var bc in BOOL_COLS){ if(head.indexOf(bc)>=0 && !BOOL_COL_EXCEPTIONS[name+'.'+bc]){ var bv=o[bc]; o[bc]=(bv===true||bv==='true'||bv==='TRUE'||bv==='1'); } }
      out.push(o);
    }
  }
  return out;
}

// Read only the LAST n data rows of a tab as objects (fast for big log tabs —
// avoids pulling the whole sheet into memory just to show recent entries).
function readTail_(name, n){
  var sh=tab_(name); var last=sh.getLastRow(); if(last<2) return [];
  var head=HEADERS[name]; var count=Math.min(n, last-1); var start=last-count+1;
  var v=sh.getRange(start,1,count,head.length).getValues(); var out=[];
  for(var i=0;i<v.length;i++){
    var o={}; var blank=true;
    for(var c=0;c<head.length;c++){ var val=v[i][c]; if(val!==''&&val!==null) blank=false; o[head[c]]=(val===null?'':val); }
    if(!blank){ for(var bc in BOOL_COLS){ if(head.indexOf(bc)>=0 && !BOOL_COL_EXCEPTIONS[name+'.'+bc]){ var bv=o[bc]; o[bc]=(bv===true||bv==='true'||bv==='TRUE'||bv==='1'); } } out.push(o); }
  }
  return out;
}
// Read any sheet (in any spreadsheet) as objects keyed by its header row.
function sheetObjects_(ss, name){
  var sh = ss.getSheetByName(name); if(!sh) return [];
  var last = sh.getLastRow(), lc = sh.getLastColumn(); if(last < 2 || lc < 1) return [];
  var vals = sh.getRange(1,1,last,lc).getValues();
  var head = vals[0].map(function(h){ return String(h).trim(); });
  var out = [];
  for(var i=1;i<vals.length;i++){
    var o = {}, blank = true;
    for(var c=0;c<head.length;c++){ var v = vals[i][c]; if(v!=='' && v!==null) blank=false; o[head[c]] = v; }
    if(!blank) out.push(o);
  }
  return out;
}
// Group attendance from the external attendance sheet — ONLY devotees whose
// "Reference Karyakarta" matches our group. Read-only.
function doGetGroupAttendance_(){
  try{
    var xss = SpreadsheetApp.openById(ATTENDANCE_SHEET_ID);
    var devs = sheetObjects_(xss, 'Devotees');
    var sess = sheetObjects_(xss, 'Sessions');
    var att  = sheetObjects_(xss, 'Attendance');
    var key = String(ATTENDANCE_GROUP_KARYAKARTA).toLowerCase();
    var our = {}, ourList = [];
    devs.forEach(function(d){
      var ref = String(d['Reference Karyakarta']||'').toLowerCase();
      var active = String(d['Active']||'Y').toUpperCase();
      if(ref.indexOf(key) >= 0 && active !== 'N'){
        var id = String(d['ID']||'');
        var name = [d['First Name'], d['Middle Name'], d['Last Name']].filter(function(x){return x;}).join(' ');
        our[id] = { id:id, name:name, mobile:String(d['Mobile']||'') };
        ourList.push(our[id]);
      }
    });
    var presentBy = {};
    att.forEach(function(a){
      if(String(a['Status']||'').toLowerCase() !== 'present') return;
      var sid = String(a['Session ID']||''), did = String(a['Devotee ID']||'');
      if(!our[did]) return;
      (presentBy[sid] = presentBy[sid] || {})[did] = true;
    });
    var attended = {};
    var sessions = sess.filter(function(s){ var c=String(s['Cancelled']||'').toLowerCase(); return c!=='y' && c!=='yes' && c!=='true'; })
      .map(function(s){
        var sid = String(s['Session ID']||'');
        var pres = presentBy[sid] || {};
        var names = [];
        Object.keys(pres).forEach(function(did){ names.push(our[did].name); attended[did] = (attended[did]||0)+1; });
        var dt = s['Session Date']; var dateStr = (dt instanceof Date) ? dt.toISOString() : String(dt||'');
        return { id:sid, date:dateStr, title:String(s['Session Title']||''), present:names.length, total:ourList.length, names:names.sort() };
      });
    sessions.sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); });
    var byDevotee = ourList.map(function(d){ return { id:d.id, name:d.name, attended: attended[d.id]||0 }; })
      .sort(function(a,b){ return b.attended - a.attended || a.name.localeCompare(b.name); });
    return json_({ ok:true, devoteeCount: ourList.length, sessionCount: sessions.length, sessions: sessions, byDevotee: byDevotee });
  }catch(e){ return json_({ ok:false, error:String(e) }); }
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

// ── Adajan Mandal Leaderboard ───────────────────────────────────────────────
// The fixed mandal leaders, seeded ONCE. Editing the roster later (add/edit/
// delete) happens through the normal insert/update/remove on `MandalLeaders`.
var DEFAULT_MANDAL_LEADERS = [
  'Pankajbhai','Smitbhai/Krunalbhai','Bhavikbhai','Pavitrabhai','Bittubhai',
  'Rameshbhai Modi','Chachubhai','Krunalbhai Vasani','Umeshbhai','Mayurbhai Tailor',
  'Dr. Jigneshbhai','Mohitbhai','Pushpakbhai','Nirdoshbhai','Prerakbhai',
  'Ankitbhai Modi','Ravibhai'
];

function seedMandalLeaders_(force){
  var existing = readAll_('MandalLeaders');
  if(existing.length && !force) return existing;
  if(!existing.length){
    var rows = DEFAULT_MANDAL_LEADERS.map(function(name, i){
      return { id: 'LDR-' + (i+1), name: name, sortOrder: i+1, active: true };
    });
    appendRows_('MandalLeaders', rows);
  }
  return readAll_('MandalLeaders');
}

function doGetLeaderboards_(p){
  var leaders = seedMandalLeaders_(false);
  var boards  = readAll_('LeaderBoards');
  var entries = readAll_('LeaderEntries');
  var logs    = readAll_('LeaderLogs');
  return json_({ ok:true, leaders: leaders, boards: boards, entries: entries, logs: logs });
}

// Upsert a single row by id. Returns 'insert' or 'update'.
function leaderUpsert_(collection, row){
  if(!row || !row.id) return null;
  var rn = findRow_(collection, 'id', row.id);
  if(rn > 0){ tab_(collection).getRange(rn,1,1,HEADERS[collection].length).setValues([rowFromObj_(collection,row)]); return 'update'; }
  appendRows_(collection, [row]); return 'insert';
}

// Save a whole board + all its entries in ONE call (fast — no 18 round-trips), then
// email the admin a summary. Used for both create and data-entry saves.
function doSaveLeaderboard_(p){
  var board = p.board || {};
  var entries = p.entries || [];
  if(!board.id) return json_({ ok:false, error:'missing board id' });
  var mode = leaderUpsert_('LeaderBoards', board);
  entries.forEach(function(e){ leaderUpsert_('LeaderEntries', e); });
  logChange_(mode==='insert'?'INSERT':'UPDATE', 'LeaderBoards', { name: board.title, updatedBy: board.updatedBy||board.createdBy }, mailFlag_(p));
  try{ sendLeaderboardEmail_(board, entries, mode, p); }catch(err){}
  return json_({ ok:true, mode: mode });
}

// Delete a board + all its entries server-side in one call.
function doDeleteLeaderboard_(p){
  var boardId = p.boardId;
  if(!boardId) return json_({ ok:false, error:'missing boardId' });
  // Remove entries first (iterate a snapshot of row numbers, delete bottom-up).
  var esh = tab_('LeaderEntries');
  var evals = esh.getDataRange().getValues();
  var eHead = evals[0]; var bCol = eHead.indexOf('boardId');
  for(var i=evals.length-1; i>=1; i--){ if(String(evals[i][bCol]) === String(boardId)) esh.deleteRow(i+1); }
  var brn = findRow_('LeaderBoards', 'id', boardId);
  if(brn > 0) tab_('LeaderBoards').deleteRow(brn);
  logChange_('DELETE', 'LeaderBoards', { name: p.title || boardId, actor: p.actor }, mailFlag_(p));
  return json_({ ok:true });
}

// Commit a day's seva log: append the challan lines to LeaderLogs AND upsert the
// updated entries (whose `done` now includes the day's additions, computed on the
// client). One call → logs saved + running totals updated + admin emailed.
function doAddLeaderLog_(p){
  var board = p.board || {};
  var entries = p.entries || [];
  var logs = p.logs || [];
  if(!board.id) return json_({ ok:false, error:'missing board id' });
  if(!logs.length) return json_({ ok:false, error:'no log lines' });
  logs.forEach(function(l){ if(l && l.id) appendRows_('LeaderLogs', [l]); });
  entries.forEach(function(e){ leaderUpsert_('LeaderEntries', e); });
  leaderUpsert_('LeaderBoards', board);
  var added = 0; logs.forEach(function(l){ added += Number(l.amount)||0; });
  logChange_('UPDATE', 'LeaderBoards', { name: (board.title||'') + ' — +' + added + ' ' + (board.unit||'Kg') + ' logged', updatedBy: board.updatedBy||board.createdBy }, mailFlag_(p));
  try{ sendLeaderboardEmail_(board, entries, 'update', p); }catch(err){}
  return json_({ ok:true, added: added });
}

// Remove one logged line and roll back its amount from the leader's running total.
function doDeleteLeaderLog_(p){
  var logId = p.logId; var board = p.board || {}; var entries = p.entries || [];
  if(!logId) return json_({ ok:false, error:'missing logId' });
  var rn = findRow_('LeaderLogs', 'id', logId);
  if(rn > 0) tab_('LeaderLogs').deleteRow(rn);
  entries.forEach(function(e){ leaderUpsert_('LeaderEntries', e); });
  if(board.id) logChange_('DELETE', 'LeaderLogs', { name: (board.title||'') + ' — log line removed', updatedBy: board.updatedBy||board.createdBy }, mailFlag_(p));
  return json_({ ok:true });
}

// ── Ghari Leaders (buyer → leader assignment) ──────────────────────────────
// A standalone organising layer: each Ghari buyer is mapped to one of the fixed
// MandalLeaders, with an EDITABLE snapshot of their season totals. It never reads
// or writes GhariOrders — no money is touched here.

// The final GHARI SALES 2026 buyer→leader assignment, dumped once into the sheet.
var GHARI_BUYERS_SEED = [
  {buyer:"KALPESHBHAI JOGANI", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:141, orders:6, amount:134050},
  {buyer:"DIGESHBHAI", leaderId:"LDR-14", leaderName:"Nirdoshbhai", ghariKg:122.5, orders:6, amount:116825},
  {buyer:"ASHISHBHAI", leaderId:"LDR-12", leaderName:"Mohitbhai", ghariKg:40.5, orders:5, amount:38575},
  {buyer:"PAVITRABHAI SARANG", leaderId:"LDR-4", leaderName:"Pavitrabhai", ghariKg:40.5, orders:6, amount:38525},
  {buyer:"TEJASBHAI", leaderId:"LDR-13", leaderName:"Pushpakbhai", ghariKg:30, orders:1, amount:28500},
  {buyer:"SMITBHAI", leaderId:"LDR-2", leaderName:"Smitbhai/Krunalbhai", ghariKg:29, orders:11, amount:27800},
  {buyer:"MOHITBHAI CHAPANERIA", leaderId:"LDR-12", leaderName:"Mohitbhai", ghariKg:25, orders:5, amount:23950},
  {buyer:"LAXMIPATI MILLS", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:25, orders:1, amount:23750},
  {buyer:"RAMESHBHAI MODI", leaderId:"LDR-6", leaderName:"Rameshbhai Modi", ghariKg:24.5, orders:6, amount:23375},
  {buyer:"BHAVIKBHAI", leaderId:"LDR-3", leaderName:"Bhavikbhai", ghariKg:20, orders:3, amount:19000},
  {buyer:"MAYURBHAI TAILER", leaderId:"LDR-10", leaderName:"Mayurbhai Tailor", ghariKg:19.5, orders:3, amount:18525},
  {buyer:"PRAVINKAKA", leaderId:"LDR-5", leaderName:"Bittubhai", ghariKg:18, orders:5, amount:17650},
  {buyer:"KRUNALBHAI VASANI", leaderId:"LDR-8", leaderName:"Krunalbhai Vasani", ghariKg:18, orders:4, amount:17100},
  {buyer:"VANITABEN", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:15, orders:2, amount:14250},
  {buyer:"DR.JIGNESHBHAI", leaderId:"LDR-11", leaderName:"Dr. Jigneshbhai", ghariKg:14, orders:3, amount:13400},
  {buyer:"BRIJESHBHAI CHACHU", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:13, orders:4, amount:12350},
  {buyer:"PANKAJBHAI PATEL", leaderId:"LDR-1", leaderName:"Pankajbhai", ghariKg:13, orders:6, amount:12350},
  {buyer:"JIGISHABEN", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:9.5, orders:5, amount:9025},
  {buyer:"AMISHABEN UMARA", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:8.5, orders:2, amount:8325},
  {buyer:"PUSHPAKBHAI", leaderId:"LDR-13", leaderName:"Pushpakbhai", ghariKg:7.5, orders:2, amount:7175},
  {buyer:"PRITIBEN PILUDARIYA", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:7, orders:1, amount:6650},
  {buyer:"UMESHBHAI", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:6, orders:4, amount:5700},
  {buyer:"TIRTHABEN KANDIWALI", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:5.5, orders:1, amount:5475},
  {buyer:"DHARMENDRA CHAPANERIA", leaderId:"LDR-12", leaderName:"Mohitbhai", ghariKg:5.5, orders:1, amount:5225},
  {buyer:"ANILBHAI PITHWA", leaderId:"LDR-5", leaderName:"Bittubhai", ghariKg:5, orders:1, amount:4750},
  {buyer:"AMIRASBHAI MANDIRWALA", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:5, orders:1, amount:4750},
  {buyer:"KALPESHBHAI (MEHULBHAI)(ANJANA FESHAN)", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:5, orders:1, amount:4750},
  {buyer:"SANJAYBHAI VALKESHWAR", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:4.5, orders:1, amount:4275},
  {buyer:"AMIBEN VYAS", leaderId:"LDR-8", leaderName:"Krunalbhai Vasani", ghariKg:4, orders:4, amount:3900},
  {buyer:"ANKURBHAI CHAUDHARI", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:4, orders:1, amount:3800},
  {buyer:"MANOJBHAI", leaderId:"LDR-3", leaderName:"Bhavikbhai", ghariKg:4, orders:2, amount:3800},
  {buyer:"AMITBHAI OLPAD", leaderId:"LDR-5", leaderName:"Bittubhai", ghariKg:3.5, orders:1, amount:3325},
  {buyer:"KISHORBHAI RANDER", leaderId:"LDR-12", leaderName:"Mohitbhai", ghariKg:3.5, orders:1, amount:3325},
  {buyer:"PRATIKBHAI BERISTER", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:3, orders:2, amount:2900},
  {buyer:"BHARATBHAI GAMI", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:3, orders:2, amount:2850},
  {buyer:"DAXESHBHAI PARMAR", leaderId:"LDR-3", leaderName:"Bhavikbhai", ghariKg:3, orders:2, amount:2850},
  {buyer:"L P SAVANI SCHOOL", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:3, orders:1, amount:2850},
  {buyer:"BHARATBHAI  PANCHHIGAR", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:3, orders:1, amount:2850},
  {buyer:"ANZALBEN", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:2.5, orders:1, amount:2375},
  {buyer:"JASHUBEN MEVADA", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:2.5, orders:1, amount:2375},
  {buyer:"RITABEN TIRTHA", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:2, orders:1, amount:1900},
  {buyer:"POONAMBEN", leaderId:"LDR-8", leaderName:"Krunalbhai Vasani", ghariKg:2, orders:1, amount:1900},
  {buyer:"VANITABEN VAGHELA", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:2, orders:1, amount:1900},
  {buyer:"SMITBHAI/PANKAJBHAI", leaderId:"LDR-2", leaderName:"Smitbhai/Krunalbhai", ghariKg:2, orders:1, amount:1900},
  {buyer:"RAJESHBHAI CHAUHAN", leaderId:"LDR-4", leaderName:"Pavitrabhai", ghariKg:1.5, orders:1, amount:1425},
  {buyer:"HANSHABEN SABARIA", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:1.5, orders:1, amount:1425},
  {buyer:"RENUBEN", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"PRITIBEN BHATT NANAVAT", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"KINJAL DESAI", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"TIKUBEN SURUCHI", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"RAKESHBHAI UAMRIGAR", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"NISHABEN INDUBEN", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"MANOJBHAI(PETROL PUMP)", leaderId:"LDR-3", leaderName:"Bhavikbhai", ghariKg:1, orders:1, amount:950},
  {buyer:"PARTHBHAI AFRIKAWALA", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:1, orders:1, amount:950},
  {buyer:"HARSHBHAI SAVAIWALA", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:1, orders:2, amount:950},
  {buyer:"KAJALBEN", leaderId:"LDR-5", leaderName:"Bittubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"KRISHNA SONI", leaderId:"LDR-5", leaderName:"Bittubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"MANSHRIBEN", leaderId:"LDR-5", leaderName:"Bittubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"RAJSHRIBEN RITABEN", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:1, orders:1, amount:950},
  {buyer:"MANDABEN KHOLGADE", leaderId:"LDR-5", leaderName:"Bittubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"NILESHBHAI/PANKAJBHAI", leaderId:"LDR-1", leaderName:"Pankajbhai", ghariKg:1, orders:1, amount:950},
  {buyer:"BHAVNABEN JARIWALA", leaderId:"LDR-5", leaderName:"Bittubhai", ghariKg:1, orders:1, amount:950},
  {buyer:"RAKESHBHAI", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"NILAMBEN MISTRY", leaderId:"LDR-13", leaderName:"Pushpakbhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"RAJAWADI MUMBAI", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"RAKESHBHAI MADHAVANI", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"AMITABEN SAVANT", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"RITABEN", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"NISTHABEN PATEL", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"RITABEN AFRIKAWALA", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"PRASHANTBHAI BATEKA", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"LILABEN RITABEN", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"BHAGAT", leaderId:"LDR-7", leaderName:"Chachubhai", ghariKg:0.5, orders:1, amount:475},
  {buyer:"SAPNABEN MANDIRWALA", leaderId:"LDR-9", leaderName:"Umeshbhai", ghariKg:0, orders:1, amount:0},
  {buyer:"RAJUBHAI SARANG", leaderId:"LDR-4", leaderName:"Pavitrabhai", ghariKg:0, orders:1, amount:0}
];

// One-time dump of the final workbook into the GhariBuyers sheet. Idempotent:
// skips if rows already exist (pass force=true to wipe + reseed).
function seedGhariBuyers_(force){
  var existing = readAll_('GhariBuyers');
  if(existing.length && !force) return { seeded:false, count: existing.length };
  if(existing.length && force){
    var sh = tab_('GhariBuyers'); var lr = sh.getLastRow();
    if(lr > 1) sh.deleteRows(2, lr - 1);
  }
  var now = new Date().toISOString();
  var rows = GHARI_BUYERS_SEED.map(function(b, i){
    return { id:'GBY-' + (i+1), buyer:b.buyer, leaderId:b.leaderId, leaderName:b.leaderName,
             ghariKg:b.ghariKg, orders:b.orders, amount:b.amount, updatedBy:'seed', updatedOn:now };
  });
  appendRows_('GhariBuyers', rows);
  return { seeded:true, count: rows.length };
}

// Read the fixed leaders + every buyer mapping + per-leader targets. Auto-seeds
// buyers on first call.
function doGetGhariBuyers_(p){
  seedGhariBuyers_(false);
  return json_({ ok:true, leaders: seedMandalLeaders_(false), buyers: readAll_('GhariBuyers'), targets: readAll_('GhariLeaderTargets') });
}

// Upsert per-leader Target (kg). rows = [{ leaderId, target }].
function doSaveGhariLeaderTargets_(p){
  var rows = p.rows || [];
  if(typeof rows === 'string'){ try{ rows = JSON.parse(rows); }catch(e){ rows = []; } }  // GET-friendly
  var now = new Date().toISOString();
  rows.forEach(function(r){
    if(!r || !r.leaderId) return;
    var row = { leaderId: String(r.leaderId), target: Number(r.target)||0, updatedBy: (r.updatedBy||p.actor||''), updatedOn: now };
    var rn = findRow_('GhariLeaderTargets', 'leaderId', row.leaderId);
    if(rn > 0) tab_('GhariLeaderTargets').getRange(rn,1,1,HEADERS.GhariLeaderTargets.length).setValues([rowFromObj_('GhariLeaderTargets', row)]);
    else appendRows_('GhariLeaderTargets', [row]);
  });
  logChange_('UPDATE', 'GhariLeaderTargets', { name: rows.length + ' leader target(s) set', updatedBy: p.actor }, mailFlag_(p));
  return json_({ ok:true, count: rows.length });
}

// Keep the denormalized leaderName in step with leaderId, whatever the client sent.
function ghariBuyerFillLeaderName_(row){
  if(!row) return row;
  if(row.leaderId){
    var l = readAll_('MandalLeaders').filter(function(x){ return String(x.id) === String(row.leaderId); })[0];
    if(l) row.leaderName = l.name;
  } else { row.leaderName = row.leaderName || ''; }
  return row;
}

// Upsert one buyer (add or edit). Generates an id for a new buyer.
function doSaveGhariBuyer_(p){
  var row = p.row || {};
  if(!row.buyer || !String(row.buyer).trim()) return json_({ ok:false, error:'Buyer name is required.' });
  if(!row.id) row.id = 'GBY-' + Date.now() + '-' + Math.floor(Math.random()*1000);
  ghariBuyerFillLeaderName_(row);
  row.updatedOn = new Date().toISOString();
  var mode = leaderUpsert_('GhariBuyers', row);
  logChange_(mode==='insert'?'INSERT':'UPDATE', 'GhariBuyers', { name: row.buyer + ' → ' + (row.leaderName||'—'), updatedBy: row.updatedBy }, mailFlag_(p));
  return json_({ ok:true, mode: mode, row: row });
}

// Transfer / bulk edit: upsert many buyers in one call (used by the Transfer flow).
function doBulkSaveGhariBuyers_(p){
  var rows = p.rows || [];
  if(!rows.length) return json_({ ok:false, error:'no rows' });
  var now = new Date().toISOString();
  rows.forEach(function(row){
    if(!row.buyer) return;
    if(!row.id) row.id = 'GBY-' + Date.now() + '-' + Math.floor(Math.random()*1000);
    ghariBuyerFillLeaderName_(row);
    row.updatedOn = now;
    leaderUpsert_('GhariBuyers', row);
  });
  var leadName = (rows[0] && rows[0].leaderName) || '';
  logChange_('UPDATE', 'GhariBuyers', { name: rows.length + ' buyer(s) → ' + (leadName||'reassigned'), updatedBy: (rows[0]&&rows[0].updatedBy)||p.actor }, mailFlag_(p));
  return json_({ ok:true, count: rows.length });
}

// Delete one buyer mapping.
function doRemoveGhariBuyer_(p){
  if(!p.id) return json_({ ok:false, error:'missing id' });
  var rn = findRow_('GhariBuyers', 'id', p.id);
  if(rn > 0){ tab_('GhariBuyers').deleteRow(rn); logChange_('DELETE', 'GhariBuyers', { name: p.buyer || p.id, actor: p.actor }, mailFlag_(p)); }
  return json_({ ok:true });
}

function sendLeaderboardEmail_(board, entries, mode, p){
  var mf = mailFlag_(p);
  if(mf === false) return;                         // client said mail was OFF
  if(mf !== true && !mailEnabled_()) return;       // else honour global flag
  var unit = board.unit || 'Kg';
  var target = 0, done = 0;
  entries.forEach(function(e){ target += Number(e.target)||0; done += Number(e.done)||0; });
  var pct = target > 0 ? (done/target*100).toFixed(2) : '0.00';
  var verb = mode === 'insert' ? 'created' : 'updated';
  var who = board.updatedBy || board.createdBy || '';
  var subject = 'Akshar Connect: Leaderboard ' + verb + ' — ' + (board.title || '');
  var rowsHtml = entries.slice().sort(function(a,b){ return (Number(a.sortOrder)||0)-(Number(b.sortOrder)||0); }).map(function(e,i){
    var t = Number(e.target)||0, d = Number(e.done)||0;
    var pp = t > 0 ? ((d/t)*100).toFixed(1) : '0.0';
    return '<tr><td style="padding:4px 8px">'+(i+1)+'</td><td style="padding:4px 8px">'+(e.leaderName||'')+'</td><td align="right" style="padding:4px 8px">'+d+' / '+t+'</td><td align="right" style="padding:4px 8px">'+pp+'%</td></tr>';
  }).join('');
  var html = '<div style="font-family:Arial,sans-serif;color:#222">'
    + '<h2 style="margin:0 0 4px">🌸 ' + (board.title || '') + '</h2>'
    + (board.subtitle ? '<p style="margin:0 0 8px;color:#666">'+board.subtitle+'</p>' : '')
    + '<p>Leaderboard <b>'+verb+'</b>'+(who?(' by '+who):'')+'.</p>'
    + '<p style="font-size:16px"><b>Total:</b> '+done+' / '+target+' '+unit+' ('+pct+'%)</p>'
    + '<table cellspacing="0" style="border-collapse:collapse;border:1px solid #ddd">'
    + '<tr style="background:#1B5E20;color:#fff"><th style="padding:4px 8px">SN</th><th style="padding:4px 8px" align="left">Katyakarta</th><th style="padding:4px 8px">Done / Target</th><th style="padding:4px 8px">%</th></tr>'
    + rowsHtml + '</table></div>';
  var plain = (board.title || '') + ' ' + verb + '. Total ' + done + ' / ' + target + ' ' + unit + ' (' + pct + '%).';
  sendMail_(subject, plain, null, html);
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
    if(action==='repairDupSabhaIds') return json_({ ok:true, result: repairDuplicateSabhaIds_() });
    if(action==='ghariRawDump'){ var _sh=ss_().getSheetByName(p.tab||'GhariOrders'); if(!_sh) return json_({ok:false,error:'no tab'}); var _lc=_sh.getLastColumn(), _lr=_sh.getLastRow(); return json_({ ok:true, rows: _sh.getRange(1,1,_lr,_lc).getValues() }); }
    if(action==='realignGhariOrders') return json_({ ok:true, result: realignGhariOrders_(p && p.apply === true) });
    if(action==='backfillGhariOrderNos') return json_({ ok:true, result: backfillGhariOrderNos_() });
    if(action==='getLeaderboards') return doGetLeaderboards_(p);
    if(action==='seedMandalLeaders') return json_({ ok:true, leaders: seedMandalLeaders_(p && p.force === true) });
    if(action==='saveLeaderboard') return doSaveLeaderboard_(p);
    if(action==='deleteLeaderboard') return doDeleteLeaderboard_(p);
    if(action==='addLeaderLog') return doAddLeaderLog_(p);
    if(action==='deleteLeaderLog') return doDeleteLeaderLog_(p);
    if(action==='getGhariBuyers') return doGetGhariBuyers_(p);
    if(action==='saveGhariBuyer') return doSaveGhariBuyer_(p);
    if(action==='bulkSaveGhariBuyers') return doBulkSaveGhariBuyers_(p);
    if(action==='removeGhariBuyer') return doRemoveGhariBuyer_(p);
    if(action==='seedGhariBuyers') return json_({ ok:true, result: seedGhariBuyers_(p && p.force === true) });
    if(action==='saveGhariLeaderTargets') return doSaveGhariLeaderTargets_(p);
    if(action==='reset'){ resetAll_(); return json_({ ok:true, msg:'reset done' }); }
    if(action==='bootstrap') return json_({ ok:true,
      users:readAll_('Users'), devotees:readAll_('Devotees'),
      // `attendance` is intentionally NOT read here — the live app's Attendance page
      // uses the cached getGroupAttendance endpoint instead, so reading the whole
      // Attendance sheet on every bootstrap was wasted time.
      sabhas:readAll_('Sabhas'), thoughts:readAll_('Thoughts'), followups:readAll_('Followups'), areas:readAll_('Areas'),
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
    if(action==='insert'){
      appendRows_(p.collection, [p.row]); logChange_('INSERT', p.collection, p.row, mailFlag_(p));
      if(p.collection==='Devotees') devoteeLog_('create', (p.row&&p.row.createdBy)||p.actor||'', null, p.row);
      return json_({ ok:true, row:p.row });
    }
    if(action==='bulkUpdateTags') return doBulkUpdateTags_(p);
    if(action==='bulkSetTags') return doBulkSetTags_(p);
    if(action==='update'){
      var rn=findRow_(p.collection, p.keyField||'id', p.key);
      if(rn<0) return json_({ ok:false, error:'not found' });
      var beforeDev = (p.collection==='Devotees') ? readRowObj_(p.collection, rn) : null;
      tab_(p.collection).getRange(rn,1,1,HEADERS[p.collection].length).setValues([rowFromObj_(p.collection,p.row)]);
      logChange_('UPDATE', p.collection, p.row, mailFlag_(p), p.changed);
      if(p.collection==='Devotees') devoteeLog_('update', (p.row&&p.row.updatedBy)||p.actor||'', beforeDev, p.row);
      return json_({ ok:true });
    }
    if(action==='remove'){
      var r=findRow_(p.collection, p.keyField||'id', p.key);
      var beforeRem = (r>0 && p.collection==='Devotees') ? readRowObj_(p.collection, r) : null;
      if(r>0) { tab_(p.collection).deleteRow(r); logChange_('DELETE', p.collection, { key: p.key, name: p.name, actor: p.actor }, mailFlag_(p)); }
      if(beforeRem) devoteeLog_('delete', p.actor||'', beforeRem, null);
      return json_({ ok:true });
    }
    if(action==='getDevoteeLog'){
      var dl = readAll_('DevoteeLog');
      if(p.devoteeId) dl = dl.filter(function(r){ return String(r.devoteeId) === String(p.devoteeId); });
      dl.sort(function(a,b){ return String(b.ts).localeCompare(String(a.ts)); });
      return json_({ ok:true, logs: dl.slice(0, Number(p.limit)||200) });
    }
    if(action==='devoteeRevert') return doDevoteeRevert_(p);
    if(action==='markAttendance') { return doMark_(p); }
    if(action==='saveFollowup') return doSaveFollowup_(p);
    // Managing users and their rights is ADMIN-ONLY — enforced server-side so a
    // non-admin can't grant themselves (or anyone) a role/module via a crafted call.
    if(action==='upsertUser'){ if(!isAdminActor_(p)) return json_({ ok:false, error:'Not allowed — only an Admin can add or change users.' }); return doUpsertUser_(p); }
    if(action==='deleteUser'){ if(!isAdminActor_(p)) return json_({ ok:false, error:'Not allowed — only an Admin can delete users.' }); return doDeleteUser_(p); }
    if(action==='logActivity'){
      // Fire-and-forget app activity log. Never throws back to the client.
      try{
        var a = p.row || {};
        appendRows_('Activity', [{
          ts: a.ts || new Date().toISOString(), actor: a.actor||'', actorMobile: a.actorMobile||'',
          action: a.action||'', target: a.target||'', detail: a.detail||'', device: a.device||''
        }]);
        // Keep the Activity tab bounded so the sheet never gets slow. When it grows
        // past ~12000 rows, drop the oldest down to ~8000 (recent history is kept).
        // Money/Ghari logs are intentionally NEVER trimmed.
        try { var _ash=tab_('Activity'); var _lr=_ash.getLastRow(); if(_lr > 12000){ _ash.deleteRows(2, _lr - 8000); } } catch(e){}
        // Activity watch: push every logged action to the watcher's device(s),
        // except the watcher's own actions. Toggle via setActivityWatch.
        try {
          var _pr = PropertiesService.getScriptProperties();
          if(_pr.getProperty('activityWatchOn') === 'true'){
            var _wm = _pr.getProperty('activityWatchMobile') || '';
            if(_wm && normMob_(_wm) !== normMob_(a.actorMobile||'')){
              // Follow-up spam guard: a drive can log hundreds of follow-ups a day.
              // The watcher only wants to know a karyakarta is ACTIVE, not every
              // devotee they touch — so send at most ONE follow-up push per
              // (karyakarta + event + day). Other action types still push every time.
              var _skip = false;
              if((a.action||'') === 'followup'){
                var _ev = (String(a.detail||'').match(/\(([^)]+)\)/) || [,''])[1]; // event title in "…(Event) — …"
                var _day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
                var _key = normMob_(a.actorMobile||'') + '|' + _ev + '|' + _day;
                var _sentDay = _pr.getProperty('fupNotifDay') || '';
                var _sentKeys = (_sentDay === _day) ? (_pr.getProperty('fupNotifKeys') || '') : '';
                if(('|' + _sentKeys + '|').indexOf('|' + _key + '|') >= 0){ _skip = true; }
                else {
                  _pr.setProperty('fupNotifDay', _day);
                  _pr.setProperty('fupNotifKeys', (_sentKeys ? _sentKeys + '|' : '') + _key);
                }
              }
              if(!_skip){
                var _who = a.actor || 'Someone';
                var _title = '👁️ ' + _who;
                var _body = (a.detail || a.action || 'did something') + (a.device ? ' · ' + a.device : '');
                pushToMobile_(_title, _body, _wm, { type:'activity', action: a.action||'' });
              }
            }
          }
        } catch(e){}
      }catch(e){}
      return json_({ ok:true });
    }
    if(action==='setActivityWatch'){
      var _p = PropertiesService.getScriptProperties();
      _p.setProperty('activityWatchOn', p.on ? 'true' : 'false');
      if(p.mobile) _p.setProperty('activityWatchMobile', String(p.mobile));
      return json_({ ok:true, on: p.on ? true : false, mobile: _p.getProperty('activityWatchMobile') || '' });
    }
    if(action==='getActivityWatch'){
      var _g = PropertiesService.getScriptProperties();
      return json_({ ok:true, on: _g.getProperty('activityWatchOn') === 'true', mobile: _g.getProperty('activityWatchMobile') || '' });
    }
    if(action==='activity'){
      var lim = Math.min(parseInt(p.limit,10)||300, 1000);
      // Read only the recent tail instead of the whole (potentially huge) tab.
      var windowN = p.actor ? 5000 : lim;
      var tail = readTail_('Activity', windowN);
      if(p.actor) tail = tail.filter(function(r){ return String(r.actor)===String(p.actor); });
      var out = tail.slice(Math.max(0, tail.length-lim)).reverse(); // newest first
      return json_({ ok:true, activity: out });
    }
    // ── App usage analytics (admin only) ────────────────────────────────────
    if(action==='getUsageDump'){ if(!isAdminActor_(p)) return json_({ ok:false, error:'Admins only' }); return doGetUsageDump_(p); }
    if(action==='getUsageStats'){ if(!isAdminActor_(p)) return json_({ ok:false, error:'Admins only' }); return doGetUsageStats_(p); }
    if(action==='getUsageDetail'){ if(!isAdminActor_(p)) return json_({ ok:false, error:'Admins only' }); return doGetUsageDetail_(p); }
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
    // Server-side write protection: Ghari is view-only for everyone except
    // Admins and users explicitly granted the `ghari` module. The UI already
    // hides write controls from Sevaks, but this guard blocks a crafted request
    // that bypasses the UI (money ledger — never trust the client alone).
    // Identity is the caller's actorMobile, verified against the Users sheet.
    if(GHARI_WRITE_ACTIONS_[action] && !ghariCanWrite_(p))
      return json_({ ok:false, error:'Not allowed — Ghari Seva is view-only for your account. (actorMobile=' + normMob_(p && p.actorMobile || '') + ')' });
    if(action==='ghariBootstrap'){
      // Optional season scoping: when the client asks for one season, return only
      // that year's orders/purchases so other years are never scanned or sent.
      // Products are a small shared catalog → always returned in full.
      var _gSeason = (p && p.season) ? String(p.season) : '';
      var _gOrders = readAll_('GhariOrders');
      var _gPurch  = readAll_('GhariPurchases');
      var _gStock  = readAll_('GhariStock');
      var _gPays   = readAll_('GhariMandalPayments');
      // Distinct list of years present (tiny) so the client's season switcher shows
      // every year even when the orders payload is scoped to just one.
      var _seasonSet = {}; _gOrders.forEach(function(o){ var s=String(o.season||''); if(s) _seasonSet[s]=1; });
      _gPurch.forEach(function(pu){ var s=String(pu.season||''); if(s) _seasonSet[s]=1; });
      _gStock.forEach(function(st){ var s=String(st.season||''); if(s) _seasonSet[s]=1; });
      _gPays.forEach(function(pm){ var s=String(pm.season||''); if(s) _seasonSet[s]=1; });
      var _seasons = Object.keys(_seasonSet).sort(function(a,b){ return Number(b)-Number(a); });
      if(_gSeason){
        _gOrders = _gOrders.filter(function(o){ return String(o.season) === _gSeason; });
        _gPurch  = _gPurch.filter(function(pu){ return String(pu.season) === _gSeason; });
        _gStock  = _gStock.filter(function(st){ return String(st.season) === _gSeason; });
        _gPays   = _gPays.filter(function(pm){ return String(pm.season) === _gSeason; });
      }
      return json_({ ok:true, products: readAll_('GhariProducts'), orders: _gOrders, purchases: _gPurch, stocks: _gStock, mandalPayments: _gPays, season: _gSeason, seasons: _seasons });
    }
    if(action==='repairGhariShift')   return doRepairGhariShift_(p);
    if(action==='ghariMarkDelivery')  return doGhariMarkDelivery_(p);
    if(action==='ghariUpsertOrder')   return doGhariUpsertOrder_(p);
    if(action==='ghariUpsertProduct') return doGhariUpsert_('GhariProducts', p.row || {}, 'sku');
    if(action==='ghariDeleteOrder')   return doGhariDelete_('GhariOrders', p.id, 'id');
    if(action==='ghariDeleteProduct') return doGhariDelete_('GhariProducts', p.sku, 'sku');
    if(action==='ghariUpsertPurchase') return doGhariUpsert_('GhariPurchases', p.row || {}, 'id');
    if(action==='ghariDeletePurchase') return doGhariDelete_('GhariPurchases', p.id, 'id');
    if(action==='ghariUpsertStock')    return doGhariUpsert_('GhariStock', p.row || {}, 'id');
    if(action==='ghariDeleteStock')    return doGhariDelete_('GhariStock', p.id, 'id');
    if(action==='ghariUpsertMandalPayment') return doGhariUpsert_('GhariMandalPayments', p.row || {}, 'id');
    if(action==='ghariDeleteMandalPayment') return doGhariDelete_('GhariMandalPayments', p.id, 'id');
    if(action==='ghariImportOrders'){ var _r=p.rows||[]; if(_r.length) appendRows_('GhariOrders', _r); return json_({ ok:true, count:_r.length }); }
    if(action==='uploadPhoto') return doUploadPhoto_(p);
    if(action==='uploadChallan') return doUploadChallan_(p);
    if(action==='remapFamilyIds') return doRemapFamilyIds_(p);
    if(action==='backfillFamilyAddresses') return doBackfillFamilyAddresses_(p);
    if(action==='registerPushToken') return doRegisterPushToken_(p);
    if(action==='getAnnouncements') return doGetAnnouncements_();
    if(action==='createAnnouncement') return doCreateAnnouncement_(p);
    if(action==='logNotifRead'){
      // A user marked a push notification as read. Append one audit row, de-duped
      // per (mobile, announcementId) so re-marking never doubles the log.
      var _mob = normMob_(p && p.actorMobile || '');
      var _aid = String(p.announcementId||''); if(!_aid) return json_({ ok:false, error:'missing announcementId' });
      var _existing = readAll_('NotifReads');
      for(var _i=0;_i<_existing.length;_i++){ if(String(_existing[_i].announcementId)===_aid && normMob_(_existing[_i].mobile)===_mob){ return json_({ ok:true, deduped:true }); } }
      appendRows_('NotifReads', [{ id:'NR-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), announcementId:_aid, title:String(p.title||''), mobile:_mob, name:String(p.name||p.by||''), readOn:new Date().toISOString() }]);
      return json_({ ok:true });
    }
    if(action==='getNotifReads'){
      var _nr = readAll_('NotifReads');
      _nr.sort(function(a,b){ return String(b.readOn).localeCompare(String(a.readOn)); });
      return json_({ ok:true, reads: _nr.slice(0, Math.min(Number(p.limit)||100, 500)) });
    }
    if(action==='sendPush'){
      // Manual admin push WITHOUT saving an announcement (not shown in the 🔔 list).
      var _aud = (['all','staff','devotees'].indexOf(p.audience) >= 0 ? p.audience : 'all');
      var _t = String(p.title || '').slice(0,120), _b = String(p.body || '').slice(0,2000);
      if(!_t) return json_({ ok:false, error:'Title required' });
      var _sent = 0; try { _sent = sendPush_(_t, _b, _aud, { type:'announcement', by:String(p.createdBy||p.by||'') }); } catch(e){ return json_({ ok:false, error:String(e) }); }
      return json_({ ok:true, sent:_sent });
    }
    if(action==='sendFollowupReminder') return doSendFollowupReminder_(p);
    if(action==='logPushStatus') return doLogPushStatus_(p);
    if(action==='getPushStatus') return doGetPushStatus_();
    // Push delivery log — campaigns + per-recipient received/clicked.
    if(action==='getPushLog'){
      var _pl = readAll_('PushLog');
      _pl.sort(function(a,b){ return String(b.createdOn).localeCompare(String(a.createdOn)); });
      return json_({ ok:true, log: _pl.slice(0, Math.min(Number(p.limit)||50, 200)) });
    }
    if(action==='getPushRecipients'){
      var _pr = readAll_('PushRecipients').filter(function(r){ return String(r.notifId) === String(p.nid); });
      return json_({ ok:true, recipients: _pr });
    }
    if(action==='pushClicked') return json_(pushClicked_(p));
    if(action==='saveSwadhyay') return doSaveSwadhyay_(p);
    if(action==='getSwadhyay') return doGetSwadhyay_(p);
    if(action==='saveSeva') return doSaveSeva_(p);
    if(action==='getSeva') return doGetSeva_(p);
    if(action==='deleteSeva') return doDeleteSeva_(p);
    if(action==='savePlan') return doSavePlan_(p);
    if(action==='getPlans') return doGetPlans_(p);
    if(action==='deletePlan') return doDeletePlan_(p);
    if(action==='uploadFeedMedia') return doUploadFeedMedia_(p);
    if(action==='createPost') return doCreatePost_(p);
    if(action==='getFeed') return doGetFeed_(p);
    if(action==='deletePost') return doDeletePost_(p);
    if(action==='editPost') return doEditPost_(p);
    if(action==='toggleLike') return doToggleLike_(p);
    if(action==='getComments') return doGetComments_(p);
    if(action==='addComment') return doAddComment_(p);
    if(action==='deleteComment') return doDeleteComment_(p);
    if(action==='sendEmail') return doSendEmail_(p);
    if(action==='getEmailQuota') return doGetEmailQuota_();
    if(action==='getEmailCampaigns') return doGetEmailCampaigns_();
    if(action==='getEmailTemplates') return doGetEmailTemplates_();
    if(action==='saveEmailTemplate') return doSaveEmailTemplate_(p);
    if(action==='deleteEmailTemplate') return doDeleteEmailTemplate_(p);
    if(action==='getGhariLog'){
      var gl = readAll_('GhariLog');
      if(p.entityId) gl = gl.filter(function(r){ return String(r.entityId) === String(p.entityId); });
      if(p.entity) gl = gl.filter(function(r){ return String(r.entity) === String(p.entity); });
      // Self-only: non-admins (Sevaks) see just their OWN actions, not everyone's.
      if(p.actor){ var _a=String(p.actor).trim().toLowerCase(); gl = gl.filter(function(r){ return String(r.actor||'').trim().toLowerCase() === _a; }); }
      gl.sort(function(a,b){ return String(b.ts).localeCompare(String(a.ts)); });
      return json_({ ok:true, logs: gl.slice(0, Number(p.limit)||300) });
    }
    if(action==='ghariRevert') return doGhariRevert_(p);
    // ── Bus Seva ───────────────────────────────────────────────────────────────
    // Idempotent upserts keyed by client-generated ids, so the offline outbox can
    // replay a lost op without ever duplicating a row. Reads are open; writes are
    // gated to Admins / Sevaks / users granted the `bus` module (busCanWrite_).
    if(BUS_WRITE_ACTIONS_[action] && !busCanWrite_(p))
      return json_({ ok:false, error:'Not allowed — Bus Seva is view-only for your account.' });
    if(action==='busBootstrap')
      return json_({ ok:true, events: readAll_('BusEvents'), bookings: readAll_('BusBookings'), tallies: readAll_('BusTally') });
    if(action==='busUpsertEvent')   return busUpsert_('BusEvents', p.row || {});
    if(action==='busDeleteEvent')   return busDelete_('BusEvents', p.id);
    if(action==='busUpsertBooking') return busUpsert_('BusBookings', p.row || {});
    if(action==='busDeleteBooking') return busDelete_('BusBookings', p.id);
    if(action==='busUpsertTally')   return busUpsert_('BusTally', p.row || {});
    if(action==='busDeleteTally')   return busDelete_('BusTally', p.id);
    if(action==='getVato') return cachedJson_('vato', 1800, function(){ return JSON.parse(doGetVato_().getContent()); });
    if(action==='backupNow') return json_({ ok:true, result: backupSpreadsheet_(Number(p.keep)||90) });
    if(action==='getGroupAttendance') return cachedJson_('groupAtt', 600, function(){ return JSON.parse(doGetGroupAttendance_().getContent()); });
    if(action==='clearBase64Photos') return doClearBase64Photos_();
    if(action==='migrateBase64Photos') return doMigrateBase64Photos_();
    if(action==='logError'){ logErrorRow_(p); sendErrorEmail_(p); return json_({ ok:true }); }
    // Pull recent errors (newest first). status = open (default) | resolved | all.
    if(action==='getErrorLog'){
      var _all = readAll_('ErrorLog');
      var _st = (p && p.status) || 'open';
      var _lim = Math.min(Number(p && p.limit) || 200, 1000);
      var _rows = _all.filter(function(r){ return _st === 'all' ? true : String(r.status || 'open') === _st; });
      _rows = _rows.slice(-_lim).reverse();
      return json_({ ok:true, errors:_rows, total:_all.length, open:_all.filter(function(r){ return String(r.status||'open')==='open'; }).length });
    }
    // Mark error(s) resolved — p.id, p.ids[], or p.all === true.
    if(action==='resolveError') return json_({ ok:true, result: resolveError_(p) });
    return json_({ ok:false, error:'unknown action: '+action });
  }catch(err){ return json_({ ok:false, error:String(err) }); }
}

// True only when the caller (actorMobile) is an Admin in the Users sheet.
function isAdminActor_(p){
  var mob = normMob_(p && p.actorMobile || '');
  if(!mob) return false;
  var users = readAll_('Users');
  for(var i=0;i<users.length;i++){
    if(normMob_(users[i].mobile) === mob) return String(users[i].role||'').trim().toLowerCase() === 'admin';
  }
  return false;
}

// ONE fast read for the whole App Usage page: the most-recent `limit` activity
// rows (newest first), read via readTail_ so a huge Activity sheet isn't scanned
// in full. The client aggregates counts and does every drill-down from this in
// memory — so clicking a module/member is instant and never hits the backend
// again (the old per-click getUsageDetail re-read the entire sheet each time).
function doGetUsageDump_(p){
  var sh = tab_('Activity'); var last = sh.getLastRow();
  var total = last > 1 ? (last - 1) : 0;
  var n = Math.min(Number(p.limit) || 6000, 8000);
  var rows = readTail_('Activity', n);        // oldest → newest
  var out = [];
  for(var i = rows.length - 1; i >= 0; i--){  // newest first
    var r = rows[i];
    out.push({ ts:r.ts, actor:r.actor, actorMobile:r.actorMobile, action:r.action, detail:r.detail, device:r.device });
  }
  return json_({ ok:true, rows: out, total: total, truncated: total > out.length });
}

// Aggregate the whole Activity log into usage stats: total events, distinct
// members, a per-action count, and a per-member summary (count + first/last seen).
// All small — the heavy row list is fetched on demand by getUsageDetail.
function doGetUsageStats_(p){
  var rows = readAll_('Activity');
  var byAction = {};
  var usersByKey = {};
  rows.forEach(function(r){
    var act = String(r.action || 'other');
    byAction[act] = (byAction[act] || 0) + 1;
    var mob = normMob_(r.actorMobile || '');
    var key = mob || ('name:' + String(r.actor || '?'));
    var u = usersByKey[key] || (usersByKey[key] = { name:String(r.actor||''), mobile:mob, count:0, firstTs:'', lastTs:'', actions:{} });
    u.count++;
    u.actions[act] = (u.actions[act] || 0) + 1;
    var ts = String(r.ts || '');
    if(ts > u.lastTs){ u.lastTs = ts; if(r.actor) u.name = String(r.actor); }
    if(!u.firstTs || ts < u.firstTs) u.firstTs = ts;
  });
  var users = Object.keys(usersByKey).map(function(k){ return usersByKey[k]; })
    .sort(function(a,b){ return b.count - a.count; });
  return json_({ ok:true, total: rows.length, members: users.length, byAction: byAction, users: users });
}

// Return the raw Activity rows (newest first) for a drill-down: filter by one
// action, a comma-list of actions, and/or a member's mobile. Capped at `limit`.
function doGetUsageDetail_(p){
  var actions = {};
  String(p.actions || p.action || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean).forEach(function(a){ actions[a] = 1; });
  var hasActionFilter = Object.keys(actions).length > 0;
  var mob = normMob_(p.actorMobile || '');
  var limit = Math.min(Number(p.limit) || 500, 3000);
  var rows = readAll_('Activity');
  var out = [];
  for(var i = rows.length - 1; i >= 0 && out.length < limit; i--){
    var r = rows[i];
    if(hasActionFilter && !actions[String(r.action)]) continue;
    if(mob && normMob_(r.actorMobile || '') !== mob) continue;
    out.push({ ts:r.ts, actor:r.actor, actorMobile:r.actorMobile, action:r.action, target:r.target, detail:r.detail, device:r.device });
  }
  return json_({ ok:true, rows: out });
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
// ── Ghari write authorization ────────────────────────────────────────────────
// The set of actions that mutate the Ghari ledger (orders, products, purchases,
// imports, reverts). Reads (ghariBootstrap, getGhariLog) are intentionally open.
var GHARI_WRITE_ACTIONS_ = {
  ghariUpsertOrder: 1, ghariUpsertProduct: 1, ghariUpsertPurchase: 1,
  ghariDeleteOrder: 1, ghariDeleteProduct: 1, ghariDeletePurchase: 1,
  ghariUpsertStock: 1, ghariDeleteStock: 1,
  ghariUpsertMandalPayment: 1, ghariDeleteMandalPayment: 1,
  ghariImportOrders: 1, ghariRevert: 1,
};
// Add/edit/delete of the Ghari ledger (orders, products, purchases, stock) is for
// Admins AND any specific user an Admin granted the `ghari` module to (toggled
// per-user in Admin → Users). Everyone else stays read-only even if they forge a
// request. The caller is identified by actorMobile (sent on every request) and
// looked up in the Users sheet — mirrors the client gate (canEdit). (Marking
// delivery/payment is a separate, lighter right — see ghariKnownUser_ /
// doGhariMarkDelivery_ — open to any known user.)
function ghariCanWrite_(p){
  var mob = normMob_(p && p.actorMobile || '');
  if(!mob) return false;
  var users = readAll_('Users');
  for(var i=0;i<users.length;i++){
    if(normMob_(users[i].mobile) !== mob) continue;
    // Case/space-insensitive so a role saved as "admin" or " Admin " still counts.
    if(String(users[i].role||'').trim().toLowerCase() === 'admin') return true;
    var mods = String(users[i].modules||'').toLowerCase().split(/[,|]/);
    for(var j=0;j<mods.length;j++) if(mods[j].trim() === 'ghari') return true;
    return false;
  }
  return false;
}

// True for ANY known app user (matched by actorMobile in the Users sheet), whatever
// their role. Marking delivery is a lighter right than editing the ledger: every
// Karyakarta / Sevak / devotee who can see Ghari may record what they delivered,
// but the write is limited to delivery fields only (see doGhariMarkDelivery_).
function ghariKnownUser_(p){
  var mob = normMob_(p && p.actorMobile || '');
  if(!mob) return false;
  var users = readAll_('Users');
  for(var i=0;i<users.length;i++){ if(normMob_(users[i].mobile) === mob) return true; }
  return false;
}

// Delivery + payment quick write. Updates ONLY delivered / deliveredBoxes /
// deliveryDate and paymentReceived / paymentType / balance on an existing order —
// never items, customer or totals — so it is safe to allow for any known user
// (Karyakartas/Sevaks/devotees mark delivery AND payment; Admins edit via the full
// form). Audit-logged (ghariLog_) so an Admin sees who marked what in the History.
// Each field group is applied only when the payload carries it, so a delivery mark
// never clears payment and a payment mark never clears delivery.
function doGhariMarkDelivery_(p){
  var row = p.row || {};
  if(!ghariKnownUser_(p))
    return json_({ ok:false, error:'Not allowed — sign in to mark delivery/payment. (actorMobile=' + normMob_(p && p.actorMobile || '') + ')' });
  var lock=LockService.getScriptLock(); try{ lock.waitLock(20000); }catch(e){}
  try{
    if(!row.id) return json_({ ok:false, error:'missing id' });
    var rn=findRow_('GhariOrders','id',row.id);
    if(rn<0) return json_({ ok:false, error:'order not found' });
    var before = readRowObj_('GhariOrders', rn);
    // Compute the order's total boxes + amount from its stored items so a crafted
    // request can never claim more boxes delivered than ordered, and balance stays
    // consistent with the (unchanged) items.
    var totalBoxes = 0, total = 0;
    try{ (JSON.parse(before.itemsJson||'[]')||[]).forEach(function(it){ var q=Number(it.qty)||0; totalBoxes += q; total += q*(Number(it.unitPrice)||0); }); }catch(e){}
    var after = {};
    HEADERS.GhariOrders.forEach(function(h){ after[h] = before[h]; });
    // Delivery fields (present on a delivery or a combined quick mark).
    if(row.deliveredBoxes !== undefined || row.delivered !== undefined){
      var n = Math.max(0, Math.min(totalBoxes, Math.round(Number(row.deliveredBoxes)||0)));
      after.delivered = totalBoxes > 0 ? (n >= totalBoxes) : (String(row.delivered)==='true' || row.delivered===true);
      after.deliveredBoxes = n;
    }
    // Planned delivery date — settable (and clearable) on its own, independent of
    // the delivered/box fields.
    if(row.deliveryDate !== undefined && row.deliveryDate !== null){
      after.deliveryDate = String(row.deliveryDate);
    }
    // Payment fields (present on a payment or a combined quick mark).
    if(row.paymentReceived !== undefined || row.paymentType !== undefined){
      var paid = Math.max(0, Number(row.paymentReceived)||0);
      after.paymentReceived = paid;
      if(row.paymentType !== undefined) after.paymentType = String(row.paymentType||'');
      after.balance = total - paid;
      // Split-payment portions always travel with a payment mark (0 for a plain
      // Cash/G-Pay/Office/Pending mark), so switching an order off a split can never
      // leave a stale cash/G-Pay breakdown behind.
      after.cashReceived = Math.max(0, Number(row.cashReceived)||0);
      after.gpayReceived = Math.max(0, Number(row.gpayReceived)||0);
    }
    after.updatedBy = row.updatedBy || '';
    after.updatedOn = row.updatedOn || new Date().toISOString();
    tab_('GhariOrders').getRange(rn,1,1,HEADERS.GhariOrders.length).setValues([rowFromObj_('GhariOrders',after)]);
    ghariLog_('order', 'delivery', after.updatedBy, before, after);
    return json_({ ok:true });
  } finally { try{ lock.releaseLock(); }catch(e){} }
}

// ── One-time repair: fix the GhariOrders column-shift corruption ─────────────
// Only touches rows whose `total` cell is BLANK (the shifted ones). Rows with a
// total value are correct and left untouched. Clean values come from the Oct-15
// backup tab (by id) or, for rows created after it, the order's GhariLog `create`
// snapshot. Money (total + category amounts + balance + deliveredBoxes) is RECOMPUTED
// from itemsJson; metadata (delivered/deliveryDate/payment/status/remarks/author)
// comes from the clean snapshot. NEVER touches "Copy of GhariOrders". Dry-run by
// default (reports, no write); pass confirm:"WRITE" to actually write.
function ghariComputeFromItems_(itemsJson){
  var items=[]; try{ items=JSON.parse(itemsJson||'[]')||[]; }catch(e){}
  var cat={ghee:0,noghee:0,sf:0,bhusu:0}, total=0, boxes=0;
  items.forEach(function(it){ var line=(Number(it.qty)||0)*(Number(it.unitPrice)||0); total+=line; boxes+=Number(it.qty)||0; if(cat[it.category]===undefined)cat[it.category]=0; cat[it.category]+=line; });
  return { total:total, boxes:boxes, ghee:cat.ghee, noghee:cat.noghee, sf:cat.sf, bhusu:cat.bhusu };
}
function doRepairGhariShift_(p){
  // Writing requires BOTH confirm:"WRITE" and the one-time token, so the repair can
  // never run by accident. Dry-run (read-only reporting) needs neither.
  var doWrite = (String(p && p.confirm) === 'WRITE') && (String(p && p.token) === 'FIXSHIFT-2026-10-17');
  var BAK = 'GhariOrders_bak_20261015_183220';
  var ss = ss_();
  var sh = ss.getSheetByName('GhariOrders'); if(!sh) return json_({ ok:false, error:'no GhariOrders' });
  var H = HEADERS.GhariOrders;
  // Clean source A: the Oct-15 backup, keyed by id.
  var bak = ss.getSheetByName(BAK); var bakById={};
  if(bak){ var bv=bak.getRange(1,1,bak.getLastRow(),bak.getLastColumn()).getValues(); var bH=bv[0];
    for(var r=1;r<bv.length;r++){ var o={}; bH.forEach(function(h,i){ o[h]=bv[r][i]; }); if(o.id) bakById[String(o.id)]=o; } }
  // Clean source B: each order's GhariLog `create` snapshot (afterJson), keyed by id.
  var logById={}; readAll_('GhariLog').forEach(function(e){
    if(String(e.entity)!=='order' || String(e.action)!=='create' || !e.afterJson) return;
    try{ logById[String(e.entityId)] = JSON.parse(e.afterJson); }catch(err){}
  });
  var lock=LockService.getScriptLock(); try{ lock.waitLock(30000); }catch(e){}
  try{
    var last=sh.getLastRow(); if(last<2) return json_({ ok:true, note:'empty' });
    var vals=sh.getRange(1,1,last,H.length).getValues();
    var idx={}; H.forEach(function(h,i){ idx[h]=i; });
    var fixed=0, skippedCorrect=0, noSource=[], samples=[];
    var metaFixed=0;
    for(var rr=1; rr<vals.length; rr++){
      var row=vals[rr]; var id=String(row[idx.id]||''); if(!id) continue;
      var totalCell=String(row[idx.total]==null?'':row[idx.total]).trim();
      var dd=String(row[idx.deliveryDate]==null?'':row[idx.deliveryDate]).trim().toLowerCase();
      var ddCorrupt=(dd==='true'||dd==='false'); // a delivered bool leaked into deliveryDate
      if(totalCell!=='' && !ddCorrupt){ skippedCorrect++; continue; } // genuinely correct — leave it
      var clean = bakById[id] || logById[id];
      if(!clean){ noSource.push(id); continue; }
      var newRow = row.slice();
      if(totalCell===''){
        // Fully shifted: rebuild money from items + metadata from the clean snapshot.
        var t = ghariComputeFromItems_(String(row[idx.itemsJson]||''));
        var delivered = (String(clean.delivered)==='true' || clean.delivered===true);
        var pay = Number(clean.paymentReceived)||0;
        newRow[idx.total]=t.total; newRow[idx.withGheeAmt]=t.ghee; newRow[idx.withoutGheeAmt]=t.noghee;
        newRow[idx.sugarFreeAmt]=t.sf; newRow[idx.bhusuAmt]=t.bhusu;
        newRow[idx.delivered]=delivered; newRow[idx.deliveredBoxes]=delivered? t.boxes : 0;
        newRow[idx.deliveryDate]=clean.deliveryDate||'';
        newRow[idx.paymentReceived]=pay; newRow[idx.balance]=t.total - pay;
        newRow[idx.paymentType]=clean.paymentType||''; newRow[idx.status]=clean.status||'active';
        newRow[idx.remarks]=clean.remarks||'';
        if(idx.subOrdersJson!==undefined && (clean.subOrdersJson)) newRow[idx.subOrdersJson]=clean.subOrdersJson;
        newRow[idx.createdBy]=clean.createdBy||''; newRow[idx.createdOn]=clean.createdOn||'';
        newRow[idx.updatedBy]=clean.updatedBy||''; newRow[idx.updatedOn]=clean.updatedOn||'';
        fixed++;
        if(samples.length<4) samples.push({ id:id, src: bakById[id]?'bak':'log', total:t.total, pay:pay, ptype:newRow[idx.paymentType], status:newRow[idx.status], delivered:delivered, remarks:newRow[idx.remarks] });
      } else {
        // Partially shifted (money already correct): fix ONLY the garbage metadata
        // fields from the clean snapshot; never touch total/payment/amounts.
        newRow[idx.deliveryDate]=clean.deliveryDate||'';
        newRow[idx.remarks]=clean.remarks||'';
        if(clean.createdBy) newRow[idx.createdBy]=clean.createdBy;
        metaFixed++;
        if(samples.length<4) samples.push({ id:id, src:'meta', keptTotal:row[idx.total], keptPay:row[idx.paymentReceived], newDDate:newRow[idx.deliveryDate], newRemarks:newRow[idx.remarks], newCreatedBy:newRow[idx.createdBy] });
      }
      if(doWrite) vals[rr]=newRow;
    }
    if(doWrite && (fixed>0 || metaFixed>0)){
      // Save a safety backup of the live sheet first, then write the corrected block.
      try{ sh.copyTo(ss).setName('GhariOrders_prefix_'+Utilities.formatDate(new Date(),'GMT','yyyyMMdd_HHmmss')); }catch(e){}
      sh.getRange(1,1,vals.length,H.length).setValues(vals);
    }
    return json_({ ok:true, mode: doWrite?'WRITE':'DRY-RUN', fixed:fixed, metaFixed:metaFixed, skippedCorrect:skippedCorrect, noSource:noSource, samples:samples });
  } finally { try{ lock.releaseLock(); }catch(e){} }
}

// Read one row (1-based sheet row number) as an object keyed by HEADERS.
function readRowObj_(collection, rn){
  var H=HEADERS[collection]; var v=tab_(collection).getRange(rn,1,1,H.length).getValues()[0];
  var o={}; H.forEach(function(h,i){ o[h]=(v[i]===null?'':v[i]); }); return o;
}
// Append one Ghari audit entry. Diffs before→after (ignoring timestamp/author cols)
// and keeps full snapshots so the change is both human-readable and revertible.
function ghariLog_(entity, action, actor, beforeRow, afterRow){
  try{
    var coll = entity==='order' ? 'GhariOrders' : (entity==='purchase' ? 'GhariPurchases' : (entity==='stock' ? 'GhariStock' : (entity==='mandalPayment' ? 'GhariMandalPayments' : 'GhariProducts')));
    var H = HEADERS[coll];
    var skip = { updatedOn:1, createdOn:1, updatedBy:1, createdBy:1 };
    var changes = [];
    if(beforeRow && afterRow){
      H.forEach(function(f){
        if(skip[f]) return;
        var b = beforeRow[f], a = afterRow[f];
        if(String(b==null?'':b) !== String(a==null?'':a)) changes.push({ field:f, before:(b==null?'':b), after:(a==null?'':a) });
      });
    }
    var rec = {
      id: 'GLOG-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      ts: new Date().toISOString(), entity: entity,
      entityId: String((afterRow&&afterRow.id)||(beforeRow&&beforeRow.id)||(afterRow&&afterRow.sku)||(beforeRow&&beforeRow.sku)||''),
      action: action, actor: String(actor||''),
      changesJson: JSON.stringify(changes),
      beforeJson: beforeRow ? JSON.stringify(beforeRow) : '',
      afterJson: afterRow ? JSON.stringify(afterRow) : ''
    };
    appendRows_('GhariLog', [rec]);
  }catch(e){}
}

// Append one devotee audit entry (old↔new snapshot) for history + revert.
function devoteeLog_(action, actor, beforeRow, afterRow){
  try{
    var H = HEADERS.Devotees;
    var skip = { updatedOn:1, createdOn:1, updatedBy:1, createdBy:1, attendanceRate:1 };
    var changes = [];
    if(beforeRow && afterRow){
      H.forEach(function(f){ if(skip[f]) return; var b=beforeRow[f], a=afterRow[f]; if(String(b==null?'':b) !== String(a==null?'':a)) changes.push({ field:f, before:(b==null?'':b), after:(a==null?'':a) }); });
    }
    var rec = {
      id: 'DLOG-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      ts: new Date().toISOString(),
      devoteeId: String((afterRow&&afterRow.id)||(beforeRow&&beforeRow.id)||''),
      name: String((afterRow&&afterRow.name)||(beforeRow&&beforeRow.name)||''),
      action: action, actor: String(actor||''),
      changesJson: JSON.stringify(changes),
      beforeJson: beforeRow ? JSON.stringify(beforeRow) : '',
      afterJson: afterRow ? JSON.stringify(afterRow) : ''
    };
    appendRows_('DevoteeLog', [rec]);
  }catch(e){}
}
// Revert a devotee to the "before" snapshot of a log entry (restores old values).
function doDevoteeRevert_(p){
  var lock=LockService.getScriptLock(); try{ lock.waitLock(20000); }catch(e){}
  try{
    var logs = readAll_('DevoteeLog'); var entry = null;
    for(var i=0;i<logs.length;i++){ if(String(logs[i].id) === String(p.logId)){ entry = logs[i]; break; } }
    if(!entry) return json_({ ok:false, error:'log entry not found' });
    var before; try{ before = JSON.parse(entry.beforeJson || 'null'); }catch(e){ before = null; }
    if(!before) return json_({ ok:false, error:'no previous values to revert to (this was the first version)' });
    var rn = findRow_('Devotees','id', before.id);
    var cur = rn>0 ? readRowObj_('Devotees', rn) : null;
    if(rn>0) tab_('Devotees').getRange(rn,1,1,HEADERS.Devotees.length).setValues([rowFromObj_('Devotees', before)]);
    else appendRows_('Devotees', [before]);
    devoteeLog_('revert', String(p.actor||''), cur, before);
    return json_({ ok:true, restored: before });
  } finally { try{ lock.releaseLock(); }catch(e){} }
}

function doGhariUpsert_(collection, row, keyField){
  var lock=LockService.getScriptLock(); try{ lock.waitLock(20000); }catch(e){}
  try{
    if(!row || !row[keyField]) return json_({ ok:false, error:'missing '+keyField });
    var rn=findRow_(collection, keyField, row[keyField]);
    var before = rn>0 ? readRowObj_(collection, rn) : null;
    if(rn>0) tab_(collection).getRange(rn,1,1,HEADERS[collection].length).setValues([rowFromObj_(collection,row)]);
    else appendRows_(collection,[row]);
    var entity = collection==='GhariPurchases' ? 'purchase' : (collection==='GhariProducts' ? 'product' : (collection==='GhariStock' ? 'stock' : (collection==='GhariMandalPayments' ? 'mandalPayment' : 'order')));
    var act = !before ? 'create' : (String(row.status||'').toLowerCase()==='void' ? 'void' : 'update');
    ghariLog_(entity, act, row.updatedBy || row.createdBy || '', before, row);
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
    var beforeOrder = rn>0 ? readRowObj_('GhariOrders', rn) : null;
    // Order number is permanent: keep whatever was assigned when the order was
    // created. Only mint a new one if this order has never had one (a brand-new
    // order from an old client, or a legacy row not yet backfilled).
    if(!(parseInt(row.orderNo,10) > 0)){
      if(beforeOrder && parseInt(beforeOrder.orderNo,10) > 0) row.orderNo = beforeOrder.orderNo;
      else row.orderNo = nextGhariOrderNo_(row.season);
    }
    if(rn>0) tab_('GhariOrders').getRange(rn,1,1,HEADERS.GhariOrders.length).setValues([rowFromObj_('GhariOrders',row)]);
    else appendRows_('GhariOrders',[row]);
    // Audit every order change (money) with a revertible before/after snapshot.
    ghariLog_('order', (isNew ? 'create' : (String(row.status||'').toLowerCase()==='void' ? 'void' : 'update')), row.updatedBy || row.createdBy || '', beforeOrder, row);
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

// Next permanent order number for a season = (highest existing) + 1.
function nextGhariOrderNo_(season){
  var rows = readAll_('GhariOrders'); var max = 0;
  rows.forEach(function(o){
    if(String(o.season||'') === String(season||'')){ var n = parseInt(o.orderNo,10); if(n > max) max = n; }
  });
  return String(max + 1);
}

// One-time (idempotent) backfill: give every GhariOrders row that has no orderNo a
// permanent number. Per season, rows are numbered in creation order (createdOn, then
// id), continuing after the highest number already present. Writes only the orderNo
// column. Safe to run repeatedly — rows that already have a number are left alone.
function backfillGhariOrderNos_(){
  var sh = ss_().getSheetByName('GhariOrders'); if(!sh) return;
  var last = sh.getLastRow(); if(last < 2) return;
  var headers = HEADERS.GhariOrders;
  var col = {}; headers.forEach(function(h,i){ col[h] = i; });
  if(col.orderNo === undefined) return;
  var width = headers.length;
  var vals = sh.getRange(2,1,last-1,width).getValues();
  var bySeason = {};
  vals.forEach(function(row, r){ var s = String(row[col.season]||''); (bySeason[s] = bySeason[s] || []).push(r); });
  var changed = false;
  Object.keys(bySeason).forEach(function(season){
    var idxs = bySeason[season];
    var max = 0;
    idxs.forEach(function(r){ var n = parseInt(vals[r][col.orderNo],10); if(n > max) max = n; });
    var missing = idxs.filter(function(r){ return !(parseInt(vals[r][col.orderNo],10) > 0); });
    missing.sort(function(a,b){
      var ca = String(vals[a][col.createdOn]||''), cb = String(vals[b][col.createdOn]||'');
      if(ca !== cb) return ca < cb ? -1 : 1;
      var ia = String(vals[a][col.id]||''), ib = String(vals[b][col.id]||'');
      return ia < ib ? -1 : (ia > ib ? 1 : 0);
    });
    missing.forEach(function(r){ vals[r][col.orderNo] = String(++max); changed = true; });
  });
  if(changed){
    var out = vals.map(function(row){ return [String(row[col.orderNo] || '')]; });
    sh.getRange(2, col.orderNo + 1, out.length, 1).setValues(out);
  }
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

// ── Ghari delivery-date reminders ────────────────────────────────────────────
// Runs daily at ~8 PM. For every active, undelivered order that has a delivery
// date, email the mandal TWICE: once the evening BEFORE (date == tomorrow) and
// once ON the delivery day (date == today). emailOnce_ de-dups per
// (order, date, when) so re-running the trigger the same day never re-sends.
function ghariDeliveryReminders_(){
  if(!mailEnabled_()) return 'mail disabled';
  var today = ymdLocal_(new Date());
  var t = new Date(); t.setDate(t.getDate() + 1);
  var tomorrow = ymdLocal_(t);
  var rows = readAll_('GhariOrders');
  var sent = 0;
  rows.forEach(function(o){
    var st = String(o.status||'').toLowerCase();
    if(st === 'void' || st === 'cancelled') return;
    if(o.delivered === true || String(o.delivered).toLowerCase() === 'true') return;
    var d = String(o.deliveryDate || '').trim();
    if(!d) return;
    var when = d === today ? 'today' : (d === tomorrow ? 'tomorrow' : '');
    if(!when) return;
    var key = 'D:' + o.id + ':' + d + ':' + when;
    if(emailOnce_(key)){ try{ sendGhariDeliveryMail_(o, when); sent++; }catch(e){} }
  });
  return 'Ghari delivery reminders sent: ' + sent;
}

// Pretty HTML reminder for an upcoming Ghari delivery.
function sendGhariDeliveryMail_(row, when){
  var heading = when === 'today' ? 'Delivery TODAY' : 'Delivery TOMORROW';
  var band = when === 'today' ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : 'linear-gradient(135deg,#f59e0b,#d97706)';
  var items=[]; try{ items=JSON.parse(row.itemsJson||'[]'); }catch(e){}
  var itemRows = items.map(function(it){
    return '<tr><td style="padding:6px 12px;border-bottom:1px solid #F0E6DC;font-size:13px;color:#26303B">'+(it.qty)+'× '+(it.name||'')+' '+(it.size||'')+'</td></tr>';
  }).join('');
  var bal = (Number(row.total)||0) - (Number(row.paymentReceived)||0);
  var payLine = bal>0 ? ('Balance due ₹'+bal) : ('Paid'+(row.paymentType?(' · '+row.paymentType):''));
  var html = ''
    + '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#FBF5EF;padding:18px;border-radius:16px">'
    + '<div style="background:'+band+';color:#fff;padding:16px 20px;border-radius:14px 14px 0 0">'
    +   '<div style="font-size:11px;font-weight:800;letter-spacing:1px;opacity:.9">AKSHAR CONNECT · GHARI SEVA '+(row.season||'')+'</div>'
    +   '<div style="font-size:20px;font-weight:800;margin-top:2px">🚚 '+(row.customerName||'Order')+'</div>'
    +   '<div style="font-size:12px;opacity:.95;margin-top:2px">'+heading+' · '+(row.deliveryDate||'')+(row.orderNo?(' · Order #'+row.orderNo):'')+'</div>'
    + '</div>'
    + '<table style="width:100%;border-collapse:collapse;background:#fff">'+itemRows+'</table>'
    + '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:0 0 14px 14px;overflow:hidden">'
    +   '<tr><td style="padding:8px 12px;font-size:13px;font-weight:800;color:#26303B">Total ₹'+(row.total||0)+'</td></tr>'
    +   '<tr><td style="padding:4px 12px 8px;font-size:12px;color:#7A7369">'+payLine+(row.karyakarta?(' · via '+row.karyakarta):'')+(row.customerMobile?(' · 📱 '+row.customerMobile):'')+(row.remarks?(' · '+row.remarks):'')+'</td></tr>'
    + '</table>'
    + '<div style="color:#9b9183;font-size:11px;text-align:center;margin-top:12px">Sent automatically by Akshar Connect</div>'
    + '</div>';
  sendMail_('Ghari Seva: '+heading+' — '+(row.customerName||'')+' ('+(row.deliveryDate||'')+')',
    heading+': '+(row.customerName||'')+' on '+(row.deliveryDate||''), GHARI_REMINDER_TO, html);
}

// ── Bus Seva write authorization + idempotent upsert/delete ──────────────────
// Writes are allowed for Admins, Sevaks, and users whose `modules` column grants
// `bus`; reads (busBootstrap) are open. Mirrors the client nav gate in navItems.js.
var BUS_WRITE_ACTIONS_ = {
  busUpsertEvent: 1, busDeleteEvent: 1, busUpsertBooking: 1, busDeleteBooking: 1,
  busUpsertTally: 1, busDeleteTally: 1,
};
function busCanWrite_(p){
  var mob = normMob_(p && p.actorMobile || '');
  if(!mob) return false;
  var users = readAll_('Users');
  for(var i=0;i<users.length;i++){
    if(normMob_(users[i].mobile) !== mob) continue;
    var role = String(users[i].role||'').trim().toLowerCase();
    if(role === 'admin' || role === 'sevak') return true;
    var mods = String(users[i].modules||'').toLowerCase().split(/[,|]/);
    for(var j=0;j<mods.length;j++) if(mods[j].trim() === 'bus') return true;
    return false;
  }
  return false;
}
// Idempotent upsert keyed by id: overwrite the row if present, else append. A
// LockService guard serializes concurrent writes so a replayed offline op is a
// no-op update rather than a duplicate.
function busUpsert_(collection, row){
  var lock=LockService.getScriptLock(); try{ lock.waitLock(20000); }catch(e){}
  try{
    if(!row || !row.id) return json_({ ok:false, error:'missing id' });
    var rn=findRow_(collection, 'id', row.id);
    if(rn>0) tab_(collection).getRange(rn,1,1,HEADERS[collection].length).setValues([rowFromObj_(collection,row)]);
    else appendRows_(collection,[row]);
    return json_({ ok:true });
  } finally { try{ lock.releaseLock(); }catch(e){} }
}
function busDelete_(collection, id){
  var lock=LockService.getScriptLock(); try{ lock.waitLock(20000); }catch(e){}
  try{
    if(id===undefined || id===null || id==='') return json_({ ok:false, error:'missing id' });
    var rn=findRow_(collection, 'id', id);
    if(rn>0) tab_(collection).deleteRow(rn);
    return json_({ ok:true });
  } finally { try{ lock.releaseLock(); }catch(e){} }
}

// Run ONCE from the Apps Script editor to schedule the daily 8 PM delivery-reminder
// trigger. Idempotent — removes any existing one first.
function setupGhariDeliveryReminders(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction() === 'ghariDeliveryReminders_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ghariDeliveryReminders_').timeBased().atHour(20).everyDays(1).create();
  return 'Ghari delivery reminders scheduled: 8 PM daily (evening before + on the day).';
}

// Revert a Ghari order/purchase/product to the "before" snapshot stored in a log
// entry. Restores the prior values and records the revert itself as a log entry.
function doGhariRevert_(p){
  var lock=LockService.getScriptLock(); try{ lock.waitLock(20000); }catch(e){}
  try{
    var logs = readAll_('GhariLog'); var entry = null;
    for(var i=0;i<logs.length;i++){ if(String(logs[i].id) === String(p.logId)){ entry = logs[i]; break; } }
    if(!entry) return json_({ ok:false, error:'log entry not found' });
    var before; try{ before = JSON.parse(entry.beforeJson || 'null'); }catch(e){ before = null; }
    if(!before) return json_({ ok:false, error:'no previous state to revert to (this was a create)' });
    var coll = entry.entity==='purchase' ? 'GhariPurchases' : (entry.entity==='product' ? 'GhariProducts' : (entry.entity==='stock' ? 'GhariStock' : (entry.entity==='mandalPayment' ? 'GhariMandalPayments' : 'GhariOrders')));
    var keyField = coll==='GhariProducts' ? 'sku' : 'id';
    var rn = findRow_(coll, keyField, before[keyField]);
    var cur = rn>0 ? readRowObj_(coll, rn) : null;
    if(rn>0) tab_(coll).getRange(rn,1,1,HEADERS[coll].length).setValues([rowFromObj_(coll, before)]);
    else appendRows_(coll, [before]);
    ghariLog_(entry.entity, 'revert', String(p.actor||''), cur, before);
    return json_({ ok:true, restored: before });
  } finally { try{ lock.releaseLock(); }catch(e){} }
}

// Delete one Ghari row by key. Used for catalog items (products admin removes)
// and for cleanup. Orders in the app are soft-voided, not deleted, so this is
// not reachable from normal order flow. Missing key is a safe no-op.
function doGhariDelete_(collection, keyVal, keyField){
  var lock=LockService.getScriptLock(); try{ lock.waitLock(20000); }catch(e){}
  try{
    if(keyVal===undefined || keyVal===null || keyVal==='') return json_({ ok:false, error:'missing '+keyField });
    var rn=findRow_(collection, keyField, keyVal);
    if(rn>0){
      var before = readRowObj_(collection, rn);
      tab_(collection).deleteRow(rn);
      var entity = collection==='GhariPurchases' ? 'purchase' : (collection==='GhariProducts' ? 'product' : (collection==='GhariStock' ? 'stock' : (collection==='GhariMandalPayments' ? 'mandalPayment' : 'order')));
      ghariLog_(entity, 'delete', '', before, null);
    }
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

// Store one error row in the ErrorLog sheet so it can be pulled into the codebase
// and fixed (in addition to the email). Keeps the sheet bounded.
function logErrorRow_(p){
  try{
    var row = {
      id: 'ERR-' + Date.now().toString(36) + '-' + Math.floor(Math.random()*46656).toString(36),
      time: (p && p.time) || new Date().toISOString(),
      user: (p && p.user) || '',
      mobile: (p && p.mobile) || '',
      message: String(p && p.message || '').slice(0,500),
      page: String(p && p.page || '').slice(0,300),
      stack: String(p && p.stack || '').slice(0,4000),
      ua: String(p && p.ua || '').slice(0,300),
      status: 'open', resolvedBy: '', resolvedOn: ''
    };
    appendRows_('ErrorLog', [row]);
    // Keep only the most recent ~800 rows so the sheet never grows without bound.
    var sh = tab_('ErrorLog'); var over = sh.getLastRow() - 1 - 800;
    if(over > 0) sh.deleteRows(2, over);
  }catch(e){}
}

// Mark error(s) resolved. p.id (one), p.ids (array), or p.all === true.
function resolveError_(p){
  var sh = tab_('ErrorLog'); var H = HEADERS.ErrorLog; var last = sh.getLastRow();
  if(last < 2) return { updated:0 };
  var data = sh.getRange(2,1,last-1,H.length).getValues();
  var idI = H.indexOf('id'), stI = H.indexOf('status'), rbI = H.indexOf('resolvedBy'), roI = H.indexOf('resolvedOn');
  var want = {}; (p && p.ids ? p.ids : (p && p.id ? [p.id] : [])).forEach(function(x){ want[String(x)] = 1; });
  var all = p && p.all === true;
  var n = 0, now = new Date().toISOString(), by = (p && p.by) || 'claude';
  for(var i=0;i<data.length;i++){
    if((all || want[String(data[i][idI])]) && String(data[i][stI]) !== 'resolved'){
      data[i][stI] = 'resolved'; data[i][rbI] = by; data[i][roI] = now; n++;
    }
  }
  if(n > 0) sh.getRange(2,1,last-1,H.length).setValues(data);
  return { updated:n };
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
