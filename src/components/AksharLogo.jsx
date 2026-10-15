import React from 'react';

// Akshar Connect logo — a bespoke inline-SVG lockup (crisp at any size, theme
// aware). The emblem is a hamsa (swan) resting on a lotus beneath a diya flame —
// evoking "હું તો નિમિત્ત માત્ર છું" (I am merely an instrument). Pass `dark` for
// a light background (navy wordmark); default colours suit a navy header.

export function AksharEmblem({ size = 48, className = '' }) {
  const uid = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={`ring-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB463" /><stop offset=".5" stopColor="#F0862A" /><stop offset="1" stopColor="#E4571B" />
        </linearGradient>
        <linearGradient id={`swan-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F6943A" /><stop offset="1" stopColor="#E25817" />
        </linearGradient>
        <linearGradient id={`lotus-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0E7490" /><stop offset="1" stopColor="#083E57" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="57" fill={`url(#ring-${uid})`} />
      <circle cx="60" cy="60" r="48" fill="#FFF7EE" />
      {/* diya flame */}
      <path d="M60 17 C63.5 24 68 27 60 35 C52 27 56.5 24 60 17 Z" fill={`url(#swan-${uid})`} />
      {/* hamsa (swan) with a long, graceful S-neck */}
      <g transform="translate(22,28) scale(.74)">
        <path d="M16 70 C12 54 24 44 42 45 C56 46 61 52 60 60 C58 46 55 30 64 21 C69 16 66 9 73 8 C79 7 83 12 80 17 L87 18 C83 23 78 24 73 22 C70 31 69 43 65 53 C60 65 48 76 33 75 C25 74.5 18 73 16 70 Z" fill={`url(#swan-${uid})`} />
        <path d="M26 64 C35 50 52 48 63 55 C54 64 41 68 30 67 Z" fill="#FFF7EE" opacity=".92" />
        <circle cx="77" cy="14" r="1.8" fill="#083E57" />
      </g>
      {/* lotus the swan rests on */}
      <g transform="translate(60,90)">
        <path d="M0 2 C6 -10 15 -10 10 3 C4 0 -4 0 -10 3 C-15 -10 -6 -10 0 2 Z" fill={`url(#lotus-${uid})`} />
        <path d="M-12 3 C-23 -6 -31 -1 -21 6 C-12 4 -3 3 1 1 C-4 -6 -9 -4 -12 3 Z" fill={`url(#lotus-${uid})`} opacity=".8" />
        <path d="M12 3 C23 -6 31 -1 21 6 C12 4 3 3 -1 1 C4 -6 9 -4 12 3 Z" fill={`url(#lotus-${uid})`} opacity=".8" />
      </g>
    </svg>
  );
}

export default function AksharLogo({ dark = false, size = 48, showTagline = true, className = '' }) {
  const aksharColor = dark ? '#0A2E52' : '#FFFFFF';
  const connectColor = dark ? '#E4571B' : '#FFC79A';
  const tagColor = dark ? '#C2541E' : '#FFC79A';
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <AksharEmblem size={size} className="shrink-0 drop-shadow-[0_3px_8px_rgba(0,0,0,0.18)]" />
      <div className="leading-none">
        <div className="font-display text-[clamp(1.4rem,6.5vw,2.1rem)] font-extrabold tracking-tight">
          <span style={{ color: aksharColor }}>Akshar</span>{' '}
          <span style={{ color: connectColor }}>Connect</span>
        </div>
        {showTagline && (
          <div className="mt-0.5 text-[11px] font-bold sm:text-[13px]"
            style={{ color: tagColor, fontFamily: '"Noto Sans Gujarati","Shruti","Gujarati Sangam MN",sans-serif' }}>
            હું તો નિમિત્ત માત્ર છું
          </div>
        )}
      </div>
    </div>
  );
}
