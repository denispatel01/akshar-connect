import React, { useEffect, useMemo, useState } from 'react';
import {
  Mail, Send, Search, X, Users, Filter, History, Check, ShieldAlert,
  Sparkles, Eye, EyeOff, Loader2, AlertTriangle, UserPlus, FileText, Pencil, Trash2, Plus,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { AREAS, YUVAK_TYPES, GENDERS } from '../services/devoteeSchema';
import { alertError } from '../utils/sweetAlert';
import Swal from 'sweetalert2';

const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
const fmtDateTime = (s) => { try { return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return s; } };

// Built-in fallback templates (used offline / before the backend responds).
// Editable copies live in the backend and are managed in the Templates tab.
const DEFAULT_TEMPLATES = [
  {
    name: 'Sabha Invitation',
    subject: 'You are invited to this week\'s Sabha 🙏',
    body: `Jai Swaminarayan {firstName},\n\nWe warmly invite you to our weekly Sabha this Sunday at the Mandal. Your presence adds to the divine atmosphere.\n\n🕉️ Day: Sunday\n🕒 Time: 5:00 PM\n📍 Venue: Swaminarayan Mandal, Adajan\n\nPlease do join us with your family.\n\nJai Swaminarayan 🙏`,
  },
  {
    name: 'Festival Greeting',
    subject: 'Festival greetings from Akshar Connect ✨',
    body: `Jai Swaminarayan {firstName},\n\nMay this festival fill your home with Maharaj and Swami's blessings, happiness and good health.\n\nWarm wishes to you and your family. 🪔\n\nJai Swaminarayan 🙏`,
  },
  {
    name: 'Seva Reminder',
    subject: 'A gentle reminder for upcoming Seva',
    body: `Jai Swaminarayan {firstName},\n\nThis is a gentle reminder about the upcoming seva. Your support means a lot to the Mandal parivar.\n\nPlease reach out if you can help.\n\nJai Swaminarayan 🙏`,
  },
  {
    name: 'Thank You',
    subject: 'Thank you for your seva 🙏',
    body: `Jai Swaminarayan {firstName},\n\nThank you for your wonderful seva and dedication. Maharaj and Swami are surely pleased with your efforts.\n\nWith gratitude,\nAkshar Connect`,
  },
  {
    name: 'General Notice',
    subject: 'An update from the Mandal',
    body: `Jai Swaminarayan {firstName},\n\n[Write your update here.]\n\nJai Swaminarayan 🙏`,
  },
];

export default function EmailPage({ user }) {
  const isStaff = user?.role === 'Admin' || user?.role === 'Sevak';
  const isAdmin = user?.role === 'Admin';
  const [tab, setTab] = useState('compose');
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);

  const devotees = useMemo(() => dataService.getDevotees() || [], []);
  const withEmail = useMemo(() => devotees.filter((d) => validEmail(d.email)), [devotees]);

  const [recipients, setRecipients] = useState([]); // { id?, name, email }
  const emailSet = useMemo(() => new Set(recipients.map((r) => r.email.toLowerCase())), [recipients]);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [quota, setQuota] = useState(null);

  // Filters
  const [fArea, setFArea] = useState('');
  const [fYuvak, setFYuvak] = useState('');
  const [fGender, setFGender] = useState('');
  const [search, setSearch] = useState('');

  // History
  const [campaigns, setCampaigns] = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);

  // Template editing
  const [editing, setEditing] = useState(null); // { id, name, subject, body } | null
  const [tplSaving, setTplSaving] = useState(false);

  const saveTpl = async () => {
    if (!editing?.name?.trim()) { alertError('Name needed', 'Give the template a name.'); return; }
    setTplSaving(true);
    try {
      await dataService.saveEmailTemplate({ id: editing.id || '', name: editing.name.trim(), subject: editing.subject || '', body: editing.body || '' });
      await loadTemplates();
      setEditing(null);
    } catch (e) { alertError('Could not save', e.message); }
    finally { setTplSaving(false); }
  };
  const deleteTpl = async (t) => {
    const res = await Swal.fire({
      icon: 'warning', title: 'Delete this template?', text: t.name,
      showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#dc2626', cancelButtonText: 'Cancel',
      customClass: { popup: 'rounded-3xl font-sans', confirmButton: 'rounded-2xl px-6 py-2.5 font-bold', cancelButton: 'rounded-2xl px-6 py-2.5 font-bold' },
    });
    if (!res.isConfirmed) return;
    try { await dataService.deleteEmailTemplate(t.id); await loadTemplates(); }
    catch (e) { alertError('Could not delete', e.message); }
  };

  const loadTemplates = () => dataService.getEmailTemplates().then((t) => { if (t && t.length) setTemplates(t); });
  useEffect(() => { dataService.getEmailQuota().then(setQuota); loadTemplates(); }, []);
  useEffect(() => {
    if (tab !== 'history') return;
    setLoadingHist(true);
    dataService.getEmailCampaigns().then((c) => setCampaigns(c || [])).finally(() => setLoadingHist(false));
  }, [tab]);

  const addRecipients = (list) => {
    setRecipients((prev) => {
      const seen = new Set(prev.map((r) => r.email.toLowerCase()));
      const next = [...prev];
      list.forEach((d) => {
        const email = String(d.email || '').trim();
        if (validEmail(email) && !seen.has(email.toLowerCase())) {
          seen.add(email.toLowerCase());
          next.push({ id: d.id, name: d.name || '', email });
        }
      });
      return next;
    });
  };
  const removeRecipient = (email) => setRecipients((prev) => prev.filter((r) => r.email.toLowerCase() !== email.toLowerCase()));

  // Matching devotees for the current filters.
  const matching = useMemo(() => {
    return withEmail.filter((d) =>
      (!fArea || d.area === fArea) &&
      (!fYuvak || d.yuvakType === fYuvak) &&
      (!fGender || d.gender === fGender)
    );
  }, [withEmail, fArea, fYuvak, fGender]);

  const matchingNew = matching.filter((d) => !emailSet.has(String(d.email).toLowerCase())).length;

  const searchResults = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [];
    return withEmail
      .filter((d) => !emailSet.has(String(d.email).toLowerCase()))
      .filter((d) => String(d.name || '').toLowerCase().includes(s) || last10(d.mobile).includes(s) || String(d.email).toLowerCase().includes(s))
      .slice(0, 8);
  }, [search, withEmail, emailSet]);

  const applyTemplate = (t) => { setSubject(t.subject); setBody(t.body); };

  const previewFor = recipients[0] || { name: 'Devotee Name', email: '' };
  const personalize = (s) => String(s || '')
    .replace(/\{\s*name\s*\}/gi, previewFor.name || '')
    .replace(/\{\s*firstName\s*\}/gi, (previewFor.name || '').split(/\s+/)[0] || previewFor.name || '');

  const send = async () => {
    if (!subject.trim() || !body.trim()) { alertError('Almost there', 'Add a subject and a message.'); return; }
    if (!recipients.length) { alertError('No recipients', 'Add at least one recipient with an email address.'); return; }
    const res = await Swal.fire({
      icon: 'question',
      title: `Send to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}?`,
      html: `<div style="text-align:left;font-size:14px">
        <b>Subject:</b> ${subject.replace(/</g, '&lt;')}<br>
        <b>From:</b> Akshar Connect &lt;aksharconnect01@gmail.com&gt;<br>
        <span style="color:#6b7280">Each person gets their own email${/\{\s*(first)?name\s*\}/i.test(subject + body) ? ', personalized by name' : ''}.</span>
      </div>`,
      showCancelButton: true, confirmButtonText: 'Send now', confirmButtonColor: '#E56F18', cancelButtonText: 'Cancel',
      customClass: { popup: 'rounded-3xl font-sans', confirmButton: 'rounded-2xl px-6 py-2.5 font-bold', cancelButton: 'rounded-2xl px-6 py-2.5 font-bold' },
    });
    if (!res.isConfirmed) return;
    setSending(true);
    try {
      const r = await dataService.sendEmail({
        subject: subject.trim(), body: body.trim(), recipients,
        audience: [fArea, fYuvak, fGender].filter(Boolean).join(' · ') || 'Custom',
        createdBy: user?.name || '',
      });
      setQuota(r.quotaLeft);
      await Swal.fire({
        icon: 'success', title: 'Sent!',
        html: `Delivered to <b>${r.sent}</b> recipient${r.sent === 1 ? '' : 's'}.${r.failed ? `<br>${r.failed} failed.` : ''}${r.skipped ? `<br>${r.skipped} skipped (no/duplicate email or over daily limit).` : ''}`,
        confirmButtonColor: '#E56F18',
        customClass: { popup: 'rounded-3xl font-sans', confirmButton: 'rounded-2xl px-6 py-2.5 font-bold' },
      });
      setSubject(''); setBody(''); setRecipients([]);
    } catch (e) {
      alertError('Could not send', e.message);
    } finally { setSending(false); }
  };

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-text-muted" />
        <h2 className="mt-4 text-lg font-bold text-text-main">Staff only</h2>
        <p className="mt-1 text-sm text-text-muted">Email tools are available to Admins and Sevaks.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow-md shadow-primary/30">
          <Mail className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-text-main leading-tight">Email</h1>
          <p className="truncate text-xs text-text-muted">From Akshar Connect &lt;aksharconnect01@gmail.com&gt;{quota != null ? ` · ${quota} left today` : ''}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-2xl border border-border-light bg-bg-base p-1">
        {[{ id: 'compose', label: 'Compose', icon: Send }, { id: 'history', label: 'History', icon: History }, ...(isAdmin ? [{ id: 'templates', label: 'Templates', icon: FileText }] : [])].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${tab === id ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'compose' && (
        <div className="mt-4 space-y-4">
          {/* Recipients */}
          <div className="rounded-3xl border border-border-light bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold text-text-main"><Users className="h-4 w-4 text-primary" /> Recipients</p>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{recipients.length} selected</span>
            </div>
            <p className="mb-3 text-[11px] text-text-muted">{withEmail.length} of {devotees.length} devotees have an email address on file.</p>

            {/* Filters */}
            <div className="grid grid-cols-3 gap-2">
              <select value={fArea} onChange={(e) => setFArea(e.target.value)} className="rounded-xl border border-border-light bg-bg-base px-2 py-2 text-xs font-semibold text-text-main focus:outline-none">
                <option value="">All areas</option>
                {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={fYuvak} onChange={(e) => setFYuvak(e.target.value)} className="rounded-xl border border-border-light bg-bg-base px-2 py-2 text-xs font-semibold text-text-main focus:outline-none">
                <option value="">All types</option>
                {YUVAK_TYPES.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={fGender} onChange={(e) => setFGender(e.target.value)} className="rounded-xl border border-border-light bg-bg-base px-2 py-2 text-xs font-semibold text-text-main focus:outline-none">
                <option value="">All genders</option>
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <button onClick={() => addRecipients(matching)} disabled={matchingNew === 0}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary bg-primary/5 py-2 text-xs font-bold text-primary transition-colors disabled:opacity-40">
              <UserPlus className="h-4 w-4" /> Add {matchingNew} matching {fArea || fYuvak || fGender ? 'devotee' : ''}{matchingNew === 1 ? '' : 's'}
            </button>

            {/* Search add */}
            <div className="relative mt-2">
              <Search className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a devotee to add individually…"
                className="w-full rounded-xl border border-border-light bg-bg-base pl-9 pr-3 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-[#FF862A]" />
              {searchResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-border-light bg-surface shadow-xl">
                  {searchResults.map((d) => (
                    <button key={d.id} onClick={() => { addRecipients([d]); setSearch(''); }} className="block w-full px-3.5 py-2.5 text-left text-sm hover:bg-bg-base">
                      <span className="font-bold text-text-main">{d.name}</span>
                      <span className="text-xs text-text-muted"> · {d.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected chips */}
            {recipients.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Selected</p>
                  <button onClick={() => setRecipients([])} className="text-[11px] font-bold text-red-500">Clear all</button>
                </div>
                <div className="mt-1.5 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {recipients.map((r) => (
                    <span key={r.email} className="flex items-center gap-1 rounded-full bg-bg-base px-2.5 py-1 text-xs font-semibold text-text-main">
                      {r.name || r.email}
                      <button onClick={() => removeRecipient(r.email)} className="text-text-muted hover:text-red-500"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Templates */}
          <div className="rounded-3xl border border-border-light bg-surface p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text-main"><Sparkles className="h-4 w-4 text-accent" /> Start from a template</p>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button key={t.id || t.name} onClick={() => applyTemplate(t)}
                  className="rounded-full border border-border-light bg-bg-base px-3 py-1.5 text-xs font-bold text-text-muted transition-colors hover:border-primary hover:text-primary">
                  {t.name}
                </button>
              ))}
              {isAdmin && (
                <button onClick={() => setTab('templates')}
                  className="rounded-full border border-dashed border-border-light bg-bg-base px-3 py-1.5 text-xs font-bold text-text-muted transition-colors hover:border-primary hover:text-primary">
                  <Pencil className="mr-1 inline h-3 w-3" />Edit templates
                </button>
              )}
            </div>
          </div>

          {/* Compose */}
          <div className="rounded-3xl border border-border-light bg-surface p-4">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Subject"
              className="w-full border-b border-border-light bg-transparent pb-2 text-base font-bold text-text-main outline-none placeholder:text-text-muted" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} placeholder="Write your message…"
              className="mt-3 w-full resize-y bg-transparent text-sm text-text-main outline-none placeholder:text-text-muted" />
            <p className="mt-1 text-[11px] text-text-muted">Tip: type <code className="rounded bg-bg-base px-1">{'{firstName}'}</code> and each person sees their own name.</p>

            <div className="mt-3 flex items-center justify-between">
              <button onClick={() => setShowPreview((v) => !v)} className="flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-text-main">
                {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {showPreview ? 'Hide' : 'Preview'}
              </button>
              <button onClick={send} disabled={sending}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/30 transition-opacity disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send{recipients.length ? ` (${recipients.length})` : ''}
              </button>
            </div>

            {showPreview && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-border-light">
                <div className="bg-gradient-to-r from-[#E56F18] to-[#FF862A] px-4 py-2 text-sm font-bold text-white">🙏 Akshar Connect</div>
                <div className="bg-bg-base p-4">
                  <p className="text-xs text-text-muted">Subject</p>
                  <p className="mb-2 text-sm font-bold text-text-main">{personalize(subject) || '(no subject)'}</p>
                  <p className="whitespace-pre-wrap text-sm text-text-main">{personalize(body) || '(empty message)'}</p>
                  {recipients[0] && <p className="mt-3 text-[11px] text-text-muted">Preview for {recipients[0].name} &lt;{recipients[0].email}&gt;</p>}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Emails send from the Mandal's Google account and count toward a daily limit{quota != null ? ` (${quota} left today)` : ''}. Recipients without a valid email are skipped automatically.</p>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="mt-4 space-y-2">
          {loadingHist && <p className="text-sm text-text-muted">Loading…</p>}
          {!loadingHist && campaigns.length === 0 && (
            <div className="rounded-3xl border border-dashed border-border-light bg-surface p-10 text-center">
              <History className="mx-auto h-8 w-8 text-text-muted" />
              <p className="mt-2 text-sm font-semibold text-text-main">No emails sent yet</p>
              <p className="text-xs text-text-muted">Your sent emails will appear here.</p>
            </div>
          )}
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border-light bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-bold text-text-main">{c.subject}</p>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{c.sentCount} sent</span>
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[12px] text-text-muted">{c.body}</p>
              <p className="mt-2 text-[11px] text-text-muted">
                {fmtDateTime(c.createdOn)}{c.createdBy ? ` · ${c.createdBy}` : ''}
                {c.audience ? ` · ${c.audience}` : ''}
                {Number(c.failedCount) > 0 ? ` · ${c.failedCount} failed` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === 'templates' && isAdmin && (
        <div className="mt-4 space-y-3">
          {!editing && (
            <button onClick={() => setEditing({ id: '', name: '', subject: '', body: '' })}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary bg-primary/5 py-2.5 text-sm font-bold text-primary">
              <Plus className="h-4 w-4" /> New template
            </button>
          )}

          {editing && (
            <div className="space-y-3 rounded-3xl border border-primary/30 bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-text-main">{editing.id ? 'Edit template' : 'New template'}</p>
                <button onClick={() => setEditing(null)} className="rounded-lg p-1 text-text-muted hover:text-red-500"><X className="h-4 w-4" /></button>
              </div>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80}
                placeholder="Template name (e.g. Diwali greeting)"
                className="w-full rounded-xl border border-border-light bg-bg-base px-3 py-2.5 text-sm font-bold text-text-main outline-none focus:ring-2 focus:ring-[#FF862A]" />
              <input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} maxLength={200}
                placeholder="Subject"
                className="w-full rounded-xl border border-border-light bg-bg-base px-3 py-2.5 text-sm text-text-main outline-none focus:ring-2 focus:ring-[#FF862A]" />
              <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={8}
                placeholder="Message… use {firstName} to personalize."
                className="w-full resize-y rounded-xl border border-border-light bg-bg-base px-3 py-2.5 text-sm text-text-main outline-none focus:ring-2 focus:ring-[#FF862A]" />
              <p className="text-[11px] text-text-muted">Tip: <code className="rounded bg-bg-base px-1">{'{firstName}'}</code> is replaced with each recipient's name.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(null)} className="rounded-xl border border-border-light bg-surface px-4 py-2 text-sm font-bold text-text-muted">Cancel</button>
                <button onClick={saveTpl} disabled={tplSaving}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {tplSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id || t.name} className="rounded-2xl border border-border-light bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-text-main">{t.name}</p>
                    <p className="truncate text-[12px] text-text-muted">{t.subject}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => setEditing({ id: t.id || '', name: t.name || '', subject: t.subject || '', body: t.body || '' })}
                      className="rounded-lg p-1.5 text-text-muted hover:text-primary" title="Edit"><Pencil className="h-4 w-4" /></button>
                    {t.id && (
                      <button onClick={() => deleteTpl(t)} className="rounded-lg p-1.5 text-text-muted hover:text-red-500" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[12px] text-text-muted">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
