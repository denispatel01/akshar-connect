import React, { useState, useEffect } from 'react';
import {
  Users,
  TrendingUp,
  Sparkles,
  UserPlus,
  Cake,
  PhoneCall,
  Home,
  Award,
  ShieldCheck
} from 'lucide-react';
import { dataService } from '../services/dataService';

export default function DashboardPage({ setActivePage, user }) {
  const [devotees, setDevotees] = useState([]);
  const [thoughts, setThoughts] = useState([]);

  useEffect(() => {
    setDevotees(dataService.getDevotees());
    setThoughts(dataService.getThoughts());
  }, []);

  const totalDevotees = devotees.length;
  const ambrishCount = devotees.filter(d => d.tags?.includes('ambrish')).length;
  const familiesCount = new Set(devotees.map(d => d.familyId).filter(Boolean)).size;
  const todaysThought = thoughts[0] || { author: 'Mahant Swami Maharaj', thought: 'Ekta and Samp bring peace and spiritual growth.' };

  const birthdaysToday = devotees.filter(d => d.flags?.includes('Birthday Today'));

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

        <button type="button" onClick={() => openDevotees('birthdays')} className={statCardCls} title="View birthdays today">
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

      {/* Thought of the Day Banner */}
      <div className="rounded-3xl border border-[#E0EAF4] bg-white shadow-xs relative overflow-hidden flex flex-col sm:flex-row">
        <div className="flex-1 p-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#FF862A] mb-2">
            <Sparkles className="h-4 w-4" /> Today's Inspiration • {todaysThought.author}
          </div>
          <p className="text-lg font-semibold text-[#003158] italic leading-relaxed">
            "{todaysThought.thought}"
          </p>
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
    </div>
  );
}
