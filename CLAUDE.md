# Anthro Collect — start here

Anthro Collect is a **student research project at Ashesi University**: a free-to-run field app
that lets tailors and field agents in Ghana record consent, tape measurements and face-blurred
photos for about 900 participants. Every screen, consent text, README and message frames the
work this way.

## Every session

1. Read [POLICY.md](POLICY.md). Its rules override convenience; when one blocks a task, stop and ask Ryan.
2. Read [docs/ROADMAP.md](docs/ROADMAP.md) and the last 5 entries in [DISCUSSION.md](DISCUSSION.md).
3. State the current milestone, the next task and any open questions.
4. For a feature, read its `specs/F#-*.md`. No spec marked **approved** → write it from
   [specs/_TEMPLATE.md](specs/_TEMPLATE.md) and stop.

**Branches and pull requests only.** Never push to `main`; never merge without Ryan's "merge it".

## Fixed decisions (changed only by Ryan, via DISCUSSION.md)

- **Login:** phone number + 6-digit PIN. **No email anywhere** — no email field, login, recovery
  or participant email. In code the phone becomes a hidden, email-shaped login id
  (`233XXXXXXXXX@phone.anthro-collect.invalid`, see `src/lib/phone.ts`) that is never shown and
  never mailed. Accounts are created only by Ryan's admin script; the app has no sign-up.
- **Sharing:** PWA link for Android (Chrome) and iPhone (Safari), Add to Home Screen.
  No app store, no APK.
- **Stack:** see [docs/TECH_STACK.md](docs/TECH_STACK.md). One PWA, one Cloudflare Worker
  (static app + `/api/*` → private R2), one Supabase project (Auth + Postgres with RLS).

## Docs

[docs/MISSION.md](docs/MISSION.md) · [docs/TECH_STACK.md](docs/TECH_STACK.md) ·
[docs/ROADMAP.md](docs/ROADMAP.md) · [docs/SECURITY.md](docs/SECURITY.md) ·
[docs/TESTING.md](docs/TESTING.md) · full plan [docs/NORTH_ANCHOR.md](docs/NORTH_ANCHOR.md)

## Commands

- `npm run dev` — Vite dev server (app only)
- `npm run lint` · `npm run typecheck`
- `npm test` — all tests (app logic, Worker, database rules on in-memory PGlite)
- `npm run test:coverage` — tests with the 80% coverage gate
- `npm run build` — typecheck + build the PWA into `dist/`
- `npm run preview:worker` — build, then run app + `/api` with `wrangler dev`
- `npm run check:worker` — `wrangler deploy --dry-run`

## Reporting

End each task in the [pull request template](.github/pull_request_template.md) order: what changed;
tests added and passing; security checks done; what Ryan needs to decide; phone test script.
