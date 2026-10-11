import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Users, ChevronDown, Trophy, ShieldAlert, Loader2 } from 'lucide-react';
import { dataService } from '../services/dataService';

const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; } };

export default function AttendancePage({ user }) {
  const isStaff = user?.role === 'Admin' || user?.role === 'Sevak';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('sessions');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    dataService.getGroupAttendance().then((r) => { if (alive) { setData(r); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const avg = useMemo(() => {
    if (!data?.sessions?.length) return 0;
    const tot = data.sessions.reduce((s, x) => s + (x.total ? x.present / x.total : 0), 0);
    return Math.round((tot / data.sessions.length) * 100);
  }, [data]);

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-text-muted" />
        <h2 className="mt-4 text-lg font-bold text-text-main">Staff only</h2>
        <p className="mt-1 text-sm text-text-muted">Attendance is available to Admins and Sevaks.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow-md shadow-primary/30">
          <CalendarCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-text-main leading-tight">Attendance</h1>
          <p className="text-xs text-text-muted">Sabha attendance — our group</p>
        </div>
      </div>

      {loading && (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading attendance…</div>
      )}

      {!loading && !data && (
        <div className="mt-6 rounded-3xl border border-dashed border-border-light bg-surface p-10 text-center text-sm text-text-muted">
          Couldn't load attendance right now. Pull to refresh or try again later.
        </div>
      )}

      {!loading && data && (
        <>
          {/* Summary */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-border-light bg-surface p-3 text-center">
              <p className="text-2xl font-black text-text-main">{data.devoteeCount}</p>
              <p className="text-[11px] font-semibold text-text-muted">Our devotees</p>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface p-3 text-center">
              <p className="text-2xl font-black text-text-main">{data.sessionCount}</p>
              <p className="text-[11px] font-semibold text-text-muted">Sabhas</p>
            </div>
            <div className="rounded-2xl border border-border-light bg-surface p-3 text-center">
              <p className="text-2xl font-black text-text-main">{avg}%</p>
              <p className="text-[11px] font-semibold text-text-muted">Avg turnout</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1 rounded-2xl border border-border-light bg-bg-base p-1">
            {[{ id: 'sessions', label: 'By Sabha', icon: CalendarCheck }, { id: 'devotees', label: 'By Devotee', icon: Users }].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${tab === id ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {tab === 'sessions' && (
            <div className="mt-3 space-y-2">
              {data.sessions.map((s) => {
                const pct = s.total ? Math.round((s.present / s.total) * 100) : 0;
                const open = openId === s.id;
                return (
                  <div key={s.id} className="overflow-hidden rounded-2xl border border-border-light bg-surface">
                    <button onClick={() => setOpenId(open ? null : s.id)} className="flex w-full items-center gap-3 p-3 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-text-main">{s.title || fmtDate(s.date)}</p>
                        <p className="text-[11px] text-text-muted">{fmtDate(s.date)}</p>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-base">
                          <div className={`h-full rounded-full ${pct >= 50 ? 'bg-emerald-500' : pct >= 25 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-text-main">{s.present}<span className="text-xs font-semibold text-text-muted">/{s.total}</span></p>
                        <ChevronDown className={`ml-auto h-4 w-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {open && (
                      <div className="border-t border-border-light px-3 py-2.5">
                        {s.names.length === 0 ? (
                          <p className="text-xs text-text-muted">No one from our group marked present.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {s.names.map((n, i) => (
                              <span key={i} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{n}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'devotees' && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-border-light bg-surface">
              {data.byDevotee.map((d, i) => (
                <div key={d.id} className="flex items-center gap-3 border-b border-border-light/60 px-3 py-2.5 last:border-0">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${i < 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-bg-base text-text-muted'}`}>
                    {i < 3 ? <Trophy className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-bold text-text-main">{d.name}</p>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-text-main">{d.attended}<span className="text-xs font-semibold text-text-muted">/{data.sessionCount}</span></p>
                    <p className="text-[10px] font-semibold text-text-muted">{data.sessionCount ? Math.round((d.attended / data.sessionCount) * 100) : 0}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-center text-[11px] text-text-muted">Read-only from the Mandal attendance sheet · only devotees under our group (Reference Karyakarta).</p>
        </>
      )}
    </div>
  );
}
