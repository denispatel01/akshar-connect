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
  X,
  Heart,
  MessageCircle,
  Film,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { ghariService } from '../services/ghariService';
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

// Relative "time ago" for feed cards.
function feedTimeAgo(iso) {
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24); return `${dd}d`;
}

// Compact Feed preview shown on the Home page so posts are seen without navigating.
function FeedPreview({ setActivePage }) {
  const [posts, setPosts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let alive = true;
    dataService.getFeed({ limit: 8 }).then((r) => { if (alive) { setPosts(r.posts || []); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  const firstMedia = (p) => { try { const m = JSON.parse(p.mediaJson || '[]'); return m[0] || null; } catch { return null; } };

  return (
    <div className="rounded-3xl border border-border-light bg-surface p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-text-main">
          <Sparkles className="h-5 w-5 text-[#FF862A]" /> Feed
        </h2>
        <button onClick={() => setActivePage('feed')} className="flex items-center gap-1 text-xs font-bold text-[#FF862A] hover:underline">
          Open Feed <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Share prompt */}
      <button onClick={() => setActivePage('feed')}
        className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-border-light bg-bg-base px-4 py-3 text-left transition-colors hover:border-primary/40">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white"><Plus className="h-4 w-4" /></span>
        <span className="text-sm font-semibold text-text-muted">Share a photo or moment with the Mandal…</span>
      </button>

      {loading && (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => <div key={i} className="h-44 w-36 shrink-0 animate-pulse rounded-2xl bg-bg-base" />)}
        </div>
      )}

      {!loading && posts.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border-light bg-bg-base px-4 py-6 text-center text-xs font-semibold text-text-muted">
          No posts yet — be the first to share 🙏
        </p>
      )}

      {!loading && posts.length > 0 && (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
          {posts.map((p) => {
            const media = firstMedia(p);
            return (
              <button key={p.id} onClick={() => setActivePage('feed')}
                className="w-40 shrink-0 snap-start overflow-hidden rounded-2xl border border-border-light bg-bg-base text-left transition-transform active:scale-[0.98]">
                <div className="relative h-36 w-full bg-gradient-to-br from-bg-base to-border-light">
                  {media && media.type === 'image' && <img src={media.url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  {media && media.type === 'video' && (
                    <div className="flex h-full w-full items-center justify-center bg-black/80"><Film className="h-7 w-7 text-white/90" /></div>
                  )}
                  {!media && (
                    <div className="flex h-full w-full items-center justify-center p-3">
                      <p className="line-clamp-4 text-[12px] font-semibold text-text-main">{p.caption || p.description || '🙏'}</p>
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-bold text-white">{feedTimeAgo(p.createdOn)}</span>
                </div>
                <div className="p-2.5">
                  <p className="truncate text-[11px] font-bold text-text-main">{p.authorName || 'Member'}</p>
                  {p.caption && <p className="mt-0.5 line-clamp-2 text-[11px] text-text-muted">{p.caption}</p>}
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] font-bold text-text-muted">
                    <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {p.likeCount || 0}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {p.commentCount || 0}</span>
                  </div>
                </div>
              </button>
            );
          })}
          <button onClick={() => setActivePage('feed')}
            className="flex w-28 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-light bg-bg-base text-text-muted transition-colors hover:border-primary/40 hover:text-primary">
            <ArrowRight className="h-5 w-5" />
            <span className="text-[11px] font-bold">View all</span>
          </button>
        </div>
      )}
    </div>
  );
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
  const oldCount = devotees.filter(d => String(d.oldNew || '').trim().toLowerCase() === 'old').length;
  // One family per head (Primary member) — same definition the directory uses,
  // so the family count matches everywhere.
  const familiesCount = devotees.filter(d => d.type === 'Primary').length;
  // "Needs attention" counts (actionable data gaps).
  const nMissingMobile = devotees.filter(d => !String(d.mobile || '').replace(/\D/g, '')).length;
  const nMissingDob = devotees.filter(d => !String(d.dob || '').trim()).length;
  const ghariPendingKg = React.useMemo(() => {
    try { return ghariService.pendingDeliveryKg(ghariService.getSeason()); } catch (e) { return 0; }
  }, []);
  const fmtKg = (k) => `${Number.isInteger(k) ? k : (Math.round(k * 10) / 10)} kg`;
  // Gender splits + family-head splits.
  const maleCount = devotees.filter(d => d.gender === 'Male').length;
  const femaleCount = devotees.filter(d => d.gender === 'Female').length;
  const maleHeadCount = devotees.filter(d => d.type === 'Primary' && d.gender === 'Male').length;
  const femaleHeadCount = devotees.filter(d => d.type === 'Primary' && d.gender === 'Female').length;
  // Karyakartas (by the follow-up karyakarta each devotee is assigned to), split by
  // the karyakarta's own gender (resolved by matching the name to a devotee record).
  // Click a name to open the devotees under that karyakarta.
  const karyakartaPanes = React.useMemo(() => {
    const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ')
      .split(/\s+/).map((t) => t.replace(/(bhai|ben|kumar)$/i, '')).join(' ')
      .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);
    // Gender lookup from the Devotees themselves — by mobile (reliable) and by name.
    const genderByMobile = new Map();
    const genderByName = new Map();
    devotees.forEach((d) => {
      const mob = last10(d.mobile); if (mob && d.gender && !genderByMobile.has(mob)) genderByMobile.set(mob, d.gender);
      const k = norm(d.name); if (k && d.gender && !genderByName.has(k)) genderByName.set(k, d.gender);
    });
    // One group per follow-up karyakarta, remembering a representative mobile so we
    // can resolve the karyakarta's gender from their own record.
    const groups = new Map(); // name -> { count, mobile }
    devotees.forEach((d) => {
      const k = String(d.followupKaryakarta || '').trim(); if (!k) return;
      const g = groups.get(k) || { count: 0, mobile: '' };
      g.count++;
      if (!g.mobile && d.followupKaryakartaMobile) g.mobile = last10(d.followupKaryakartaMobile);
      groups.set(k, g);
    });
    const male = [], female = [], other = [];
    [...groups.entries()].forEach(([name, info]) => {
      const gender = (info.mobile && genderByMobile.get(info.mobile)) || genderByName.get(norm(name)) || '';
      const row = { name, count: info.count };
      if (gender === 'Female') female.push(row); else if (gender === 'Male') male.push(row); else other.push(row);
    });
    const srt = (arr) => arr.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { male: srt(male), female: srt(female), other: srt(other) };
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
  const scrollToKaryakartas = () => { try { document.getElementById('kk-panes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} };

  const isDevotee = user?.role === 'Devotee';

  // Mobile: single column (grid-cols-1 = identical stack). Desktop: a real
  // multi-column dashboard via lg:col-span / lg:order — DOM order is unchanged so
  // mobile looks exactly the same.
  return (
    <div className="w-full max-w-none 2xl:max-w-[1600px] 2xl:mx-auto px-4 py-6 sm:px-6 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-primary p-6 text-white shadow-lg sm:p-8 lg:col-span-3 lg:order-1">
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
              Everything for our Mandal in one place — daily Vato & darshan, the community Feed, your Swadhyay, Calendar & Seva, devotees, events, announcements and more. 🙏
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

      {/* Darshan + Today's Inspiration — side by side on desktop (half each),
          stacked full-width on mobile. Darshan sits first, right after the banner. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:col-span-3 lg:order-2 lg:items-start">
        <DarshanSlider />
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
          className="w-full object-contain bg-[#001a33] lg:max-h-[22rem]"
          loading="lazy"
        />
        </div>
      </div>

      {/* Needs attention — actionable data gaps (staff only) */}
      {!isDevotee && (() => {
        const isAdmin = user?.role === 'Admin';
        const chips = [];
        if (birthdaysToday.length) chips.push({ key: 'bday', label: `${birthdaysToday.length} birthday${birthdaysToday.length === 1 ? '' : 's'} today`, icon: Cake, cls: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900', onClick: () => setShowTodayBdays(true) });
        if (ghariPendingKg > 0) chips.push({ key: 'ghari', label: `${fmtKg(ghariPendingKg)} Ghari to collect`, icon: TrendingUp, cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900', onClick: () => setActivePage('ghari') });
        if (isAdmin && nMissingMobile) chips.push({ key: 'mob', label: `${nMissingMobile} missing mobile`, icon: Phone, cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900', onClick: () => setActivePage('data') });
        if (isAdmin && nMissingDob) chips.push({ key: 'dob', label: `${nMissingDob} missing DOB`, icon: Star, cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900', onClick: () => setActivePage('data') });
        if (!chips.length) return null;
        return (
          <div className="rounded-3xl border border-border-light bg-surface p-4 shadow-xs lg:col-span-3 lg:order-3">
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">
              <TrendingUp className="h-4 w-4 text-[#FF862A]" /> Needs attention
            </p>
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <button key={c.key} onClick={c.onClick}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-transform active:scale-95 ${c.cls}`}>
                  <c.icon className="h-3.5 w-3.5" /> {c.label}
                  <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Stats Summary Cards — bifurcated into Male & Female sections because some
          labels only make sense per gender. Total Devotees & Families appear in both. */}
      <div className="lg:col-span-2 lg:order-4 space-y-6">
        {!isDevotee ? (<>
        {/* MALE section */}
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#FF862A]">
            <User className="h-4 w-4" /> Male
          </h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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

        <button type="button" onClick={scrollToKaryakartas} className={statCardCls} title="View Male Karyakartas">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Male Karyakartas</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950">
              <UserCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{karyakartaPanes.male.length}</p>
          <p className="text-[11px] font-semibold text-teal-600 mt-1">Tap to view the list</p>
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
          </div>
        </section>

        {/* FEMALE section */}
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#FF862A]">
            <User className="h-4 w-4" /> Female
          </h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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

        <button type="button" onClick={scrollToKaryakartas} className={statCardCls} title="View Female Karyakartas">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Female Karyakartas</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-600 dark:bg-pink-950">
              <UserCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-main">{karyakartaPanes.female.length}</p>
          <p className="text-[11px] font-semibold text-pink-600 mt-1">Tap to view the list</p>
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
          </div>
        </section>
        </>) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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
        )}
      </div>

      {/* Karyakartas — split into Male & Female panes. Tap a name to open the
          devotees under that karyakarta. */}
      {!isDevotee && (karyakartaPanes.male.length > 0 || karyakartaPanes.female.length > 0 || karyakartaPanes.other.length > 0) && (
        <div id="kk-panes" className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:col-span-3 lg:order-6">
          {[
            { key: 'male', title: 'Male Karyakartas', rows: karyakartaPanes.male, tone: 'text-blue-600', chip: 'bg-blue-50 text-blue-600 dark:bg-blue-950' },
            { key: 'female', title: 'Female Karyakartas', rows: karyakartaPanes.female, tone: 'text-pink-600', chip: 'bg-pink-50 text-pink-600 dark:bg-pink-950' },
          ].map((pane) => (
            <div key={pane.key} className="rounded-3xl border border-border-light bg-surface p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className={`flex items-center gap-2 text-base font-bold text-text-main`}>
                  <UserCheck className={`h-5 w-5 ${pane.tone}`} /> {pane.title}
                </h2>
                <span className="shrink-0 text-xs font-bold text-text-muted">{pane.rows.length} people</span>
              </div>
              {pane.rows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border-light bg-bg-base px-4 py-6 text-center text-xs font-semibold text-text-muted">None yet</p>
              ) : (
                <div className="space-y-2">
                  {pane.rows.map(({ name, count }) => (
                    <button key={name} type="button"
                      onClick={() => setActivePage('devotees', { filterPreset: { karyakarta: name } })}
                      title={`View ${count} devotee${count === 1 ? '' : 's'} under ${name}`}
                      className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-border-light bg-bg-base px-4 py-3 text-left transition-all hover:border-primary/40 hover:shadow-sm">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${pane.chip}`}>
                          {name.trim()[0]?.toUpperCase() || '?'}
                        </span>
                        <span className="truncate text-sm font-bold text-text-main">{name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{count}</span>
                        <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-primary" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Karyakartas whose gender couldn't be matched to a devotee record. */}
          {karyakartaPanes.other.length > 0 && (
            <div className="rounded-3xl border border-border-light bg-surface p-5 shadow-xs lg:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-bold text-text-main">
                  <UserCheck className="h-5 w-5 text-text-muted" /> Other Karyakartas
                </h2>
                <span className="shrink-0 text-xs font-bold text-text-muted">{karyakartaPanes.other.length} people · gender not matched</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {karyakartaPanes.other.map(({ name, count }) => (
                  <button key={name} type="button"
                    onClick={() => setActivePage('devotees', { filterPreset: { karyakarta: name } })}
                    title={`View ${count} devotee${count === 1 ? '' : 's'} under ${name}`}
                    className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-border-light bg-bg-base px-4 py-3 text-left transition-all hover:border-primary/40 hover:shadow-sm">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-500 dark:bg-slate-800">
                        {name.trim()[0]?.toUpperCase() || '?'}
                      </span>
                      <span className="truncate text-sm font-bold text-text-main">{name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{count}</span>
                      <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-primary" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feed preview — surfaced on Home so posts get seen */}
      <div className="lg:col-span-1 lg:order-5"><FeedPreview setActivePage={setActivePage} /></div>


      {/* Upcoming Birthdays */}
      <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs lg:col-span-2 lg:order-8">
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

      {/* Quick Actions */}
      {!isDevotee && (
      <div className="rounded-3xl border border-border-light bg-surface p-6 shadow-xs lg:col-span-1 lg:order-7">
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
