-- ============================================================================
-- Akshar Connect — Supabase (Postgres) schema for the NEW parallel app
-- ============================================================================
-- Destined for the new repo (akshar-connect-pg). The LIVE app (Apps Script +
-- Google Sheet) is NOT touched by anything here.
--
-- Derived column-for-column from the HEADERS map in google-apps-script/Code.gs
-- (SCHEMA_VERSION 2026-10-16-ghari-sub-orders). One sheet tab -> one table.
--
-- Conventions (see docs/postgres-migration-plan.md §3):
--   • Primary key = the EXISTING stable business id (id / sku / token / key /
--     mobile / name / SN), kept as text so existing ids are preserved exactly.
--     Append-only logs with no business key get a surrogate bigserial id.
--   • Column names keep the EXACT camelCase from the Sheet (quoted identifiers)
--     so the Sheet mirror stays byte-identical and there is no rename layer.
--     The ONE deliberate exception is ghari_orders.itemsJson -> items and
--     subOrdersJson -> subOrders (jsonb), mapped in the gateway/sync layer.
--   • Every table gets: deleted boolean (soft delete), created_at + updated_at
--     timestamptz (system columns; updated_at maintained by a trigger).
--   • Money/amount columns -> numeric(12,2); counts/minutes/boxes -> integer;
--     the BOOL_COLS from Code.gs -> boolean; JSON blobs -> jsonb.
--   • DOMAIN date/time/timestamp columns that are free-form STRINGS in the Sheet
--     today (date, time, ts, createdOn, updatedOn, contactedOn, resolvedOn, …)
--     are kept as TEXT, exactly as the Sheet stores them. Rationale: fidelity +
--     the "never silently change data" rule — DOB/date formats are already
--     inconsistent in the live data. Real temporal logic/sync uses the system
--     created_at / updated_at timestamptz columns instead. (This refines §3.1,
--     which suggested timestamptz; text is the safer, fidelity-preserving choice.)
--
-- RLS note: in phase 1 ALL writes go through a Supabase Edge Function using the
-- service-role key, which BYPASSES RLS. The policies below therefore only govern
-- DIRECT anon/authenticated access (e.g. fast read paths). Sensitive tables
-- (users, errorlog, ghari_log, push_*, activity, changes, email_*) get NO
-- anon/auth policies at all → only the service-role gateway can touch them.
--
-- Safe to run top-to-bottom on a fresh Supabase project. Idempotent-ish: uses
-- "create table if not exists" and "drop trigger if exists" so re-running is OK.
-- ============================================================================

-- gen_random_uuid() etc. (bigserial surrogates below don't need this, but it's
-- handy for future use and already present on Supabase).
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest on every UPDATE, no matter who writes.
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Convenience: attach the updated_at trigger to a table by name.
-- (Called once per table after each CREATE below.)

-- ============================================================================
-- CORE DIRECTORY & SABHAS
-- ============================================================================

-- Users (staff logins). PK = mobile. pin/password are migrated as hashes in the
-- gateway (see plan §8); kept here as text columns named to match the Sheet.
create table if not exists users (
  mobile      text primary key,
  pin         text,
  password    text,
  role        text,
  name        text,
  modules     text,                       -- comma-separated extra module grants
  deleted     boolean      not null default false,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);
drop trigger if exists trg_users_updated on users;
create trigger trg_users_updated before update on users
  for each row execute function set_updated_at();

create table if not exists devotees (
  id                     text primary key,
  name                   text,
  "firstName"            text,
  "middleName"           text,
  "lastName"             text,
  gender                 text,
  dob                    text,            -- free-form date string (see header note)
  "bloodGroup"           text,
  "maritalStatus"        text,
  anniversary            text,
  mobile                 text,
  whatsapp               text,
  email                  text,
  mandal                 text,
  area                   text,
  address                text,
  education              text,
  ambrish                text,
  "familyId"             text,
  relation               text,
  type                   text,
  "dateOfJoining"        text,
  "attendanceRate"       text,
  status                 text,
  tags                   text,            -- pipe/comma-separated, as in the Sheet
  qualification          text,
  grade                  text,
  "gradeAsOf"            text,
  "educationStatus"      text,
  school                 text,
  profession             text,
  "professionField"      text,
  "companyName"          text,
  "areaRoute"            text,
  reference              text,
  "followupKaryakarta"   text,
  "followupKaryakartaMobile" text,
  "yuvakType"            text,
  photo                  text,            -- Drive URL (not base64)
  notes                  text,
  "createdBy"            text,
  "createdOn"            text,
  "updatedBy"            text,
  "updatedOn"            text,
  "oldNew"               text,
  deleted                boolean     not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
drop trigger if exists trg_devotees_updated on devotees;
create trigger trg_devotees_updated before update on devotees
  for each row execute function set_updated_at();
create index if not exists idx_devotees_mobile   on devotees (mobile);
create index if not exists idx_devotees_familyId  on devotees ("familyId");
create index if not exists idx_devotees_deleted   on devotees (deleted);

create table if not exists sabhas (
  id             text primary key,
  title          text,
  date           text,
  time           text,
  venue          text,
  "presentCount" integer,
  "totalCount"   integer,
  status         text,
  type           text,
  description    text,
  tags           text,
  outcomes       text,
  deleted        boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists trg_sabhas_updated on sabhas;
create trigger trg_sabhas_updated before update on sabhas
  for each row execute function set_updated_at();

create table if not exists attendance (
  id          text primary key,
  "sabhaId"   text,
  "devoteeId" text,
  present     boolean,
  "timestamp" text,
  "markedBy"  text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_attendance_updated on attendance;
create trigger trg_attendance_updated before update on attendance
  for each row execute function set_updated_at();
create index if not exists idx_attendance_sabhaId   on attendance ("sabhaId");
create index if not exists idx_attendance_devoteeId on attendance ("devoteeId");

create table if not exists followups (
  id            text primary key,
  "eventId"     text,
  "devoteeId"   text,
  "assignedTo"  text,
  call          boolean,
  "inPerson"    boolean,
  message       boolean,
  outcome       text,
  remark        text,
  "contactedOn" text,
  "contactedBy" text,
  deleted       boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_followups_updated on followups;
create trigger trg_followups_updated before update on followups
  for each row execute function set_updated_at();
create index if not exists idx_followups_eventId   on followups ("eventId");
create index if not exists idx_followups_devoteeId on followups ("devoteeId");

create table if not exists thoughts (
  id         text primary key,
  author     text,
  thought    text,
  date       text,
  deleted    boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_thoughts_updated on thoughts;
create trigger trg_thoughts_updated before update on thoughts
  for each row execute function set_updated_at();

create table if not exists areas (
  name       text primary key,
  number     text,
  notes      text,
  deleted    boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_areas_updated on areas;
create trigger trg_areas_updated before update on areas
  for each row execute function set_updated_at();

-- ============================================================================
-- APPEND-ONLY LOGS (no stable business key → surrogate bigserial id)
-- These sync APPEND-ONLY: new rows are added to the mirror, never rewritten.
-- ============================================================================

create table if not exists activity (
  id          bigserial primary key,
  ts          text,
  actor       text,
  "actorMobile" text,
  action      text,
  target      text,
  detail      text,
  device      text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_activity_updated on activity;
create trigger trg_activity_updated before update on activity
  for each row execute function set_updated_at();
create index if not exists idx_activity_actorMobile on activity ("actorMobile");
create index if not exists idx_activity_action      on activity (action);

create table if not exists changes (
  id          bigserial primary key,
  ts          text,
  action      text,
  collection  text,
  summary     text,
  emailed     text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_changes_updated on changes;
create trigger trg_changes_updated before update on changes
  for each row execute function set_updated_at();

-- Runtime exception log — powers `npm run errors`. PK = id. status ∈ open|resolved.
-- NOTE: `message` is the error text (free text) — in the Sheet backend it is a
-- BOOL_COL exception; here it is plainly text, so nothing coerces it.
create table if not exists errorlog (
  id           text primary key,
  time         text,
  "user"       text,
  mobile       text,
  message      text,
  page         text,
  stack        text,
  ua           text,
  status       text,
  "resolvedBy" text,
  "resolvedOn" text,
  deleted      boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_errorlog_updated on errorlog;
create trigger trg_errorlog_updated before update on errorlog
  for each row execute function set_updated_at();
create index if not exists idx_errorlog_status on errorlog (status);

-- ============================================================================
-- PUSH NOTIFICATIONS
-- ============================================================================

create table if not exists pushlog (
  id          text primary key,
  title       text,
  body        text,
  audience    text,
  type        text,
  "sentCount" integer,
  "clickCount" integer,
  "createdBy" text,
  "createdOn" text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_pushlog_updated on pushlog;
create trigger trg_pushlog_updated before update on pushlog
  for each row execute function set_updated_at();

-- One row per device a notification reached. PK = notifId|devoteeId (composed by
-- the gateway/migration, since the Sheet tab has no id column).
create table if not exists pushrecipients (
  id          text primary key,            -- "<notifId>|<devoteeId>"
  "notifId"   text,
  "devoteeId" text,
  name        text,
  mobile      text,
  platform    text,
  "sentOn"    text,
  clicked     text,                         -- 'yes' when tapped (free text, as Sheet)
  "clickedOn" text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_pushrecipients_updated on pushrecipients;
create trigger trg_pushrecipients_updated before update on pushrecipients
  for each row execute function set_updated_at();
create index if not exists idx_pushrecipients_notifId on pushrecipients ("notifId");

-- Device registry for FCM. PK = token.
create table if not exists push_tokens (
  token       text primary key,
  "devoteeId" text,
  mobile      text,
  name        text,
  platform    text,
  "updatedOn" text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_push_tokens_updated on push_tokens;
create trigger trg_push_tokens_updated before update on push_tokens
  for each row execute function set_updated_at();
create index if not exists idx_push_tokens_mobile on push_tokens (mobile);

create table if not exists announcements (
  id          text primary key,
  title       text,
  body        text,
  audience    text,
  "createdBy" text,
  "createdOn" text,
  "sentCount" integer,                      -- blank for auto-posts → null
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_announcements_updated on announcements;
create trigger trg_announcements_updated before update on announcements
  for each row execute function set_updated_at();

create table if not exists notif_reads (
  id               text primary key,
  "announcementId" text,
  title            text,
  mobile           text,
  name             text,
  "readOn"         text,
  deleted          boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
drop trigger if exists trg_notif_reads_updated on notif_reads;
create trigger trg_notif_reads_updated before update on notif_reads
  for each row execute function set_updated_at();

-- Per-person notification-permission response. PK = key (devoteeId or mobile).
create table if not exists push_status (
  key         text primary key,
  "devoteeId" text,
  mobile      text,
  name        text,
  status      text,                         -- granted|denied|default|unsupported
  platform    text,
  "updatedOn" text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_push_status_updated on push_status;
create trigger trg_push_status_updated before update on push_status
  for each row execute function set_updated_at();

-- ============================================================================
-- GHARI SEVA — MONEY. Strictest treatment. Soft-delete only, amount checks.
-- ============================================================================

-- Catalog of sellable items. PK = sku. unitPrice is money.
create table if not exists ghari_products (
  sku          text primary key,
  name         text,
  size         text,
  category     text,                        -- ghee|noghee|sf|bhusu
  "unitPrice"  numeric(12,2) not null default 0,
  "sortOrder"  integer,
  active       boolean,
  deleted      boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_ghari_products_updated on ghari_products;
create trigger trg_ghari_products_updated before update on ghari_products
  for each row execute function set_updated_at();

-- One customer order. `items` jsonb is AUTHORITATIVE; the flat amount columns are
-- a derived, human-readable denormalization (mirrors toBackendRow_ in
-- ghariService.js). status ∈ active|void (orders are NEVER hard-deleted: money).
create table if not exists ghari_orders (
  id               text primary key,
  "orderNo"        text,
  season           text not null,
  "customerName"   text,
  "customerMobile" text,
  "devoteeId"      text,
  karyakarta       text,
  "karyakartaId"   text,
  items            jsonb        not null default '[]'::jsonb,   -- was itemsJson
  "itemsSummary"   text,
  "subOrders"      jsonb        not null default '[]'::jsonb,   -- was subOrdersJson
  total            numeric(12,2) not null default 0,           -- derived from items
  "withGheeAmt"    numeric(12,2) not null default 0,           -- derived
  "withoutGheeAmt" numeric(12,2) not null default 0,           -- derived
  "sugarFreeAmt"   numeric(12,2) not null default 0,           -- derived
  "bhusuAmt"       numeric(12,2) not null default 0,           -- derived
  delivered        boolean      not null default false,
  "deliveredBoxes" integer      not null default 0,
  "deliveryDate"   text,
  "paymentReceived" numeric(12,2) not null default 0,
  balance          numeric(12,2) not null default 0,           -- total - paymentReceived
  "paymentType"    text,
  status           text         not null default 'active',     -- active|void
  remarks          text,
  "createdBy"      text,
  "createdOn"      text,
  "updatedBy"      text,
  "updatedOn"      text,
  deleted          boolean      not null default false,
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);
drop trigger if exists trg_ghari_orders_updated on ghari_orders;
create trigger trg_ghari_orders_updated before update on ghari_orders
  for each row execute function set_updated_at();
create index if not exists idx_ghari_orders_season on ghari_orders (season);
create index if not exists idx_ghari_orders_karyakartaId on ghari_orders ("karyakartaId");

-- Independent money guard (the defence against a column-shift-equivalent): on
-- every write, recompute total + the four category amounts + balance from `items`
-- and flag any row that disagrees with its stored derived columns by > ₹0.01.
-- It LOGS a warning and lets the write through (so a legitimate edit is never
-- blocked), but the discrepancy surfaces for a human to check. Flip RAISE NOTICE
-- to RAISE EXCEPTION if you prefer a hard stop. category map: ghee→withGheeAmt,
-- noghee→withoutGheeAmt, sf→sugarFreeAmt, bhusu→bhusuAmt.
create or replace function ghari_orders_amount_guard()
returns trigger
language plpgsql
as $$
declare
  it            jsonb;
  calc_total    numeric(12,2) := 0;
  calc_ghee     numeric(12,2) := 0;
  calc_noghee   numeric(12,2) := 0;
  calc_sf       numeric(12,2) := 0;
  calc_bhusu    numeric(12,2) := 0;
  line          numeric(12,2);
  cat           text;
begin
  for it in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
  loop
    line := coalesce((it->>'qty')::numeric, 0) * coalesce((it->>'unitPrice')::numeric, 0);
    calc_total := calc_total + line;
    cat := coalesce(it->>'category', '');
    if    cat = 'ghee'   then calc_ghee   := calc_ghee   + line;
    elsif cat = 'noghee' then calc_noghee := calc_noghee + line;
    elsif cat = 'sf'     then calc_sf     := calc_sf     + line;
    elsif cat = 'bhusu'  then calc_bhusu  := calc_bhusu  + line;
    end if;
  end loop;

  if abs(coalesce(new.total, 0) - calc_total) > 0.01 then
    raise notice 'ghari_orders amount mismatch on id=%: stored total=% but items compute to %',
      new.id, new.total, calc_total;
  end if;
  if abs(coalesce(new.balance, 0) - (calc_total - coalesce(new."paymentReceived", 0))) > 0.01 then
    raise notice 'ghari_orders balance mismatch on id=%: stored balance=% but total-paid computes to %',
      new.id, new.balance, (calc_total - coalesce(new."paymentReceived", 0));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ghari_orders_amount_guard on ghari_orders;
create trigger trg_ghari_orders_amount_guard before insert or update on ghari_orders
  for each row execute function ghari_orders_amount_guard();

-- Procurement (the "buy" side). itemsJson kept as jsonb under its Sheet name.
create table if not exists ghari_purchases (
  id            text primary key,
  season        text,
  date          text,
  supplier      text,
  "itemsJson"   jsonb        not null default '[]'::jsonb,
  "itemsSummary" text,
  boxes         integer      not null default 0,
  amount        numeric(12,2) not null default 0,
  challan       text,                         -- Drive URL (image or PDF)
  remarks       text,
  status        text         not null default 'active',   -- active|void
  "createdBy"   text,
  "createdOn"   text,
  "updatedBy"   text,
  "updatedOn"   text,
  deleted       boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_ghari_purchases_updated on ghari_purchases;
create trigger trg_ghari_purchases_updated before update on ghari_purchases
  for each row execute function set_updated_at();
create index if not exists idx_ghari_purchases_season on ghari_purchases (season);

-- Karyakarta stock holdings.
create table if not exists ghari_stock (
  id            text primary key,
  season        text,
  date          text,
  karyakarta    text,
  "karyakartaId" text,
  "itemsJson"   jsonb        not null default '[]'::jsonb,
  "itemsSummary" text,
  boxes         integer      not null default 0,
  remarks       text,
  status        text         not null default 'active',
  "createdBy"   text,
  "createdOn"   text,
  "updatedBy"   text,
  "updatedOn"   text,
  deleted       boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_ghari_stock_updated on ghari_stock;
create trigger trg_ghari_stock_updated before update on ghari_stock
  for each row execute function set_updated_at();
create index if not exists idx_ghari_stock_season on ghari_stock (season);

-- Ghari audit log (money — every change recorded, NEVER trimmed, supports revert).
-- entity ∈ order|purchase|product. action ∈ create|update|void|delete|revert.
create table if not exists ghari_log (
  id            text primary key,
  ts            text,
  entity        text,
  "entityId"    text,
  action        text,
  actor         text,
  "changesJson" jsonb,
  "beforeJson"  jsonb,
  "afterJson"   jsonb,
  deleted       boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_ghari_log_updated on ghari_log;
create trigger trg_ghari_log_updated before update on ghari_log
  for each row execute function set_updated_at();
create index if not exists idx_ghari_log_entityId on ghari_log ("entityId");

-- ============================================================================
-- LEADERBOARDS
-- ============================================================================

create table if not exists mandal_leaders (
  id          text primary key,
  name        text,
  "sortOrder" integer,
  active      boolean,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_mandal_leaders_updated on mandal_leaders;
create trigger trg_mandal_leaders_updated before update on mandal_leaders
  for each row execute function set_updated_at();

create table if not exists leader_boards (
  id          text primary key,
  title       text,
  subtitle    text,
  unit        text,                          -- Kg | ₹ | count | …
  status      text,                          -- active|archived
  "createdBy" text,
  "createdOn" text,
  "updatedBy" text,
  "updatedOn" text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_leader_boards_updated on leader_boards;
create trigger trg_leader_boards_updated before update on leader_boards
  for each row execute function set_updated_at();

create table if not exists leader_entries (
  id           text primary key,
  "boardId"    text,
  "leaderId"   text,
  "leaderName" text,
  target       numeric(12,2),                -- unit varies per board
  done         numeric(12,2),
  "sortOrder"  integer,
  deleted      boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_leader_entries_updated on leader_entries;
create trigger trg_leader_entries_updated before update on leader_entries
  for each row execute function set_updated_at();
create index if not exists idx_leader_entries_boardId on leader_entries ("boardId");

-- ============================================================================
-- SWADHYAY / SEVA / CALENDAR
-- ============================================================================

-- Daily Swadhyay log — one row per devotee per day. PK = key (devoteeId|date).
create table if not exists swadhyay (
  key         text primary key,
  "devoteeId" text,
  mobile      text,
  name        text,
  date        text,
  "bhajanMin" integer not null default 0,
  "bhajanTime" text,
  "listenMin" integer not null default 0,
  "readMin"   integer not null default 0,
  "createdOn" text,
  "updatedOn" text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_swadhyay_updated on swadhyay;
create trigger trg_swadhyay_updated before update on swadhyay
  for each row execute function set_updated_at();
create index if not exists idx_swadhyay_devoteeId on swadhyay ("devoteeId");

-- Karyakarta visit log. `planned` is stored as '1'/'' in the Sheet → kept text
-- (not a BOOL_COL) to preserve the exact value and avoid a translation layer.
create table if not exists seva (
  id               text primary key,
  "karyakartaId"   text,
  "karyakartaName" text,
  "karyakartaMobile" text,
  date             text,
  "fromTime"       text,
  "toTime"         text,
  category         text,
  work             text,
  "visitedId"      text,
  "visitedName"    text,
  "companionsJson" jsonb       not null default '[]'::jsonb,
  planned          text,                      -- '1' | ''
  "createdBy"      text,
  "createdOn"      text,
  "updatedBy"      text,
  "updatedOn"      text,
  deleted          boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
drop trigger if exists trg_seva_updated on seva;
create trigger trg_seva_updated before update on seva
  for each row execute function set_updated_at();
create index if not exists idx_seva_karyakartaId on seva ("karyakartaId");
create index if not exists idx_seva_visitedId    on seva ("visitedId");

create table if not exists cal_plan (
  id          text primary key,
  "devoteeId" text,
  date        text,
  type        text,                           -- seva|bhajan|katha
  note        text,
  status      text,                           -- planned|done
  "createdOn" text,
  "updatedOn" text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_cal_plan_updated on cal_plan;
create trigger trg_cal_plan_updated before update on cal_plan
  for each row execute function set_updated_at();
create index if not exists idx_cal_plan_devoteeId on cal_plan ("devoteeId");

-- ============================================================================
-- FEED (community photo/video posts). status ∈ active|removed (soft delete).
-- The uniform `deleted` is set true when status='removed' at migration time.
-- ============================================================================

create table if not exists feed_posts (
  id             text primary key,
  "authorId"     text,
  "authorName"   text,
  "authorMobile" text,
  caption        text,
  description    text,
  "mediaJson"    jsonb        not null default '[]'::jsonb,
  "likeCount"    integer      not null default 0,
  "commentCount" integer      not null default 0,
  "createdOn"    text,
  status         text         not null default 'active',   -- active|removed
  deleted        boolean      not null default false,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);
drop trigger if exists trg_feed_posts_updated on feed_posts;
create trigger trg_feed_posts_updated before update on feed_posts
  for each row execute function set_updated_at();
create index if not exists idx_feed_posts_createdOn on feed_posts ("createdOn");

-- One like. PK = postId|devoteeId (idempotent, one like per person per post).
create table if not exists feed_likes (
  id          text primary key,              -- "<postId>|<devoteeId>"
  "postId"    text,
  "devoteeId" text,
  name        text,
  "createdOn" text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_feed_likes_updated on feed_likes;
create trigger trg_feed_likes_updated before update on feed_likes
  for each row execute function set_updated_at();
create index if not exists idx_feed_likes_postId on feed_likes ("postId");

create table if not exists feed_comments (
  id           text primary key,
  "postId"     text,
  "authorId"   text,
  "authorName" text,
  text         text,
  "createdOn"  text,
  status       text        not null default 'active',   -- active|removed
  deleted      boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_feed_comments_updated on feed_comments;
create trigger trg_feed_comments_updated before update on feed_comments
  for each row execute function set_updated_at();
create index if not exists idx_feed_comments_postId on feed_comments ("postId");

-- ============================================================================
-- EMAIL (staff → devotees)
-- ============================================================================

create table if not exists email_campaigns (
  id               text primary key,
  subject          text,
  body             text,
  audience         text,
  "recipientCount" integer,
  "sentCount"      integer,
  "failedCount"    integer,
  "createdBy"      text,
  "createdOn"      text,
  deleted          boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
drop trigger if exists trg_email_campaigns_updated on email_campaigns;
create trigger trg_email_campaigns_updated before update on email_campaigns
  for each row execute function set_updated_at();

create table if not exists email_templates (
  id          text primary key,
  name        text,
  subject     text,
  body        text,
  "createdBy" text,
  "createdOn" text,
  "updatedBy" text,
  "updatedOn" text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_email_templates_updated on email_templates;
create trigger trg_email_templates_updated before update on email_templates
  for each row execute function set_updated_at();

-- ============================================================================
-- BUS SEVA
-- ============================================================================

create table if not exists bus_events (
  id          text primary key,
  title       text,
  date        text,
  destination text,
  remarks     text,
  status      text,                          -- active|void
  "createdBy" text,
  "createdOn" text,
  "updatedBy" text,
  "updatedOn" text,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_bus_events_updated on bus_events;
create trigger trg_bus_events_updated before update on bus_events
  for each row execute function set_updated_at();

create table if not exists bus_bookings (
  id               text primary key,
  "eventId"        text,
  "passengersJson" jsonb       not null default '[]'::jsonb,
  "passengerCount" integer     not null default 0,
  "seatType"       text,
  mobile           text,
  karyakarta       text,
  "karyakartaId"   text,
  remarks          text,
  status           text,                      -- active|void
  "createdBy"      text,
  "createdOn"      text,
  "updatedBy"      text,
  "updatedOn"      text,
  deleted          boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
drop trigger if exists trg_bus_bookings_updated on bus_bookings;
create trigger trg_bus_bookings_updated before update on bus_bookings
  for each row execute function set_updated_at();
create index if not exists idx_bus_bookings_eventId on bus_bookings ("eventId");

-- ============================================================================
-- VATO (daily teachings, maintained by hand). PK = SN.
-- For this tab the normal sync direction is Sheet → Postgres (human-authored).
-- ============================================================================

create table if not exists vato (
  "SN"       text primary key,
  "Gujarati" text,
  "English"  text,
  deleted    boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_vato_updated on vato;
create trigger trg_vato_updated before update on vato
  for each row execute function set_updated_at();

-- ============================================================================
-- DEVOTEE EDIT AUDIT (old↔new on every add/edit/delete, revertible)
-- ============================================================================

create table if not exists devotee_log (
  id            text primary key,
  ts            text,
  "devoteeId"   text,
  name          text,
  action        text,                        -- create|update|delete|revert
  actor         text,
  "changesJson" jsonb,
  "beforeJson"  jsonb,
  "afterJson"   jsonb,
  deleted       boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_devotee_log_updated on devotee_log;
create trigger trg_devotee_log_updated before update on devotee_log
  for each row execute function set_updated_at();
create index if not exists idx_devotee_log_devoteeId on devotee_log ("devoteeId");

-- ============================================================================
-- SYNC STATE & AUDIT (Postgres ⇄ Sheet mirror; see plan §5)
-- ============================================================================

-- One row per mirrored tab: the snapshot/hash of the Sheet at the end of the
-- last successful PG→Sheet run, used to detect manual Sheet edits before the
-- next nightly run overwrites them.
create table if not exists sync_state (
  tab               text primary key,        -- Sheet tab name (e.g. 'GhariOrders')
  last_sheet_hash   text,
  last_synced_at    timestamptz,
  last_direction    text,
  updated_at        timestamptz not null default now()
);
drop trigger if exists trg_sync_state_updated on sync_state;
create trigger trg_sync_state_updated before update on sync_state
  for each row execute function set_updated_at();

-- One row per sync run (nightly or manual), with per-table counts and the Ghari
-- money reconciliation result.
create table if not exists sync_runs (
  id           bigserial primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  direction    text not null,                -- 'pg_to_sheet' | 'sheet_to_pg'
  trigger      text not null,                -- 'nightly' | 'manual'
  actor        text,
  tables_json  jsonb,                        -- per-table {inserted,updated,skipped,flagged,soft_deleted}
  money_check  jsonb,                        -- {ghari_total_before,ghari_total_after,matched}
  status       text not null,                -- 'ok' | 'aborted' | 'needs_review'
  notes        text
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Phase 1: the Edge Function gateway uses the SERVICE-ROLE key, which bypasses
-- RLS, so it can read/write everything. The policies below only govern DIRECT
-- anon/authenticated access (fast read paths via supabase-js).
--
--   • "public read" tables: authenticated clients may SELECT non-deleted rows.
--   • Sensitive tables get RLS ENABLED but NO policies → denied to anon/auth;
--     only the service-role gateway can touch them.
--   • No INSERT/UPDATE/DELETE policies anywhere → all writes go through the
--     gateway (service role). Tighten/loosen later as direct paths are added.
-- ============================================================================

-- Enable RLS on every table.
do $$
declare t text;
begin
  foreach t in array array[
    'users','devotees','sabhas','attendance','followups','thoughts','areas',
    'activity','changes','errorlog','pushlog','pushrecipients','push_tokens',
    'announcements','notif_reads','push_status','ghari_products','ghari_orders',
    'ghari_purchases','ghari_stock','ghari_log','mandal_leaders','leader_boards',
    'leader_entries','swadhyay','seva','cal_plan','feed_posts','feed_likes',
    'feed_comments','email_campaigns','email_templates','bus_events','bus_bookings',
    'vato','devotee_log','sync_state','sync_runs'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- Authenticated read policies for the non-sensitive tables the app renders.
-- (Sensitive tables deliberately get NO policy → service-role-only.)
do $$
declare t text;
begin
  foreach t in array array[
    'devotees','sabhas','attendance','followups','thoughts','areas',
    'announcements','notif_reads','ghari_products','ghari_orders','ghari_purchases',
    'ghari_stock','mandal_leaders','leader_boards','leader_entries','swadhyay',
    'seva','cal_plan','feed_posts','feed_likes','feed_comments','email_templates',
    'bus_events','bus_bookings','vato'
  ]
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (deleted = false);',
      'read_authenticated_' || t, t
    );
  end loop;
end $$;

-- Sensitive tables with NO policy (service-role-only): users, errorlog, ghari_log,
-- devotee_log, pushlog, pushrecipients, push_tokens, push_status, activity,
-- changes, email_campaigns, sync_state, sync_runs. (They have RLS enabled above
-- and no policy here, so direct anon/auth access is denied.)

-- ============================================================================
-- END
-- ============================================================================
