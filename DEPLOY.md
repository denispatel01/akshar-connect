# Akshar Connect — Deployment

## 1. Frontend → GitHub Pages (test on iPhone Safari)

The app is configured to host at **https://denispatel01.github.io/akshar-connect/**
(Vite `base: '/akshar-connect/'`). The workflow `.github/workflows/deploy.yml` builds on
every push to `main` and publishes `dist/` to the **`gh-pages`** branch — which is already
your repo's Pages source, so **no settings change is needed**.

Watch progress in the repo's **Actions** tab. When it finishes, open on your iPhone Safari:

> https://denispatel01.github.io/akshar-connect/

To install as an app: Safari **Share → Add to Home Screen** — it uses the Akshar Connect
temple icon and opens full-screen.

Admin login: mobile **9924598434**, PIN **17853**.

## 2. Backend → Google Apps Script (via clasp)

The backend lives in `google-apps-script/` (`Code.gs` + `appsscript.json`).

> The app's `dataService.js` points at your existing deployed Web App URL. To keep that
> same URL working, redeploy the **same** deployment (don't create a new one), otherwise
> update `API_URL` in `src/services/dataService.js` with the new `/exec` URL and rebuild.

**Using clasp** — already configured (`.clasp.json` holds the real Script ID, and the
live web-app deployment id is recorded below). To ship a backend change:
```bash
cd google-apps-script
clasp push -f                     # uploads Code.gs + appsscript.json
clasp deploy -i AKfycbw-LyYduU1mUaXwamTGPyh_TtP6pZkO3pTCPPGKMQOhUwJhFa_Z4wFzz83FYXnq9YqAnA -d "your note"
```
That redeploys the **existing** web-app deployment, so the `/exec` URL in `dataService.js`
never changes. (`clasp deployments` lists them; the one above is the live one, `@HEAD` is a test.)
If clasp isn't logged in on a new machine: `clasp login` (opens Google OAuth in the browser).

**Or without clasp:** open the Apps Script editor, paste the contents of `Code.gs`, Save,
then **Deploy → Manage deployments → (edit the existing one) → Version: New version → Deploy**.

### After redeploying the backend
- The new sheet columns (`tags`, education/profession fields, `Followups` tab, `Sabhas.type`)
  are created automatically on the next app load (non-destructive migration).
- The admin account **9924598434 / 17853** is auto-ensured on load.
- To push the merged 561-devotee dataset into the live sheet: log in as admin →
  **Admin Settings → Devotee Database → “Load merged data into live database”**.
