import React, { useState, useEffect } from 'react';
import { Settings, Shield, KeyRound, Database, RefreshCw, CheckCircle, Info, UserPlus, Users, ArrowRight, Pencil, Trash2, MapPin, Plus, Save, X, Activity, Mail, GripVertical, Megaphone, Bell } from 'lucide-react';
import { dataService } from '../services/dataService';
import ActivityFeed from '../components/ActivityFeed';

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [liveCount, setLiveCount] = useState(dataService.getDevotees().length);
  const bundledCount = dataService.bundledDevoteeCount();
  const isAdmin = user?.role === 'Admin';
  const [tab, setTab] = useState('announcements');

  const emptyForm = { mobile: '', name: '', pin: '', password: '', role: 'Devotee', ghari: false };
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState('');
  const [formMsg, setFormMsg] = useState('');
  const [showCreds, setShowCreds] = useState(false);

  useEffect(() => {
    setUsers([...dataService.getUsers()]);
    setKkPlan(dataService.planKaryakartaReconcile());
  }, []);

  const [editingMobile, setEditingMobile] = useState(null); // null = adding new

  const handleAddUser = (e) => {
    e.preventDefault();
    setFormErr(''); setFormMsg('');
    const mobile = String(form.mobile || '').trim();
    const pin = String(form.pin || '').trim();
    if (!/^\d{10}$/.test(mobile)) { setFormErr('Mobile must be exactly 10 digits.'); return; }
    // PIN required for a NEW user; optional when editing (blank = keep current).
    if (!editingMobile && !/^\d{6}$/.test(pin)) { setFormErr('PIN must be 6 digits.'); return; }
    if (pin && !/^\d{6}$/.test(pin)) { setFormErr('PIN must be 6 digits (leave blank to keep current).'); return; }
    // Grant/revoke the Ghari Seva module. Admins implicitly have every module, so
    // the explicit grant only matters for non-admins.
    const modules = form.ghari ? 'ghari' : '';
    dataService.saveUser({ mobile, name: form.name.trim(), pin, password: form.password, role: form.role, modules });
    setUsers([...dataService.getUsers()]);
    setForm(emptyForm); setEditingMobile(null);
    setFormMsg(`User "${form.name.trim() || mobile}" saved.`);
  };

  const editUser = (u) => {
    setEditingMobile(String(u.mobile));
    const hasGhari = String(u.modules || '').split(/[,|]/).map((s) => s.trim().toLowerCase()).includes('ghari');
    setForm({ mobile: String(u.mobile), name: u.name || '', pin: '', password: '', role: u.role || 'Devotee', ghari: hasGhari });
    setFormErr(''); setFormMsg('');
  };

  const removeUser = async (u) => {
    if (String(u.mobile) === String(user?.mobile)) { setFormErr('You cannot delete your own account.'); return; }
    if (!window.confirm(`Delete user "${u.name || u.mobile}"? They will lose access. This cannot be undone.`)) return;
    await dataService.deleteUserAndSync(u.mobile);
    setUsers([...dataService.getUsers()]);
    if (editingMobile === String(u.mobile)) { setForm(emptyForm); setEditingMobile(null); }
    setFormMsg(`User "${u.name || u.mobile}" deleted.`);
  };

  // ── Follow-up Karyakarta reconciliation ──────────────────────────────────
  const [kkPlan, setKkPlan] = useState(null);
  const [kkRunning, setKkRunning] = useState(false);
  const [kkMsg, setKkMsg] = useState('');
  const loadKkPlan = () => setKkPlan(dataService.planKaryakartaReconcile());
  const kkRenameGroups = (kkPlan || []).filter(g => g.willRename);
  const kkRecordsToRename = kkRenameGroups.reduce((n, g) => n + g.count, 0);

  const handleReconcileKk = async () => {
    if (!window.confirm(
      `This will rewrite follow-up karyakarta names to match the Devotees tab and fill each karyakarta's mobile.\n\n` +
      `${kkRenameGroups.length} name(s) will be corrected across ${kkRecordsToRename} record(s); mobiles are filled for all matched records.\n\n` +
      `It rewrites the live Devotees sheet in one atomic operation. Continue?`
    )) return;
    setKkRunning(true); setKkMsg('');
    try {
      const r = await dataService.reconcileKaryakartaNamesAndSync();
      setLiveCount(dataService.getDevotees().length);
      loadKkPlan();
      setKkMsg(`Done — ${r.renamed} name(s) corrected, ${r.mobilesFilled} mobile(s) filled (${r.recordsChanged} record(s) updated).`);
    } catch (e) {
      setKkMsg('Failed: ' + (e.message || 'error'));
    } finally { setKkRunning(false); }
  };

  const handleImport = async () => {
    if (!window.confirm(
      `This will REPLACE all devotee records in the live database with the ${bundledCount} merged devotees bundled in this app.\n\n` +
      `Current records: ${liveCount}. This cannot be undone. Continue?`
    )) return;
    setImporting(true); setImportMsg('');
    try {
      const n = await dataService.importBundledDevotees();
      setLiveCount(n);
      setImportMsg(`Success — ${n} devotees are now loaded.`);
    } catch (e) {
      setImportMsg('Failed: ' + (e.message || 'error') + '. Check backend deployment and try again.');
    } finally { setImporting(false); }
  };

  return (
    <div className="w-full max-w-none px-4 py-6 sm:px-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">⚙️ Admin</h1>
        <p className="text-sm font-medium text-text-muted">Manage announcements, users, areas, notifications and system settings.</p>
      </div>

      {/* Admin-only tab navigation */}
      {isAdmin && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {[['announcements', '📣 Announcements'], ['users', '👥 Users'], ['areas', '🗺️ Areas'], ['notifications', '🔔 Notifications'], ['system', '🗄️ System']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-bold transition-colors ${tab === k ? 'bg-primary text-white shadow-md' : 'border border-border-light bg-surface text-text-muted hover:text-text-main'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ANNOUNCEMENTS TAB */}
      {isAdmin && tab === 'announcements' && (
        <div className="grid gap-6 md:grid-cols-2 items-start">
          <AnnouncementSender />
          <AnnouncementManager />
        </div>
      )}

      {/* USERS TAB */}
      {isAdmin && tab === 'users' && (
        <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
            <UserPlus className="h-4 w-4 text-[#FF862A]" /> 👥 User Management
          </div>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">👤 Name</label>
              <input
                type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name" required
                className="w-full rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">📱 Mobile Number</label>
              <input
                type="tel" inputMode="numeric" maxLength={10} value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
                placeholder="10-digit mobile" required disabled={!!editingMobile}
                className="w-full rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A] disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">🔢 PIN {editingMobile && <span className="font-semibold text-slate-400">(blank = keep)</span>}</label>
              <input
                type="text" inputMode="numeric" maxLength={6} value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
                placeholder={editingMobile ? 'Leave blank to keep' : '6-digit PIN'} required={!editingMobile}
                className="w-full rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">🔑 Password <span className="font-semibold text-slate-400">({editingMobile ? 'blank = keep' : 'optional'})</span></label>
              <input
                type="text" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingMobile ? 'Leave blank to keep' : 'Optional password for login'}
                className="w-full rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">🛡️ Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]"
              >
                <option value="Admin">Admin</option>
                <option value="Sevak">Sevak</option>
                <option value="Devotee">Devotee</option>
              </select>
            </div>
            {/* Module grants — Admins already have everything, so only offer this
                for non-admin users. */}
            {form.role !== 'Admin' && (
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">🧩 Module Access</label>
                <button type="button" onClick={() => setForm({ ...form, ghari: !form.ghari })}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-sm font-bold transition-colors ${form.ghari ? 'border-[#FF862A] bg-[#FF862A]/10 text-[#E56F18]' : 'border-border-light bg-bg-base text-text-muted'}`}>
                  <span className="flex items-center gap-2">🪔 Ghari Seva</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${form.ghari ? 'bg-[#FF862A] text-white' : 'bg-slate-200 text-slate-600'}`}>{form.ghari ? 'Allowed' : 'No access'}</span>
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit"
                className="flex items-center gap-2 rounded-2xl bg-[#FF862A] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#e5741f]">
                <UserPlus className="h-4 w-4" /> {editingMobile ? 'Save Changes' : 'Add User'}
              </button>
              {editingMobile && (
                <button type="button" onClick={() => { setForm(emptyForm); setEditingMobile(null); setFormErr(''); setFormMsg(''); }}
                  className="rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm font-bold text-text-muted hover:text-text-main">
                  Cancel
                </button>
              )}
              {formErr && <span className="text-xs font-bold text-red-600">{formErr}</span>}
              {formMsg && (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" /> {formMsg}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* AREAS TAB */}
      {isAdmin && tab === 'areas' && <AreaMaster />}

      {/* NOTIFICATIONS TAB */}
      {isAdmin && tab === 'notifications' && <NotificationsReport />}

      {/* SYSTEM TAB — email toggle */}
      {isAdmin && tab === 'system' && <MailToggle />}

      {/* SYSTEM TAB — activity log */}
      {isAdmin && tab === 'system' && (
        <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
            <Activity className="h-4 w-4 text-[#FF862A]" /> 📜 Activity Log
          </div>
          <div className="max-h-[32rem] overflow-y-auto pr-1">
            <ActivityFeed limit={400} />
          </div>
        </div>
      )}

      {/* SYSTEM TAB — Devotee Database */}
      {isAdmin && tab === 'system' && (
      <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
          <Database className="h-4 w-4 text-[#FF862A]" /> 🗄️ Devotee Database
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border-light bg-bg-base p-4">
            <span className="text-xs font-bold text-slate-500 block">Currently Loaded</span>
            <p className="text-3xl font-extrabold text-text-main mt-1">{liveCount}</p>
            <p className="text-[11px] text-slate-500 mt-1">devotee records in the app</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
            <span className="text-xs font-bold text-emerald-700 block">Bundled Merged Dataset</span>
            <p className="text-3xl font-extrabold text-text-main mt-1">{bundledCount}</p>
            <p className="text-[11px] text-slate-500 mt-1">from AksharConnect + GBM sheets (de-duplicated)</p>
          </div>
        </div>
        {isAdmin ? (
          <div className="space-y-2">
            <button onClick={handleImport} disabled={importing}
              className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#00223f] disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${importing ? 'animate-spin' : ''}`} />
              {importing ? 'Importing…' : `Load merged data into live database (${bundledCount})`}
            </button>
            <p className="text-[11px] text-slate-500 flex items-start gap-1">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Replaces the live Devotees sheet with the merged dataset. Redeploy the Apps Script backend first so new columns (tags, education, etc.) are saved. Blank fields are left for you to fill in later.
            </p>
            {importMsg && (
              <p className={`text-xs font-bold flex items-center gap-1 ${importMsg.startsWith('Success') ? 'text-emerald-600' : 'text-red-600'}`}>
                <CheckCircle className="h-4 w-4" /> {importMsg}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Only an Admin can replace the devotee database.</p>
        )}
      </div>
      )}

      {/* USERS TAB — Reconcile Follow-up Karyakarta Names */}
      {isAdmin && tab === 'users' && (
        <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
            <Users className="h-4 w-4 text-[#FF862A]" /> Reconcile Karyakarta Names
          </div>
          <p className="text-[11px] text-slate-500 flex items-start gap-1">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Matches each free-typed follow-up karyakarta to its devotee record, renames it to the exact name from the Devotees tab, and fills the karyakarta's mobile. Review the matches below before applying.
          </p>

          <div className="rounded-2xl border border-border-light overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-bg-base px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>Current value</span><span>Records</span><span>Matched devotee</span>
            </div>
            {(kkPlan || []).map((g, i) => (
              <div key={i} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2.5 border-t border-border-light text-xs ${g.willRename ? 'bg-amber-50/40' : ''}`}>
                <span className="font-semibold text-text-main truncate" title={g.value}>{g.value}</span>
                <span className="text-center font-bold text-slate-500 tabular-nums px-2">{g.count}</span>
                <span className="flex items-center gap-1.5 min-w-0">
                  {g.willRename
                    ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    : <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                  <span className="truncate" title={g.match ? `${g.match.name} · ${g.match.mobile || 'no mobile'}` : 'no match'}>
                    {g.match ? g.match.name : '—'}
                    {g.match?.mobile ? <span className="text-slate-400"> · {g.match.mobile}</span> : null}
                  </span>
                  {g.willRename
                    ? <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">RENAME</span>
                    : <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">OK</span>}
                </span>
              </div>
            ))}
            {(!kkPlan || kkPlan.length === 0) && (
              <div className="px-4 py-4 text-center text-xs font-semibold text-slate-400">No follow-up karyakarta values found.</div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleReconcileKk} disabled={kkRunning || kkRenameGroups.length === 0}
              className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#00223f] disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${kkRunning ? 'animate-spin' : ''}`} />
              {kkRunning ? 'Reconciling…' : kkRenameGroups.length === 0 ? 'All names already match' : `Apply — fix ${kkRenameGroups.length} name(s), ${kkRecordsToRename} record(s)`}
            </button>
            {kkMsg && (
              <span className={`text-xs font-bold flex items-center gap-1 ${kkMsg.startsWith('Done') ? 'text-emerald-600' : 'text-red-600'}`}>
                <CheckCircle className="h-4 w-4" /> {kkMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* USERS TAB — Registered System Users */}
      {isAdmin && tab === 'users' && (
      <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-text-main">👥 System User Accounts</h2>
          {isAdmin && (
            <button onClick={() => setShowCreds(s => !s)}
              className="rounded-xl border border-border-light bg-bg-base px-3 py-1.5 text-xs font-bold text-text-main hover:border-primary">
              {showCreds ? 'Hide credentials' : 'Show credentials'}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {users.length === 0 && <p className="text-xs text-text-muted">No users yet.</p>}
          {users.map((u, i) => (
            <div key={i} className="p-3.5 rounded-2xl border border-border-light bg-bg-base">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-primary text-white text-sm font-bold">{(u.name || 'U')[0]}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-text-main break-words">
                    {u.name || 'User'} {String(u.mobile) === String(user?.mobile) && <span className="text-[10px] font-bold text-primary">(you)</span>}
                  </p>
                  <p className="text-[11px] font-semibold text-text-muted">+91 {u.mobile}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 break-words">
                    PIN: <span className="font-mono text-text-muted">{showCreds && isAdmin ? (u.pin || '—') : '••••'}</span>
                    {' • '}Password: <span className="font-mono text-text-muted">{showCreds && isAdmin ? (u.password || '—') : '••••••••'}</span>
                  </p>
                  {u.role !== 'Admin' && String(u.modules || '').toLowerCase().includes('ghari') && (
                    <span className="mt-1 inline-block rounded-full bg-[#FF862A]/10 px-2 py-0.5 text-[10px] font-black text-[#E56F18]">🪔 Ghari Seva</span>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                  u.role === 'Admin' ? 'bg-red-100 text-red-700' : u.role === 'Sevak' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'
                }`}>
                  {u.role || 'Devotee'}
                </span>
              </div>
              {isAdmin && (
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-border-light pt-2">
                  <button onClick={() => editUser(u)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-text-muted hover:bg-surface hover:text-primary"><Pencil className="h-4 w-4" /> Edit</button>
                  <button onClick={() => removeUser(u)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /> Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Non-admin (e.g. Sevak) — the admin hub is Admin-only */}
      {!isAdmin && (
        <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs text-center">
          <Shield className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-2 text-sm font-bold text-text-main">Admin access required</p>
          <p className="text-xs text-text-muted">These settings are available to administrators only.</p>
        </div>
      )}
    </div>
  );
}

// ── Email notifications on/off (#100) ───────────────────────────────────────
function AnnouncementSender() {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [audience, setAudience] = React.useState('all');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const send = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true); setResult(null);
    try {
      const r = await dataService.createAnnouncement({ title: title.trim(), body: body.trim(), audience });
      setResult({ ok: true, sent: r.sent });
      setTitle(''); setBody('');
      try { window.dispatchEvent(new CustomEvent('ac-announcements-changed')); } catch (e) {}
    } catch (err) {
      setResult({ ok: false, error: String(err.message || err) });
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
        <Megaphone className="h-4 w-4 text-[#FF862A]" /> 📣 Send Announcement
      </div>
      <p className="text-xs text-text-muted -mt-2">Shows in everyone's 🔔 and pushes a notification to their phone.</p>
      <form onSubmit={send} className="grid grid-cols-1 gap-4">
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Title</label>
          <input type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Sabha this Sunday 6 PM" required
            className="w-full rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Message</label>
          <textarea value={body} maxLength={2000} rows={3} onChange={(e) => setBody(e.target.value)}
            placeholder="Write the announcement…"
            className="w-full rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Send to</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value)}
            className="w-full rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]">
            <option value="all">Everyone</option>
            <option value="staff">Karyakartas / staff only</option>
            <option value="devotees">Devotees only</option>
          </select>
        </div>
        <button type="submit" disabled={busy || !title.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-[#00223f] disabled:opacity-60">
          {busy ? 'Sending…' : <>Send announcement</>}
        </button>
        {result && (result.ok
          ? <p className="text-xs font-bold text-emerald-600">✅ Posted — pushed to {result.sent} device{result.sent === 1 ? '' : 's'}.</p>
          : <p className="text-xs font-bold text-rose-600">⚠️ {result.error}</p>)}
      </form>
    </div>
  );
}

// Manage posted announcements — list, edit text, delete.
function AnnouncementManager() {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [editId, setEditId] = React.useState(null);
  const [draft, setDraft] = React.useState({ title: '', body: '' });
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    dataService.getAnnouncements().then(l => setList(l || [])).finally(() => setLoading(false));
  }, []);
  React.useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener('ac-announcements-changed', onChange);
    return () => window.removeEventListener('ac-announcements-changed', onChange);
  }, [load]);

  const startEdit = (a) => { setEditId(a.id); setDraft({ title: a.title || '', body: a.body || '' }); };
  const cancel = () => { setEditId(null); setDraft({ title: '', body: '' }); };
  const save = async (a) => {
    if (!draft.title.trim()) return;
    setBusy(true);
    try { await dataService.updateAnnouncement({ ...a, title: draft.title.trim(), body: draft.body.trim() }); cancel(); load(); }
    finally { setBusy(false); }
  };
  const del = async (a) => {
    if (!window.confirm(`Delete announcement "${a.title}"? This removes it from everyone's notifications list.`)) return;
    setBusy(true);
    try { await dataService.deleteAnnouncement(a.id); load(); } finally { setBusy(false); }
  };
  const fmt = (iso) => { try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

  return (
    <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
          <Megaphone className="h-4 w-4 text-[#FF862A]" /> Posted announcements
        </div>
        <button onClick={load} className="rounded-lg border border-border-light bg-bg-base px-2.5 py-1 text-[11px] font-bold text-text-muted hover:text-text-main"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      {loading ? <p className="text-xs text-text-muted">Loading…</p>
        : list.length === 0 ? <p className="text-xs text-text-muted">No announcements yet. Send one from the left.</p>
        : (
          <div className="space-y-2">
            {list.map(a => (
              <div key={a.id} className="rounded-2xl border border-border-light bg-bg-base p-3">
                {editId === a.id ? (
                  <div className="space-y-2">
                    <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                      className="w-full rounded-xl border border-border-light bg-surface px-3 py-2 text-sm font-bold text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
                    <textarea value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} rows={2}
                      className="w-full rounded-xl border border-border-light bg-surface px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => save(a)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"><Save className="h-3.5 w-3.5" /> Save</button>
                      <button onClick={cancel} className="rounded-lg border border-border-light px-3 py-1.5 text-xs font-bold text-text-muted">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-main">{a.title}</p>
                      {a.body && <p className="text-[13px] text-text-muted whitespace-pre-wrap">{a.body}</p>}
                      <p className="mt-1 text-[10px] text-slate-400">{fmt(a.createdOn)} · {a.audience || 'all'} · sent to {a.sentCount || 0}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => startEdit(a)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface hover:text-primary"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => del(a)} className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// Report: who allowed / rejected notifications.
function NotificationsReport() {
  const [rows, setRows] = React.useState(null);
  const load = React.useCallback(() => { dataService.getPushStatus().then(r => setRows(r || [])); }, []);
  React.useEffect(() => { load(); }, [load]);

  const stats = React.useMemo(() => {
    const s = { granted: 0, denied: 0, default: 0, other: 0 };
    (rows || []).forEach(r => { const k = String(r.status || '').toLowerCase(); if (k in s) s[k]++; else s.other++; });
    return s;
  }, [rows]);
  const fmt = (iso) => { try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); } catch { return ''; } };
  const badge = (st) => {
    const k = String(st || '').toLowerCase();
    if (k === 'granted') return 'bg-emerald-100 text-emerald-700';
    if (k === 'denied') return 'bg-red-100 text-red-700';
    return 'bg-slate-200 text-slate-600';
  };
  const label = (st) => ({ granted: 'Allowed', denied: 'Rejected', default: 'Not decided' }[String(st || '').toLowerCase()] || st || '—');

  return (
    <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
          <Bell className="h-4 w-4 text-[#FF862A]" /> Notification permissions
        </div>
        <button onClick={load} className="rounded-lg border border-border-light bg-bg-base px-2.5 py-1 text-[11px] font-bold text-text-muted hover:text-text-main"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 text-center"><p className="text-2xl font-extrabold text-emerald-700">{stats.granted}</p><p className="text-[11px] font-bold text-emerald-700">Allowed</p></div>
        <div className="rounded-2xl border border-red-100 bg-red-50/60 p-3 text-center"><p className="text-2xl font-extrabold text-red-600">{stats.denied}</p><p className="text-[11px] font-bold text-red-600">Rejected</p></div>
        <div className="rounded-2xl border border-border-light bg-bg-base p-3 text-center"><p className="text-2xl font-extrabold text-text-muted">{stats.default + stats.other}</p><p className="text-[11px] font-bold text-text-muted">Not decided</p></div>
      </div>
      {rows === null ? <p className="text-xs text-text-muted">Loading…</p>
        : rows.length === 0 ? <p className="text-xs text-text-muted">No responses logged yet. They appear here as devotees open the app.</p>
        : (
          <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
            {rows.slice().sort((a, b) => String(b.updatedOn).localeCompare(String(a.updatedOn))).map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-xl border border-border-light bg-bg-base px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-main">{r.name || r.mobile || r.devoteeId || '—'}</p>
                  <p className="text-[10px] text-slate-400">{r.mobile ? '+91 ' + r.mobile : ''} · {r.platform || ''} · {fmt(r.updatedOn)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badge(r.status)}`}>{label(r.status)}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function MailToggle() {
  // Start from the cached value so the toggle is usable immediately (no stuck
  // "Loading…"); refine from the server once it responds.
  const [enabled, setEnabled] = useState(() => dataService.mailEnabledCached());
  useEffect(() => { dataService.getMailEnabled().then(setEnabled).catch(() => {}); }, []);
  const toggle = () => {
    // Optimistic (#118): flip instantly, sync in the background (the cache is
    // updated immediately by setMailEnabled, so writes already honour the new state).
    const next = !enabled;
    setEnabled(next);
    dataService.setMailEnabled(next).then((v) => setEnabled(v)).catch(() => {});
  };
  return (
    <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs">
      <div className="mb-4 flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
        <Mail className="h-4 w-4 text-[#FF862A]" /> 📧 Email Notifications
      </div>
      <p className="mb-4 text-sm font-medium text-text-muted">
        Send an email to <strong>aksharconnect01@gmail.com</strong> on every add / edit / delete.
      </p>
      <button onClick={toggle}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3.5 transition-all ${enabled ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950' : 'border-border-light bg-bg-base'}`}>
        <span className="text-sm font-bold text-text-main">
          {enabled ? '✅ Emails are ON' : '🔕 Emails are OFF'}
        </span>
        <span className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </span>
      </button>
    </div>
  );
}

// ── Area Master ────────────────────────────────────────────────────────────
// Lists every area (those typed on devotee records + any admin-added ones) and
// lets an admin assign a number/order to each, add new areas, and delete entries.
function AreaMaster() {
  // Read live each render — do NOT snapshot in useState, or the card stays empty
  // ("0 areas") when Admin mounts before bootstrap finishes loading devotees/areas.
  const [tick, setTick] = useState(0);
  const areas = dataService.getAreas();
  const devotees = dataService.getDevotees();
  const [edits, setEdits] = useState({});       // name(lower) -> number being edited
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [msg, setMsg] = useState('');

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };
  const refresh = () => setTick((n) => n + 1);
  // Re-render when the background bootstrap finishes loading areas/devotees (#125).
  useEffect(() => {
    const onRefresh = () => setTick((n) => n + 1);
    window.addEventListener('ac-data-refreshed', onRefresh);
    return () => window.removeEventListener('ac-data-refreshed', onRefresh);
  }, []);

  // Union of master areas + distinct devotee areas, with a devotee count each.
  const rows = React.useMemo(() => {
    const counts = {};
    devotees.forEach(d => {
      const a = String(d.area || '').trim();
      if (a) counts[a.toLowerCase()] = (counts[a.toLowerCase()] || 0) + 1;
    });
    const byKey = {};
    areas.forEach(a => {
      const name = String(a.name || '').trim();
      if (name) byKey[name.toLowerCase()] = { name, number: a.number || '', inMaster: true, count: counts[name.toLowerCase()] || 0 };
    });
    devotees.forEach(d => {
      const name = String(d.area || '').trim();
      if (name && !byKey[name.toLowerCase()]) byKey[name.toLowerCase()] = { name, number: '', inMaster: false, count: counts[name.toLowerCase()] || 0 };
    });
    return Object.values(byKey).sort((a, b) => {
      const na = parseInt(a.number, 10), nb = parseInt(b.number, 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      if (!isNaN(na) && isNaN(nb)) return -1;
      if (isNaN(na) && !isNaN(nb)) return 1;
      return a.name.localeCompare(b.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, devotees, tick]);

  const [q, setQ] = useState('');
  const numFor = (r) => (edits[r.name.toLowerCase()] ?? r.number);

  const save = async (r) => {
    try {
      await dataService.saveAreaAndSync(r.name, { number: numFor(r) });
      refresh(); flash(`✅ Saved "${r.name}"`);
    } catch (e) { flash('⚠️ ' + e.message); }
  };
  const remove = async (r) => {
    if (!window.confirm(`Remove "${r.name}" from Area Master? (Devotee records keep their area text.)`)) return;
    await dataService.deleteAreaAndSync(r.name);
    refresh(); flash(`🗑️ Removed "${r.name}"`);
  };
  const add = async () => {
    const name = newName.trim();
    if (!name) { flash('⚠️ Enter an area name'); return; }
    try {
      await dataService.saveAreaAndSync(name, { number: newNumber });
      setNewName(''); setNewNumber(''); refresh(); flash(`✅ Added "${name}"`);
    } catch (e) { flash('⚠️ ' + e.message); }
  };

  // Drag-and-drop reorder (#121): dropping a row renumbers every area 1..N by its
  // new position, so you can slot an area in between without hand-editing numbers.
  const [dragIdx, setDragIdx] = useState(null);
  const reorder = async (from, to) => {
    if (from == null || to == null || from === to) return;
    const order = rows.map((r) => r.name);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    setEdits({});
    for (let i = 0; i < order.length; i++) {
      const r = rows.find((x) => x.name === order[i]);
      const newNum = String(i + 1);
      if (r && String(r.number) !== newNum) {
        try { await dataService.saveAreaAndSync(r.name, { number: newNum }); } catch (e) { /* optimistic */ }
      }
    }
    refresh(); flash('✅ Reordered');
  };

  const assignedCount = rows.filter(r => r.inMaster).length;
  const ql = q.trim().toLowerCase();
  const shown = ql ? rows.filter(r => r.name.toLowerCase().includes(ql)) : rows;
  const searching = ql.length > 0;

  return (
    <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-4">
      {/* Header + summary chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-black text-text-main">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#FF862A]/10 text-[#FF862A]"><MapPin className="h-4 w-4" /></span>
          Area Master
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="rounded-full bg-bg-base px-2.5 py-1 text-[11px] font-bold text-text-muted">{rows.length} areas</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40">{assignedCount} numbered</span>
        </div>
      </div>

      {/* Add new area — highlighted */}
      <div className="rounded-2xl border border-dashed border-[#FF862A]/40 bg-[#FF862A]/[0.04] p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New area name" onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            className="flex-1 rounded-xl border border-border-light bg-surface px-3.5 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
          <input value={newNumber} onChange={(e) => setNewNumber(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="No." onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            className="w-full sm:w-20 rounded-xl border border-border-light bg-surface px-3 py-2.5 text-sm text-center text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
          <button onClick={add} className="flex items-center justify-center gap-1.5 rounded-xl bg-[#FF862A] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#e5741f]">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {/* Quick search */}
      <div className="relative">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search areas…"
          className="w-full rounded-2xl border border-border-light bg-bg-base pl-4 pr-9 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
        {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-lg text-text-muted hover:bg-surface"><X className="h-4 w-4" /></button>}
      </div>

      {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40">{msg}</p>}
      {!searching && <p className="text-[11px] text-text-muted">Drag the handle to reorder (numbers auto-adjust), or edit a number and tap save.</p>}

      {/* Area list */}
      <div className="space-y-1.5">
        {shown.map((r, i) => {
          const idx = rows.indexOf(r);
          const dirty = (edits[r.name.toLowerCase()] ?? null) !== null && String(edits[r.name.toLowerCase()]) !== String(r.number);
          return (
            <div key={r.name.toLowerCase()}
              draggable={!searching}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { reorder(dragIdx, idx); setDragIdx(null); }}
              onDragEnd={() => setDragIdx(null)}
              className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition-colors ${dragIdx === idx ? 'opacity-50 border-primary bg-primary/5' : 'border-border-light bg-bg-base'}`}>
              {!searching && <span className="shrink-0 cursor-grab active:cursor-grabbing text-text-muted/60" title="Drag to reorder"><GripVertical className="h-4 w-4" /></span>}
              {/* Number badge (editable) */}
              <input value={numFor(r)} onChange={(e) => setEdits({ ...edits, [r.name.toLowerCase()]: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric" placeholder="#"
                className="h-9 w-9 shrink-0 rounded-xl border border-border-light bg-surface text-center text-sm font-black text-primary focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
              {/* Name + count */}
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold text-text-main leading-snug">{r.name}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-text-muted">👥 {r.count} devotee{r.count === 1 ? '' : 's'}</span>
                  {!r.inMaster && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/60">not numbered</span>}
                </div>
              </div>
              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => save(r)} title="Save number"
                  className={`flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-bold transition-colors ${dirty ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:text-primary'}`}>
                  <Save className="h-3.5 w-3.5" />{dirty ? 'Save' : ''}
                </button>
                {r.inMaster && (
                  <button onClick={() => remove(r)} title="Remove from Area Master" className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="px-4 py-6 text-center text-sm font-semibold text-text-muted">{searching ? `No areas match "${q}".` : 'No areas yet.'}</p>}
      </div>
    </div>
  );
}
