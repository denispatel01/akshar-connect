// Builds a ready-to-send WhatsApp invite asking a devotee to log in and complete
// their own profile — with the app link, the exact login steps, and the list of
// fields still missing from their record.

const APP_URL = 'https://denispatel01.github.io/akshar-connect/';

// Fields a devotee can fill in themselves; used to tell them what's still pending.
const CHECKS = [
  ['First name', (d) => d.firstName || d.name],
  ['Last name', (d) => d.lastName],
  ['Date of birth', (d) => d.dob],
  ['Gender', (d) => d.gender],
  ['Mobile number', (d) => d.mobile],
  ['Email', (d) => d.email],
  ['Address', (d) => d.address],
  ['Area', (d) => d.area],
  ['Education / Profession', (d) => d.school || d.profession || d.qualification || d.education],
  ['Photo', (d) => d.photo],
];

export function missingProfileFields(d) {
  return CHECKS.filter(([, get]) => !String(get(d) || '').trim()).map(([label]) => label);
}

export function profileInviteText(d) {
  const name = (d.firstName || d.name || '').trim() || 'Jai Swaminarayan';
  const missing = missingProfileFields(d);
  const lines = [
    `Jai Swaminarayan ${name} 🙏`,
    '',
    'Please take a minute to complete your Akshar Connect profile so our Mandal records stay accurate.',
    '',
    `📲 Open the app: ${APP_URL}`,
    'Log in with:',
    '• Mobile: your 10-digit mobile number',
    '• 6-digit PIN: your date of birth as DDMMYY (e.g. 01-12-1995 → 011295)',
    '',
    missing.length
      ? 'Still to add / check in your profile:'
      : 'Your profile looks complete — thank you! 🙏',
    ...missing.map((m) => `• ${m}`),
    '',
    'Jai Swaminarayan 🙏',
  ];
  return lines.filter((x) => x !== undefined).join('\n');
}

// wa.me link to the devotee's own WhatsApp/mobile with the invite pre-filled.
// Returns null when there's no usable number.
export function profileInviteLink(d) {
  const mob = String(d.whatsapp || d.mobile || '').replace(/\D/g, '');
  if (mob.length < 10) return null;
  const num = mob.length === 10 ? '91' + mob : mob;
  return `https://wa.me/${num}?text=${encodeURIComponent(profileInviteText(d))}`;
}
