import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  TrendingUp,
  Sparkles,
  UserPlus,
  Cake,
  PhoneCall,
  Home,
  Award,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Phone,
  MapPin,
  User,
  MessageSquare,
  X
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { tagLabel, tagChipStyle } from '../services/tagCatalog';

import { pickRotatingThought, displayThoughtDate } from '../utils/thoughtRotation';
import { isBirthdayToday, upcomingBirthdays, birthdayLabel, birthdayDate } from '../utils/birthdays';

const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function dobShort(dob) {
  if (!dob) return '—';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return dob;
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS_ABBR[d.getMonth()]}-${d.getFullYear()}`;
}
function birthdayWaLink(d) {
  const num = String(d.whatsapp || d.mobile || '').replace(/\D/g, '');
  if (!num) return null;
  const to = num.length === 10 ? '91' + num : num;
  const first = d.firstName || (d.name || '').split(' ')[0] || '';
  const msg = encodeURIComponent(`Jai Swaminarayan ${first}! 🎂🎉 Aapne Janmadin ni khoob khoob shubhkaamnao. Prabhu Shreeji Maharaj ane Guruhari aapne sada sukhi ane satsangmay rakhe. 🙏`);
  return `https://wa.me/${to}?text=${msg}`;
}

export default function DashboardPage({ setActivePage, user }) {
  const [devotees, setDevotees] = useState([]);
  const [thoughts, setThoughts] = useState([]);
  const [expandedBday, setExpandedBday] = useState(null);
  const [showTodayBdays, setShowTodayBdays] = useState(false);

  useEffect(() => {
    setDevotees(dataService.getDevotees());
    setThoughts(dataService.getThoughts());
  }, []);

  const totalDevotees = devotees.length;
  const ambrishCount = devotees.filter(d => d.tags?.includes('ambrish')).length;
  const familiesCount = new Set(devotees.map(d => d.familyId).filter(Boolean)).size;
  const picked = pickRotatingThought(thoughts);
  const todaysThought = picked.thought || {
    author: 'Mahant Swami Maharaj',
    thought: 'Ekta, Samp, and Suhradbhav are the true ornaments of a Satsangi.',
    date: '2026-09-19',
  };
  const birthdaysToday = devotees.filter(d => isBirthdayToday(d.dob));
  const upcoming = upcomingBirthdays(devotees, 30).slice(0, 8); // today + next 30 days

  // Thought slider — all thoughts, starting on today's rotating pick.
  const thoughtSlides = thoughts.length ? thoughts : [todaysThought];
  const thoughtScrollRef = useRef(null);
  useEffect(() => {
    const el = thoughtScrollRef.current;
    if (!el) return;
    const idx = Math.max(0, thoughtSlides.indexOf(picked.thought));
    const child = el.children[idx];
    if (child) el.scrollLeft = child.offsetLeft - el.offsetLeft;
  }, [thoughts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const slideThought = (dir) => {
    const el = thoughtScrollRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  };

  const statCardCls =
    'rounded-2xl border border-[#E4EBF3] bg-white p-5 shadow-xs transition-all hover:shadow-md hover:border-[#003158]/30 text-left w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003158]';

  const openDevotees = (devoteesPreset) => setActivePage('devotees', { devoteesPreset });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-[#003158] p-6 text-white shadow-lg sm:p-8">
        <img
          src={`${import.meta.env.BASE_URL}images/swamiji-jode.webp`}
          alt="Jode cho Maharaj"
          className="absolute inset-y-0 right-0 z-0 hidden h-full w-1/2 object-cover object-[center_25%] opacity-90 sm:block"
          loading="lazy"
        />
        <div className="absolute inset-0 z-0 hidden bg-gradient-to-r from-[#003158] via-[#003158]/95 to-[#003158]/30 sm:block" />
        <div
          className="absolute -right-10 -top-10 h-64 w-64 rounded-full opacity-20 z-0"
          style={{ background: 'radial-gradient(circle, rgba(255,134,42,1) 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#FF862A] uppercase tracking-widest mb-1">
              <ShieldCheck className="h-4 w-4" /> Role: {user?.role || 'Devotee'}
            </div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">
              Jai Swaminarayan, {user?.name || 'Devotee'}!
            </h1>
            <p className="mt-1 text-sm text-white/80 max-w-xl">
              Welcome to Akshar Connect dashboard. Manage devotees, run follow-up drives, and keep the satsang community connected.
            </p>
          </div>

          <button
            onClick={() => setActivePage('devotees')}
            className="flex items-center gap-2 rounded-2xl bg-[#FF862A] px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#e06f19] active:scale-95"
          >
            <Users className="h-5 w-5" /> View Devotees
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button type="button" onClick={() => openDevotees('total')} className={statCardCls} title="View all devotees">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9BB5CB]">Total Devotees</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#003158]/10 text-[#003158]">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#003158]">{totalDevotees}</p>
          <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Tap to open full directory
          </p>
        </button>

        <button type="button" onClick={() => openDevotees('ambrish')} className={statCardCls} title="View Ambrish devotees">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9BB5CB]">Ambrish</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-[#FF862A]">
              <Award className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#003158]">{ambrishCount}</p>
          <p className="text-[11px] font-semibold text-amber-600 mt-1">Tap to view tagged Ambrish</p>
        </button>

        <button type="button" onClick={() => openDevotees('families')} className={statCardCls} title="View family heads">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9BB5CB]">Families</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Home className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#003158]">{familiesCount}</p>
          <p className="text-[11px] font-semibold text-emerald-600 mt-1">Tap to view primary family members</p>
        </button>

        <button type="button" onClick={() => setShowTodayBdays(true)} className={statCardCls} title="View birthdays today">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9BB5CB]">Today's Birthdays</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <Cake className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#003158]">{birthdaysToday.length}</p>
          <p className="text-[11px] font-semibold text-purple-600 mt-1">Tap to view celebrating today</p>
        </button>
      </div>

      {/* Upcoming Birthdays */}
      <div className="rounded-3xl border border-[#E0EAF4] bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-base font-bold text-[#003158] flex items-center gap-2">
            <Cake className="h-5 w-5 text-purple-600" /> Upcoming Birthdays
          </h2>
          <button onClick={() => openDevotees('upcomingBirthdays')} className="text-xs font-bold text-[#FF862A] hover:underline shrink-0">
            View all
          </button>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm font-semibold text-[#9BB5CB]">No birthdays in the next 30 days.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map(({ devotee, info }) => {
              const open = expandedBday === devotee.id;
              const wa = birthdayWaLink(devotee);
              return (
                <div key={devotee.id}
                  className={`rounded-2xl border transition-all ${info.isToday ? 'border-purple-200 bg-purple-50/60' : 'border-[#F0F4F8] bg-[#F8FAFC]'} ${open ? 'shadow-sm' : ''}`}>
                  {/* header row (tap to expand) */}
                  <button
                    onClick={() => setExpandedBday(open ? null : devotee.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${info.isToday ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600'}`}>
                        <Cake className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#003158] truncate">{devotee.name}</p>
                        <p className="text-[11px] text-slate-400">{birthdayDate(info)}{info.turning ? ` · turning ${info.turning}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[11px] font-bold ${info.isToday ? 'text-purple-700' : 'text-purple-600'}`}>{birthdayLabel(info)}</span>
                      <ChevronDown className={`h-4 w-4 text-[#9BB5CB] transition-transform ${open ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* expanded details */}
                  {open && (
                    <div className="px-3 pb-3 pt-1 border-t border-black/5 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                        <p className="flex items-center gap-2 text-slate-600"><Cake className="h-3.5 w-3.5 text-purple-500 shrink-0" /> {dobShort(devotee.dob)}</p>
                        <p className="flex items-center gap-2 text-slate-600"><Phone className="h-3.5 w-3.5 text-[#9BB5CB] shrink-0" /> {devotee.mobile || '—'}</p>
                        {devotee.address && <p className="flex items-start gap-2 text-slate-600 sm:col-span-2"><MapPin className="h-3.5 w-3.5 text-[#9BB5CB] shrink-0 mt-0.5" /> <span>{devotee.address}{devotee.area ? `, ${devotee.area}` : ''}</span></p>}
                        {devotee.followupKaryakarta && <p className="flex items-center gap-2 text-slate-600 sm:col-span-2"><User className="h-3.5 w-3.5 text-blue-500 shrink-0" /> {devotee.followupKaryakarta}</p>}
                      </div>
                      {Array.isArray(devotee.tags) && devotee.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {devotee.tags.slice(0, 5).map((k) => (
                            <span key={k} style={tagChipStyle(k)} className="rounded-full px-2 py-0.5 text-[10px] font-bold">{tagLabel(k)}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-600">
                            <MessageSquare className="h-4 w-4" /> Wish on WhatsApp
                          </a>
                        )}
                        <button onClick={() => setActivePage('devotees', { openDevoteeId: devotee.id })}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4EBF3] bg-white px-3.5 py-2 text-xs font-bold text-[#003158] hover:bg-[#F0F4F8]">
                          <User className="h-4 w-4" /> View profile
                        </button>
                        {!wa && <span className="text-[11px] font-semibold text-slate-400">No mobile on file for a WhatsApp wish.</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Today's Inspiration — swipeable slider */}
      <div className="rounded-3xl border border-[#E0EAF4] bg-white shadow-xs relative overflow-hidden flex flex-col sm:flex-row">
        <div className="flex-1 p-6 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#FF862A]">
              <Sparkles className="h-4 w-4" /> Today's Inspiration
            </span>
            {thoughtSlides.length > 1 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => slideThought(-1)} aria-label="Previous thought"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#E4EBF3] text-[#003158] hover:bg-[#F0F4F8]">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => slideThought(1)} aria-label="Next thought"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#E4EBF3] text-[#003158] hover:bg-[#F0F4F8]">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div ref={thoughtScrollRef}
            className="flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {thoughtSlides.map((t, i) => (
              <div key={i} className="snap-center shrink-0 w-full pr-1">
                <p className="text-lg font-semibold text-[#003158] italic leading-relaxed">
                  "{t.thought}"
                </p>
                <p className="mt-3 text-xs font-semibold text-[#9BB5CB]">
                  <span className="text-[#003158]/70">{t.author}</span>
                  {t.date ? <span> · {displayThoughtDate(t.date)}</span> : null}
                </p>
              </div>
            ))}
          </div>
          {thoughtSlides.length > 1 && (
            <p className="mt-3 text-[11px] font-semibold text-[#B7C4D2]">Swipe or use the arrows to read more thoughts →</p>
          )}
        </div>
        <img
          src={`${import.meta.env.BASE_URL}images/quote-rajipo.webp`}
          alt="Kariye aej kaam jema Taro Rajipo"
          className="h-40 w-full object-cover object-center sm:h-auto sm:w-64 sm:rounded-r-3xl"
          loading="lazy"
        />
      </div>

      {/* Quick Actions */}
      <div className="rounded-3xl border border-[#E0EAF4] bg-white p-6 shadow-xs">
        <h2 className="text-base font-bold text-[#003158] mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            onClick={() => setActivePage('devotees')}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#E4EBF3] bg-[#F0F4F8] p-4 text-center transition-all hover:bg-white hover:border-[#003158] hover:shadow-md"
          >
            <UserPlus className="h-6 w-6 text-[#003158]" />
            <span className="text-xs font-bold text-[#003158]">Devotee Directory</span>
          </button>

          <button
            onClick={() => setActivePage('followups')}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#E4EBF3] bg-[#F0F4F8] p-4 text-center transition-all hover:bg-white hover:border-[#FF862A] hover:shadow-md"
          >
            <PhoneCall className="h-6 w-6 text-[#FF862A]" />
            <span className="text-xs font-bold text-[#003158]">Run Follow-ups</span>
          </button>
        </div>
      </div>

      {/* Today's Birthdays modal */}
      {showTodayBdays && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" onClick={() => setShowTodayBdays(false)}>
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#F0F4F8] p-5">
              <h2 className="text-lg font-bold text-[#003158] flex items-center gap-2">
                <Cake className="h-5 w-5 text-purple-600" /> Today's Birthdays
                <span className="text-sm font-bold text-purple-600">({birthdaysToday.length})</span>
              </h2>
              <button onClick={() => setShowTodayBdays(false)} className="text-[#9BB5CB] hover:text-[#003158]"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0 space-y-3">
              {birthdaysToday.length === 0 ? (
                <p className="text-sm font-semibold text-[#9BB5CB] text-center py-8">No devotee has a birthday today.</p>
              ) : (
                birthdaysToday.map((d) => {
                  const wa = birthdayWaLink(d);
                  return (
                    <div key={d.id} className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white shrink-0"><Cake className="h-5 w-5" /></div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#003158] truncate">{d.name}</p>
                          <p className="text-[11px] font-semibold text-purple-600">🎂 Turning {new Date().getFullYear() - new Date(d.dob).getFullYear()} today</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                        <p className="flex items-center gap-2 text-slate-600"><Cake className="h-3.5 w-3.5 text-purple-500 shrink-0" /> {dobShort(d.dob)}</p>
                        <p className="flex items-center gap-2 text-slate-600"><Phone className="h-3.5 w-3.5 text-[#9BB5CB] shrink-0" /> {d.mobile || '—'}</p>
                        {d.address && <p className="flex items-start gap-2 text-slate-600 sm:col-span-2"><MapPin className="h-3.5 w-3.5 text-[#9BB5CB] shrink-0 mt-0.5" /> <span>{d.address}{d.area ? `, ${d.area}` : ''}</span></p>}
                        {d.followupKaryakarta && <p className="flex items-center gap-2 text-slate-600 sm:col-span-2"><User className="h-3.5 w-3.5 text-blue-500 shrink-0" /> {d.followupKaryakarta}</p>}
                      </div>
                      {Array.isArray(d.tags) && d.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {d.tags.slice(0, 6).map((k) => (
                            <span key={k} style={tagChipStyle(k)} className="rounded-full px-2 py-0.5 text-[10px] font-bold">{tagLabel(k)}</span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-600">
                            <MessageSquare className="h-4 w-4" /> Wish on WhatsApp
                          </a>
                        )}
                        <button onClick={() => { setShowTodayBdays(false); setActivePage('devotees', { openDevoteeId: d.id }); }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4EBF3] bg-white px-3.5 py-2 text-xs font-bold text-[#003158] hover:bg-[#F0F4F8]">
                          <User className="h-4 w-4" /> View profile
                        </button>
                        {!wa && <span className="text-[11px] font-semibold text-slate-400">No mobile on file for a WhatsApp wish.</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
