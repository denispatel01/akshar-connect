// Title-case a string: first letter of each word upper, the rest lower, so both
// "ramesh patel" and "RAMESH PATEL" become "Ramesh Patel". Whitespace is preserved.
export function toProperCase(s) {
  return String(s == null ? '' : s).replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// Install a single app-wide formatter that tidies text INPUTS to proper case when
// the user leaves the field (on blur). One listener instead of touching dozens of
// inputs. It deliberately skips:
//   • non-text input types: email, password, number, tel, search, date/time, url…
//   • <textarea> entirely → covers seva notes, remarks, feed captions, email body
//   • anything with a data-nocase attribute (opt-out for a specific field)
//   • values that look like an email/handle (contain "@")
// It writes the value through React's native setter and re-fires `input`, so the
// controlled component's state updates normally. Returns an un-installer.
export function installProperCase() {
  const SKIP_TYPES = new Set([
    'email', 'password', 'number', 'tel', 'search', 'url',
    'date', 'datetime-local', 'time', 'month', 'week', 'color', 'range', 'file', 'checkbox', 'radio',
  ]);

  const onFocusOut = (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'INPUT') return;                 // textareas are left as-is
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (SKIP_TYPES.has(type)) return;
    if (el.readOnly || el.disabled) return;
    if (el.dataset && el.dataset.nocase !== undefined) return; // per-field opt-out
    const v = el.value;
    if (!v || v.includes('@')) return;                         // skip emails / handles
    if (!/[a-z]/.test(v)) return;                              // nothing to upcase
    const next = toProperCase(v);
    if (next === v) return;
    try {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      desc.set.call(el, next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (err) { /* ignore — leave the field untouched */ }
  };

  document.addEventListener('focusout', onFocusOut, true);
  return () => document.removeEventListener('focusout', onFocusOut, true);
}
