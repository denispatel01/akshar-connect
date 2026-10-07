import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Shared multi-select dropdown (checkbox list) with Select all / Clear.
// `options` is an array of strings or { value, label }. `selected` is value[].
export default function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const text = selected.length === 0
    ? label
    : selected.length === 1
      ? (opts.find((o) => o.value === selected[0])?.label || selected[0])
      : `${label} (${selected.length})`;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-1 rounded-xl border px-3 py-2 text-xs font-semibold outline-none ${selected.length ? 'border-primary bg-primary/5 text-text-main' : 'border-border-light bg-bg-base text-text-muted'}`}>
        <span className="truncate">{text}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full min-w-[11rem] max-h-72 overflow-y-auto rounded-xl border border-border-light bg-surface shadow-xl p-1">
            <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border-light mb-1 sticky top-0 bg-surface">
              <button type="button" onClick={() => onChange(opts.map((o) => o.value))} className="text-[11px] font-bold text-primary hover:underline">Select all</button>
              {selected.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="text-[11px] font-bold text-red-500 hover:underline">Clear</button>
              )}
            </div>
            {opts.map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-text-main hover:bg-bg-base rounded-lg cursor-pointer">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="rounded text-primary focus:ring-primary" />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
