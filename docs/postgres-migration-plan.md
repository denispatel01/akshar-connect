# Akshar Connect — Backend Migration Plan: Google Apps Script + Sheets → Supabase (Postgres)

**Status:** PROPOSAL — approach decided (see §0.5); schema/build not yet started.
**Author:** Claude (planning session), 2026-10-18
**Decision owner:** Urvashi / Denis

---

## 0.5 DECISION (2026-10-19): build a separate parallel app, don't migrate in place

The live app must keep running untouched so devotees are never disturbed. So instead of
flipping the existing app to Supabase behind a flag (§7), we **build a brand-new app that
is a same-to-same clone of the frontend, differing only in its backend.**

Decisions made with the user:
- **New separate GitHub repo** (e.g. `akshar-connect-pg`) — a copy of this frontend. The
  live repo, its GitHub Pages URL, its Apps Script, and its Sheet are **never touched.**
  The clone gets its **own URL** and its **own Supabase project** (Postgres source of truth).
- **Copy the current live data into Postgres and keep it synced.** One-time migrate the
  Sheet into Supabase (§9), then keep both aligned with the sync engine (§5). During the
  trial both apps show the same real data.
- **Both run in parallel.** Current app (Sheet) stays live for devotees; the new app
  (Postgres) is tested privately. When proven, cut devotees over by pointing them at the
  new URL (or repointing the old URL to the new build). If anything is wrong, the old app
  is still live and current — rollback is "keep using the old URL," zero data risk.

This **supersedes the in-place feature-flag rollout in §7** for the live app. The
`USE_SUPABASE` flag still exists inside the clone (so the clone can fall back to the Sheet
backend during its own development), but the live app is left entirely alone.

**What unblocks the build (account-level, needed from the user):**
1. A **Supabase project** created (staging + prod, or one to start). Claude needs the
   project URL + anon key + service-role key (service-role kept as a secret, never
   committed).
2. A **new empty GitHub repo** for the clone — Claude can create it via `gh` if desired,
   or the user creates it and shares the name.
3. For the nightly Sheet mirror (§6): a **Google service account** with edit access to the
   mirror Sheet (only if we keep syncing back to a Sheet for the new app; optional at first).

**Buildable right now with no accounts:** the full Supabase schema SQL (§3, the ~40
`CREATE TABLE`s + triggers + RLS) and the migration/validation script (§9) — both are
reviewable deliverables that need no credentials to write.

---

## 0. TL;DR

We move the **source of truth** from the Google Sheet (via Apps Script) to **Supabase
(hosted Postgres)**. The Google Sheet stays alive as a **human-readable mirror** that is
rewritten from Postgres every night at 03:00 and on demand.

- Frontend keeps its current **cache-first** shape (`hydrateSync()` → instant render,
  `bootstrap()` → network refresh). We only swap the transport under `api()` in
  `src/services/dataService.js` from the Apps Script `/exec` URL to Supabase.
- The **Ghari money path** (outbox/offline queue in `src/services/ghariService.js`) is
  preserved exactly. Its durable outbox keeps working; only the endpoint it flushes to
  changes.
- **Every table gets `updated_at` + `deleted` (soft delete).** No table is ever
  blind-overwritten. No row is ever hard-deleted by the sync engine.
- Sync is **row-level upsert by stable ID**, with a **dry-run preview + confirmation**
  for the risky direction (Sheet → Postgres), and a **full audit log** of every sync run.
- Rollout is behind a **feature flag** so the live Sheets app keeps serving users until
  the new path is proven. Rollback is a one-line flag flip.

Nothing in this document changes app behaviour the user sees, except that it becomes
faster and the data becomes safer.

---

## 1. Why, and the non-negotiables

The app currently stores everything in a Google Sheet and talks to it through a single
Apps Script web app (`google-apps-script/Code.gs`, ~3000 lines, one `handle_()` action
router). This works but has real limits: Sheets is not a database (no types, no
constraints, no transactions, row-shift corruption is possible), Apps Script has quotas
and cold-start latency, and every read pulls whole tabs into memory.

**The column-shift history is the reason this plan is cautious.** 101 Ghari orders were
once silently shifted by +7 columns and corrupted (see `MEMORY.md →
ghari-orders-column-shift`, `ghari-amount-safety`). That class of bug is *only possible*
because the Sheet is positional (data lives at a cell coordinate, not against a named
column with a type). Moving money to Postgres — where every value is a typed, named,
constrained column keyed by a stable primary key — **removes that entire failure mode.**
The Sheet mirror is written by name, never by blind range, so it can't recreate it either.

**Non-negotiables carried into every design choice below:**

1. Never lose a write. The Ghari outbox guarantee ("every save lands in localStorage +
   a durable queue that survives reloads") must survive the migration unchanged.
2. Never silently change or delete money data. `GhariOrders`, `GhariPurchases`,
   `GhariStock`, `GhariLog` get the strictest treatment: soft-delete only, append-only
   audit, amount-total reconciliation on every migration and every sync.
3. `itemsJson` is authoritative for a Ghari order; the flat amount columns
   (`total`, `withGheeAmt`, …) are a **derived denormalization** for human reading
   (`toBackendRow_` in `ghariService.js` computes them from `computeTotals(items)`).
   Postgres mirrors that: `items` JSONB is the truth, amounts are generated/derived.

---

## 2. Current architecture (what we are replacing)

### 2.1 Backend (`google-apps-script/Code.gs`)
- **`HEADERS`** — a map of sheet-tab name → ordered column list. This is the de-facto
  schema. There are ~40 tabs (see §3). `SCHEMA_VERSION` bumps force a re-ensure.
- **Storage helpers:** `readAll_(name)` reads a whole tab as objects keyed by `HEADERS`;
  `rowFromObj_` / `appendRows_` write; `findRow_(name, keyField, keyVal)` linear-scans a
  key column to locate a row; `BOOL_COLS` coerces certain columns to booleans on read.
- **Router:** `doPost`/`doGet` → `handle_(p)` dispatches on `p.action`. Generic CRUD is
  `insert` / `update` / `remove` (take `collection`, `keyField`, `key`, `row`). Dozens of
  specialized actions exist (`bootstrap`, `ghariBootstrap`, `saveSwadhyay`, `createPost`,
  `sendEmail`, `ghariUpsertOrder`, `ghariRevert`, …).
- **Side effects:** emails (change digests, error reports, campaigns), FCM push, Drive
  photo/challan/feed-media uploads, time-triggers (seva reminders, swadhyay reminder,
  backups 3×/day, change digest).

### 2.2 Frontend data layer (`src/services/dataService.js`)
- `API_URL` = the deployed `/exec`. `api(action, payload)` POSTs JSON (as
  `text/plain` to dodge CORS preflight), retries 4× with backoff.
- `hydrateSync()` — synchronous: fills in-memory `DB` from `localStorage[ac_cache_v1]`
  (or bundled demo) so the UI renders instantly, before any network.
- `bootstrap()` — async: calls `api('bootstrap')`, replaces `DB`, `saveCache()`.
- `push(action, payload)` — fire-and-forget optimistic writes with retry.
- Exposes `backendApi()` / `backendOnline()` for sibling services to reuse the same
  transport.

### 2.3 Ghari money layer (`src/services/ghariService.js`)
- Local-first: `MEM` (in-memory) + `localStorage` (`ac_ghari_orders_v1`, etc.).
- **Durable outbox** (`ac_ghari_outbox_v1`): every write enqueues an op
  `{opId, action, payload, tries, queuedAt}`. `enqueueUpsert_` collapses duplicate
  pending ops for the same key (latest state wins) but preserves `notify`/`INSERT`
  intent. `flush()` attempts each op independently, keeps failures for retry, drops
  permanent "not allowed" rejections with a surfaced error.
- `syncDown(season)` pulls `ghariBootstrap` for one season and merges: any id with a
  pending outbox op keeps the **local** copy; everything else takes the **server** copy.
- **Money math** lives in `computeTotals(items)` (single source of truth) and
  `orderKg_`. These move to the client unchanged; Postgres stores both the authoritative
  `items` and the derived totals for cross-checking.

---

## 3. Supabase schema

### 3.1 Conventions applied to EVERY table
- **Primary key** = the existing stable business ID (`id`, or `sku`/`token`/`key` where
  that is already the key — see table list). Kept as `text` to preserve existing IDs
  exactly (no re-keying during migration — re-keying is how money gets lost).
- **`updated_at timestamptz not null default now()`** — maintained by a trigger
  (`BEFORE UPDATE`) so it is always truthful regardless of who writes.
- **`deleted boolean not null default false`** — soft delete. Reads filter
  `where deleted = false` by default. The sync engine and the app never issue SQL
  `DELETE` against these tables.
- **`created_at timestamptz not null default now()`** — for audit/debugging, in addition
  to any existing domain `createdOn` column (we keep the domain columns verbatim so the
  Sheet mirror stays identical to today).
- **Column names:** keep the **exact camelCase names** from `HEADERS` (quoted
  identifiers, e.g. `"customerMobile"`). This keeps the Sheet mirror byte-identical and
  avoids a rename mapping layer. (Alternative — snake_case with a mapping layer — is
  more "Postgres-idiomatic" but adds a translation surface where a money column could be
  mis-mapped. We choose zero-translation.)
- **Types:** money/amount columns → `numeric(12,2)`; counts/minutes/boxes → `integer`;
  booleans (`present`, `delivered`, `active`, `call`, …) → `boolean`; JSON blobs
  (`itemsJson`, `mediaJson`, `companionsJson`, `changesJson`, `beforeJson`, `afterJson`,
  `subOrdersJson`) → `jsonb`; timestamps that are ISO strings today → `timestamptz`;
  everything else → `text`. **Ghari `itemsJson` and the amount columns are both stored**
  (truth + derived) — see §3.3.

### 3.2 Table inventory (derived from `HEADERS` in `Code.gs`)

Each maps one sheet tab → one Postgres table. PK column in **bold**.

| Table | PK | Notes / money-sensitive |
|---|---|---|
| `users` | **mobile** | login identity; see §8 auth |
| `devotees` | **id** | big table; `photo` is a Drive URL; family fields |
| `sabhas` | **id** | |
| `attendance` | **id** | FK-ish: `sabhaId`, `devoteeId` |
| `followups` | **id** | |
| `thoughts` | **id** | |
| `areas` | **name** | |
| `activity` | synthetic `id` | append-only log; trimmed today at ~12k rows |
| `changes` | synthetic `id` | change digest log |
| `errorlog` | **id** | powers `npm run errors` — see §9.5 |
| `pushlog` | **id** | |
| `pushrecipients` | synthetic `id` (`notifId`+`devoteeId`) | |
| `ghari_products` | **sku** | 💰 unit prices |
| `ghari_orders` | **id** | 💰💰 see §3.3 |
| `ghari_purchases` | **id** | 💰 procurement + challan URL |
| `ghari_stock` | **id** | 💰 karyakarta holdings |
| `ghari_log` | **id** | 💰 append-only audit, NEVER trimmed |
| `mandal_leaders` | **id** | |
| `leader_boards` | **id** | |
| `leader_entries` | **id** | `target`/`done` numeric |
| `push_tokens` | **token** | device registry |
| `announcements` | **id** | |
| `notif_reads` | **id** | |
| `push_status` | **key** | |
| `swadhyay` | **key** (`devoteeId\|date`) | minutes |
| `seva` | **id** | |
| `cal_plan` | **id** | |
| `feed_posts` | **id** | soft-delete via `status` today → also set `deleted` |
| `feed_likes` | **id** (`postId\|devoteeId`) | |
| `feed_comments` | **id** | |
| `email_campaigns` | **id** | |
| `email_templates` | **id** | |
| `bus_events` | **id** | |
| `bus_bookings` | **id** | |
| `vato` | **SN** | hand-maintained in Sheet — Sheet→PG is the normal direction here |
| `devotee_log` | **id** | audit |
| `cal_plan`, `seva`, `swadhyay` | | per-devotee logs |

> Note: several tables already have a domain-level soft delete (`status ∈ active|void`
> for Ghari, `status ∈ active|removed` for Feed). We **keep those columns as-is** and
> **add** the uniform `deleted` flag on top. The sync engine keys its "is this row gone"
> decision off `deleted`; the app continues to use `status` for its own display logic.
> During migration we set `deleted = (status in ('void','removed'))` as the initial value.

### 3.3 `ghari_orders` — the critical table (exact columns)

Authoritative + derived, mirroring `toBackendRow_`:

```sql
create table ghari_orders (
  id              text primary key,
  "orderNo"       text,
  season          text not null,
  "customerName"  text,
  "customerMobile" text,
  "devoteeId"     text,
  karyakarta      text,
  "karyakartaId"  text,
  items           jsonb not null default '[]',   -- AUTHORITATIVE (was itemsJson)
  "itemsSummary"  text,                           -- derived, human-readable
  "subOrders"     jsonb default '[]',             -- was subOrdersJson
  total           numeric(12,2) not null default 0,  -- derived from items
  "withGheeAmt"   numeric(12,2) not null default 0,  -- derived
  "withoutGheeAmt" numeric(12,2) not null default 0, -- derived
  "sugarFreeAmt"  numeric(12,2) not null default 0,  -- derived
  "bhusuAmt"      numeric(12,2) not null default 0,  -- derived
  delivered       boolean not null default false,
  "deliveredBoxes" integer not null default 0,
  "deliveryDate"  text,
  "paymentReceived" numeric(12,2) not null default 0,
  balance         numeric(12,2) not null default 0,  -- total - paymentReceived
  "paymentType"   text,
  status          text not null default 'active',    -- active|void
  remarks         text,
  "createdBy"     text, "createdOn" text,
  "updatedBy"     text, "updatedOn" text,
  deleted         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

**Integrity guard (defence against a future column-shift-equivalent):** add a Postgres
`CHECK`/trigger that recomputes `total`, the four category amounts and `balance` from
`items` on write and rejects (or logs to `ghari_log`) a row whose stored `total` differs
from the recomputed `items` total by more than ₹0.01. The client already computes these
with `computeTotals()`; the DB becomes a second independent check. **This is a guarantee
Sheets could never give.**

### 3.4 Row Level Security (RLS)
Supabase exposes tables over PostgREST. We **enable RLS on every table** and do **not**
rely on the public anon key for writes:
- **Phase 1 (fastest, lowest risk):** route all writes through Supabase **Edge Functions**
  (or RPC `security definer` functions) that replicate the current Apps Script
  authorization (e.g. "Ghari is view-only for Sevaks", "only Admin can upsert users" —
  `isAdminActor_` in `Code.gs`). The anon key gets **read-only** policies (or no direct
  table access at all), so a crafted client call can't tamper with money. This mirrors
  how the backend already enforces rules server-side today.
- Reads that are already public-ish (bootstrap data) can use RLS read policies directly
  via `supabase-js` for speed.

This keeps the server-side authorization that `Code.gs` has today (see the `isAdminActor_`
checks on `upsertUser`/`deleteUser`, and the Ghari permission rejection path in
`flush()`), rather than trusting the client.

---

## 4. API layer — how the frontend talks to Supabase

### 4.1 Strategy: swap the transport, keep the shape
The whole app funnels through **one function**: `api(action, payload)` in
`dataService.js`. Every other call (`push`, `backendApi`, the entire Ghari outbox
`flush`) goes through it. **We change only that function** (and add an auth token header).
`hydrateSync()`, `bootstrap()`, the cache, and the Ghari outbox are untouched.

Two concrete options for what `api()` does:

- **(A) Edge Function "action gateway" (RECOMMENDED for phase 1).** Deploy one Supabase
  Edge Function (`/functions/v1/api`) that accepts the **same `{action, ...payload}`
  envelope** the app already sends, and internally does the Postgres work. This is an
  almost mechanical port of the `handle_()` router from `Code.gs` into
  Deno/TypeScript against the Postgres client. **Why:** the frontend diff is nearly zero
  (just the URL + an `Authorization: Bearer <jwt>` header), all existing actions keep
  working including the Ghari outbox ops (`ghariUpsertOrder`, `ghariMarkDelivery`,
  `ghariRevert`, …), and server-side authorization is preserved in one place.

- **(B) Direct `supabase-js` per-resource.** Rewrite each `dataService` method to call
  `supabase.from('ghari_orders').upsert(...)` etc. Cleaner long-term, but it's a large
  surface rewrite, it spreads authorization logic into the client, and it would require
  reworking the Ghari outbox's action-based ops. **Defer to a later phase**, if ever.

**Recommendation:** Phase 1 = Option A (gateway), because it preserves the outbox and the
money-write authorization with the least risk. Migrate hot read paths to direct
`supabase-js` later for latency, once correctness is proven.

### 4.2 What changes in `dataService.js` (phase 1)
```js
// before
const API_URL = "https://script.google.com/macros/s/.../exec";
// after (behind a feature flag — see §7)
const API_URL = USE_SUPABASE
  ? "https://<project>.supabase.co/functions/v1/api"
  : "https://script.google.com/macros/s/.../exec";
```
Plus: add the Supabase anon key / user JWT to the request headers inside `api()`. The
`text/plain` content-type trick is no longer needed (Edge Functions send CORS headers),
but keeping JSON works fine. Retry/backoff logic stays.

### 4.3 Ghari outbox — unchanged
`ghariService.js` calls `backendApi(op.action, payload)` in `flush()`. Because the Edge
Function keeps the same action names and payloads, **the outbox needs no changes**.
`syncDown()` keeps calling `ghariBootstrap` (now served from Postgres, scoped by season).
The challan-upload-before-sync step still runs client-side; challans continue to go to
Drive (or optionally migrate to Supabase Storage later — not required for phase 1).

### 4.4 Cache-first guarantees preserved
`hydrateSync()` and `localStorage[ac_cache_v1]` are storage-agnostic — they don't care
where `bootstrap()` got its data. No change. Offline reads keep working identically.

---

## 5. The SAFE sync engine (Postgres ⇄ Sheet)

This is the heart of the plan. Postgres is authoritative; the Sheet is a mirror that is
**rewritten from Postgres** nightly, and can be **read back into Postgres** on demand
(rarely, emergencies only) **with a preview and confirmation**.

### 5.1 Core rules (apply to BOTH directions)
1. **Row-level upsert by stable ID. NEVER a full-table blind overwrite / clear-and-refill.**
   (The current `replaceDevotees` action — `sh.clear()` then re-append — is exactly the
   anti-pattern we are retiring.)
2. **Match by primary key** (`id`/`sku`/`token`/`key`), compare fields, update only what
   differs.
3. **Soft delete, never hard delete.** A row missing on one side is flagged
   `deleted = true` on the other side (or, Sheet-side, moved/marked — see 5.2), never
   physically removed.
4. **Every sync run writes an audit record** (see 5.5) with counts and a per-row change
   list for money tables.
5. **Money tables (`ghari_*`) get amount-total reconciliation** before and after every
   run: sum `total` across non-deleted orders on each side must match (within ₹0.01) or
   the run aborts and emails the admin (per `MEMORY.md → ghari-amount-safety`).

### 5.2 Direction 1 — Postgres → Sheet (the nightly default; safe)
Postgres is authoritative, so this is the lower-risk direction. But we still must not
**clobber a manual Sheet edit made since the last sync** before anyone has pulled it back.

Algorithm (per table):
1. Read all non-deleted rows from Postgres (the truth) and all rows from the Sheet tab.
2. For each Postgres row, locate the Sheet row by PK:
   - **No Sheet row** → append it.
   - **Sheet row exists and matches** → skip (no write).
   - **Sheet row exists but differs** → this is the only sensitive case. Because manual
     Sheet edits carry no timestamp, we cannot tell "stale mirror" from "fresh manual
     edit". **Guard:** before the nightly PG→Sheet run, compute a **hash/snapshot of the
     current Sheet** and compare it to the **snapshot taken at the end of the previous
     sync** (stored in a `sync_state` table). If the Sheet changed since we last wrote it,
     those changed rows are **reported, not overwritten** — the admin is emailed "N manual
     sheet edits detected; run a manual Sheet→Postgres first to keep them." The rest of
     the table syncs normally. This realises the user's stated habit (PG→Sheet first,
     then Sheet→PG) safely and automatically.
3. **Deletes:** a Sheet row whose PK is marked `deleted = true` in Postgres is **marked**
   in the Sheet (e.g. `status = void`/`deleted` column set, row greyed) — **not physically
   deleted** — so the ledger stays visually complete and recoverable.
4. Write rows **by named column** (look up each column's position from the Sheet header
   row every run; never assume a fixed offset). This is the structural fix for the
   column-shift class of bug.
5. After a successful run, store a fresh Sheet snapshot/hash in `sync_state` and append an
   audit row.

> Writing "by named column, re-reading the header each run" is the single most important
> defence. The 2025 corruption happened because data was written positionally and a
> column offset drifted. Named writes make that impossible.

### 5.3 Direction 2 — Sheet → Postgres (manual, rare, preview-gated)
Used only when someone has made an emergency manual edit in the Sheet and wants it in
Postgres. Because manual edits have no timestamp and could be mistakes, this direction is
**never automatic and never silent.**

Two-step, always:
1. **Dry-run / preview (no writes).** Diff every Sheet row against Postgres by PK and
   produce a **report**:
   - rows that would be **inserted** (in Sheet, not in PG),
   - rows that would be **updated** (field-by-field: column, old PG value → new Sheet
     value — especially every money column),
   - rows in PG but **missing from the Sheet** → these are **NOT auto-deleted**; they are
     listed as "present in Postgres, absent in Sheet — ignored (no delete)". A delete can
     only happen by explicitly soft-deleting in the app, never by a row vanishing from the
     Sheet.
   - **Money reconciliation line:** "Ghari order total in Sheet ₹X vs Postgres ₹Y;
     applying this would change the grand total by ₹Z."
2. **Confirmation required.** The admin reviews the preview and explicitly confirms.
   Only then are the upserts applied (still row-level, still by PK, still soft-delete
   semantics). The applied change set is written to the audit log and (for Ghari) to
   `ghari_log` as well.

The manual-sync UI offers the two directions as the user described:
**(1) Postgres → Sheet** and **(2) Sheet → Postgres**, with a one-line hint recommending
"run Postgres→Sheet first, then Sheet→Postgres" so Postgres data is never lost.

### 5.4 Conflict handling summary
- Normal operation: Postgres always wins (it's the source of truth); the Sheet is a
  mirror. No conflict.
- Manual Sheet edit detected during nightly PG→Sheet: those rows are **preserved and
  reported**, not overwritten (§5.2 step 2). Admin resolves by running a previewed
  Sheet→PG.
- Sheet→PG apply: human reviews and confirms every change (§5.3). No automatic
  resolution of money differences — a human always decides.
- A row can never be resurrected or deleted by sync alone: deletes are soft and only
  originate from the app.

### 5.5 Audit log
New table `sync_runs`:
```sql
create table sync_runs (
  id           bigserial primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  direction    text not null,            -- 'pg_to_sheet' | 'sheet_to_pg'
  trigger      text not null,            -- 'nightly' | 'manual'
  actor        text,                     -- who ran a manual sync
  tables_json  jsonb,                    -- per-table {inserted, updated, skipped, flagged, soft_deleted}
  money_check  jsonb,                    -- {ghari_total_before, ghari_total_after, matched: bool}
  status       text not null,            -- 'ok' | 'aborted' | 'needs_review'
  notes        text
);
```
Plus the existing `ghari_log` append-only audit continues to capture every money row
change (it already stores `before`/`after` snapshots and supports revert — see
`ghariRevert`). The sync engine writes to `ghari_log` for any Ghari row it changes.

---

## 6. The 03:00 scheduled job — options compared

| Option | How | Pros | Cons |
|---|---|---|---|
| **Apps Script time trigger** (in a reduced `Code.gs`) | A trimmed Apps Script keeps only Drive/Sheet access; a `ScriptApp` time trigger at 03:00 calls Supabase to pull the truth and rewrite the Sheet | Already has Sheet write access + the user's Drive auth; zero new infra; `clasp`/deploy flow already understood | Keeps a foot in Apps Script (the thing we're leaving); Apps Script → Supabase network calls; quota/timezone quirks |
| **Supabase `pg_cron` + Edge Function** | `pg_cron` fires at 03:00 → calls an Edge Function that writes the Sheet via the Google Sheets API (service account) | All logic in one place (Supabase); no Apps Script; scales | Needs a Google service account with Sheets API access to the specific Sheet (one-time setup); Edge Function must speak the Sheets REST API |
| **GitHub Action (scheduled workflow)** | `on: schedule: cron` at 03:00 runs a Node script: read Supabase → write Sheet via Sheets API | Free, versioned in-repo, easy to read logs, easy to run manually ("Run workflow" button doubles as a manual trigger), secrets in GH | Cron is best-effort (can run a few min late); needs Google service account creds as a GH secret; cold Node start |

**Recommendation: GitHub Action (scheduled workflow).**
Reasons: (1) it's **in the repo** so the sync logic is versioned and reviewable alongside
the app; (2) the manual "Run workflow" button is a ready-made **on-demand sync trigger**
with a direction input (`pg_to_sheet` / `sheet_to_pg` + a `dry_run` boolean), matching the
user's manual-sync requirement for free; (3) logs are visible; (4) no new always-on infra.
It needs a Google **service account** (JSON key, stored as a GH Actions secret) granted
edit access to the mirror Sheet, and the Supabase service-role key as a secret. The nightly
cron (`0 21 * * *` UTC = 03:00 Asia/Kolkata, since IST = UTC+5:30 → actually `30 21 * * *`
UTC) does PG→Sheet; a `workflow_dispatch` input runs either direction with the
preview/confirm flow (preview posts the diff as the workflow summary; "confirm" = re-run
with `dry_run=false`).

> IST is UTC+5:30, so 03:00 IST = **21:30 UTC** → cron `30 21 * * *`. Double-check against
> DST — India has none, so this is stable year-round.

(If the user prefers not to manage a service account, fall back to the **Apps Script time
trigger** option — it reuses the Drive auth that already exists. That's the second choice.)

---

## 7. Rollout behind a feature flag + rollback

### 7.1 Feature flag
- A single build-time/runtime flag `USE_SUPABASE` (env var `VITE_USE_SUPABASE`, or a
  remote-config value read at bootstrap) selects the backend in `api()` (§4.2).
- **Dual-write bridge (optional, safest):** during the proving window, writes can go to
  **both** backends (Apps Script Sheet AND Supabase) while reads come from the old path.
  This builds confidence that Supabase receives every write correctly before we flip
  reads. Implemented as a thin wrapper in `api()` that, for write actions, also posts to
  the secondary URL best-effort. Turn off once proven.
- Flip order: (1) migrate data (§8-data below) → (2) dual-write on, reads still Sheets →
  (3) compare the two datasets daily for a week (the sync audit + a reconciliation query)
  → (4) flip reads to Supabase for internal/admin users only → (5) flip all users →
  (6) Sheet becomes mirror-only.

### 7.2 Rollback
- **Instant:** flip `USE_SUPABASE` back to `false`. The app returns to the Apps Script +
  Sheets path, which is still live and (thanks to the nightly PG→Sheet mirror) still
  current. Because the Sheet was kept faithfully mirrored, **no data is stranded** in
  Postgres-only state at rollback time — the last nightly (or an on-demand PG→Sheet run)
  brings the Sheet fully up to date first.
- Keep the Apps Script deployment **untouched and deployed** throughout phases 1–5 so
  rollback is always a flag flip, never a redeploy.

---

## 8. Auth — mapping the current login to Supabase

### 8.1 Today
Login is `mobile + PIN` (staff, in the `Users` sheet) or `mobile + DOB` (devotees, matched
against `Devotees`). Matching is cache-first in `dataService.login()` and tolerant of
mobile/number formatting (`normMobile_` → last 10 digits). There is a seeded admin.
**There are no real password hashes** — PINs/DOBs are compared in plaintext against the
sheet. Roles: `Admin` / `Sevak` / `Devotee` (+ per-module grants via `Users.modules`).

### 8.2 Recommended mapping (phase 1 — keep the current UX, add real security server-side)
Supabase Auth's email/password and phone-OTP flows don't match "mobile + PIN/DOB" cleanly,
and the user base is small and non-technical. So:

- **Keep the existing login UX** (mobile + PIN / mobile + DOB) but authenticate it through
  a **Supabase Edge Function** (`/functions/v1/login`) that:
  1. Looks up the user/devotee in Postgres by normalized mobile.
  2. Verifies the PIN/DOB **server-side**. Store PINs as **hashed** (bcrypt) in a
     `users.pin_hash` column at migration time — a strict security upgrade over today's
     plaintext. DOB stays compared against the `devotees` record.
  3. Mints a **Supabase JWT** (custom claims: `role`, `devoteeId`, `mobile`, `modules`)
     and returns it. The app stores it in the session and sends it on every `api()` call.
- **RLS policies key off the JWT claims** (e.g. `role = 'Admin'` for user management;
  Ghari write policies reject `Sevak`), replacing the current client-trust + per-action
  `isAdminActor_` checks with DB-enforced rules.

This preserves the login the users know, removes plaintext PIN comparison, and gives us
real row-level enforcement. (A later phase could move to Supabase phone-OTP if desired —
out of scope here.)

### 8.3 Seed admin
The hardcoded `ADMIN_SEED` (mobile `9924598434`) is migrated as a normal `users` row with
a hashed PIN. `ensureSeedAdminPin_` logic is replaced by a one-time migration insert.

---

## 9. One-time data migration (Sheets → Postgres) + validation

### 9.1 Export
For each tab, read all rows (reuse `readAll_`-equivalent logic, or the Google Sheets API
from the migration script) → transform to typed rows → bulk `insert` into the matching
Postgres table. Preserve IDs exactly. Set `deleted = (status in ('void','removed'))` where
applicable; else `false`. Parse JSON columns into `jsonb`; parse ISO timestamps; coerce
booleans using the same `BOOL_COLS` rules.

### 9.2 Ghari — extra care
- For every order, parse `itemsJson` → `items` jsonb, then **recompute** `total` and the
  four category amounts with the **same `computeTotals()` logic** and compare to the
  stored flat columns. Any mismatch is **reported, not silently "fixed"** — a human
  decides (this is how we'd catch any lingering shift-corruption artefact before it lands
  in the new truth store).
- Same for purchases (`boxes`, `amount`) and stock.

### 9.3 Validation gates (migration aborts if any fail)
- **Row counts** per table: Sheet rows (non-blank) == Postgres rows inserted.
- **Ghari amount reconciliation:** `SUM(total)` over active orders in Postgres ==
  `SUM(total)` computed from the Sheet, to the paisa. Same for `paymentReceived`,
  `balance`, purchases `amount`, and per-category amount totals.
- **Spot PK uniqueness:** no duplicate IDs (the Sheet has had duplicate-ID repair actions
  before — `repairDuplicateSabhaIds_`; run a dup check and surface any).
- **Sample diff:** pick N random rows per table and assert field-by-field equality.
- Produce a **migration report** (counts, reconciliation numbers, any mismatches) saved to
  the repo / emailed, reviewed by a human before go-live.

### 9.4 Dry-run first
Run the whole migration into a **staging Supabase project** first, validate, throw it
away, then run against production Supabase. Never migrate straight to prod unseen.

### 9.5 `npm run errors` continuity
The `getErrorLog` / `resolveError` endpoints and `reportError` → `logError` flow must keep
working. In phase 1 they're ported into the Edge Function gateway against the `errorlog`
table, so `npm run errors` (which reads `API_URL` from `dataService.js`) keeps working once
it points at Supabase. Document this in `CLAUDE.md` after the cutover.

---

## 10. Phased sequence & honest effort estimate

Estimates assume one developer (with Claude) who knows this codebase. Ranges are honest,
not optimistic.

| Phase | Work | Est. |
|---|---|---|
| **0. Setup** | Create Supabase project (staging + prod), service account for Sheets API, repo secrets, define `sync_state`/`sync_runs` tables | 0.5–1 day |
| **1. Schema** | Write the ~40 `CREATE TABLE`s with types, PKs, `updated_at` trigger, `deleted`, Ghari CHECK/trigger, RLS policies | 1.5–2.5 days |
| **2. Migration script + validation** | Export→transform→load, reconciliation gates, migration report, dry-run on staging | 2–3 days |
| **3. API gateway (Edge Function)** | Port `handle_()` router actions to Deno/TS against Postgres, preserving every action incl. Ghari ops + authorization + login function | 4–7 days (largest piece — ~40 actions) |
| **4. Frontend swap + flag** | `api()` URL+JWT behind `USE_SUPABASE`; optional dual-write; verify `hydrateSync`/`bootstrap`/Ghari outbox end-to-end | 1.5–2.5 days |
| **5. Sync engine** | PG→Sheet (named-column, snapshot guard), Sheet→PG (preview+confirm), audit log, money reconciliation, GitHub Action (nightly + manual dispatch) | 3–5 days |
| **6. Proving window** | Dual-write + daily reconciliation, fix drift, phased read cutover, rollback drill | 1–2 weeks elapsed (part-time) |
| **7. Cleanup** | Point `npm run errors` at Supabase, update `CLAUDE.md`/`DEPLOY.md`, retire `replaceDevotees` blind-overwrite, keep Apps Script as mirror-writer only | 1 day |

**Total active engineering: ~2.5–4 weeks**, plus a 1–2 week low-effort proving window
running in parallel with normal use. The gateway port (phase 3) and the sync engine
(phase 5) are the two substantial efforts; everything else is mechanical.

**Biggest risks / where to spend the care budget:**
1. The Ghari money path (outbox + reconciliation). Mitigated by: unchanged outbox, DB-side
   amount CHECK, reconciliation gates on migration and every sync, append-only `ghari_log`.
2. The Sheet→PG direction. Mitigated by: always preview+confirm, never auto-delete.
3. Auth cutover. Mitigated by: keep the exact login UX, add hashing + JWT server-side.

---

## 11. Open questions for the reviewer

1. **Scheduler:** OK to use a **GitHub Action** (needs a Google service-account JSON as a
   repo secret)? Or prefer keeping an **Apps Script time trigger** (reuses existing Drive
   auth, no service account)?
2. **Column naming:** keep **exact camelCase** quoted identifiers (zero translation, Sheet
   stays byte-identical) — confirmed preferred? (vs. snake_case + mapping layer.)
3. **Dual-write proving window:** worth the extra wiring for a week of safety, or go
   straight to a flag flip after staging validation?
4. **Challans/photos:** keep on Google Drive for now (no change), or migrate to Supabase
   Storage in a later phase?
5. **Auth:** comfortable hashing PINs (bcrypt) at migration — meaning the plaintext PINs in
   the Sheet are replaced by hashes in Postgres (strict upgrade, but the Sheet mirror would
   then NOT show PINs; is that acceptable, or must the Sheet keep showing PINs)?

---

*No application code has been changed by this document. Implementation begins only after
this plan is reviewed and approved.*
