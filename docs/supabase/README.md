# Supabase backend for the new parallel app

These files are destined for the **new repo** (`akshar-connect-pg`). The **live app**
(Apps Script + Google Sheet) is never touched by anything here. See the full plan in
[../postgres-migration-plan.md](../postgres-migration-plan.md).

| File | What it is |
|---|---|
| `schema.sql` | Full Postgres schema — all ~38 tables (one per Sheet tab) + `sync_state`/`sync_runs`, triggers, soft-delete, the Ghari amount guard, and RLS. |
| `migrate.mjs` | One-time **Sheet → Supabase** migration + validation (row counts, Ghari money reconciliation, dup-PK, sample diff). Read-only against the live Sheet. |

## 1. Create the schema

In the Supabase project → **SQL Editor**, paste and run `schema.sql`. It's safe to re-run
(`create table if not exists`, `drop trigger if exists`).

## 2. Run the migration

Needs **Node 18+** and the Supabase client:

```bash
npm i @supabase/supabase-js
```

Set three env vars (a `docs/supabase/.env` you do **not** commit, or export them):

```bash
export SOURCE_API_URL="https://script.google.com/macros/s/.../exec"   # LIVE app /exec (read-only source)
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role key — never commit>"
```

Then:

```bash
# 1) Validate the Sheet with NO writes anywhere (safe to run now, needs only SOURCE_API_URL):
node docs/supabase/migrate.mjs --dry-run

# 2) Full load into Supabase + full validation:
node docs/supabase/migrate.mjs --fresh

# one tab only:
node docs/supabase/migrate.mjs --tab GhariOrders
```

Exit code `0` = all validations passed; `2` = problems found. A report is written to
`logs/migration-report.json` and `logs/migration-report.md`.

## 3. What it validates

- **Row counts** — non-blank Sheet rows per tab == rows in the Postgres table.
- **Ghari money reconciliation** — recomputes each active order's total from `items`
  (the same `computeTotals` math as the app) and checks it against the stored flat
  columns **and** against what landed in Postgres, to the paisa. Any order whose stored
  total disagrees with its items is listed for a human — **never auto-"fixed"**.
- **Duplicate PKs** — surfaced per table (the Sheet has had dup-id issues before).
- **Sample field-by-field diff** — a handful of rows per table, Postgres vs source.

## How it reads the Sheet without changing the backend

It calls the live Apps Script's existing generic `ghariRawDump` action, which returns the
full raw grid of **any** tab by name. So no `Code.gs` change and no redeploy are needed,
and it only ever reads.

> **Run the dry-run first and review `logs/migration-report.md` before the live load** —
> especially the Ghari reconciliation. This is money data; validation gates go first.
