# Akshar Connect — Handoff & Pending Tasks

> Handoff for continuing development on another account. This file is self-contained:
> architecture, conventions, deploy steps, what's already built, and **detailed specs
> for everything still pending**. Read the "How things work" section before coding.

---

## 1. Project overview

**Akshar Connect** is a PWA for a Swaminarayan Mandal (Adajan, Surat) to manage devotees,
seva, daily spiritual practice, events, and announcements.

- **Frontend:** React + Vite + Tailwind CSS. Entry `src/main.jsx` → `src/App.jsx`.
- **Distribution:** Installed **PWA** (iOS + Android, Add to Home Screen). **No APK** — do
  not reintroduce APK-only features. Auto-deploys to **GitHub Pages** on every push to `main`
  (`.github/workflows/deploy.yml`).
- **Backend:** **Google Apps Script** web app (single file `google-apps-script/Code.gs`) backed
  by a Google Sheet. No other server. Deployed via **clasp**.
- **Push:** Firebase Cloud Messaging (web push). Firebase project `akshar-connect-625b6`.
- **Repo:** github.com/denispatel01/akshar-connect (branch `main`).

### Roles
`user.role` ∈ `Admin` | `Sevak` | `Devotee`. Admin sees everything. Sevak = karyakarta staff.
Devotee = regular member (sees mostly their own family + personal modules).

---

## 2. How things work (READ FIRST)

### Frontend data layer
- All data access goes through **`src/services/dataService.js`** (devotees, auth, announcements,
  push, swadhyay, seva, calendar plans, etc.). It talks to the backend via `api(action, payload)`
  (POST text/plain JSON to the `/exec` URL) and caches in `localStorage`.
- `src/services/ghariService.js` — the Ghari Seva module's own offline-queue service.
- Pages live in `src/pages/*.jsx`; shared components in `src/components/*.jsx`.
- Routing is a simple switch in `src/App.jsx` on `activePage` (no router lib). Nav items are in
  `src/components/Navbar.jsx` (desktop `allNavItems`, mobile `primaryMobile` 3 tabs + a `Menu`
  hamburger whose list = all nav items minus the primary ones).

### Backend (Google Apps Script)
- `Code.gs` has a `HEADERS` object (one entry per sheet tab = column order), a `SCHEMA_VERSION`
  string, and `handle_(p)` which dispatches on `p.action`. To add a feature:
  1. Add a `HEADERS.<Tab>` array.
  2. Bump `SCHEMA_VERSION` (forces `ensureSheets_` to create/migrate tabs once).
  3. Add the tab name to the array inside `ensureSheets_`.
  4. Add `doX_(p)` handler functions and route them in `handle_` (`if(action==='x') return doX_(p);`).
- Helpers: `tab_(name)`, `readAll_(name)`, `appendRows_(name, arr)`, `findRow_(name, keyField, val)`,
  `rowFromObj_(name, obj)`, `json_(obj)`. Follow the existing patterns.

### Deploy process (IMPORTANT — keeps the same URL)
Backend deploy, run from `google-apps-script/`:
```
npx clasp push -f
npx clasp deploy --deploymentId AKfycbw-LyYduU1mUaXwamTGPyh_TtP6pZkO3pTCPPGKMQOhUwJhFa_Z4wFzz83FYXnq9YqAnA --description "<what changed>"
```
- `deploymentId` above == the `/exec` id in `API_URL` (in `src/services/dataService.js`). **Never**
  run a bare `clasp deploy` (it makes a NEW url and breaks the app).
- Apps Script id: `1GLXaTVufgSoOtPn-n6FULEDrmV53Z3epPWTMkzVZzWwkj1OL5UKkJ3y6`.
- **Drive/FCM/trigger permissions are human-only:** new Google scopes (Drive, outbound fetch,
  time-based triggers) require the owner to run a function once in the Apps Script editor and click
  "Allow". Provide those instructions; you cannot grant them programmatically.
- Frontend: just `git push` to `main` → GitHub Action builds & deploys to Pages. Verify locally
  with `npx vite build` before every commit.

### Conventions
- Commit + push to `main` after each logical change (the owner wants this; no asking). End commit
  messages with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Keep UI modern, mobile-first, quick to use (big tap targets, chips/steppers over dropdowns for
  small option sets). Tailwind tokens used: `bg-surface`, `bg-bg-base`, `text-text-main`,
  `text-text-muted`, `border-border-light`, `text-primary` / `bg-primary` (navy), `#FF862A` (saffron accent).
- Dark mode is supported — use the tokens, add `dark:` variants where needed.
- Test backend endpoints with a quick Node `fetch` to the `/exec` URL (see examples in git history).
- The backend web app is `ANYONE_ANONYMOUS` — do NOT leave destructive/admin endpoints deployed;
  add them temporarily, use, then remove and redeploy (pattern used before for setup endpoints).

### Identity helper (used by personal modules)
To get the current user's devotee record / id on a page:
```js
const me = dataService.getDevotees().find(d => d.id === user.devoteeId
  || String(d.mobile).replace(/\D/g,'').slice(-10) === String(user.mobile).replace(/\D/g,'').slice(-10));
const devoteeId = me?.id || user?.devoteeId || user?.mobile || '';
```

---

## 3. Already built (DONE — for context, do not redo)

- **Ghari Seva** module (purchases/orders; challan photo+PDF upload to Drive).
- **Profile photos** → background upload to Google Drive (only the URL stored in the sheet).
- **Devotees directory** — search, filters (areas/karyakartas/references/qualifications as
  dropdowns; gender/age/members/old-ref-new as quick chips), grid/table views, profile detail
  with **collapsible sections**, QR, add/edit wizard.
- **Default gender filter**: non-admins browsing the directory default to their own gender
  (search or explicit chip overrides; Admin sees everyone). Family details always show all.
- **Family IDs**: sequential `FAM###` (contiguous FAM001…FAM201); new family heads get `FAM{max+1}`.
- **Dashboard** stat cards incl. Ambrish, **Sahradyi** (mutually exclusive with Ambrish),
  Karyakarta (male) and **Female Karyakarta** (separate), Old, Families, Birthdays.
- **Push notifications** (FCM web push, no APK) — fully working & tested on iOS. Admin
  **Announcements** (send/edit/delete) + **Notification permission report** (who allowed/rejected).
  "Enable Notifications" button in My Account (iOS-safe, gesture-triggered).
- **Admin page** restructured into tabs: Announcements · Users · Areas · Notifications · System.
  **Area Master** redesigned (search, number badges, drag reorder).
- **Swadhyay** module — daily Bhajan (chanting) / Shravan (listening) / Vanchan (reading) minutes,
  modern UI (chips + steppers + typeable), date switcher for back-dating, streak + 7-day chart,
  **daily reminder push** (configurable hour via Script property `swadhyayHour`, default 22 = 10 PM).
- **Seva** module (Sevak/Admin) — log a visit: whose home (devotee picker), date, from/to time,
  type, what was done, **companions** (multiple co-sevaks). Reflected on every involved profile
  (visited devotee, karyakarta, and each companion) in a collapsible Seva section (full date + AM/PM).
- **Calendar** module — month view (prev/next), per-day planned/done Seva·Bhajan·Katha dots
  (combines Swadhyay + Seva + a `CalPlan` store), day sheet to plan/mark-done, month summary.
- **PWA auto-update** — silent, loop-guarded (reload at most once per session).
- **Nav** — mobile bottom bar = 3 tabs + hamburger Menu (scrollable).
- **Data Quality** module (Admin) — profile-completeness scoring + buckets, list
  sorted 100%→low with missing-field chips (tap → profile), search + quick filters
  (incomplete / missing mobile / missing DOB), duplicate detection (shared mobile,
  name+DOB, name+family) with opt-in per-record delete + confirm, and insights
  (health score, gender split, per-area coverage). Client-side; delete via `remove`.
- **Feed** module (everyone) — Instagram-style posts: photos (downscaled) + camera +
  short video, caption + description, multi-media (≤6), likes, comments, author/admin
  delete, "load more". Media on Drive (`feed-media`); only URLs in the sheet.
  **Video note:** shipped via Drive upload capped at 25 MB (short clips). Firebase
  Storage for longer video is deferred — add later if the owner enables Storage.

### Backend sheet tabs that exist
`Users, Devotees, Sabhas, Attendance, Followups, Thoughts, Areas, Activity, Changes,
GhariProducts, GhariOrders, GhariPurchases, PushTokens, Announcements, PushStatus,
Swadhyay, Seva, CalPlan`.

---

## 4. ~~PENDING~~ manual steps the OWNER must do

1. ✅ **DONE (2026-10-11) — Schedule the Swadhyay reminder at 10 PM.** In the Apps Script editor
   (`script.google.com/d/1GLXaTVufgSoOtPn-n6FULEDrmV53Z3epPWTMkzVZzWwkj1OL5UKkJ3y6/edit`):
   function dropdown → **`installSwadhyayReminder`** → Run → approve the time-trigger permission.
   (It reads Script property `swadhyayHour`, default 22. To change the hour: set that property and
   re-run the function.) Until this is run, the daily reminder does not fire.

---

## 5. ~~PENDING~~ ✅ DONE MODULE A — Data Quality / Review module (admin)

> Built & deployed (src/pages/DataQualityPage.jsx, admin-only, in the hamburger Menu).
> Spec below kept for reference.

**Goal:** help the admin complete every devotee profile. A data-oriented, fully-functional,
bug-free module to review profile completeness and clean duplicates. **Admin-only.**

### Where it goes
- New page `src/pages/DataQualityPage.jsx`, route `activePage === 'data'` in `App.jsx`, nav entry
  (Admin only) in `Navbar.jsx` (goes into the hamburger Menu). Icon suggestion: `Database` or `ClipboardCheck`.
- No backend change needed for completeness/duplicates (compute client-side from
  `dataService.getDevotees()`). Deletion uses the EXISTING `remove` action
  (`api('remove', { collection:'Devotees', keyField:'id', key })`) — or `dataService.deleteDevotee`
  if present; otherwise add a thin wrapper. Deleting must be **opt-in per record, never automatic**.

### 5.1 Profile completeness
- Define a weighted list of "profile fields that matter" (reuse the field list from the devotee
  schema / profile sections). Suggested core fields: name, gender, dob, mobile (or marked
  no-phone), area, familyId, type/relation, yuvakType, address; plus satsang fields.
- Compute each devotee's completeness **%** = filled core fields / total core fields.
- **Summary cards:** count of profiles that are 100%, 80–99%, 50–79%, 20–49%, <20%.
- **List, sorted DESCENDING by completeness** (100% first) — the owner explicitly asked for this
  order. Each row: name, area, % with a progress bar, and the **missing fields** as small chips.
  Tapping a row opens that devotee's profile/edit (reuse the existing profile overlay / wizard) so
  they can fill gaps immediately.
- Add a quick filter: "show only incomplete (<100%)", and a search box.
- Also surface **missing mobile** count and **missing DOB** count (these block self-login — see
  the login section). A one-tap filter to each.

### 5.2 Duplicate detection (opt-in delete)
- Detect **possible duplicates** by:
  - same normalized mobile (last 10 digits) across different records (excluding intentional
    family-shared numbers — show them grouped so the admin can judge),
  - very similar names (normalize: lowercase, strip honorifics "bhai"/"ben"/"kumar", collapse
    spaces) + same DOB or same mobile,
  - exact same name + same familyId.
- Show duplicate **groups** (2+ records) as cards. Each card lists the records with their key
  fields (name, mobile, dob, area, familyId, createdOn). Admin picks which to **keep** and which to
  **delete**; **require an explicit confirm** before deleting. **Never auto-delete.**
- After deletion, refresh the list. Deletion goes through the normal sync (`remove`).

### 5.3 Nice-to-have insights (add if time; owner invited suggestions)
- Area coverage (devotees per area; areas with 0 numbered), tag coverage, gender split,
  old/new/reference split, records with no family linked, records missing createdBy, etc.
- A "data health score" headline number.

### Acceptance
- Loads fast (compute from already-cached devotees; don't block render).
- Sorted completeness list 100%→low with missing-field chips.
- Duplicate groups with manual keep/delete + confirm.
- Admin-only; no crashes on empty/odd data.

---

## 6. ~~PENDING~~ ✅ DONE MODULE B — Feed module (Instagram-style)

> Built & deployed (src/pages/FeedPage.jsx, everyone, in the hamburger Menu). Media
> on Drive (`feed-media`); backend tabs FeedPosts/FeedLikes/FeedComments + actions.
> Video shipped via Drive (≤25 MB); Firebase Storage deferred. Spec below for reference.

**Goal:** a social Feed where devotees post **photos / short videos** with a **caption +
description**, visible to everyone. Modern, quick to post.

### ⚠️ Decision needed first: media storage
- **Photos:** store on **Google Drive** via the existing pattern (`dataService.uploadChallan`
  uploads a data-URI to Drive and returns a URL; or add an analogous `uploadFeedMedia`). Downscale
  images client-side before upload (see `downscaleImage_` in `GhariPage.jsx`).
- **Videos:** Google Apps Script is a **poor fit for video** (base64 through GAS caps at tens of MB
  and is slow/unreliable). Options:
  - **(Recommended)** Use **Firebase Storage** (same `akshar-connect-625b6` project; free tier, then
    low cost). Upload directly from the browser with the Firebase JS SDK (already a dependency:
    `firebase`), get a download URL, store only the URL. Requires enabling Storage in the Firebase
    console + security rules (owner step).
  - Or: **photos-only v1** (ship now, no new infra), add video later.
  - Confirm with the owner which path before building video.

### Data model (backend)
- `HEADERS.FeedPosts = ['id','authorId','authorName','authorMobile','caption','description',
  'mediaJson','createdOn','status']` where `mediaJson` = JSON array of `{type:'image'|'video', url}`.
  `status` ∈ `active|removed` (soft delete).
- Optional `HEADERS.FeedLikes` / `FeedComments` if you add likes/comments (phase 2).
- Actions: `createPost`, `getFeed` (paginated, newest first, status=active), `deletePost`
  (author or admin), and media upload (`uploadFeedMedia` to Drive, or Firebase Storage client-side).

### Frontend
- `src/pages/FeedPage.jsx`, route `activePage === 'feed'`, nav entry for everyone (hamburger Menu).
- Composer: capture/choose photo or video, caption (short), description (longer), post button.
  Optimistic add. Show upload progress for video.
- Feed list: cards with author, media (image or `<video controls>`), caption, description, time.
  Author/admin can delete. Infinite scroll or "load more".
- Phase 2 (optional): likes, comments, report/moderation (admin remove).

### Acceptance
- Everyone can post photos (+ video if Firebase Storage chosen) with caption + description.
- Feed shows newest first, media renders, author/admin can delete.
- Media stored off-sheet (URLs only in the sheet).

---

## 7. PENDING — smaller polish / verify (optional)

- Verify the **PWA infinite-loading fix** on a real device (reload-once-per-session guard in
  `main.jsx`). If any device is still stuck: remove PWA from home screen & re-add (clears SW).
- Consider adding **Swadhyay admin report** (who logged, streaks) and **Calendar** entry points
  from the dashboard.
- The 348 devotees missing mobile/DOB can't self-login — the Data Quality module's missing-field
  filters should make fixing them easy (ties modules A + login together).

---

## 8. Quick-start commands

```bash
# install
npm install

# dev build / verify before every commit
npx vite build

# backend deploy (from google-apps-script/, keep the same deploymentId!)
cd google-apps-script
npx clasp push -f
npx clasp deploy --deploymentId AKfycbw-LyYduU1mUaXwamTGPyh_TtP6pZkO3pTCPPGKMQOhUwJhFa_Z4wFzz83FYXnq9YqAnA --description "msg"

# frontend: git push to main auto-deploys to GitHub Pages
git add -A && git commit -m "..." && git push origin main
```

**Live backend URL (API_URL in src/services/dataService.js):**
`https://script.google.com/macros/s/AKfycbw-LyYduU1mUaXwamTGPyh_TtP6pZkO3pTCPPGKMQOhUwJhFa_Z4wFzz83FYXnq9YqAnA/exec`
