# Edge Function API gateway (`api`)

`functions/api/index.ts` is a faithful port of the `handle_()` action router in
`google-apps-script/Code.gs`, running on Supabase Edge Functions (Deno) against Postgres
instead of the Google Sheet. It keeps the **exact** request/response contract the frontend
already uses, so moving the new app onto it is a one-line change in
`src/services/dataService.js`:

```js
const API_URL = "https://<project>.supabase.co/functions/v1/api";
```
(plus sending the Supabase anon key as the `Authorization: Bearer <anon-key>` header — the
retry/`text/plain` logic in `api()` stays as-is).

## What it does

- Same `{ action, ...payload }` envelope, same JSON replies (`{ ok:false, error }` on
  failure) → the Ghari offline outbox, `hydrateSync`/`bootstrap`, and caching all keep
  working unchanged.
- **JSON translation:** the schema stores blobs as `jsonb` (and renames the Ghari order
  blobs `itemsJson→items`, `subOrdersJson→subOrders`). The gateway serializes them back to
  the exact string fields the client expects on the way out, and parses on the way in.
- **Soft deletes:** `remove` / Ghari / Bus deletes set `deleted = true`; nothing is hard
  deleted. Reads filter `deleted = false`.
- **Authorization preserved:** Ghari ledger writes need Admin or the `ghari` module;
  delivery/payment marks need any known user; user management needs Admin; Bus writes need
  Admin/Sevak/`bus` — all checked against the `users` table via `actorMobile`, exactly as
  the Sheet backend did.
- **Audit log:** every Ghari write records a `ghari_log` row with before/after snapshots
  (revert supported); devotee add/edit/delete records a `devotee_log` row.

## Phase-1 stubs (return a clear `ok:false`, never a silent wrong success)

These need external services and are wired in a later phase; the client already falls back
gracefully (e.g. keeps the local data URI when an upload returns no URL):

| Action(s) | Needs |
|---|---|
| `sendEmail` | an email provider (Resend / SMTP) |
| `sendPush`, `sendFollowupReminder`, push on `createAnnouncement` | FCM |
| `uploadPhoto`, `uploadChallan`, `uploadFeedMedia` | Supabase Storage |
| `getGroupAttendance` | the external attendance Google Sheet |
| `backupNow` | a backup target |

Sheet-only repair/inspection actions (`realignGhariOrders`, `repairGhariShift`,
`ghariRawDump`, `classifyOldNew`, …) return a clear "not part of the Postgres gateway".

## Auth note (phase 1 keeps it same-to-same)

Login stays client-side exactly as today: `bootstrap`/`getUsers` return the `users` rows and
the app matches mobile + PIN/DOB in `dataService.login()`. Moving verification server-side
with hashed PINs + a JWT (plan §8) is a later hardening step — deferred so the clone behaves
identically to the live app first.

## Deploy

```bash
# one time
supabase link --project-ref <ref>

# deploy the function (it does its own actor checks, so skip the platform JWT gate)
supabase functions deploy api --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform automatically —
no secrets to set for the gateway itself.

## Local type-check

```bash
deno check docs/supabase/functions/api/index.ts
```
