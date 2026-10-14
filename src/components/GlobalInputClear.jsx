import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// App-wide "clear" (✕) button for text fields.
//
// Instead of editing every single <input> across the app, this mounts ONCE and
// floats a small clear button at the right edge of whichever eligible text field
// is currently focused and non-empty. Tapping it empties the field (dispatching a
// real `input` event so React's controlled state updates) and keeps the keyboard
// open. Fields that already have their own clear/action button beside them (the
// Ghari pickers, the search boxes, +/- steppers, PIN boxes…) are skipped, so a
// field never ends up with two ✕ icons on top of each other.
// ─────────────────────────────────────────────────────────────────────────────

const EXCLUDE_TYPES = new Set([
  'password', 'checkbox', 'radio', 'hidden', 'range', 'color', 'file',
  'submit', 'button', 'reset', 'date', 'time', 'datetime-local', 'month', 'week',
]);

function eligible(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
  if (el.disabled || el.readOnly) return false;
  if (el.dataset && el.dataset.noClear === 'true') return false;
  if (tag === 'INPUT') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (EXCLUDE_TYPES.has(t)) return false;
    if (el.maxLength === 1) return false; // OTP / PIN digit boxes
  }
  // Skip fields that already carry their own trailing button (clear, stepper…).
  const wrap = el.parentElement;
  if (wrap && Array.from(wrap.children).some((c) => c !== el && c.tagName === 'BUTTON')) return false;
  if (el.getBoundingClientRect().width < 70) return false;
  return true;
}

function clearValue(el) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, ''); else el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function GlobalInputClear() {
  const [el, setEl] = useState(null);
  const [rect, setRect] = useState(null);
  const [hasValue, setHasValue] = useState(false);
  const elRef = useRef(null);
  elRef.current = el;

  useEffect(() => {
    const measure = () => {
      const e = elRef.current;
      if (!e || !document.contains(e)) { setEl(null); return; }
      setRect(e.getBoundingClientRect());
      setHasValue(!!e.value);
    };
    const onFocusIn = (ev) => {
      const t = ev.target;
      if (eligible(t)) { setEl(t); requestAnimationFrame(measure); }
      else setEl(null);
    };
    // When focus leaves, re-check what (if anything) is now focused after the
    // browser settles — so clicking our button (which keeps focus) never hides it.
    const onFocusOut = () => setTimeout(() => {
      const a = document.activeElement;
      if (a && eligible(a)) { setEl(a); measure(); } else setEl(null);
    }, 0);
    const onInput = () => measure();
    const onScroll = () => measure();
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('input', onInput, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('input', onInput, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useEffect(() => {
    if (!el) { setRect(null); return; }
    setRect(el.getBoundingClientRect());
    setHasValue(!!el.value);
  }, [el]);

  if (!el || !rect || !hasValue) return null;
  const isArea = el.tagName === 'TEXTAREA';
  const size = 22;
  const top = isArea ? rect.top + 8 : rect.top + (rect.height - size) / 2;
  const left = rect.right - size - 8;

  return createPortal(
    <button type="button" aria-label="Clear field"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => { const e = elRef.current; if (e) { clearValue(e); e.focus(); setHasValue(false); } }}
      style={{ position: 'fixed', top, left, width: size, height: size, zIndex: 2147483000 }}
      className="flex items-center justify-center rounded-full bg-text-muted/25 text-text-muted shadow-sm backdrop-blur-sm transition-colors hover:bg-text-muted/40 hover:text-text-main">
      <X style={{ width: 14, height: 14 }} />
    </button>,
    document.body
  );
}
