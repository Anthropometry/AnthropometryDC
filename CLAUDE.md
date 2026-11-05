# Anthro Collect — rules for Claude Code

Anthro Collect is a **student research project at Ashesi University**. It is a free-to-run
field app that lets tailors and field agents in Ghana record consent, tape measurements and
face-blurred photos for about 900 participants. The data will train a model that estimates
body measurements from photos. Every screen, consent text, README and message frames the work
this way: a school research project at Ashesi University (consent may add one line about
possible future app use).

The full plan is `docs/NORTH_ANCHOR.md`. Decisions are logged in `DISCUSSION.md` (newest first).
Where this file and the plan disagree, this file and `DISCUSSION.md` win.

## Start of every session

1. State the current milestone (`docs/NORTH_ANCHOR.md` → Roadmap), the next task and any open questions.
2. Read the last 5 entries in `DISCUSSION.md`.
3. For a feature task, read its `specs/F#-*.md` file. No spec marked approved → write the spec and stop.

## Fixed decisions (changed only by Ryan)

- **Login:** collectors log in with **phone number + 6-digit PIN**. There is **no email anywhere**:
  no email field, no email login, no email recovery, no email for participants. Accounts are
  created only by Ryan's admin script; the app has no sign-up screen. Login is rate-limited.
- **Sharing:** the app is a **PWA shared as a link**, installed with Add to Home Screen on
  **Android (Chrome) and iPhone (Safari)**. No app store, no APK.
- **Stack:** Vite + React + TypeScript + Tailwind PWA (`vite-plugin-pwa`), Dexie for offline storage,
  MediaPipe face detector (self-hosted files). **One Cloudflare Worker** serves the static app and
  handles `/api/*` (uploads to two private R2 buckets: photos, signatures). **One Supabase project**
  for auth and Postgres with row-level security. Tests: Vitest, Workers test pool, PGlite.
  CI/CD: GitHub Actions → `wrangler deploy`.
- **Cost:** free tiers only (GitHub, Cloudflare, Supabase).
- **Units:** collector picks cm or inches once; the database stores cm (plus typed value and unit).
- **Languages:** consent in EN/FR/TW with English always shown alongside.
- **Ethics:** real collection is off until Ryan switches `collection_open` on after IRB approval;
  until then only Practice participants (`is_practice`) are accepted.

## Process

1. Spec first. No code for a feature until its `specs/F#` file is marked approved by Ryan.
2. One feature per branch and pull request. Never push to `main` and never merge without Ryan's
   "merge it" (the one-time initial scaffold push was approved by Ryan on 5 Nov 2026).
3. Every change includes tests, deny cases included. Run all tests and the build before saying "done".
4. Fill in the pull request template: what changed, tests, security checks, decisions needed,
   phone test script (Android low-cost, Android mid-range, iPhone; online and airplane mode).
5. Unsure about scope, wording, data or a trade-off? Ask Ryan, then record the answer in
   `DISCUSSION.md`. Never guess.

## Data and access

6. Never read, query, export or inspect the live database or R2 buckets, and never ask for the
   Supabase secret key. When you need to know what's in the data, ask Ryan.
7. Database changes only as new files in `supabase/migrations/`, applied with `supabase db push`
   only after Ryan approves in chat. Never edit an applied migration.
8. Never put secrets in code, commits, logs or chat. Only public `VITE_*` values in the app.
   Worker secrets go in `wrangler secret`/`.dev.vars`; admin secrets only in `.env.admin` on Ryan's laptop.
9. Never log names, signatures, photos or phone numbers.

## Product rules

10. Consent before any measurement or photo. No unblurred face leaves the camera function;
    blur twice (detector + fixed head zone), strip EXIF by re-encoding, never store the raw frame.
11. Names only in `consents`. Collectors can write consents but never read them back.
12. Offline first: write locally, sync later, delete locally only after the server confirms.
13. Free tier only; no new service or library without a `DISCUSSION.md` entry Ryan approved.
14. Never weaken a security control (row-level security, the IRB gate, auth checks, blur) to make
    a test or feature pass.

## Security checklist (every pull request)

Inputs validated (phone, Worker, database checks); access checked server-side (Worker re-checks
token and participant ownership on every `/api` request; RLS in the database); unknown `/api`
routes return 404; no secrets in code; no personal data in logs; tests cover the deny path.

## Reporting

End each task with, in this order: what changed; tests added and passing; security checks done;
what Ryan needs to decide; what to test on the phone.

## Commands

- `npm run dev` — Vite dev server (app only)
- `npm run build` — typecheck + build the PWA into `dist/`
- `npm test` — Vitest
- `npm run preview:worker` — build, then run the Worker locally with `wrangler dev`
- `npm run check:worker` — `wrangler deploy --dry-run` (no upload)
