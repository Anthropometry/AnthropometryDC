# Security by design

Security runs inside every feature, not after it: each spec lists its security requirements, each
pull request reports them, and CI blocks a merge when a check fails.

## Principles → controls

| Principle | What it means here | Where it is enforced |
| --- | --- | --- |
| Least privilege | Collectors see only their own participants; they can change only unit and language; the Supabase secret key lives only on Ryan's laptop; the Cloudflare deploy token can deploy Workers and nothing else; Claude Code has no database access | RLS + column grants (`supabase/migrations`), token scope, POLICY.md §6 |
| Fail-safe defaults | Real collection is off until Ryan switches it on; buckets are private; any unknown `/api` route returns 404; a failed auth or ownership check denies; a failed upload keeps the local copy | `app_settings.collection_open` + trigger, `worker/index.ts` |
| Defence in depth | Face blur twice (detector + fixed head zone); validation on the phone, in the Worker and in database checks; access enforced by both the Worker and row-level security | F6, `worker/index.ts`, table `check` constraints |
| Complete mediation | Every `/api` request re-checks the login token and participant ownership; nothing is trusted from an earlier request | `worker/index.ts` |
| Separation of duties | Claude Code writes code; CI tests it; Ryan approves merges and database changes; only the deploy workflow ships | `ci.yml`, `deploy.yml` + `production` environment |
| Data minimisation | No email or phone for participants; names only in the restricted consent table; EXIF removed; photos cropped to what training needs | schema, F4, F6 |
| Economy of mechanism | One Worker, one database, no extra services | TECH_STACK.md |
| Secure secrets handling | Secrets only in GitHub/Cloudflare secret stores or `.env.admin`; a secret scanner runs on every push | gitleaks in CI, `.gitignore` |
| Psychological acceptability | PIN and big buttons, so collectors don't write passwords down or share phones unlocked | F1 |
| Audit and accountability | Every row stores who created it and when; Worker logs kept; weekly export and backup | `collector_id`/`created_at` columns, R2 `uploadedBy` metadata, F8 |

## Login without email

The phone number is mapped in code to a hidden login id on the reserved `.invalid` domain, so no
mail can ever be sent to it. Collectors self sign up with an invite code. A Postgres hook refuses
any sign-up without a valid code or with a non-hidden-id email; new accounts start **pending** and
row-level security denies them everything until Ryan approves (`specs/F1-login.md`). Resetting a
collector's PIN revokes their sessions.

Threat added by open sign-up: **someone signs up without being invited**. They are refused by the
invite hook (and again by the trigger); even with a leaked code they stay pending, with no data
access, until Ryan approves.

## Threat model (reviewed each milestone)

- **Stolen or shared phone:** PIN login, session can be revoked by resetting the PIN, no names
  stored on the phone after sync.
- **One collector reading another's data:** row-level security, tested in CI
  (`supabase/tests/rls.test.ts`).
- **Leaked key:** only public keys in the app; secret scanner; rotate keys if a scan ever fires.
- **Unblurred face uploaded:** blur happens before the image exists as a file; a test fails the
  build if the raw frame is passed to storage.
- **Fake uploads or oversized files:** Worker checks token, ownership, content type, magic bytes and size.
- **Vulnerable package:** `npm audit` (high and critical fail) and Dependabot.

## Per-feature checklist (every pull request)

- [ ] Inputs validated (phone, Worker, database)
- [ ] Access checked server-side (Worker + RLS)
- [ ] No secrets in code
- [ ] No personal data in logs
- [ ] Tests cover the deny path, not only the allow path
