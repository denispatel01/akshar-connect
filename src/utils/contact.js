// Shared phone/WhatsApp link helpers — one source of truth (previously this logic
// was re-implemented inline in DevoteesPage, FollowupsPage and NotificationsPopup).
// The common rule across the app: strip non-digits, and prefix the Indian country
// code 91 when a bare 10-digit number is given.

export function normMobile(m) {
  return String(m == null ? '' : m).replace(/\D/g, '');
}

// E.164-ish number for links: prefix 91 for a 10-digit Indian mobile, else use the
// digits as-is (already carries a country code). Returns '' when unusable.
export function intlMobile(m) {
  const d = normMobile(m);
  if (!d) return '';
  return d.length === 10 ? '91' + d : d;
}

// tel: href, or '' when there's no usable number.
export function telHref(m) {
  const d = normMobile(m);
  return d ? `tel:${d.length === 10 ? '+91' + d : (d.length > 10 ? '+' + d : d)}` : '';
}

// wa.me href with an optional pre-filled message, or '' when there's no number.
export function waHref(m, text) {
  const num = intlMobile(m);
  if (!num) return '';
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
