import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Reusable vertical timeline — a single connector line with a coloured dot per
// entry. Each entry is COLLAPSED by default (shows only its title + subtitle, e.g.
// a name and a date); tapping it expands to reveal the badge and body. When there
// is more than one entry a small "Expand all / Collapse all" control appears.
//
// items: [{
//   id,            // stable key
//   icon,          // optional lucide icon for the dot
//   color,         // optional dot colour (hex/css); default primary
//   title,         // main line (string or node) — shown collapsed
//   subtitle,      // secondary line (e.g. the date) — shown collapsed
//   time,          // optional right-aligned timestamp/label — shown collapsed
//   badge,         // optional small pill by the title — shown only when expanded
//   body,          // optional extra content — shown only when expanded
// }]
export default function Timeline({ items = [], className = '', collapsible = true, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded ? items.map((i) => i.id) : []));
  const toggle = (id) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => setExpanded(new Set(items.map((i) => i.id)));
  const collapseAll = () => setExpanded(new Set());

  if (!items.length) return null;
  const hasExtra = (it) => it.badge != null || (it.body != null && it.body !== '');

  return (
    <div className={className}>
      {collapsible && items.length > 1 && (
        <div className="mb-2 flex items-center justify-end gap-1.5">
          <button type="button" onClick={expandAll} className="rounded-lg border border-border-light bg-surface px-2.5 py-1 text-[11px] font-bold text-text-muted hover:border-primary hover:text-primary">Expand all</button>
          <button type="button" onClick={collapseAll} className="rounded-lg border border-border-light bg-surface px-2.5 py-1 text-[11px] font-bold text-text-muted hover:border-primary hover:text-primary">Collapse all</button>
        </div>
      )}
      <ol className="relative ml-1.5 border-l-2 border-border-light">
        {items.map((it) => {
          const Icon = it.icon;
          const color = it.color || '#E56F18';
          const open = !collapsible || expanded.has(it.id);
          const canExpand = collapsible && hasExtra(it);
          return (
            <li key={it.id} className="relative pb-4 pl-5 last:pb-0">
              {/* Dot on the connector line */}
              <span
                className="absolute -left-[9px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-surface"
                style={{ background: Icon ? color : undefined, backgroundColor: !Icon ? color : undefined }}
              >
                {Icon && <Icon className="h-2.5 w-2.5 text-white" />}
              </span>
              <div className="overflow-hidden rounded-xl border border-border-light bg-bg-base">
                <button
                  type="button"
                  onClick={() => canExpand && toggle(it.id)}
                  className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-text-main">
                      <span className="break-words">{it.title}</span>
                      {open && it.badge != null && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">{it.badge}</span>
                      )}
                    </div>
                    {it.subtitle != null && it.subtitle !== '' && (
                      <p className="mt-0.5 text-[11px] font-semibold text-text-muted">{it.subtitle}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {it.time != null && it.time !== '' && (
                      <span className="text-[10px] font-semibold text-text-muted">{it.time}</span>
                    )}
                    {canExpand && <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />}
                  </div>
                </button>
                {open && it.body != null && it.body !== '' && (
                  <div className="px-3 pb-2 text-[11px] text-text-main/90">{it.body}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
