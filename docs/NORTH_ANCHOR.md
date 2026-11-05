# North Anchor v2 — Anthro Collect (Spec-Driven Build)

Nov 5, 2026 · @Ryan Tangu Mbun Tangwe

## How this works and how you stay in the loop

This document is the single source Claude Code builds from: it turns each section into a file in the repo, then writes code only against those files. Nothing reaches the live app unless tests pass and you approve it.

Your part in every feature:

1. **Approve the spec.** Claude Code writes `specs/F#-name.md` and stops. You read it (5 minutes) and reply "approved" or with changes.
2. **Answer questions.** Claude Code never reads the database or guesses; it asks you, and logs your answer in `DISCUSSION.md`.
3. **Test the preview.** Each pull request gets a preview link and a numbered phone test script. You run it on an Android phone and an iPhone.
4. **Approve the merge.** You say "merge it". CI tests run again and only a green build deploys.

What Claude Code reports after every task, in this order: what changed, tests added and passing, security checks done, what you need to decide, what to test on the phone. If any line is missing, ask for it.

## Mission (becomes `docs/MISSION.md`)

Build a free-to-run field app that lets tailors and field agents in Ghana record consent, tape measurements and face-blurred photos for about 900 participants, for a student research project at Ashesi University that trains a model to estimate body measurements from photos.

Success means:

- A collector with a short walkthrough completes one participant in 15 to 20 minutes (checked in the pilot).
- About 900 consented participants: roughly 360 adult women, 315 adult men, 225 children, with a wide spread of heights and sizes.
- Every complete record holds consent, tape measurements in cm, and two or three face-blurred photos.
- No unblurred face is ever stored or uploaded, and no name sits beside photos or measurements.
- Total running cost is zero.

Principles, in priority order: consent first; privacy and security built in from day one; never lose data (offline first); easy enough for a local tailor; free services only; accurate tape ground truth over volume.

Out of scope for now: app-store release, payments, the model itself, any public dataset release.

## Tech stack (becomes `docs/TECH_STACK.md`)

One PWA, one Cloudflare Worker, one Supabase project; anything new needs a `DISCUSSION.md` entry and your approval first.

| Layer | Choice | Why |
| --- | --- | --- |
| App | Vite + React + TypeScript, Tailwind | Small bundle, fast on low-cost Android; you already know React |
| Install | PWA (`vite-plugin-pwa`), shared as a link | Android and iPhone from one link, no store review |
| Offline storage | IndexedDB via Dexie | Survives no signal and app restarts |
| Face blur | MediaPipe face detector, files self-hosted | Runs on the phone, works offline |
| Hosting + API | One Cloudflare Worker: static app + `/api/*` | Same origin (no CORS), one deploy, free static traffic |
| Photo storage | Cloudflare R2, two private buckets (photos, signatures) | 10 GB free, no keys on phones |
| Login + database | Supabase Auth (phone + 6-digit PIN) and Postgres with row-level security | Free tier, access rules enforced in the database |
| Tests | Vitest; Workers test pool; PGlite for database rules | Runs in CI without touching the real database |
| CI/CD | GitHub Actions → `wrangler deploy` | Only a green build deploys |

Login uses no email: the phone number becomes an internal username that is never mailed. Real SMS codes would need a paid provider.

## Spec files in the repo

Claude Code creates these from this document in the first session; after that, the files are the source of truth and this doc is the overview.

```
CLAUDE.md                 short entry point: "read POLICY.md, then the spec for the task"
POLICY.md                 rules that govern Claude Code (section below)
DISCUSSION.md             your decisions and answers, dated (section below)
docs/MISSION.md           purpose, success criteria, principles
docs/TECH_STACK.md        the stack table and what is not allowed
docs/ROADMAP.md           milestones with must-pass checklists
docs/SECURITY.md          principles → controls, threat model, per-feature checks
docs/TESTING.md           what is tested, where, coverage targets
specs/_TEMPLATE.md        the shape every feature spec follows
specs/F1-login.md … F8    one file per feature, written before its code
.github/workflows/ci.yml  tests + checks on every pull request
.github/workflows/deploy.yml  deploy on merge to main
.github/pull_request_template.md  the report Claude Code fills in
supabase/migrations/      database changes, applied only after your approval
```

Every feature spec (`specs/_TEMPLATE.md`) has: goal in one sentence, user story, screens, data written, acceptance criteria (testable), security requirements, tests to write, open questions for you, status (draft, approved, built, verified).

## Feature specs

Eight features, built in this order; each becomes a `specs/F#` file that you approve before any code is written.

| ID | Feature | Done when (acceptance) | Security built in |
| --- | --- | --- | --- |
| F1 | Login + install | Phone + 6-digit PIN logs in on Android Chrome and iPhone Safari; Add to Home Screen works; app opens offline after first load | No sign-up from the app; accounts made only by your admin script; rate-limited login; no email field |
| F2 | Home + settings + device self-check | Unit (cm/in) and app language set once; sync badge; 10-second camera/sensor/detector check saved with phone model | Collector can change only unit and language (column-level grant) |
| F3 | Practice mode | Practice participants clearly marked, flagged `is_practice`, excluded from every export | Database refuses real participants until you open collection after IRB approval |
| F4 | Participant + consent | Adult / under-18 path; consent in EN/FR/TW with English always shown; two required ticks; signature; guardian + child assent; "capture later"; receipt code | Names only in `consents`; collectors can write but never read consents; later screens locked until consent exists |
| F5 | Measurements | One per screen, number pad, skip, inch ⅛ buttons, stores typed value + unit + cm, plausibility warning | Input validated on phone and by database checks |
| F6 | Camera + face blur | Level lock (pitch 90±1.5°, roll ±1°), silhouette guide, 3-second auto-shutter, front + side (+ back optional) | Detector blur plus fixed head-zone blur before saving; raw frame never stored; EXIF stripped by re-encoding |
| F7 | Offline sync + upload | Queue uploads in order with retries; badge shows waiting/synced; local copy deleted only after server confirms; Wi-Fi-only switch | Worker checks login and ownership before every write to R2; size and type limits; no storage keys on phones |
| F8 | Admin + export | Progress and coverage views; export script makes images, `measurements.csv` (cm), `metadata.json` per participant | Admin role checked in the database; export skips practice, rejected and consent data; weekly backup |

Cut order if time runs short: back photo, then Wi-Fi switch, then bilingual labels on optional measurements. Never cut: consent, face blur, offline saving, security checks.

## Roadmap (becomes `docs/ROADMAP.md`)

Eight milestones in order, each one pull request per feature; real collection starts only after Gate A (tool test) and Gate B (IRB approval).

&#91;embedded content: roadmap · 8 milestones, 2 gates\]

Must-pass checks. A box is ticked only after you test it on a phone.

**M0 Setup + CI**

- [ ] Spec files from this doc merged
- [ ] CI runs on a pull request: typecheck, tests, audit, secret scan, build
- [ ] Deploy waits for your approval, then the live URL returns `/api/health` OK
- [ ] First migration applied with row-level security; deny tests pass in CI
- [ ] You exist as the admin collector

**M1 Login (F1)**

- [ ] Phone + PIN login works on Android and iPhone; wrong PIN shows a plain message
- [ ] Installs to the Home Screen; opens offline

**M2 Home + practice (F2, F3)**

- [ ] Unit, language, sync badge, self-check saved
- [ ] Practice records marked and refused as real data while collection is closed

**M3 Consent (F4)**

- [ ] Adult and under-18 paths, three languages, signature, receipt code
- [ ] Works fully in airplane mode; collectors can't read consents back

**M4 Measurements (F5)**

- [ ] Number pad, skip, inch ⅛, plausibility warnings; cm stored

**M5 Camera + blur (F6)**

- [ ] Level lock and auto-shutter on a low-cost Android first
- [ ] Blur confirmed on 20 test photos; no raw frame stored

**M6 Offline sync (F7)**

- [ ] App killed mid-upload loses nothing and duplicates nothing
- [ ] Worker refuses another collector's participant (tested)

**M7 Admin + export (F8)**

- [ ] Progress and coverage views; export skips practice and consents; one backup done

**Gate A: tool test**

- [ ] 5 practice participants reach Supabase and R2 from 2 Android phones and 1 iPhone
- [ ] Unit conversion checked against a real tape

**Gate B: IRB approval**

- [ ] IRB approval received; consent text frozen as v1
- [ ] You switch `collection_open` on; collectors created and trained

## Security by design (becomes `docs/SECURITY.md`)

Security runs inside every feature, not after it: each spec lists its security requirements, each pull request reports them, and CI blocks a merge when a check fails.

| Principle | What it means here |
| --- | --- |
| Least privilege | Collectors see only their own participants; they can change only unit and language; the Supabase secret key lives only on your laptop; the Cloudflare deploy token can deploy Workers and nothing else; Claude Code has no database access |
| Fail-safe defaults | Real collection is off until you switch it on; buckets are private; any unknown `/api` route returns 404; a failed auth or ownership check denies; a failed upload keeps the local copy |
| Defence in depth | Face blur twice (detector + fixed head zone); validation on the phone, in the Worker and in database checks; access enforced by both the Worker and row-level security |
| Complete mediation | Every `/api` request re-checks the login token and participant ownership; nothing is trusted from an earlier request |
| Separation of duties | Claude Code writes code; CI tests it; you approve merges and database changes; only the deploy workflow ships |
| Data minimisation (privacy by design) | No email or phone for participants; names only in the restricted consent table; EXIF removed; photos cropped to what training needs |
| Economy of mechanism | One Worker, one database, no extra services; less code means fewer holes |
| Secure secrets handling | Secrets only in GitHub/Cloudflare secret stores or `.env.admin`; a secret scanner runs on every push |
| Psychological acceptability | PIN and big buttons, so collectors don't write passwords down or share phones unlocked |
| Audit and accountability | Every row stores who created it and when; Worker logs kept; weekly export and backup |

Threats we design against (short list, reviewed each milestone):

- **Stolen or shared phone:** PIN login, session can be revoked by resetting the PIN, no names stored on the phone after sync.
- **One collector reading another's data:** row-level security, tested in CI.
- **Leaked key:** only public keys in the app; secret scanner; rotate keys if a scan ever fires.
- **Unblurred face uploaded:** blur happens before the image exists as a file; a test fails the build if the raw frame is passed to storage.
- **Fake uploads or oversized files:** Worker checks token, ownership, content type and size.
- **Vulnerable package:** `npm audit` and Dependabot in CI.

Per-feature security checklist (every pull request): inputs validated; access checked server-side; no secrets in code; no personal data in logs; tests cover the deny path, not only the allow path.

## Unit tests and quality (becomes `docs/TESTING.md`)

Every feature ships with its tests in the same pull request, and CI refuses a merge if any test fails or coverage of the core logic drops below 80%.

| What | Tool | Examples of what is tested |
| --- | --- | --- |
| App logic (`src/lib`) | Vitest | inch → cm conversion, plausibility warnings, phone number normalising, receipt codes, sync order and retry |
| Offline queue | Vitest + fake IndexedDB | nothing deleted before server confirms; app killed mid-upload loses nothing and duplicates nothing |
| Worker (`/api`) | Vitest Workers pool | no token → 401; someone else's participant → 403; wrong file type or too large → rejected; unknown route → 404 |
| Database rules | PGlite (in-memory Postgres) | collector A can't see B's data; collectors can't read consents; no real participant before IRB switch; no self-promotion to admin |
| Screens | React Testing Library | consent screen blocks "Next" until both boxes are ticked; skip works; Practice label shows |
| Phones | Your test script per PR | Android low-cost, Android mid-range, iPhone; online and airplane mode |

Tests always include the deny case (what must be refused), because that is where security bugs hide. Database rule tests run on an in-memory copy, so neither CI nor Claude Code ever touches real data.

## CI/CD setup

GitHub Actions tests every pull request and deploys `main` to Cloudflare only after the tests pass and you click Approve. Claude Code writes the workflow files; you do the 6 one-time clicks below.

**What runs, and when**

- On every pull request (`ci.yml`): install → typecheck → lint → unit tests with coverage → database-rule tests → `npm audit` (high and critical fail) → secret scan (gitleaks) → build → upload a preview version and post its link on the PR.
- On merge to `main` (`deploy.yml`): the same checks again, then waits for your approval, then `wrangler deploy`.
- Database changes are not in CI: Claude Code applies a migration with `supabase db push` only after you say yes in chat.

**Your one-time clicks**

1. **Cloudflare API token (least privilege).** Dashboard → My Profile → API Tokens → Create Token → Custom token. Permissions: Account → Workers Scripts → Edit, and Account → Account Settings → Read. Limit it to your account. Copy the token once.
2. **Account ID.** Dashboard → Workers & Pages → copy the Account ID on the right.
3. **GitHub secrets.** Repo → Settings → Secrets and variables → Actions → New repository secret: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Paste them there, never in a chat.
4. **Approval gate.** Repo → Settings → Environments → New environment `production` → tick Required reviewers → add yourself.
5. **Protect `main`.** Repo → Settings → Rules → Rulesets → New branch ruleset for `main`: require a pull request, require the `ci` status check to pass, block force pushes. Do this after the first CI run, so the `ci` check appears in the list.
6. **Dependabot.** Repo → Settings → Code security → turn on Dependabot alerts and security updates.

If you connected the repo to Cloudflare's own Git builds earlier, disconnect it (Worker → Settings → Builds → Disconnect), so the app isn't deployed twice. If the first deploy fails with a permissions error, add only the permission the error names to the token.

## POLICY.md — rules for Claude Code

These rules override convenience; when one blocks a task, Claude Code stops and asks rather than working around it.

**Process**

1. Spec first. No code for a feature until its `specs/F#` file is marked approved by Ryan.
2. One feature per branch and pull request. Never push to `main`; never merge without Ryan's "merge it".
3. Every change includes tests, deny cases included. Run all tests and the build before saying "done".
4. Fill in the pull request template: what changed, tests, security checks, decisions needed, phone test script.
5. Unsure about scope, wording, data or a trade-off? Ask Ryan, then record the answer in `DISCUSSION.md`. Never guess.

**Data and access**

6. Never read, query, export or inspect the live database or R2 buckets, and never ask for the Supabase secret key. When you need to know what's in the data, ask Ryan.
7. Database changes only as new files in `supabase/migrations/`, applied with `supabase db push` only after Ryan approves in chat. Never edit an applied migration.
8. Never put secrets in code, commits, logs or chat. Only public `VITE_*` values in the app.
9. Never log names, signatures, photos or phone numbers.

**Product rules**

10. Consent before any measurement or photo. No unblurred face leaves the camera function.
11. Names only in `consents`. Collectors log in with phone + PIN; never add an email field.
12. Offline first: write locally, sync later, delete locally only after the server confirms.
13. Free tier only; no new service or library without a `DISCUSSION.md` entry Ryan approved.
14. Never weaken a security control (row-level security, the IRB gate, auth checks, blur) to make a test or feature pass.

**Keeping Ryan in the loop**

15. Start each session by stating the current milestone, the next task and any open questions.
16. End each task with: done, tested, security checked, waiting on Ryan for …

## DISCUSSION.md — your decisions, dated

Every decision or answer you give lands here as one dated entry, newest first, so Claude Code and you can always see why something is the way it is. Each entry: date, topic, what was decided, why, and which spec or file it changed.

Starting entries (from the first North Anchor and our chats):

| Date | Topic | Decision | Why |
| --- | --- | --- | --- |
| 5 Nov | Process | Spec-driven build: mission, stack, specs, roadmap, policy, discussion log | Keep Claude Code on track; keep Ryan in control |
| 5 Nov | Security | Security runs in parallel with every feature, per the principles table | Not an afterthought |
| 5 Nov | Data access | Claude Code never reads the database; it asks Ryan | Least privilege, participant privacy |
| 5 Nov | Quality | Unit tests in every pull request; CI blocks merges on failure | Catch bugs before collectors do |
| 5 Nov | Deploy | GitHub Actions deploys only after tests pass and Ryan approves | Separation of duties |
| 1 Nov | Login | Phone + 6-digit PIN; no email for collectors or participants | Many collectors have no email; SMS codes cost money |
| 1 Nov | Sharing | PWA link for all phones; optional APK for Android; no app store | Store review takes too long |
| 1 Nov | Framing | Consent leads with "student research project at Ashesi"; one line notes possible future app use | Honest consent keeps the data reusable |
| 28 Oct | Scope | 900 participants: 5 agents × 120, 5 tailors × 60, plus spare collectors | Tailors see fewer people |
| 28 Oct | Units | Collector picks cm or inches once; database stores cm | Tapes differ |
| 28 Oct | Languages | Consent in EN/FR/TW; screens show English plus the chosen language | Not all Twi speakers read Twi |
| 28 Oct | Ethics | Real collection waits for IRB approval; team tests use Practice mode | Human-subject research |
| 27 Oct | Cost | Free services only: GitHub, Cloudflare, Supabase | No budget |

## Prompts to paste into Claude Code

Export this doc as Markdown, save it in your project folder as `docs/NORTH_ANCHOR.md`, then paste these prompts in order. You copy prompts, never code.

**1. Create the spec files (first session)**

```
Read docs/NORTH_ANCHOR.md. Using only what it says, create CLAUDE.md, POLICY.md,
DISCUSSION.md, docs/MISSION.md, docs/TECH_STACK.md, docs/ROADMAP.md,
docs/SECURITY.md, docs/TESTING.md, specs/_TEMPLATE.md and
.github/pull_request_template.md. Do not write app code yet.
List anything unclear as questions for me. Commit on a branch and open a PR.
```

**2. Scaffold + CI/CD (M0)**

```
Follow POLICY.md. Build milestone M0 from docs/ROADMAP.md: scaffold the stack in
docs/TECH_STACK.md, set up Vitest, the Workers test pool and PGlite rule tests,
and write .github/workflows/ci.yml and deploy.yml exactly as the CI/CD section
describes. Write the first migration with row-level security and its deny tests.
Ask before running supabase db push. Report in the PR template format.
```

**3. Each feature (repeat F1 → F8)**

```
Follow POLICY.md. Write specs/F<n>-<name>.md from the template and the
North Anchor. Stop and wait for my approval.
```

After you reply "approved":

```
Build F<n> to the approved spec with tests (deny cases included) and the
security checklist. Open a PR with the preview link and a phone test script.
```

**4. Start of any later session**

```
Read CLAUDE.md, POLICY.md, docs/ROADMAP.md and the last 5 DISCUSSION.md entries.
Tell me: current milestone, next task, open questions. Then wait.
```
