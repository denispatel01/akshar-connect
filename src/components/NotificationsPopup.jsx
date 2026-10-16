import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, Cake, MessageSquare, CalendarClock, PhoneCall, UserPlus, Megaphone, Check } from 'lucide-react';
import { dataService } from '../services/dataService';
import { hasAnyTag } from '../services/devoteeSchema';
import { isBirthdayToday, upcomingBirthdays, birthdayDate } from '../utils/birthdays';

const fmtWhen = (iso) => {
  try {
    const d = new Date(iso); const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch { return ''; }
};

const contactedF = (f) => !!(f && (f.call || f.inPerson || f.message || f.outcome));

function waWish(d) {
  const num = String(d.whatsapp || d.mobile || '').replace(/\D/g, '');
  if (!num) return '';
  const to = num.length === 10 ? '91' + num : num;
  const txt = encodeURIComponent(`Jai Swaminarayan ${d.firstName || d.name || ''}! 🎂 Wishing you a very happy birthday. 🙏`);
  return `https://wa.me/${to}?text=${txt}`;
}

// Shown once per day on app open when there is something worth surfacing.
export default function NotificationsPopup({ user }) {
  const canManage = user?.role === 'Admin' || user?.role === 'Sevak';
  // Push notifications = announcements, newest first (the backend already sorts
  // desc and caps at 50). We show the FULL list — this is the notification feed.
  const [announcements, setAnnouncements] = useState(() => (dataService.getCachedAnnouncements() || []));
  // Per-device "read" set — a notification the user marked as read is hidden now and
  // on every future open (so ~3 pushes/day don't pile up endlessly).
  const [readIds, setReadIds] = useState(() => dataService.getReadNotifIds());
  const markRead = (a) => {
    dataService.markNotificationRead(a);
    setReadIds(new Set([...readIds, String(a.id)]));
  };
  // Refresh announcements in the background (and when a push arrives while open).
  useEffect(() => {
    let alive = true;
    const load = () => dataService.getAnnouncements().then(list => { if (alive) setAnnouncements(list || []); }).catch(() => {});
    load();
    const onPush = () => load();
    window.addEventListener('ac-push-received', onPush);
    return () => { alive = false; window.removeEventListener('ac-push-received', onPush); };
  }, []);
  // Only show push notifications the user hasn't marked as read.
  const unreadAnnouncements = useMemo(() => (announcements || []).filter(a => !readIds.has(String(a.id))), [announcements, readIds]);
  const devotees = useMemo(() => dataService.getDevotees(), []);
  const today = useMemo(() => devotees.filter(d => isBirthdayToday(d.dob)), [devotees]);
  const soon = useMemo(
    () => upcomingBirthdays(devotees, 7).filter(x => !x.info?.isToday).slice(0, 12),
    [devotees]
  );

  // Pending follow-ups on upcoming events (staff only). Pending must be counted
  // over the EVENT'S AUDIENCE (devotees matching its tags), not the whole
  // directory — otherwise an event tagged for 54 people showed ~531 pending
  // (total devotees minus a few contacted). Mirrors FollowupsPage's audience.
  const pendingEvents = useMemo(() => {
    if (!canManage) return [];
    const todayISO = new Date().toISOString().slice(0, 10);
    // Dedupe by id so duplicate records don't inflate the count.
    const seen = new Set();
    const uniqueDevotees = devotees.filter(d => (seen.has(d.id) ? false : (seen.add(d.id), true)));
    return dataService.getEvents()
      .filter(ev => (ev.date || '') >= todayISO)
      .map(ev => {
        const tags = String(ev.tags || '').split('|').map(s => s.trim()).filter(Boolean);
        const audience = tags.length ? uniqueDevotees.filter(d => hasAnyTag(d, tags)) : uniqueDevotees;
        const fmap = {};
        dataService.getFollowupsForEvent(ev.id).forEach(f => { fmap[f.devoteeId] = f; });
        const pending = audience.reduce((n, d) => n + (contactedF(fmap[d.id]) ? 0 : 1), 0);
        return { ev, pending };
      })
      .filter(x => x.pending > 0)
      .sort((a, b) => (a.ev.date || '').localeCompare(b.ev.date || ''))
      .slice(0, 5);
  }, [devotees, canManage]);

  // Devotees added in the last 7 days (staff only).
  const newDevotees = useMemo(() => {
    if (!canManage) return [];
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return devotees
      .filter(d => { const t = Date.parse(d.createdOn || ''); return !isNaN(t) && t >= cutoff; })
      .sort((a, b) => Date.parse(b.createdOn) - Date.parse(a.createdOn));
  }, [devotees, canManage]);

  const hasItems = unreadAnnouncements.length > 0 || today.length > 0 || soon.length > 0 || pendingEvents.length > 0 || newDevotees.length > 0;
  // This is a notification CENTER, opened from the header bell — never an
  // auto-popup. It slides in from the right (a real notification panel) and lists
  // every push notification, newest first.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('ac-open-notifications', onOpen);
    return () => window.removeEventListener('ac-open-notifications', onOpen);
  }, []);

  const close = () => setOpen(false);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-stretch justify-end bg-black/40 backdrop-blur-[1px]"
      onClick={close} style={{ animation: 'ntfFade .2s ease-out' }}>
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-surface shadow-2xl sm:rounded-l-3xl"
        onClick={e => e.stopPropagation()} style={{ animation: 'ntfSlide .25s cubic-bezier(.22,1,.36,1)' }}>
        <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-text-main">
            <Bell className="h-5 w-5 text-[#FF862A]" /> Notifications
          </h2>
          <button onClick={close} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {!hasItems && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted">
              <Bell className="h-9 w-9 opacity-30" />
              <p className="text-sm font-semibold">No notifications yet.</p>
              <p className="text-[12px]">Push notifications will appear here, newest first.</p>
            </div>
          )}
          {unreadAnnouncements.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#FF862A]">
                <Megaphone className="h-3.5 w-3.5" /> Push notifications
              </p>
              <div className="space-y-2">
                {unreadAnnouncements.map(a => (
                  <div key={a.id} className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-text-main">{a.title}</p>
                      <span className="shrink-0 text-[10px] font-bold text-text-muted">{fmtWhen(a.createdOn)}</span>
                    </div>
                    {a.body && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-text-main/90">{a.body}</p>}
                    <div className="mt-2 flex justify-end">
                      <button onClick={() => markRead(a)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white/70 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-white dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                        <Check className="h-3.5 w-3.5" /> Mark as read
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {today.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-500">
                <Cake className="h-3.5 w-3.5" /> Birthdays today ({today.length})
              </p>
              <div className="space-y-2">
                {today.map(d => {
                  const wa = waWish(d);
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10 px-3 py-2.5">
                      <span className="text-sm font-bold text-text-main truncate">{d.name}</span>
                      {wa && (
                        <a href={wa} target="_blank" rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600">
                          <MessageSquare className="h-3.5 w-3.5" /> Wish
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {soon.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                <CalendarClock className="h-3.5 w-3.5" /> Coming up this week
              </p>
              <div className="space-y-1.5">
                {soon.map(({ devotee, info }) => (
                  <div key={devotee.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-light bg-bg-base px-3 py-2">
                    <span className="text-sm font-semibold text-text-main truncate">{devotee.name}</span>
                    <span className="text-[11px] font-bold text-text-muted shrink-0">{birthdayDate(info)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingEvents.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#FF862A]">
                <PhoneCall className="h-3.5 w-3.5" /> Pending follow-ups
              </p>
              <div className="space-y-1.5">
                {pendingEvents.map(({ ev, pending }) => (
                  <div key={ev.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text-main truncate">{ev.title}</p>
                      <p className="text-[11px] text-text-muted">{ev.date}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#FF862A] px-2.5 py-0.5 text-[11px] font-bold text-white">{pending} pending</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {newDevotees.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                <UserPlus className="h-3.5 w-3.5" /> New devotees (last 7 days) · {newDevotees.length}
              </p>
              <div className="space-y-1.5">
                {newDevotees.slice(0, 8).map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-3 py-2">
                    <span className="text-sm font-semibold text-text-main truncate">{d.name}</span>
                    <span className="text-[11px] font-bold text-text-muted shrink-0">{String(d.createdOn || '').slice(0, 10)}</span>
                  </div>
                ))}
                {newDevotees.length > 8 && (
                  <p className="text-[11px] text-text-muted text-center">+{newDevotees.length - 8} more</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border-light p-3">
          <button onClick={close} className="w-full rounded-2xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-[#00223f]">
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ntfFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ntfSlide { from { transform: translateX(100%); opacity: .4 } to { transform: translateX(0); opacity: 1 } }
      `}</style>
    </div>,
    document.body
  );
}
