#!/usr/bin/env node
// ============================================================================
// Akshar Connect — one-time Sheet → Supabase (Postgres) migration + validation
// ============================================================================
// Reads EVERY tab from the LIVE Google Sheet (read-only, via the existing
// Apps Script web app) and loads it into the NEW Supabase project, then
// validates: row counts per table + Ghari money reconciliation (to the paisa) +
// duplicate-PK detection + a sample field-by-field diff.
//
//   • It NEVER writes to the Sheet or the live Apps Script — read-only there.
//   • It reads each tab's raw grid via the existing generic `ghariRawDump`
//     action (it dumps ANY tab given a name — no Code.gs change / redeploy).
//   • Column mapping + typing mirror docs/supabase/schema.sql exactly.
//   • Ghari amounts are recomputed from `items` with the SAME math as
//     ghariService.js computeTotals() and reconciled against stored totals.
//
// Usage:
//   node migrate.mjs --dry-run      # read + map + validate the Sheet only,
//                                    # NO writes to Supabase (safe anywhere)
//   node migrate.mjs                 # full load into Supabase + full validation
//   node migrate.mjs --tab GhariOrders   # one tab only
//   node migrate.mjs --fresh         # truncate target tables before load
//
// Env (put in docs/supabase/.env or export):
//   SOURCE_API_URL              the LIVE Apps Script /exec URL (read-only source)
//   SUPABASE_URL                https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   service-role key (NEVER commit it)
//
// Requires: Node 18+ (global fetch) and `npm i @supabase/supabase-js`.
// Writes a report to ./logs/migration-report.json and .md.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';

// ── args / env ───────────────────────────────────────────────────────────────
const ARGS = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
const ONE_TAB = (process.argv.slice(2).find((a, i, arr) => arr[i - 1] === '--tab')) || '';
const DRY_RUN = ARGS.has('--dry-run');
const FRESH   = ARGS.has('--fresh');

const SOURCE_API_URL = process.env.SOURCE_API_URL || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SOURCE_API_URL) fail('SOURCE_API_URL is required (the live Apps Script /exec URL).');
if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_KEY)) {
  fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run.');
}
const sb = DRY_RUN ? null : createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function fail(msg) { console.error('\n❌ ' + msg); process.exit(1); }

// ── schema map: sheet tab → target table (mirrors schema.sql) ────────────────
// pk: the primary-key column on the TARGET table.
// composePk: (obj) => string  — build a synthetic id when the Sheet has none.
// surrogate: true — no business key; insert only (bigserial id), never upsert.
const TABLES = [
  { tab: 'Users',          table: 'users',          pk: 'mobile' },
  { tab: 'Devotees',       table: 'devotees',       pk: 'id' },
  { tab: 'Sabhas',         table: 'sabhas',         pk: 'id' },
  { tab: 'Attendance',     table: 'attendance',     pk: 'id' },
  { tab: 'Followups',      table: 'followups',      pk: 'id' },
  { tab: 'Thoughts',       table: 'thoughts',       pk: 'id' },
  { tab: 'Areas',          table: 'areas',          pk: 'name' },
  { tab: 'Activity',       table: 'activity',       pk: 'id', surrogate: true },
  { tab: 'Changes',        table: 'changes',        pk: 'id', surrogate: true },
  { tab: 'ErrorLog',       table: 'errorlog',       pk: 'id' },
  { tab: 'PushLog',        table: 'pushlog',        pk: 'id' },
  { tab: 'PushRecipients', table: 'pushrecipients', pk: 'id',
    composePk: o => `${o.notifId ?? ''}|${o.devoteeId ?? ''}` },
  { tab: 'PushTokens',     table: 'push_tokens',    pk: 'token' },
  { tab: 'Announcements',  table: 'announcements',  pk: 'id' },
  { tab: 'NotifReads',     table: 'notif_reads',    pk: 'id' },
  { tab: 'PushStatus',     table: 'push_status',    pk: 'key' },
  { tab: 'GhariProducts',  table: 'ghari_products', pk: 'sku' },
  { tab: 'GhariOrders',    table: 'ghari_orders',   pk: 'id', ghariOrders: true },
  { tab: 'GhariPurchases', table: 'ghari_purchases', pk: 'id' },
  { tab: 'GhariStock',     table: 'ghari_stock',    pk: 'id' },
  { tab: 'GhariLog',       table: 'ghari_log',      pk: 'id' },
  { tab: 'MandalLeaders',  table: 'mandal_leaders', pk: 'id' },
  { tab: 'LeaderBoards',   table: 'leader_boards',  pk: 'id' },
  { tab: 'LeaderEntries',  table: 'leader_entries', pk: 'id' },
  { tab: 'Swadhyay',       table: 'swadhyay',       pk: 'key' },
  { tab: 'Seva',           table: 'seva',           pk: 'id' },
  { tab: 'CalPlan',        table: 'cal_plan',       pk: 'id' },
  { tab: 'FeedPosts',      table: 'feed_posts',     pk: 'id' },
  { tab: 'FeedLikes',      table: 'feed_likes',     pk: 'id' },
  { tab: 'FeedComments',   table: 'feed_comments',  pk: 'id' },
  { tab: 'EmailCampaigns', table: 'email_campaigns', pk: 'id' },
  { tab: 'EmailTemplates', table: 'email_templates', pk: 'id' },
  { tab: 'BusEvents',      table: 'bus_events',     pk: 'id' },
  { tab: 'BusBookings',    table: 'bus_bookings',   pk: 'id' },
  { tab: 'Vato',           table: 'vato',           pk: 'SN' },
  { tab: 'DevoteeLog',     table: 'devotee_log',    pk: 'id' },
];

// Per target-table typing (mirrors schema.sql). Keyed by the SHEET column name.
const NUMERIC = new Set(['unitPrice','total','withGheeAmt','withoutGheeAmt','sugarFreeAmt','bhusuAmt','paymentReceived','balance','amount','target','done']);
const INTEGER = new Set(['presentCount','totalCount','sentCount','clickCount','sortOrder','deliveredBoxes','boxes','bhajanMin','listenMin','readMin','recipientCount','failedCount','likeCount','commentCount','passengerCount']);
// Booleans only for these table.column pairs (BOOL_COLS from Code.gs minus the
// ErrorLog.message exception; `planned`/`clicked` stay text on purpose).
const BOOLEAN = new Set(['attendance.present','followups.call','followups.inPerson','followups.message','ghari_products.active','mandal_leaders.active','ghari_orders.delivered']);
// JSON columns under their SHEET name → jsonb. ghari_orders renames handled below.
const JSON_COLS = new Set(['itemsJson','subOrdersJson','mediaJson','companionsJson','changesJson','beforeJson','afterJson','passengersJson']);
// Status values that mean "soft-deleted" for the uniform `deleted` flag.
const DELETED_STATUSES = new Set(['void','removed']);

// ── coercion helpers ─────────────────────────────────────────────────────────
function toNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function toInt(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(String(v).replace(/[^0-9\-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}
function toBool(v) {
  if (v === true) return true;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}
function toJson(v, { required = false, fallback = null } = {}) {
  const s = (v === null || v === undefined) ? '' : String(v).trim();
  if (!s) return fallback;
  try { return JSON.parse(s); }
  catch (e) {
    if (required) throw new Error(`JSON parse failed: ${s.slice(0, 80)}`);
    return fallback;
  }
}
const isBlankCell = v => v === '' || v === null || v === undefined;

// computeTotals — byte-for-byte the same money math as ghariService.js.
function computeTotals(items) {
  const by = { ghee: 0, noghee: 0, sf: 0, bhusu: 0 };
  let total = 0, boxes = 0;
  (items || []).forEach(it => {
    const line = toNum(it.qty) * toNum(it.unitPrice);
    total += line; boxes += toNum(it.qty);
    if (by[it.category] === undefined) by[it.category] = 0;
    by[it.category] += line;
  });
  return { total, boxes, byCategory: by };
}

// ── source read: one tab's full raw grid via the generic ghariRawDump action ──
async function fetchGrid(tab) {
  const r = await fetch(SOURCE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'ghariRawDump', tab }),
    redirect: 'follow',
  });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { throw new Error(`${tab}: non-JSON response (is SOURCE_API_URL correct?)`); }
  if (!d || d.ok === false || !Array.isArray(d.rows)) throw new Error(`${tab}: ${d && d.error ? d.error : 'no rows returned'}`);
  return d.rows; // [[header...], [row...], ...]
}

// Map a raw grid to typed row objects for the target table.
function mapRows(spec, grid) {
  if (!grid.length) return { rows: [], header: [], blankSkipped: 0 };
  const header = grid[0].map(h => String(h).trim());
  const body = grid.slice(1);
  const rows = [];
  let blankSkipped = 0;

  for (const raw of body) {
    // Skip fully-blank rows (matches readAll_'s blank-row skip).
    if (raw.every(isBlankCell)) { blankSkipped++; continue; }

    const o = {};
    for (let c = 0; c < header.length; c++) {
      const col = header[c];
      if (!col) continue;
      let v = raw[c];

      // ghari_orders renames: itemsJson → items, subOrdersJson → subOrders.
      let targetCol = col;
      if (spec.ghariOrders && col === 'itemsJson')     targetCol = 'items';
      if (spec.ghariOrders && col === 'subOrdersJson') targetCol = 'subOrders';

      if (JSON_COLS.has(col)) {
        const required = spec.ghariOrders && col === 'itemsJson'; // money: must parse
        o[targetCol] = toJson(v, { required, fallback: (col === 'changesJson' || col === 'beforeJson' || col === 'afterJson') ? null : [] });
      } else if (NUMERIC.has(col)) {
        o[targetCol] = toNum(v);
      } else if (INTEGER.has(col)) {
        o[targetCol] = toInt(v);
      } else if (BOOLEAN.has(`${spec.table}.${col}`)) {
        o[targetCol] = toBool(v);
      } else {
        o[targetCol] = isBlankCell(v) ? '' : (v instanceof Object ? String(v) : v);
      }
    }

    // Synthetic PK where the Sheet has none.
    if (spec.composePk) o[spec.pk] = spec.composePk(o);

    // Uniform soft-delete flag from the domain status.
    o.deleted = DELETED_STATUSES.has(String(o.status || '').toLowerCase());

    // Surrogate-id tables: drop any id so bigserial assigns one.
    if (spec.surrogate) delete o.id;

    rows.push(o);
  }
  return { rows, header, blankSkipped };
}

// ── load into Supabase ────────────────────────────────────────────────────────
async function loadTable(spec, rows) {
  if (DRY_RUN) return { inserted: 0, skipped: rows.length };
  if (FRESH) {
    // Soft truncate: for surrogate logs a hard delete is fine; for keyed tables we
    // also clear so the one-time load is clean. (This is the NEW project only.)
    const { error } = await sb.from(spec.table).delete().neq(spec.pk, '__none__');
    if (error && !spec.surrogate) console.warn(`  (fresh) could not clear ${spec.table}: ${error.message}`);
  }
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    let error;
    if (spec.surrogate) {
      ({ error } = await sb.from(spec.table).insert(chunk));
    } else {
      ({ error } = await sb.from(spec.table).upsert(chunk, { onConflict: spec.pk }));
    }
    if (error) throw new Error(`load ${spec.table}: ${error.message}`);
    inserted += chunk.length;
  }
  return { inserted, skipped: 0 };
}

// ── validation ────────────────────────────────────────────────────────────────
async function pgCount(table) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

// Ghari money reconciliation (orders): recompute totals from items (source of
// truth) and compare against the stored flat columns AND against Postgres.
async function reconcileGhari(orderRows) {
  const sum = (arr, f) => arr.reduce((s, r) => s + f(r), 0);
  const active = orderRows.filter(o => String(o.status || 'active').toLowerCase() !== 'void');

  const recomputedTotal = round2(sum(active, o => computeTotals(o.items).total));
  const storedTotal     = round2(sum(active, o => toNum(o.total)));
  const storedPaid      = round2(sum(active, o => toNum(o.paymentReceived)));
  const storedBalance   = round2(sum(active, o => toNum(o.balance)));

  // Per-order mismatches (stored total vs items) — surface each, never "fix".
  const mismatches = [];
  for (const o of active) {
    const ct = round2(computeTotals(o.items).total);
    if (Math.abs(ct - round2(toNum(o.total))) > 0.01) {
      mismatches.push({ id: o.id, orderNo: o.orderNo, storedTotal: round2(toNum(o.total)), itemsTotal: ct });
    }
  }

  let pgTotal = null, pgPaid = null;
  if (!DRY_RUN) {
    const { data, error } = await sb.from('ghari_orders').select('total,paymentReceived,status,deleted');
    if (error) throw new Error(`pg ghari read: ${error.message}`);
    const pgActive = (data || []).filter(r => String(r.status || 'active').toLowerCase() !== 'void');
    pgTotal = round2(sum(pgActive, r => toNum(r.total)));
    pgPaid  = round2(sum(pgActive, r => toNum(r.paymentReceived)));
  }

  return {
    activeOrders: active.length,
    recomputedTotal, storedTotal, storedPaid, storedBalance,
    pgTotal, pgPaid,
    storedVsItemsMatched: Math.abs(recomputedTotal - storedTotal) <= 0.01,
    pgVsSheetMatched: DRY_RUN ? null : Math.abs((pgTotal ?? -1) - storedTotal) <= 0.01,
    perOrderMismatches: mismatches,
  };
}
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

// Duplicate-PK detection on the mapped rows (skip surrogate tables).
function findDupPks(spec, rows) {
  if (spec.surrogate) return [];
  const seen = new Map();
  const dups = [];
  for (const r of rows) {
    const k = String(r[spec.pk] ?? '');
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  for (const [k, n] of seen) if (n > 1 && k !== '') dups.push({ pk: k, count: n });
  return dups;
}

// Sample field-by-field diff: N rows re-read from Postgres vs the mapped source.
async function sampleDiff(spec, rows, n = 5) {
  if (DRY_RUN || spec.surrogate || !rows.length) return { checked: 0, diffs: [] };
  const sample = rows.slice(0, n);
  const keys = sample.map(r => r[spec.pk]);
  const { data, error } = await sb.from(spec.table).select('*').in(spec.pk, keys);
  if (error) return { checked: 0, diffs: [{ error: error.message }] };
  const byPk = new Map((data || []).map(r => [String(r[spec.pk]), r]));
  const diffs = [];
  for (const src of sample) {
    const got = byPk.get(String(src[spec.pk]));
    if (!got) { diffs.push({ pk: src[spec.pk], missing: true }); continue; }
    for (const col of Object.keys(src)) {
      if (col === 'deleted') continue;
      const a = normCmp(src[col]), b = normCmp(got[col]);
      if (a !== b) diffs.push({ pk: src[spec.pk], col, source: a, pg: b });
    }
  }
  return { checked: sample.length, diffs };
}
function normCmp(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  const specs = ONE_TAB ? TABLES.filter(t => t.tab === ONE_TAB) : TABLES;
  if (ONE_TAB && !specs.length) fail(`Unknown --tab "${ONE_TAB}".`);

  console.log(`\n🔁 Akshar Connect migration  (${DRY_RUN ? 'DRY RUN — no writes' : 'LIVE load into Supabase'}${FRESH ? ', FRESH' : ''})`);
  console.log(`   source: ${SOURCE_API_URL.slice(0, 55)}…`);
  console.log(`   tables: ${specs.length}\n`);

  const report = { startedAt: new Date().toISOString(), dryRun: DRY_RUN, tables: {}, ghari: null, ok: true, problems: [] };

  for (const spec of specs) {
    process.stdout.write(`• ${spec.tab.padEnd(16)} `);
    try {
      const grid = await fetchGrid(spec.tab);
      const { rows, blankSkipped } = mapRows(spec, grid);
      const dups = findDupPks(spec, rows);
      const { inserted } = await loadTable(spec, rows);
      const pg = DRY_RUN ? null : await pgCount(spec.table);
      const diff = await sampleDiff(spec, rows);

      const countMatch = DRY_RUN ? null : (pg === rows.length);
      const tabReport = {
        sheetRows: rows.length, blankSkipped, inserted, pgRows: pg,
        countMatch, dupPks: dups, sampleDiffs: diff.diffs,
      };
      report.tables[spec.tab] = tabReport;

      // Ghari money reconciliation.
      if (spec.ghariOrders) {
        report.ghari = await reconcileGhari(rows);
      }

      // Problems → report + overall ok=false.
      if (countMatch === false) { report.ok = false; report.problems.push(`${spec.tab}: row count ${rows.length} (sheet) ≠ ${pg} (pg)`); }
      if (dups.length)          { report.ok = false; report.problems.push(`${spec.tab}: ${dups.length} duplicate PK(s)`); }
      if (diff.diffs.length)    { report.ok = false; report.problems.push(`${spec.tab}: ${diff.diffs.length} sample field diff(s)`); }

      const flags = [];
      if (dups.length) flags.push(`⚠ ${dups.length} dup pk`);
      if (countMatch === false) flags.push(`⚠ count ${rows.length}≠${pg}`);
      if (diff.diffs.length) flags.push(`⚠ ${diff.diffs.length} diff`);
      console.log(`${String(rows.length).padStart(5)} rows  ${DRY_RUN ? '(mapped)' : '→ ' + inserted + ' loaded'}  ${flags.join(' ') || '✓'}`);
    } catch (e) {
      report.ok = false; report.problems.push(`${spec.tab}: ${e.message}`);
      report.tables[spec.tab] = { error: e.message };
      console.log(`ERROR — ${e.message}`);
    }
  }

  // Ghari reconciliation verdict.
  if (report.ghari) {
    const g = report.ghari;
    console.log('\n💰 Ghari orders reconciliation (active orders only):');
    console.log(`   active orders        : ${g.activeOrders}`);
    console.log(`   total from items     : ₹${g.recomputedTotal}`);
    console.log(`   total stored (sheet) : ₹${g.storedTotal}   ${g.storedVsItemsMatched ? '✓ match' : '❌ MISMATCH'}`);
    console.log(`   payment received     : ₹${g.storedPaid}`);
    console.log(`   balance              : ₹${g.storedBalance}`);
    if (!DRY_RUN) console.log(`   total in Postgres    : ₹${g.pgTotal}   ${g.pgVsSheetMatched ? '✓ match' : '❌ MISMATCH'}`);
    if (g.perOrderMismatches.length) {
      report.ok = false;
      report.problems.push(`Ghari: ${g.perOrderMismatches.length} order(s) whose stored total ≠ items total`);
      console.log(`   ⚠ ${g.perOrderMismatches.length} order(s) where stored total ≠ items total — review before go-live:`);
      g.perOrderMismatches.slice(0, 20).forEach(m => console.log(`       ${m.orderNo || m.id}: stored ₹${m.storedTotal} vs items ₹${m.itemsTotal}`));
    }
    if (!g.storedVsItemsMatched || g.pgVsSheetMatched === false) report.ok = false;
  }

  report.finishedAt = new Date().toISOString();

  // Write the report.
  try { mkdirSync('./logs', { recursive: true }); } catch {}
  writeFileSync('./logs/migration-report.json', JSON.stringify(report, null, 2));
  writeFileSync('./logs/migration-report.md', renderReportMd(report));

  console.log(`\n${report.ok ? '✅ All validations passed.' : '❌ Validation found problems (see below / logs/migration-report.md).'}`);
  if (report.problems.length) report.problems.forEach(p => console.log('   - ' + p));
  console.log(`\n📝 Report: logs/migration-report.json  +  logs/migration-report.md\n`);

  process.exit(report.ok ? 0 : 2);
}

function renderReportMd(r) {
  const lines = [];
  lines.push(`# Migration report`);
  lines.push('');
  lines.push(`- Mode: **${r.dryRun ? 'DRY RUN (no writes)' : 'LIVE load'}**`);
  lines.push(`- Started: ${r.startedAt}`);
  lines.push(`- Finished: ${r.finishedAt}`);
  lines.push(`- Result: ${r.ok ? '✅ PASS' : '❌ PROBLEMS'}`);
  lines.push('');
  lines.push(`| Tab | Sheet rows | Loaded | PG rows | Count match | Dup PKs | Sample diffs |`);
  lines.push(`|---|---:|---:|---:|:--:|---:|---:|`);
  for (const [tab, t] of Object.entries(r.tables)) {
    if (t.error) { lines.push(`| ${tab} | — | — | — | ERROR | — | ${t.error} |`); continue; }
    lines.push(`| ${tab} | ${t.sheetRows} | ${t.inserted ?? '—'} | ${t.pgRows ?? '—'} | ${t.countMatch === null ? '—' : (t.countMatch ? '✓' : '❌')} | ${t.dupPks?.length || 0} | ${t.sampleDiffs?.length || 0} |`);
  }
  if (r.ghari) {
    const g = r.ghari;
    lines.push('');
    lines.push(`## Ghari money reconciliation`);
    lines.push(`- Active orders: ${g.activeOrders}`);
    lines.push(`- Total from items: ₹${g.recomputedTotal}`);
    lines.push(`- Total stored (sheet): ₹${g.storedTotal} — ${g.storedVsItemsMatched ? 'match ✓' : 'MISMATCH ❌'}`);
    lines.push(`- Payment received: ₹${g.storedPaid}`);
    lines.push(`- Balance: ₹${g.storedBalance}`);
    if (g.pgTotal !== null) lines.push(`- Total in Postgres: ₹${g.pgTotal} — ${g.pgVsSheetMatched ? 'match ✓' : 'MISMATCH ❌'}`);
    if (g.perOrderMismatches.length) {
      lines.push('');
      lines.push(`### ⚠ Orders whose stored total ≠ items total (review before go-live)`);
      g.perOrderMismatches.forEach(m => lines.push(`- ${m.orderNo || m.id}: stored ₹${m.storedTotal} vs items ₹${m.itemsTotal}`));
    }
  }
  if (r.problems.length) {
    lines.push('');
    lines.push(`## Problems`);
    r.problems.forEach(p => lines.push(`- ${p}`));
  }
  lines.push('');
  return lines.join('\n');
}

main().catch(e => fail(e.stack || e.message));
