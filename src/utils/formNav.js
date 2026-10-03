// Enter-to-next-field navigation (#113). Attach as onKeyDown on a container that
// also carries the `data-enter-nav` attribute. Pressing Enter in a text-like input
// or a select moves focus to the next visible, enabled field instead of doing
// nothing (or submitting). Textareas are left alone so Enter still inserts newlines.
export function focusNextOnEnter(e) {
  if (e.key !== 'Enter' || e.shiftKey) return;
  const el = e.target;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'textarea') return;                 // keep newlines in multi-line fields
  if (tag !== 'input' && tag !== 'select') return;
  const type = (el.type || '').toLowerCase();
  if (type === 'submit' || type === 'button' || type === 'checkbox' || type === 'radio') return;

  const scope = el.closest('[data-enter-nav]') || el.form || document;
  const fields = Array.from(scope.querySelectorAll('input, select, textarea'))
    .filter((n) => !n.disabled && n.type !== 'hidden' && n.tabIndex !== -1 && n.offsetParent !== null);

  const i = fields.indexOf(el);
  if (i === -1) return;
  e.preventDefault();                             // don't submit / don't insert a newline
  const next = fields[i + 1];
  if (next) {
    next.focus();
    try { if (typeof next.select === 'function') next.select(); } catch { /* not selectable */ }
  } else {
    el.blur();
  }
}
