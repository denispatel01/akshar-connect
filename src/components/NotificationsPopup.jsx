import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, Cake, MessageSquare, CalendarClock, PhoneCall, UserPlus, Megaphone } from 'lucide-react';
import { dataService } from '../services/dataService';
import { isBirthdayToday, upcomingBirthdays, birthdayDate } from '../utils/birthdays';

const fmtWhen = (iso) => { try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); } catch { return ''; } };

const dayKey = () => 'ac-notif-' + new Date().toISOString().slice(0, 10);
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
  const [announcements, setAnnouncements] = useState(() => (dataService.getCachedAnnouncements() || []).slice(0, 5));
  // Refresh announcements in the background (and when a push arrives while open).
  useEffect(() => {
    let alive = true;
    const load = () => dataService.getAnnouncements().then(list => { if (alive) setAnnouncements((list || []).slice(0, 5)); }).catch(() => {});
    load();
    const onPush = () => load();
    window.addEventListener('ac-push-received', onPush);
    return () => { alive = false; window.removeEventListener('ac-push-received', onPush); };
  }, []);
  const devotees = useMemo(() => dataService.getDevotees(), []);
  const today = useMemo(() => devotees.filter(d => isBirthdayToday(d.dob)), [devotees]);
  const soon = useMemo(
    () => upcomingBirthdays(devotees, 7).filter(x => !x.info?.isToday).slice(0, 12),
    [devotees]
  );

  // Pending follow-ups on upcoming events (staff only).
  const pendingEvents = useMemo(() => {
    if (!canManage) return [];
    const todayISO = new Date().toISOString().slice(0, 10);
    const total = devotees.length;
    return dataService.getEvents()
      .filter(ev => (ev.date || '') >= todayISO)
      .map(ev => {
        const done = dataService.getFollowupsForEvent(ev.id).filter(contactedF).length;
        return { ev, pending: Math.max(0, total - done) };
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

  const hasItems = announcements.length > 0 || today.length > 0 || soon.length > 0 || pendingEvents.length > 0 || newDevotees.length > 0;
  const [open, setOpen] = useState(() => {
    if (!hasItems) return false;
    try { return localStorage.getItem(dayKey()) !== '1'; } catch (e) { return true; }
  });

  // Just close for now — it will pop up again next time the app is opened.
  const close = () => setOpen(false);
  // Suppress only for the rest of today; it returns tomorrow.
  const dismissToday = () => {
    try { localStorage.setItem(dayKey(), '1'); } catch (e) {}
    setOpen(false);
  };

  if (!open || !hasItems) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 backdrop-blur-[1px] p-4 pt-[8vh]"
      onClick={close} style={{ animation: 'ntfFade .2s ease-out' }}>
      <div className="w-full max-w-md rounded-3xl bg-surface shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()} style={{ animation: 'ntfPop .25s cubic-bezier(.22,1,.36,1)' }}>
        <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-text-main">
            <Bell className="h-5 w-5 text-[#FF862A]" /> Notifications
          </h2>
          <button onClick={close} className="grid h-8 w-8 place-items-center rounded-xl text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {announcements.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#FF862A]">
                <Megaphone className="h-3.5 w-3.5" /> Announcements
              </p>
              <div className="space-y-2">
                {announcements.map(a => (
                  <div key={a.id} className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-text-main">{a.title}</p>
                      <span className="shrink-0 text-[10px] font-bold text-text-muted">{fmtWhen(a.createdOn)}</span>
                    </div>
                    {a.body && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-text-main/90">{a.body}</p>}
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

        <div className="border-t border-border-light p-3 flex gap-2">
          <button onClick={dismissToday} className="flex-1 rounded-2xl border border-border-light bg-bg-base py-2.5 text-sm font-bold text-text-muted hover:text-text-main">
            Don't show today
          </button>
          <button onClick={close} className="flex-1 rounded-2xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-[#00223f]">
            Got it
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ntfFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ntfPop { from { transform: translateY(-12px) scale(.98); opacity: .6 } to { transform: translateY(0) scale(1); opacity: 1 } }
      `}</style>
    </div>,
    document.body
  );
}
