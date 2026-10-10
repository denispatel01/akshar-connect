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
  UserCheck,
  Star,
  MessageSquare,
  X
} from 'lucide-react';
import { dataService } from '../services/dataService';
import DarshanSlider from '../components/DarshanSlider';
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
    const read = () => { setDevotees(dataService.getDevotees()); setThoughts(dataService.getThoughts()); };
    read();
    // Refresh counts in place when the background live-refresh finishes (#147).
    window.addEventListener('ac-data-refreshed', read);
    return () => window.removeEventListener('ac-data-refreshed', read);
  }, []);

  const totalDevotees = devotees.length;
  // Ambrish & Sahradyi are shown as mutually exclusive groups (a devotee tagged
  // both is counted in neither, matching the directory's Ambrish/Sahradyi views).
  const ambrishCount = devotees.filter(d => d.tags?.includes('ambrish') && !d.tags?.includes('sahradyi')).length;
  const sahradyiCount = devotees.filter(d => d.tags?.includes('sahradyi') && !d.tags?.includes('ambrish')).length;
  const karyakartaCount = devotees.filter(d => d.tags?.includes('karyakarta') && d.gender !== 'Female').length;
  const femaleKaryakartaCount = devotees.filter(d => d.tags?.includes('karyakarta') && d.gender === 'Female').length;
  const oldCount = devotees.filter(d => String(d.oldNew || '').trim().toLowerCase() === 'old').length;
  // One family per head (Primary member) — same definition the directory uses,
  // so the family count matches everywhere.
  const familiesCount = devotees.filter(d => d.type === 'Primary').length;
  // Gender splits + family-head splits.
  const maleCount = devotees.filter(d => d.gender === 'Male').length;
  const femaleCount = devotees.filter(d => d.gender === 'Female').length;
  const maleHeadCount = devotees.filter(d => d.type === 'Primary' && d.gender === 'Male').length;
  const femaleHeadCount = devotees.filter(d => d.type === 'Primary' && d.gender === 'Female').length;
  // Karyakartas (by the follow-up karyakarta each devotee is assigned to), with how
  // many devotees fall under each — click a name to open that person's list.
  const karyakartaGroups = React.useMemo(() => {
    const m = new Map();
    devotees.forEach((d) => {
      const k = String(d.followupKaryakarta || '').trim();
      if (k) m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [devotees]);
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
    'rounded-2xl border border-border-light bg-surface p-5 shadow-xs transition-all hover:shadow-md hover:border-primary/30 text-left w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003158]';

  const openDevotees = (devoteesPreset) => setActivePage('devotees', { devoteesPreset });

  const isDevotee = user?.role === 'Devotee';

  return (
    <div className="w-full max-w-none px-4 py-6 sm:px-6 space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-primary p-6 text-white shadow-lg sm:p-8">
        <img
          src={`${import.meta.env.BASE_URL}images/swamiji-jode.webp`}
          alt="Jode cho Maharaj"
          className="absolute inset-y-0 right-0 z-0 hidden h-full w-1/2 object-cover object-[center_25%] opacity-90 sm:block"
          loading="lazy"
        />
        <div className="absolute inset-0 z-0 hidden bg-gradient-to-r from-[#E56F18] via-[#E56F18]/95 to-[#E56F18]/30 sm:block" />
        <div
          className="absolute -right-10 -top-10 h-64 w-64 rounded-full opacity-25 z-0"
          style={{ background: 'radial-gradient(circle, rgba(255,210,170,1) 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-white/90 uppercase tracking-widest mb-1">
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
            className="flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-[#E56F18] shadow-md transition-all hover:bg-white/90 active:scale-95"
          >
            <Users className="h-5 w-5" /> View Devotees
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {!isDevotee && (<>
        <button type="button" onClick={() => openDevotees('total')} className={statCardCls} title="View all devotees">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Total Devotees</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-text-main">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{totalDevotees}</p>
          <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Tap to open full directory
          </p>
        </button>

        <button type="button" onClick={() => openDevotees('ambrish')} className={statCardCls} title="View Ambrish devotees">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Ambrish</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-[#FF862A]">
              <Award className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{ambrishCount}</p>
          <p className="text-[11px] font-semibold text-amber-600 mt-1">Tap to view tagged Ambrish</p>
        </button>

        <button type="button" onClick={() => openDevotees('sahradyi')} className={statCardCls} title="View Sahradyi devotees">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Sahradyi</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-[#FF862A]">
              <Award className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{sahradyiCount}</p>
          <p className="text-[11px] font-semibold text-amber-600 mt-1">Tap to view tagged Sahradyi</p>
        </button>

        <button type="button" onClick={() => openDevotees('families')} className={statCardCls} title="View family heads">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Families</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Home className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{familiesCount}</p>
          <p className="text-[11px] font-semibold text-emerald-600 mt-1">Tap to view primary family members</p>
        </button>

        <button type="button" onClick={() => openDevotees('karyakarta')} className={statCardCls} title="View Karyakartas">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Karyakarta</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950">
              <UserCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{karyakartaCount}</p>
          <p className="text-[11px] font-semibold text-teal-600 mt-1">Tap to view karyakartas</p>
        </button>

        <button type="button" onClick={() => openDevotees('karyakarta-female')} className={statCardCls} title="View Female Karyakartas">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Female Karyakarta</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-600 dark:bg-pink-950">
              <UserCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{femaleKaryakartaCount}</p>
          <p className="text-[11px] font-semibold text-pink-600 mt-1">Tap to view female karyakartas</p>
        </button>

        <button type="button" onClick={() => openDevotees('old')} className={statCardCls} title="View Old devotees">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Old Devotees</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950">
              <Star className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{oldCount}</p>
          <p className="text-[11px] font-semibold text-indigo-600 mt-1">Tap to view old devotees</p>
        </button>

        <button type="button" onClick={() => openDevotees('male')} className={statCardCls} title="View male devotees">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Male Devotees</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950">
              <User className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{maleCount}</p>
          <p className="text-[11px] font-semibold text-blue-600 mt-1">Tap to view male devotees</p>
        </button>

        <button type="button" onClick={() => openDevotees('female')} className={statCardCls} title="View female devotees">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Female Devotees</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-600 dark:bg-pink-950">
              <User className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{femaleCount}</p>
          <p className="text-[11px] font-semibold text-pink-600 mt-1">Tap to view female devotees</p>
        </button>

        <button type="button" onClick={() => openDevotees('male-head')} className={statCardCls} title="View male family heads">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Male Heads</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950">
              <Home className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{maleHeadCount}</p>
          <p className="text-[11px] font-semibold text-blue-600 mt-1">Primary members · male</p>
        </button>

        <button type="button" onClick={() => openDevotees('female-head')} className={statCardCls} title="View female family heads">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Female Heads</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-600 dark:bg-pink-950">
              <Home className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{femaleHeadCount}</p>
          <p className="text-[11px] font-semibold text-pink-600 mt-1">Primary members · female</p>
        </button>
        </>)}

        <button type="button" onClick={() => setShowTodayBdays(true)} className={statCardCls} title="View birthdays today">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Today's Birthdays</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <Cake className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{birthdaysToday.length}</p>
          <p className="text-[11px] font-semibold text-purple-600 mt-1">Tap to view celebrating today</p>
        </button>
      </div>

      {/* Karyakartas — tap a name to open the devotees under that karyakarta */}
      {!isDevotee && karyakartaGroups.length > 0 && (
        <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-base font-bold text-text-main flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-teal-600" /> Karyakartas
            </h2>
            <span className="text-xs font-bold text-text-muted shrink-0">{karyakartaGroups.length} people</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {karyakartaGroups.map(({ name, count }) => (
              <button
                key={name}
                type="button"
                onClick={() => setActivePage('devotees', { filterPreset: { karyakarta: name } })}
                title={`View ${count} devotee${count === 1 ? '' : 's'} under ${name}`}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-border-light bg-bg-base px-4 py-3 text-left transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 text-sm font-bold dark:bg-teal-950">
                    {name.trim()[0]?.toUpperCase() || '?'}
                  </span>
                  <span className="truncate text-sm font-bold text-text-main">{name}</span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{count}</span>
                  <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-primary" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Darshan & Vichar slider */}
      <DarshanSlider />

      {/* Upcoming Birthdays */}
      <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-base font-bold text-text-main flex items-center gap-2">
            <Cake className="h-5 w-5 text-rose-500" /> Upcoming Birthdays
          </h2>
          <button onClick={() => openDevotees('upcomingBirthdays')} className="text-xs font-bold text-[#FF862A] hover:underline shrink-0">
            View all
          </button>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm font-semibold text-text-muted">No birthdays in the next 30 days.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 items-start">
            {upcoming.map(({ devotee, info }) => {
              const open = expandedBday === devotee.id;
              const wa = birthdayWaLink(devotee);
              return (
                <div key={devotee.id}
                  className={`rounded-2xl border transition-all ${info.isToday ? 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10' : 'border-border-light bg-bg-base'} ${open ? 'shadow-sm' : ''}`}>
                  {/* header row (tap to expand) */}
                  <button
                    onClick={() => setExpandedBday(open ? null : devotee.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${info.isToday ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'}`}>
                        <Cake className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-text-main leading-snug break-words">{devotee.name}</p>
                        <p className="text-[11px] text-text-muted">{birthdayDate(info)}{info.turning ? ` · turning ${info.turning}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[11px] font-bold ${info.isToday ? 'text-rose-600 dark:text-rose-300' : 'text-rose-500 dark:text-rose-400'}`}>{birthdayLabel(info)}</span>
                      <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* expanded details */}
                  {open && (
                    <div className="px-3 pb-3 pt-1 border-t border-border-light space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                        <p className="flex items-center gap-2 text-text-muted"><Cake className="h-3.5 w-3.5 text-rose-500 shrink-0" /> {dobShort(devotee.dob)}</p>
                        <p className="flex items-center gap-2 text-text-muted"><Phone className="h-3.5 w-3.5 text-text-muted shrink-0" /> {devotee.mobile || '—'}</p>
                        {!isDevotee && devotee.address && <p className="flex items-start gap-2 text-text-muted sm:col-span-2"><MapPin className="h-3.5 w-3.5 text-text-muted shrink-0 mt-0.5" /> <span>{devotee.address}{devotee.area ? `, ${devotee.area}` : ''}</span></p>}
                        {!isDevotee && devotee.followupKaryakarta && <p className="flex items-center gap-2 text-text-muted sm:col-span-2"><User className="h-3.5 w-3.5 text-blue-500 shrink-0" /> {devotee.followupKaryakarta}</p>}
                      </div>
                      {!isDevotee && Array.isArray(devotee.tags) && devotee.tags.length > 0 && (
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
                        {!isDevotee && (
                        <button onClick={() => setActivePage('devotees', { openDevoteeId: devotee.id })}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-3.5 py-2 text-xs font-bold text-text-main hover:bg-bg-base">
                          <User className="h-4 w-4" /> View profile
                        </button>
                        )}
                        {!wa && <span className="text-[11px] font-semibold text-text-muted">No mobile on file for a WhatsApp wish.</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Today's Inspiration — full-width text with the wallpaper below it */}
      <div className="rounded-3xl border border-border-light bg-surface shadow-xs relative overflow-hidden flex flex-col">
        <div className="w-full p-6 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#FF862A]">
              <Sparkles className="h-4 w-4" /> Today's Inspiration
            </span>
            {thoughtSlides.length > 1 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => slideThought(-1)} aria-label="Previous thought"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-light text-text-main hover:bg-bg-base">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => slideThought(1)} aria-label="Next thought"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-light text-text-main hover:bg-bg-base">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div ref={thoughtScrollRef}
            className="flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {thoughtSlides.map((t, i) => (
              <div key={i} className="snap-center shrink-0 w-full pr-1">
                <p className="text-lg font-semibold text-text-main italic leading-relaxed">
                  "{t.thought}"
                </p>
                <p className="mt-3 text-xs font-semibold text-text-muted">
                  <span className="text-text-main/70">{t.author}</span>
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
          className="w-full object-contain bg-[#001a33]"
          loading="lazy"
        />
      </div>

      {/* Quick Actions */}
      {!isDevotee && (
      <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs">
        <h2 className="text-base font-bold text-text-main mb-4">⚡ Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            onClick={() => setActivePage('devotees')}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border-light bg-bg-base p-4 text-center transition-all hover:bg-surface hover:border-primary hover:shadow-md"
          >
            <UserPlus className="h-6 w-6 text-text-main" />
            <span className="text-xs font-bold text-text-main">Devotee Directory</span>
          </button>

          <button
            onClick={() => setActivePage('followups')}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border-light bg-bg-base p-4 text-center transition-all hover:bg-surface hover:border-[#FF862A] hover:shadow-md"
          >
            <PhoneCall className="h-6 w-6 text-[#FF862A]" />
            <span className="text-xs font-bold text-text-main">Run Follow-ups</span>
          </button>
        </div>
      </div>
      )}

      {/* Today's Birthdays modal */}
      {showTodayBdays && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" onClick={() => setShowTodayBdays(false)}>
          <div className="w-full max-w-lg rounded-3xl bg-surface shadow-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border-light p-5">
              <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                <Cake className="h-5 w-5 text-purple-600" /> Today's Birthdays
                <span className="text-sm font-bold text-purple-600">({birthdaysToday.length})</span>
              </h2>
              <button onClick={() => setShowTodayBdays(false)} className="text-text-muted hover:text-text-main"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0 space-y-3">
              {birthdaysToday.length === 0 ? (
                <p className="text-sm font-semibold text-text-muted text-center py-8">No devotee has a birthday today.</p>
              ) : (
                birthdaysToday.map((d) => {
                  const wa = birthdayWaLink(d);
                  return (
                    <div key={d.id} className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white shrink-0"><Cake className="h-5 w-5" /></div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-text-main truncate">{d.name}</p>
                          <p className="text-[11px] font-semibold text-purple-600">🎂 Turning {new Date().getFullYear() - new Date(d.dob).getFullYear()} today</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                        <p className="flex items-center gap-2 text-slate-600"><Cake className="h-3.5 w-3.5 text-purple-500 shrink-0" /> {dobShort(d.dob)}</p>
                        <p className="flex items-center gap-2 text-slate-600"><Phone className="h-3.5 w-3.5 text-text-muted shrink-0" /> {d.mobile || '—'}</p>
                        {!isDevotee && d.address && <p className="flex items-start gap-2 text-slate-600 sm:col-span-2"><MapPin className="h-3.5 w-3.5 text-text-muted shrink-0 mt-0.5" /> <span>{d.address}{d.area ? `, ${d.area}` : ''}</span></p>}
                        {!isDevotee && d.followupKaryakarta && <p className="flex items-center gap-2 text-slate-600 sm:col-span-2"><User className="h-3.5 w-3.5 text-blue-500 shrink-0" /> {d.followupKaryakarta}</p>}
                      </div>
                      {!isDevotee && Array.isArray(d.tags) && d.tags.length > 0 && (
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
                        {!isDevotee && (
                        <button onClick={() => { setShowTodayBdays(false); setActivePage('devotees', { openDevoteeId: d.id }); }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border-light bg-surface px-3.5 py-2 text-xs font-bold text-text-main hover:bg-bg-base">
                          <User className="h-4 w-4" /> View profile
                        </button>
                        )}
                        {!wa && <span className="text-[11px] font-semibold text-text-muted">No mobile on file for a WhatsApp wish.</span>}
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
