import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, User, MapPin, Phone } from 'lucide-react';
import { dataService } from '../services/dataService';

const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);

// App-wide quick search for devotees / karyakartas. Opens a profile on tap.
export default function GlobalSearch({ open, onClose, onOpenDevotee, user }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const isDevotee = user?.role === 'Devotee';

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const digits = s.replace(/\D/g, '');
    const devs = dataService.getDevotees() || [];
    return devs.filter((d) => {
      const name = String(d.name || '').toLowerCase();
      return name.includes(s)
        || (digits && last10(d.mobile).includes(digits))
        || String(d.area || '').toLowerCase().includes(s)
        || String(d.familyId || '').toLowerCase().includes(s)
        || String(d.followupKaryakarta || '').toLowerCase().includes(s);
    }).slice(0, 25);
  }, [q]);

  if (!open) return null;

  // Hide female mobiles from devotee-role viewers (privacy rule).
  const showMobile = (d) => !(isDevotee && d.gender === 'Female');

  return createPortal(
    <div className="fixed inset-0 z-[130] flex flex-col bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto mt-0 flex w-full max-w-xl flex-col overflow-hidden bg-surface shadow-2xl sm:mt-16 sm:rounded-3xl" style={{ maxHeight: '100vh' }} onClick={(e) => e.stopPropagation()}>
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-border-light px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <Search className="h-5 w-5 shrink-0 text-text-muted" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search devotees, karyakartas, area, family…"
            className="w-full bg-transparent text-base text-text-main outline-none placeholder:text-text-muted" />
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-text-muted hover:bg-bg-base">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {!q.trim() && (
            <p className="px-5 py-10 text-center text-sm text-text-muted">Type a name, mobile, area or family ID to search.</p>
          )}
          {q.trim() && results.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-text-muted">No matches for “{q}”.</p>
          )}
          {results.map((d) => (
            <button key={d.id} onClick={() => { onOpenDevotee(d.id); onClose(); }}
              className="flex w-full items-center gap-3 border-b border-border-light/60 px-4 py-3 text-left last:border-0 hover:bg-bg-base">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {String(d.name || 'U')[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-text-main">{d.name || '—'}</p>
                <p className="flex items-center gap-2 truncate text-[11px] text-text-muted">
                  {d.area && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{d.area}</span>}
                  {showMobile(d) && last10(d.mobile) && <span className="inline-flex items-center gap-0.5"><Phone className="h-3 w-3" />{d.mobile}</span>}
                  {d.familyId && <span>· {d.familyId}</span>}
                </p>
              </div>
              <User className="h-4 w-4 shrink-0 text-text-muted" />
            </button>
          ))}
          {results.length >= 25 && <p className="px-5 py-3 text-center text-[11px] text-text-muted">Showing first 25 — refine your search.</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
