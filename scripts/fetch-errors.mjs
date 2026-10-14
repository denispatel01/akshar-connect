#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Pull the app's runtime exception log from the Google Apps Script backend into
// the codebase, so errors real users hit can be read and fixed here directly
// (they are still emailed too — this is an additional channel, not a replacement).
//
//   npm run errors              → list OPEN errors (newest first) + write logs/errors.json
//   npm run errors -- --all     → include already-resolved errors
//   npm run errors -- --json    → print raw JSON only (no pretty summary)
//   npm run errors -- --resolve ERR-xxxx          → mark one error resolved
//   npm run errors -- --resolve all               → mark every open error resolved
//
// After you fix an error here, mark it resolved so it drops off the list.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Keep the endpoint in one place: read it straight from the app's data service.
function readApiUrl() {
  const src = fs.readFileSync(path.join(ROOT, 'src/services/dataService.js'), 'utf8');
  const m = src.match(/const\s+API_URL\s*=\s*["']([^"']+)["']/);
  if (!m) throw new Error('Could not find API_URL in src/services/dataService.js');
  return m[1];
}

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valAfter = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

async function call(params) {
  const url = readApiUrl() + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('Backend did not return JSON (is the deployment up to date?):\n' + text.slice(0, 300)); }
  if (data && data.ok === false) {
    if (String(data.error || '').startsWith('unknown action')) {
      throw new Error('The backend does not know this action yet — push & redeploy Code.gs first (clasp push + redeploy). Then re-run.');
    }
    throw new Error('Backend error: ' + data.error);
  }
  return data;
}

const line = (s = '') => process.stdout.write(s + '\n');

async function main() {
  // Resolve mode.
  const resolve = valAfter('--resolve');
  if (resolve) {
    const params = resolve === 'all' ? { action: 'resolveError', all: 'true', by: 'claude' }
                                     : { action: 'resolveError', id: resolve, by: 'claude' };
    const r = await call(params);
    line(`✓ Marked ${r?.result?.updated ?? 0} error(s) resolved.`);
    return;
  }

  const status = has('--all') ? 'all' : 'open';
  const data = await call({ action: 'getErrorLog', status, limit: '200' });
  const errors = data.errors || [];

  // Always persist a machine-readable snapshot for reference / diffing.
  const outDir = path.join(ROOT, 'logs');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'errors.json');
  fs.writeFileSync(outFile, JSON.stringify({ fetchedAt: new Date().toISOString(), ...data }, null, 2));

  if (has('--json')) { line(JSON.stringify(data, null, 2)); return; }

  line('');
  line(`🩺 Akshar Connect — exception log`);
  line(`   ${data.open ?? '?'} open · ${data.total ?? '?'} total · showing ${errors.length} (${status})`);
  line(`   saved → logs/errors.json`);
  line('');
  if (!errors.length) { line('   ✅ No errors to show. All clear.'); line(''); return; }

  for (const e of errors) {
    const when = String(e.time || '').replace('T', ' ').slice(0, 19);
    line(`────────────────────────────────────────────────────────`);
    line(`${e.status === 'resolved' ? '✅' : '🔴'} ${e.id}   ${when}`);
    line(`   who:  ${e.user || '—'}${e.mobile ? ' (' + e.mobile + ')' : ''}`);
    line(`   page: ${e.page || '—'}`);
    line(`   msg:  ${e.message || '—'}`);
    if (e.stack) line('   stack:\n' + String(e.stack).split('\n').map((l) => '     ' + l).join('\n'));
    if (e.ua) line(`   ua:   ${e.ua}`);
  }
  line(`────────────────────────────────────────────────────────`);
  line('');
  line('Fix an error, then: npm run errors -- --resolve <ERR-id>  (or --resolve all)');
  line('');
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
