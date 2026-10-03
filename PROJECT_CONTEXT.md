# Akshar Connect — Project Context & Handoff

_Last updated: 2026-10-03_

A PWA for the **Adajan Satsang Mandal** (Swaminarayan Hariprabodham Foundation, Surat)
to manage devotees, families, follow-up drives, events, tagging and reports.

---

## 1. Tech stack & architecture

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite, Tailwind, lucide-react icons, SheetJS (`xlsx`, lazy-loaded) |
| Hosting | **GitHub Pages** (repo `denispatel01/akshar-connect`), auto-deployed from `main` via `.github/workflows/deploy.yml` → `gh-pages` |
| Live URL | https://denispatel01.github.io/akshar-connect/ (base path `/akshar-connect/`) |
| Backend | **Google Apps Script** web app (`google-apps-script/Code.gs`) over a Google Sheet |
| Backend deploy | via **clasp** — redeploy the SAME deployment id to keep the `/exec` URL stable |
| Data cache | `localStorage` (`ac-db` cache, `ac-session` session) |

### Backend specifics
- Script ID + live deployment id are in `google-apps-script/.clasp.json` / `DEPLOY.md`.
- Live web-app deployment id: `AKfycbw-LyYduU1mUaXwamTGPyh_TtP6pZkO3pTCPPGKMQOhUwJhFa_Z4wFzz83FYXnq9YqAnA`
- `dataService.js` `API_URL` points at that deployment's `/exec`. **Redeploy the same id** on backend changes so the URL never changes.
- Sheet tabs: `Users`, `Devotees`, `Sabhas`, `Attendance`, `Followups`, `Thoughts`,
  `Areas`, `Activity`, `Changes` (+ `*_bak_*` backups). `SCHEMA_VERSION` is
  `2026-10-04c`. `Areas` = `name|number|notes` (keyed by `name`); `Activity` =
  `ts|actor|actorMobile|action|target|detail|device` (app-wide audit log).
  Devotees gained a `grade` column; audit columns are ordered
  `createdBy|createdOn|updatedBy|updatedOn`.

### ⚠️ Email requires one-time owner authorization
`MailApp.sendEmail` needs the `script.send_mail` OAuth scope. The web app was
first authorized before mail was added, so sends fail silently. **Fix (owner, once):**
open the Apps Script editor → run the `testMail` function → approve the permission
prompt (includes "Send email as you"). After that, add/edit/delete emails flow.
Diagnose anytime via `?action=testMail` (returns `sent:true` / the real error).

### Admin login
- Mobile `9924598434`, PIN `170853` (admin seed: "Denis Patel" / role Admin).

---

## 2. Deploy workflow (how to ship)

**Frontend:** commit + push to `main` → GitHub Actions builds and publishes to Pages
(~1–2 min). Verify by checking the `assets/index-*.js` hash changes at the live URL.

**Backend (Apps Script):**
```
cd google-apps-script
clasp push --force
clasp deploy --deploymentId AKfycbw-...YqAnA -d "note"
```
Then hit any action (e.g. `?action=bootstrap`) once to run `ensureSheets_` migrations.

**Tooling note:** this dev machine intermittently loses Git / Node / GitHub-CLI from
`C:\Program Files` between sessions — reinstall via `winget` (`Git.Git`,
`OpenJS.NodeJS.LTS`, `GitHub.cli`). `clasp` is a global npm package at
`%APPDATA%\npm`. Git credentials are stored in Git Credential Manager; `gh` was
authed once via device flow.

---

## 3. Data model notes

- **Family model:** a devotee is either a **head** (`type: 'Primary'`, their own family)
  or a **member** (`type: 'Family'`, `familyId` → the head's family, `relation` set).
  "Family head = `type === 'Primary'`" is the single definition used **everywhere**
  (dashboard Families count = directory family-head count).
- **Family ID** auto-generated from a new head's own record id.
- Members **inherit** the head's address / area / city / follow-up karyakarta (and
  surname suggestion) on creation or when linked.
- Removed columns (do **not** re-add): `gharNo`, `wing`, `secondaryMobile`.
- `HEADERS.Devotees` order in `Code.gs` **must match the physical sheet column order**;
  `migrateHeaders_` rebuilds by column **name** (with a backup) when `SCHEMA_VERSION`
  is bumped. Never change header order without bumping `SCHEMA_VERSION`.

### ⚠️ Data-shift incident (resolved)
Manually deleting the `wing` column in the sheet while `HEADERS` still listed it caused
a one-column data shift. Fixed via `repairFromBackup_('Devotees_bak_<good>')`, which
rebuilds Devotees from a known-good backup **mapped by column name**. A
`Devotees_corrupt_*` safety tab was kept. **Lesson:** change columns only through
`HEADERS` + `SCHEMA_VERSION`, never by hand in the sheet.

---

## 4. Performance model (important)

Saves are **optimistic / local-first**: `addDevoteeAndSync` / `updateDevoteeAndSync` /
bulk tag ops update the local cache and **return immediately**, syncing to Apps Script
in the **background** (`push()` fire-and-forget with retry). The UI feels instant; the
sheet catches up a second later. Bulk tag edits use single batch endpoints
(`bulkUpdateTags`, `bulkSetTags`) instead of one request per devotee.

Backend was also sped up: the per-write blocking email was removed; `ensureSheets_`
migrates only once per `SCHEMA_VERSION` (gated via Script Properties).

**Known tradeoff:** if a background write fails and the app is closed immediately, that
one change can be lost. The robust long-term fix is **Fuller migration to Firestore**
(local-first + realtime + offline), which is free at this scale — deferred until asked.

---

## 5. Emails

- All app mail goes to **aksharconnect01@gmail.com** (`Code.gs`).
- On **add / edit / delete** a devotee, `logChange_` writes to the `Changes` tab **and**
  sends a notification email — **server-side, after** the optimistic client response, so
  the user never waits. Bulk tag ops do **not** email (protects the Gmail 100/day quota).
- Error emails (app crashes) also go to aksharconnect01@gmail.com.
- Optional hourly digest exists: run `setupChangeDigest_()` once in the Apps Script editor.

---

## 6. Feature inventory (what exists today)

### Navigation / roles
- Tabs: **Home, Divine Devotees, Follow-up, Reports, Email, Bulk Tags (Admin/Sevak),
  Family Tags (Admin), Admin (Admin)**. Devotees see Home + My Profile only.
- Mobile bottom nav + "More" sheet (toggle).

### Search (Devotees, Follow-up, Bulk Tagger) — **strict, not fuzzy**
- Matches a devotee's **own** First/Middle/Last name (word-prefix), **DOB**
  (`dd-MM-yyyy` / `dd-MM-yy`, also `/` `.`), and **mobile** (substring). Never
  karyakarta/reference/address. Clear (✕) icon on every search bar.

### Divine Devotees (directory)
- Full-width, responsive card grid (up to 5 cols on wide screens).
- **Multi-select filters:** Area, Karyakarta, Reference, Qualification, Age
  (Under 15 / 15–45 / Over 45), Gender, Membership, Old/Ref/New.
- **Tags** filter is a separate toggle section (not inside Filters).
- **Sort:** Default / Name A–Z / Recently joined / Oldest joined.
- **Export to Excel** (.xlsx) — order: SN, Full Name, Address, Mobile No, DOB,
  Follow-up Karyakarta, Reference, Yuvak Type, then all other fields. Respects filters.
- Print/PDF directory.

### Profile (full LinkedIn-style single scroll)
- Everything scrolls (no fixed header); floating close ✕; bottom Edit/Save bar.
- Header: cover, avatar (shows uploaded `photo`), headline, Call/WhatsApp, key facts,
  and Mobile/Address/Karyakarta/Reference.
- Section cards: Personal, Contact (Address first), Education & Profession (Field +
  Company; legacy Occupation removed), Satsang (family role), Family (members list +
  Family ID), System, Tags. Fields in 2–4 responsive columns.
- **Family role editor:** "Head of own family" (hides relation/head) vs "Member of a
  family" (searchable head picker + relation). No separate membership field.

### Add Devotee — **multi-step wizard**
- Steps: Basics → Details → Family & Satsang → Review, with progress bar.
- Live preview card, **duplicate detection** (mobile exact + first+last name),
  **smart family autofill** + surname suggestion, **photo upload** (auto square-crop),
  **Save & add another**. Mandal (Adajan) + created-by set automatically.
- iOS-friendly searchable dropdowns (Area/Karyakarta/Reference).

### Follow-up (event drives)
- Event list + full-screen Add/Edit Event form (Title, Date, Time, Venue, Type
  [Sabha/Seva/Event/Padhramani/Samaiyo/Karyakarta Sabha/Shibir], Description, Devotee
  tags).
- Drive board: summary chips, search (name/DOB/mobile), **karyakarta filter**
  (auto-selects signed-in karyakarta), tags filter, pending-only, "N of total" count.
  Selecting an event's tags pre-filters the roster.

### Bulk Tagger (Admin/Sevak)
- One devotee per screen, swipe/←→, tap tags, one top "Save (N)", karyakarta filter.

### Admin
- Merged **System User Accounts** card: name, mobile, PIN, password (behind "Show
  credentials"), role, Edit/Delete (actions on a bottom row). Import, karyakarta
  reconcile, old/new classification, reference marking tools.

### Backend one-time/admin actions (in Code.gs)
- `syncFamilyFields` (flatten family address/karyakarta), `markReference`,
  `classifyOldNew`, `repairFromBackup`, diagnostics `peekHeaders` / `listTabs` /
  `peekTab`. (Consider removing diagnostics + repair after confirming stability.)

---

## 7. Pending / requested tasks (not yet done)

### Done 2026-10-04 (batch #58–#68) — frontend NOT yet pushed to `main`/Pages
- **#58** Add-wizard tags grouped by category with a "Select all" per section.
- **#59** Add-wizard Review step shows ALL entered details (not just a few).
- **#60** Emoji/icons pass across profile sections, admin cards, grid headers, etc.
- **#61** **Area Master** admin card (list all areas + devotee counts, assign a
  number, add/edit/delete). Backend `Areas` sheet deployed (@32). Area Route field
  already absent from the Add wizard.
- **#62** Profile System card shows Created by/on and (if edited) Updated by/on.
- **#63** Create-event shows a success toast and auto-opens the new event's drive.
- **#64** An event's audience tags are **locked** during follow-up (🔒, can't remove;
  can still add extra filter tags).
- **#65** System-user form is single-column: Name → Mobile → PIN → Password → Role
  (added a Password field).
- **#66** Mobile "More" sheet now closes reliably (sheet moved below the tab bar's
  z-index so the More button always receives the tap).
- **#67 Desktop redesign:** refined navbar (gradient accent + active pills); Darshan
  slider shows the full image (object-contain + blurred fill, wider aspect); Upcoming
  Birthdays in a responsive multi-col grid; Today's Inspiration full-width with the
  wallpaper below; Devotees **Grid (table, default) vs Cards** toggle (desktop), grid
  header sticky + body scrollable, remembered in `localStorage` (`ac-devotees-view`).
- **#68** `createdBy`/`updatedBy` now reliably stamped as `Name (mobile)` — the audit
  code had read a non-existent `ac-session` key (real key is `ac_session_v1`); fixed
  centrally via `actorLabel()` in `dataService.js`.

**⚠️ Next:** commit + push frontend to `main` so GitHub Pages rebuilds. Backend is
already deployed.

### Still pending
- **#51** Photo upload with **camera capture**; ask for photo at the **last** step.
- **#56** Make the Add form **colorful / extraordinary**.
- **#57** DOB manual typing + placeholder polish (date input already allows both).
- Make remaining small popups full-screen if desired (QR pass, notifications, Family
  Tags) — event form already converted.
- Profile "extraordinary" ideas offered: at-a-glance summary card, more quick actions
  (copy number / vCard / Maps), satsang timeline, inline per-field edit, cover upload.

---

## 8. Key files

| File | Purpose |
|------|---------|
| `src/pages/DevoteesPage.jsx` | Directory, filters, profile view/edit, export |
| `src/components/AddDevoteeWizard.jsx` | Multi-step add form |
| `src/pages/FollowupsPage.jsx` | Events + drive board |
| `src/pages/BulkTagPage.jsx` | Swipe bulk tagger |
| `src/pages/AdminPage.jsx` | Users + admin tools |
| `src/pages/DashboardPage.jsx` | Home dashboard |
| `src/services/dataService.js` | Data layer, optimistic sync, API calls |
| `src/services/devoteeSchema.js` | Field schema, tag (de)serialize, helpers |
| `src/services/tagCatalog.js` | Tag categories/catalog |
| `src/utils/search.js` | Strict search (`devoteeSearchText`, `scoreMatch`, dob forms) |
| `google-apps-script/Code.gs` | Backend: HEADERS, CRUD, migrations, emails |
| `DEPLOY.md` | Deploy instructions |

---

## 9. Gotchas / conventions

- **Optimistic writes** — don't re-add `await api(...)` to single CRUD; keep `push()`.
- **Column changes** — only via `HEADERS` + bump `SCHEMA_VERSION`; never edit sheet
  columns by hand (caused the data shift).
- **Transient 404s** from the Apps Script `/exec` are normal; the client retries.
- **Viewport** has `maximum-scale=1` to stop iOS zooming inputs on focus.
- Avatar/photo display uses `photo || avatar || generated-initials`.
- Backups: `migrateHeaders_` and repair create `Devotees_bak_*` / `Devotees_corrupt_*`
  tabs — safe to delete old ones once stable.
