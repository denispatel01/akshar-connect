import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// A floating helper that appears ONLY while you're actively scrolling:
//  • scrolling DOWN → a down arrow that jumps to the bottom of the page
//  • scrolling UP   → an up arrow that jumps to the top
// It auto-hides shortly after you stop, and never shows when the page is too short
// to scroll, when you're already at the top (up) or bottom (down).
export default function ScrollHelper() {
  const [dir, setDir] = useState(null); // 'down' | 'up' | null
  const lastY = useRef(0);
  const hideTimer = useRef(null);

  useEffect(() => {
    lastY.current = window.scrollY || 0;
    const onScroll = () => {
      const y = window.scrollY || 0;
      const doc = document.documentElement;
      const maxY = (doc.scrollHeight || 0) - window.innerHeight;
      const delta = y - lastY.current;
      lastY.current = y;

      // Not enough page to scroll → never show.
      if (maxY < 240) { setDir(null); return; }

      if (Math.abs(delta) < 4) return; // ignore tiny jitter
      if (delta > 0) {
        // Scrolling down — offer "to bottom" unless already there.
        setDir(y >= maxY - 8 ? null : 'down');
      } else {
        // Scrolling up — offer "to top" unless already there.
        setDir(y <= 8 ? null : 'up');
      }

      // Auto-hide after a short idle.
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setDir(null), 1600);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  // Jump in the given direction. Take the direction as an argument (not from state)
  // so this still does the right thing when fired from pointerdown.
  const go = (d) => {
    const to = d === 'down' ? (document.documentElement.scrollHeight || 0) : 0;
    try { window.scrollTo({ top: to, behavior: 'smooth' }); } catch { window.scrollTo(0, to); }
    setDir(null);
  };

  if (!dir) return null;
  const Icon = dir === 'down' ? ChevronDown : ChevronUp;
  // Act on pointerdown, not click: while the page still has momentum, the first
  // touch is consumed to stop the scroll and the click never fires — so we'd need a
  // second tap. Firing on pointerdown makes that first touch both stop the scroll
  // AND jump, so a single tap works. preventDefault suppresses the stray click.
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); go(dir); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(dir); } }}
      aria-label={dir === 'down' ? 'Scroll to bottom' : 'Scroll to top'}
      // Sits above the mobile bottom bar; tucks to the corner on desktop (no bar).
      className="fixed right-4 z-40 grid h-11 w-11 place-items-center rounded-full border border-border-light bg-surface/95 text-text-main shadow-lg backdrop-blur transition-all hover:border-primary hover:text-primary active:scale-95 animate-fade-in bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-6"
      style={{ touchAction: 'manipulation' }}>
      <Icon className="h-5 w-5" strokeWidth={2.5} />
    </button>
  );
}
