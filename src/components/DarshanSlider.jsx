import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

const BASE = import.meta.env.BASE_URL;
// Prabodh Swamiji darshan / vichar wallpapers (public/images/gallery)
const FILES = [
  '9.jpg', '13.jpg', '14.jpg', '16.jpg', '18.jpg', '22.jpg', '23.jpg', '24.jpg', '27.jpg',
  '10.webp', '11.webp', '12.webp', '15.webp', '17.webp', '19.webp', '20.webp', '21.webp', '25.webp', '26.webp', '8.webp',
];
const IMAGES = FILES.map((f) => `${BASE}images/gallery/${f}`);

export default function DarshanSlider() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = IMAGES.length;
  const startX = useRef(null);
  const go = (d) => setI((p) => (p + d + n) % n);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((p) => (p + 1) % n), 4500);
    return () => clearInterval(t);
  }, [paused, n]);

  return (
    <div className="rounded-3xl border border-[#E0EAF4] bg-white p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-base font-bold text-[#003158] flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#FF862A]" /> Darshan &amp; Vichar
        </h2>
        <span className="text-[11px] font-semibold text-[#9BB5CB]">{i + 1} / {n}</span>
      </div>

      <div
        className="group relative overflow-hidden rounded-2xl bg-[#001a33] aspect-[16/10] sm:aspect-[16/8]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={(e) => { startX.current = e.touches[0].clientX; setPaused(true); }}
        onTouchEnd={(e) => {
          if (startX.current == null) return;
          const dx = e.changedTouches[0].clientX - startX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          startX.current = null; setPaused(false);
        }}
      >
        {IMAGES.map((src, idx) => (
          <img
            key={idx}
            src={src}
            alt="Prabodh Swamiji darshan"
            loading={idx <= 1 ? 'eager' : 'lazy'}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out ${idx === i ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}

        {/* arrows */}
        <button onClick={() => go(-1)} aria-label="Previous"
          className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/55 opacity-0 group-hover:opacity-100 transition">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button onClick={() => go(1)} aria-label="Next"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/55 opacity-0 group-hover:opacity-100 transition">
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* dots */}
        <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {IMAGES.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)} aria-label={`Go to ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
