import React from 'react';

// Reusable vertical timeline — a single connector line with a coloured dot per
// entry, used across the app (devotee Seva history, Activity log, and anywhere a
// chronological list reads better as a timeline). Purely presentational: the
// caller supplies already-ordered items.
//
// items: [{
//   id,                      // stable key
//   icon,                    // optional lucide icon component for the dot
//   color,                   // optional dot colour (hex or css colour); default primary
//   title,                   // string or node — the main line
//   subtitle,                // optional secondary line (string or node)
//   time,                    // optional right-aligned timestamp/label
//   body,                    // optional extra content below (string or node)
//   badge,                   // optional small pill (string or node) shown by the title
// }]
export default function Timeline({ items = [], className = '' }) {
  if (!items.length) return null;
  return (
    <ol className={`relative ml-1.5 border-l-2 border-border-light ${className}`}>
      {items.map((it) => {
        const Icon = it.icon;
        const color = it.color || '#E56F18';
        return (
          <li key={it.id} className="relative pb-4 pl-5 last:pb-0">
            {/* Dot on the connector line */}
            <span
              className="absolute -left-[9px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-surface"
              style={{ background: Icon ? color : undefined, backgroundColor: !Icon ? color : undefined }}
            >
              {Icon && <Icon className="h-2.5 w-2.5 text-white" />}
            </span>
            <div className="rounded-xl border border-border-light bg-bg-base px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-text-main">
                    <span className="break-words">{it.title}</span>
                    {it.badge != null && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">{it.badge}</span>
                    )}
                  </div>
                  {it.subtitle != null && it.subtitle !== '' && (
                    <p className="mt-0.5 text-[11px] font-semibold text-text-muted">{it.subtitle}</p>
                  )}
                </div>
                {it.time != null && it.time !== '' && (
                  <span className="shrink-0 text-[10px] font-semibold text-text-muted">{it.time}</span>
                )}
              </div>
              {it.body != null && it.body !== '' && (
                <div className="mt-0.5 text-[11px] text-text-main/90">{it.body}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
