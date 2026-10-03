import React, { useState, useEffect } from 'react';
import { Settings, Shield, KeyRound, Database, RefreshCw, CheckCircle, Info, UserPlus, Users, ArrowRight, Pencil, Trash2, MapPin, Plus, Save, X, Activity, Mail } from 'lucide-react';
import { dataService } from '../services/dataService';
import ActivityFeed from '../components/ActivityFeed';

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [liveCount, setLiveCount] = useState(dataService.getDevotees().length);
  const bundledCount = dataService.bundledDevoteeCount();
  const isAdmin = user?.role === 'Admin';

  const emptyForm = { mobile: '', name: '', pin: '', password: '', role: 'Devotee' };
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
    dataService.saveUser({ mobile, name: form.name.trim(), pin, password: form.password, role: form.role });
    setUsers([...dataService.getUsers()]);
    setForm(emptyForm); setEditingMobile(null);
    setFormMsg(`User "${form.name.trim() || mobile}" saved.`);
  };

  const editUser = (u) => {
    setEditingMobile(String(u.mobile));
    setForm({ mobile: String(u.mobile), name: u.name || '', pin: '', password: '', role: u.role || 'Devotee' });
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
    <div className="w-full max-w-none px-4 py-6 sm:px-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3 grid-flow-dense items-start">
      <div className="col-span-full">
        <h1 className="text-2xl font-bold text-text-main">⚙️ Admin Settings & Control</h1>
        <p className="text-sm font-medium text-text-muted">
          Access codes, user management, and system database settings.
        </p>
      </div>

      {/* User Management Card (Admin only) */}
      {isAdmin && (
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

      {/* Area Master Card (Admin only) */}
      {isAdmin && <div className="md:col-span-2 xl:col-span-2"><AreaMaster /></div>}

      {/* Email notifications on/off (Admin only) (#100) */}
      {isAdmin && <MailToggle />}

      {/* Activity Log (Admin only) — everything everyone does in the app */}
      {isAdmin && (
        <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs md:col-span-2 xl:col-span-3">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
            <Activity className="h-4 w-4 text-[#FF862A]" /> 📜 Activity Log
          </div>
          <div className="max-h-[32rem] overflow-y-auto pr-1">
            <ActivityFeed limit={400} />
          </div>
        </div>
      )}

      {/* Devotee Database Card */}
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

      {/* Reconcile Follow-up Karyakarta Names (Admin only) */}
      {isAdmin && (
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

      {/* Registered System Users */}
      <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs md:col-span-2 xl:col-span-2">
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
    </div>
  );
}

// ── Email notifications on/off (#100) ───────────────────────────────────────
function MailToggle() {
  // Start from the cached value so the toggle is usable immediately (no stuck
  // "Loading…"); refine from the server once it responds.
  const [enabled, setEnabled] = useState(() => dataService.mailEnabledCached());
  const [saving, setSaving] = useState(false);
  useEffect(() => { dataService.getMailEnabled().then(setEnabled).catch(() => {}); }, []);
  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    try { setEnabled(await dataService.setMailEnabled(!enabled)); }
    catch (e) { /* ignore */ }
    finally { setSaving(false); }
  };
  return (
    <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs">
      <div className="mb-4 flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
        <Mail className="h-4 w-4 text-[#FF862A]" /> 📧 Email Notifications
      </div>
      <p className="mb-4 text-sm font-medium text-text-muted">
        Send an email to <strong>aksharconnect01@gmail.com</strong> on every add / edit / delete.
      </p>
      <button onClick={toggle} disabled={saving}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3.5 transition-all ${enabled ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950' : 'border-border-light bg-bg-base'}`}>
        <span className="text-sm font-bold text-text-main">
          {saving ? 'Saving…' : enabled ? '✅ Emails are ON' : '🔕 Emails are OFF'}
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

  return (
    <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold text-text-main uppercase tracking-wider">
        <MapPin className="h-4 w-4 text-[#FF862A]" /> 🗺️ Area Master
        <span className="ml-auto normal-case font-semibold text-text-muted">{rows.length} areas</span>
      </div>
      <p className="text-xs font-medium text-text-muted">
        All areas devotees belong to. Assign each a number to control its order in lists and reports.
      </p>

      {/* Add new area */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="➕ New area name"
          className="flex-1 rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
        <input value={newNumber} onChange={(e) => setNewNumber(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="No."
          className="w-full sm:w-24 rounded-2xl border border-border-light bg-bg-base px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
        <button onClick={add} className="flex items-center justify-center gap-2 rounded-2xl bg-[#FF862A] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#e5741f]">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {msg && <p className="text-xs font-bold text-emerald-600">{msg}</p>}

      {/* Area list — the full area name gets its own line (never clipped); the
          number input, devotee count and compact Save/Delete sit on a second row. */}
      <div className="divide-y divide-border-light rounded-2xl border border-border-light overflow-hidden">
        {rows.map((r) => (
          <div key={r.name.toLowerCase()} className="px-4 py-2.5">
            {/* Full area name — wraps, never truncated */}
            <div className="flex items-start gap-1.5">
              <p className="flex-1 break-words text-sm font-bold text-text-main leading-snug">{r.name}</p>
              {!r.inMaster && <span className="shrink-0 mt-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950">unassigned</span>}
            </div>
            {/* Compact controls row */}
            <div className="mt-1.5 flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] font-bold text-text-muted">
                <span>🔢</span>
                <input value={numFor(r)} onChange={(e) => setEdits({ ...edits, [r.name.toLowerCase()]: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric" placeholder="—"
                  className="w-12 rounded-md border border-border-light bg-bg-base px-1.5 py-1 text-sm text-text-main text-center focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
              </label>
              <span className="text-[11px] font-bold text-text-muted">👥 {r.count}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <button onClick={() => save(r)} title="Save number" className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white hover:bg-primary-hover"><Save className="h-3.5 w-3.5" /></button>
                {r.inMaster && (
                  <button onClick={() => remove(r)} title="Remove from Area Master" className="flex h-7 w-7 items-center justify-center rounded-md bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-950"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm font-semibold text-text-muted">No areas yet.</p>}
      </div>
    </div>
  );
}
