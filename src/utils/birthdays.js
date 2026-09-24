// Birthday helpers — computed from a devotee's `dob` (YYYY-MM-DD).

// Returns { isToday, daysUntil, next: Date, turning } or null when dob is missing/invalid.
export function birthdayInfo(dob, ref = new Date()) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const m = d.getMonth(), day = d.getDate();
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  let next = new Date(today.getFullYear(), m, day);
  if (next < today) next = new Date(today.getFullYear() + 1, m, day);
  const daysUntil = Math.round((next - today) / 86400000);
  const isToday = m === ref.getMonth() && day === ref.getDate();
  return { isToday, daysUntil, next, turning: next.getFullYear() - d.getFullYear() };
}

export function isBirthdayToday(dob, ref = new Date()) {
  const i = birthdayInfo(dob, ref);
  return !!i && i.isToday;
}

// Within `days` from now (inclusive of today).
export function isBirthdayWithin(dob, days = 30, ref = new Date()) {
  const i = birthdayInfo(dob, ref);
  return !!i && (i.isToday || i.daysUntil <= days);
}

// Sorted upcoming birthdays over the next `days` (today first), each { devotee, info }.
export function upcomingBirthdays(devotees, days = 30, ref = new Date()) {
  return devotees
    .map((d) => ({ devotee: d, info: birthdayInfo(d.dob, ref) }))
    .filter((x) => x.info && x.info.daysUntil <= days)
    .sort((a, b) => a.info.daysUntil - b.info.daysUntil);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function birthdayLabel(info) {
  if (!info) return '';
  if (info.isToday) return 'Today 🎂';
  if (info.daysUntil === 1) return 'Tomorrow';
  return `in ${info.daysUntil} days`;
}
export function birthdayDate(info) {
  if (!info) return '';
  return `${info.next.getDate()} ${MONTHS[info.next.getMonth()]}`;
}
