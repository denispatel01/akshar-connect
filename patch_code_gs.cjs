const fs = require('fs');
let code = fs.readFileSync('google-apps-script/Code.gs', 'utf8');

const notifFn = `
function sendNotificationEmail_(action, collection, row) {
  try {
    var email = 'denispatel01@gmail.com';
    var subject = 'Akshar Connect: ' + action + ' on ' + collection;
    var body = 'An action (' + action + ') was performed on the ' + collection + ' collection.\\n\\n';
    
    if (row && typeof row === 'object') {
      body += 'Details:\\n';
      for (var key in row) {
        if (row[key]) {
          body += key + ': ' + row[key] + '\\n';
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
`;

code += notifFn;

code = code.replace(
  "if(action==='insert'){ appendRows_(p.collection, [p.row]); return json_({ ok:true, row:p.row }); }",
  "if(action==='insert'){ appendRows_(p.collection, [p.row]); sendNotificationEmail_('INSERT', p.collection, p.row); return json_({ ok:true, row:p.row }); }"
);

code = code.replace(
  "tab_(p.collection).getRange(rn,1,1,HEADERS[p.collection].length).setValues([rowFromObj_(p.collection,p.row)]);\n      return json_({ ok:true });",
  "tab_(p.collection).getRange(rn,1,1,HEADERS[p.collection].length).setValues([rowFromObj_(p.collection,p.row)]);\n      sendNotificationEmail_('UPDATE', p.collection, p.row);\n      return json_({ ok:true });"
);

code = code.replace(
  "if(r>0) tab_(p.collection).deleteRow(r);\n      return json_({ ok:true });",
  "if(r>0) { tab_(p.collection).deleteRow(r); sendNotificationEmail_('DELETE', p.collection, { key: p.key }); }\n      return json_({ ok:true });"
);

// Also hook into Sabhas (events)
code = code.replace(
  "if(action==='markAttendance') return doMark_(p);",
  "if(action==='markAttendance') { var res = doMark_(p); sendNotificationEmail_('MARK_ATTENDANCE', 'Attendance', p); return res; }"
);

fs.writeFileSync('google-apps-script/Code.gs', code, 'utf8');
console.log('Code.gs patched');
