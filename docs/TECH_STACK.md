# Tech stack

One PWA, one Cloudflare Worker, one Supabase project. Anything new needs a `DISCUSSION.md` entry
and Ryan's approval first.

| Layer | Choice | Why |
| --- | --- | --- |
| App | Vite + React + TypeScript, Tailwind | Small bundle, fast on low-cost Android |
| Install | PWA (`vite-plugin-pwa`), shared as a link | Android and iPhone from one link, no store review |
| Offline storage | IndexedDB via Dexie | Survives no signal and app restarts |
| Face blur | MediaPipe face detector, files self-hosted | Runs on the phone, works offline |
| Hosting + API | One Cloudflare Worker: static app + `/api/*` | Same origin (no CORS), one deploy, free static traffic |
| Photo storage | Cloudflare R2, two private buckets (photos, signatures) | 10 GB free, no keys on phones |
| Login + database | Supabase Auth (phone + 6-digit PIN via hidden login id) and Postgres with row-level security | Free tier, access rules enforced in the database |
| Tests | Vitest; Workers test pool; PGlite for database rules | Runs in CI without touching the real database |
| Lint | ESLint + typescript-eslint | Catch mistakes before review |
| CI/CD | GitHub Actions → `wrangler deploy` | Only a green build deploys |

## Login without email

Collectors type their phone number and 6-digit PIN. In code (`src/lib/phone.ts`) the phone is
normalised to `+233…` and turned into a hidden, email-shaped login id
`233XXXXXXXXX@phone.anthro-collect.invalid`, which Supabase's password login uses. The `.invalid`
domain is reserved and can never receive mail. Supabase's native phone (SMS) provider is **not**
used: real SMS codes need a paid provider.

Supabase dashboard settings this relies on: Email provider on, **Confirm email off**,
**Allow new users to sign up off**, minimum password length 6. Accounts are created only by the
admin script with the secret key from `.env.admin` on Ryan's laptop.

## Not allowed

- Any paid service or paid tier.
- Any second backend, database, storage service or analytics/tracking service.
- Native app builds, app-store releases or APKs.
- Supabase phone/SMS auth, email auth that sends mail, social login.
- Secret keys (Supabase secret/service-role key, R2 access keys) in the app, the Worker code or the repo.
- New libraries without an approved `DISCUSSION.md` entry.

## Versions pinned on purpose

- TypeScript `~6.0`: typescript-eslint does not support TypeScript 7 yet.
