# Anthro Collect

A field data app for a **student research project at Ashesi University**. Tailors and field
agents in Ghana use it to record consent, tape measurements and face-blurred photos. The data
trains a model that estimates body measurements from photos.

- **Install:** open the app link in Chrome (Android) or Safari (iPhone) → Add to Home Screen.
  It is a PWA; there is no app store version.
- **Login:** phone number + 6-digit PIN. No email. Accounts are created by the project admin.

Rules for contributors and Claude Code: [CLAUDE.md](CLAUDE.md). Full plan:
[docs/NORTH_ANCHOR.md](docs/NORTH_ANCHOR.md). Decisions: [DISCUSSION.md](DISCUSSION.md).

## Stack

Vite + React + TypeScript + Tailwind, `vite-plugin-pwa` · one Cloudflare Worker serving the app
and `/api/*` (uploads to private R2 buckets) · Supabase Auth + Postgres with row-level security.

## Develop

```bash
npm install
cp .env.example .env.local        # public Supabase URL + publishable key
cp .dev.vars.example .dev.vars    # same values for the Worker
npm run dev                       # app only
npm test                          # unit + Worker tests
npm run build                     # typecheck + build PWA into dist/
npm run preview:worker            # app + /api via wrangler dev
```

## Layout

```
src/            React PWA (src/lib = testable logic)
worker/         Cloudflare Worker: /api/health, PUT /api/photos|signatures/:participantId/:slot
supabase/migrations/   database schema + row-level security (applied only after approval)
docs/           plan and project docs
```
