import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// A small floating up/down control for long pages. Both arrows are always present
// and tappable whenever the page can scroll (no "appears only while scrolling"
// timing), so a SINGLE tap jumps — the up arrow to the top, the down arrow to the
// bottom. Each arrow hides on its own when you're already at that end.
export default function ScrollHelper() {
  const [st, setSt] = useState({ show: false, atTop: true, atBottom: false });

  useEffect(() => {
    const update = () => {
      const y = window.scrollY || 0;
      const maxY = (document.documentElement.scrollHeight || 0) - window.innerHeight;
      setSt({
        show: maxY >= 240,            // only when there's a meaningful amount to scroll
        atTop: y <= 8,
        atBottom: y >= maxY - 8,
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Content height can change after data loads; re-measure for a short while.
    const t = setInterval(update, 1000);
    const stop = setTimeout(() => clearInterval(t), 6000);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      clearInterval(t); clearTimeout(stop);
    };
  }, []);

  const scrollTo = (top) => { try { window.scrollTo({ top, behavior: 'smooth' }); } catch { window.scrollTo(0, top); } };

  if (!st.show || (st.atTop && st.atBottom)) return null;

  const btn = 'grid h-11 w-11 place-items-center text-text-main transition-colors hover:text-primary active:scale-95 disabled:opacity-25 disabled:pointer-events-none';
  return (
    <div className="fixed right-4 z-40 flex flex-col overflow-hidden rounded-full border border-border-light bg-surface/95 shadow-lg backdrop-blur animate-fade-in bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-6">
      <button onClick={() => scrollTo(0)} disabled={st.atTop} aria-label="Scroll to top" className={btn}>
        <ChevronUp className="h-5 w-5" strokeWidth={2.5} />
      </button>
      <div className="mx-2 h-px bg-border-light" />
      <button onClick={() => scrollTo(document.documentElement.scrollHeight || 0)} disabled={st.atBottom} aria-label="Scroll to bottom" className={btn}>
        <ChevronDown className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
