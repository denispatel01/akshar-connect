# Akshar Connect — working notes for Claude

A PWA (React + Vite) with a Google Apps Script backend (`google-apps-script/Code.gs`)
that reads/writes a Google Sheet. The app is also packaged for Android via Capacitor.

## Exception log — pull real user errors and fix them

Runtime errors that real users hit are reported by the app
(`dataService.reportError` → backend `logError`), which now does two things:
1. **Emails** the admin (unchanged — `sendErrorEmail_`).
2. **Stores** the error in the `ErrorLog` sheet so it can be pulled in here.

**At the start of a debugging/working session, and whenever the user mentions a
bug or crash, run:**

```bash
npm run errors
```

This fetches the open errors (newest first), prints them with stack + context
(route, user, device), and saves a snapshot to `logs/errors.json` (gitignored).

- `npm run errors -- --all` — include already-resolved errors.
- `npm run errors -- --resolve <ERR-id>` — after you fix one, mark it resolved so
  it drops off the list. `--resolve all` clears them all.

Then diagnose from the stack/route, fix the source, and mark it resolved. The
backend endpoints are `getErrorLog` / `resolveError` in `Code.gs`; the fetch URL is
read from `src/services/dataService.js` (`API_URL`).

## Deploying the backend (human-only)

Backend changes to `Code.gs` do not take effect until it is pushed and the existing
deployment is redeployed (`clasp push` + redeploy the deploymentId). Drive/clasp
auth is human-only — **do not attempt to deploy; ask the user to do it.** New
`ErrorLog` features (`npm run errors`) only work after that redeploy.

## Commit & push

Commit and push to `main` after changes (no separate branch/PR needed unless asked).
