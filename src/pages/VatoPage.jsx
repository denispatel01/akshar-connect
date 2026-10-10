import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Share2, Sparkles, CalendarDays, Shuffle, BookOpen } from 'lucide-react';

import { dataService } from '../services/dataService';

// Deterministic "day of year" so the Vato-of-the-day matches the 6 AM push.
const dayOfYear = () => {
  const n = new Date();
  const s = new Date(n.getFullYear(), 0, 0);
  return Math.floor((n - s) / 86400000);
};

// Split a cell into its main teaching text and a trailing reference line like
// "ભગવાનનો મહિમા (37.1) / (૧/૧)" so we can show the reference as a chip.
function splitRef(text) {
  const raw = String(text || '').trim();
  if (!raw) return { body: '', ref: '' };
  const lines = raw.split('\n').map((l) => l.trimEnd());
  // find last non-empty line
  let i = lines.length - 1;
  while (i >= 0 && !lines[i].trim()) i--;
  if (i >= 0 && /\([\d.૦-૯/]+\)/.test(lines[i]) && lines[i].trim().length <= 60) {
    const ref = lines[i].trim();
    const body = lines.slice(0, i).join('\n').trim();
    return { body: body || raw, ref };
  }
  return { body: raw, ref: '' };
}

export default function VatoPage({ user }) {
  const [list, setList] = useState(() => dataService.getCachedVato());
  const [idx, setIdx] = useState(0);
  const [lang, setLang] = useState('both'); // both | gu | en
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    dataService.getVato().then((v) => {
      if (!alive) return;
      const clean = (v || []).filter((r) => String(r.Gujarati || '').trim() || String(r.English || '').trim());
      setList(clean);
      setIdx(clean.length ? dayOfYear() % clean.length : 0);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // When cache arrives first, still set today's index.
  useEffect(() => {
    if (list.length) setIdx((i) => (i === 0 ? dayOfYear() % list.length : i));
    // eslint-disable-next-line
  }, [list.length]);

  const todayIdx = list.length ? dayOfYear() % list.length : 0;
  const item = list[idx] || {};
  const gu = useMemo(() => splitRef(item.Gujarati), [item.Gujarati]);
  const en = useMemo(() => splitRef(item.English), [item.English]);
  const isToday = idx === todayIdx;

  const go = (d) => setList((l) => { setIdx((i) => (l.length ? (i + d + l.length) % l.length : 0)); return l; });
  const random = () => { if (list.length > 1) { let r = idx; while (r === idx) r = Math.floor(Math.random() * list.length); setIdx(r); } };

  const shareText = [gu.body, gu.ref, '', en.body, en.ref, '', '— Akshar Connect'].filter((x) => x !== undefined).join('\n').trim();
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Vato · Akshar Connect', text: shareText }); return; }
    } catch (e) { /* fall through */ }
    try { window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener'); } catch (e) {}
  };

  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow-md shadow-primary/30">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-text-main leading-tight">Vato · વાતો</h1>
            <p className="text-xs text-text-muted">Daily teachings to read & reflect</p>
          </div>
        </div>
        {/* Language toggle */}
        <div className="flex rounded-full border border-border-light bg-bg-base p-0.5 text-[11px] font-bold">
          {[['both', 'ગુ+EN'], ['gu', 'ગુજ'], ['en', 'EN']].map(([k, label]) => (
            <button key={k} onClick={() => setLang(k)}
              className={`rounded-full px-2.5 py-1 transition-colors ${lang === k ? 'bg-primary text-white' : 'text-text-muted'}`}>{label}</button>
          ))}
        </div>
      </div>

      {loading && list.length === 0 && (
        <div className="mt-5 animate-pulse rounded-3xl border border-border-light bg-surface p-8">
          <div className="h-4 w-24 rounded bg-bg-base" />
          <div className="mt-4 space-y-2"><div className="h-4 w-full rounded bg-bg-base" /><div className="h-4 w-5/6 rounded bg-bg-base" /><div className="h-4 w-4/6 rounded bg-bg-base" /></div>
        </div>
      )}

      {!loading && list.length === 0 && (
        <div className="mt-6 rounded-3xl border border-dashed border-border-light bg-surface p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-2 text-sm font-semibold text-text-main">No Vato yet</p>
          <p className="text-xs text-text-muted">Add rows to the “Vato” sheet (SN · Gujarati · English) and they’ll appear here.</p>
        </div>
      )}

      {list.length > 0 && (
        <>
          {/* The card */}
          <div className="relative mt-5 overflow-hidden rounded-[28px] border border-[#F0C9A0]/60 bg-gradient-to-br from-[#FFF7EF] to-[#FFEBD7] shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/20">
            {/* glow */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#FF862A]/20 blur-3xl" />
            <div className="relative p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[11px] font-bold text-[#B45309] shadow-sm dark:bg-black/30 dark:text-amber-300">
                  <CalendarDays className="h-3.5 w-3.5" /> {isToday ? `Today · ${dateLabel}` : `Vato #${item.SN || idx + 1}`}
                </span>
                <span className="text-[11px] font-bold text-[#B45309]/70 dark:text-amber-300/70">{idx + 1} / {list.length}</span>
              </div>

              {/* Gujarati */}
              {(lang === 'both' || lang === 'gu') && gu.body && (
                <div className="mt-4">
                  <p className="whitespace-pre-line text-[17px] leading-[1.85] font-semibold text-[#3A2A1A] dark:text-amber-50" style={{ fontFamily: '"Noto Sans Gujarati","Shruti","Gujarati Sangam MN",sans-serif' }}>
                    {gu.body}
                  </p>
                  {gu.ref && <span className="mt-2 inline-block rounded-lg bg-white/60 px-2.5 py-1 text-[12px] font-bold text-[#92400E] dark:bg-black/30 dark:text-amber-300">{gu.ref}</span>}
                </div>
              )}

              {/* Divider */}
              {lang === 'both' && gu.body && en.body && (
                <div className="my-5 flex items-center gap-2">
                  <span className="h-px flex-1 bg-[#E0B384]/50" />
                  <Sparkles className="h-3.5 w-3.5 text-[#E07C24]" />
                  <span className="h-px flex-1 bg-[#E0B384]/50" />
                </div>
              )}

              {/* English */}
              {(lang === 'both' || lang === 'en') && en.body && (
                <div className={lang === 'en' ? 'mt-4' : ''}>
                  <p className="whitespace-pre-line text-[15px] leading-[1.75] text-[#5B4636] dark:text-amber-100/90">{en.body}</p>
                  {en.ref && <span className="mt-2 inline-block rounded-lg bg-white/60 px-2.5 py-1 text-[11px] font-bold text-[#92400E] dark:bg-black/30 dark:text-amber-300">{en.ref}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <button onClick={() => go(-1)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-light bg-surface text-text-main hover:border-primary active:scale-95">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              {!isToday && (
                <button onClick={() => setIdx(todayIdx)} className="rounded-2xl border border-border-light bg-surface px-3 py-2.5 text-xs font-bold text-text-main hover:border-primary">Today</button>
              )}
              <button onClick={random} title="Random" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-light bg-surface text-text-main hover:border-primary active:scale-95">
                <Shuffle className="h-4 w-4" />
              </button>
              <button onClick={share} className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/30 active:scale-95">
                <Share2 className="h-4 w-4" /> Share
              </button>
            </div>
            <button onClick={() => go(1)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-light bg-surface text-text-main hover:border-primary active:scale-95">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <p className="mt-4 text-center text-[11px] text-text-muted">🌸 A new Vato arrives every morning. Read a little, reflect a little. 🙏</p>
        </>
      )}
    </div>
  );
}
