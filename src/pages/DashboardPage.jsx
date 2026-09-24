import React, { useState, useEffect } from 'react';
import {
  Users,
  CalendarCheck,
  QrCode,
  FileSpreadsheet,
  TrendingUp,
  Sparkles,
  UserPlus,
  Cake,
  CheckCircle,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { dataService } from '../services/dataService';

export default function DashboardPage({ setActivePage, user }) {
  const [devotees, setDevotees] = useState([]);
  const [sabhas, setSabhas] = useState([]);
  const [thoughts, setThoughts] = useState([]);

  useEffect(() => {
    setDevotees(dataService.getDevotees());
    setSabhas(dataService.getSabhas());
    setThoughts(dataService.getThoughts());
  }, []);

  const totalDevotees = devotees.length;
  const activeSabhas = sabhas.filter(s => s.status === 'Scheduled').length;
  const avgAttendance = Math.round(
    devotees.reduce((acc, curr) => acc + (curr.attendanceRate || 0), 0) / (totalDevotees || 1)
  );
  const todaysThought = thoughts[0] || { author: 'Mahant Swami Maharaj', thought: 'Ekta and Samp bring peace and spiritual growth.' };

  const birthdaysToday = devotees.filter(d => d.flags?.includes('Birthday Today'));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-[#003158] p-6 text-white shadow-lg sm:p-8">
        <img
          src="/images/swamiji-jode.webp"
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
              Welcome to Akshar Connect dashboard. Track live sabha attendance, manage devotees, and inspect reports.
            </p>
          </div>

          <button
            onClick={() => setActivePage('qr-scanner')}
            className="flex items-center gap-2 rounded-2xl bg-[#FF862A] px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#e06f19] active:scale-95"
          >
            <QrCode className="h-5 w-5" /> Launch QR Scanner
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#E4EBF3] bg-white p-5 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9BB5CB]">Total Devotees</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#003158]/10 text-[#003158]">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#003158]">{totalDevotees}</p>
          <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Active Satsangi database
          </p>
        </div>

        <div className="rounded-2xl border border-[#E4EBF3] bg-white p-5 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9BB5CB]">Scheduled Sabhas</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-[#FF862A]">
              <CalendarCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#003158]">{activeSabhas}</p>
          <p className="text-[11px] font-semibold text-amber-600 mt-1">Upcoming events</p>
        </div>

        <div className="rounded-2xl border border-[#E4EBF3] bg-white p-5 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9BB5CB]">Avg Attendance</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#003158]">{avgAttendance}%</p>
          <p className="text-[11px] font-semibold text-emerald-600 mt-1">Consistency score</p>
        </div>

        <div className="rounded-2xl border border-[#E4EBF3] bg-white p-5 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9BB5CB]">Today's Birthdays</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <Cake className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#003158]">{birthdaysToday.length}</p>
          <p className="text-[11px] font-semibold text-purple-600 mt-1">Devotee celebrations</p>
        </div>
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
          src="/images/quote-rajipo.webp"
          alt="Kariye aej kaam jema Taro Rajipo"
          className="h-40 w-full object-cover object-center sm:h-auto sm:w-64 sm:rounded-r-3xl"
          loading="lazy"
        />
      </div>

      {/* Quick Actions & Recent Sabhas Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Actions Panel */}
        <div className="rounded-3xl border border-[#E0EAF4] bg-white p-6 shadow-xs">
          <h2 className="text-base font-bold text-[#003158] mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setActivePage('sabhas')}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#E4EBF3] bg-[#F0F4F8] p-4 text-center transition-all hover:bg-white hover:border-[#003158] hover:shadow-md"
            >
              <CalendarCheck className="h-6 w-6 text-[#003158]" />
              <span className="text-xs font-bold text-[#003158]">Mark Attendance</span>
            </button>

            <button
              onClick={() => setActivePage('qr-scanner')}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#E4EBF3] bg-[#F0F4F8] p-4 text-center transition-all hover:bg-white hover:border-[#FF862A] hover:shadow-md"
            >
              <QrCode className="h-6 w-6 text-[#FF862A]" />
              <span className="text-xs font-bold text-[#003158]">Scan Devotee QR</span>
            </button>

            <button
              onClick={() => setActivePage('devotees')}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#E4EBF3] bg-[#F0F4F8] p-4 text-center transition-all hover:bg-white hover:border-[#003158] hover:shadow-md"
            >
              <UserPlus className="h-6 w-6 text-[#003158]" />
              <span className="text-xs font-bold text-[#003158]">Devotee Directory</span>
            </button>

            <button
              onClick={() => setActivePage('reports')}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#E4EBF3] bg-[#F0F4F8] p-4 text-center transition-all hover:bg-white hover:border-[#003158] hover:shadow-md"
            >
              <FileSpreadsheet className="h-6 w-6 text-[#003158]" />
              <span className="text-xs font-bold text-[#003158]">Download Reports</span>
            </button>
          </div>
        </div>

        {/* Recent Sabha List Panel */}
        <div className="lg:col-span-2 rounded-3xl border border-[#E0EAF4] bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#003158]">Upcoming & Recent Sabhas</h2>
            <button
              onClick={() => setActivePage('sabhas')}
              className="text-xs font-bold text-[#FF862A] hover:underline flex items-center gap-1"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {sabhas.map((sabha) => (
              <div
                key={sabha.id}
                className="flex items-center justify-between rounded-2xl border border-[#E4EBF3] p-4 transition-all hover:border-[#003158]"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${sabha.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {sabha.status}
                    </span>
                    <span className="text-xs font-semibold text-[#9BB5CB]">{sabha.date} • {sabha.time}</span>
                  </div>
                  <h3 className="text-sm font-bold text-[#003158]">{sabha.title}</h3>
                  <p className="text-xs text-slate-500">{sabha.venue}</p>
                </div>

                <div className="text-right">
                  <span className="text-sm font-extrabold text-[#003158] block">
                    {sabha.presentCount} / {sabha.totalCount}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600">Present</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
