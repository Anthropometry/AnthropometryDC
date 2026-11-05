# DISCUSSION — Ryan's decisions, newest first

Each entry: date, topic, decision, why, files changed.

| Date | Topic | Decision | Why | Changed |
| --- | --- | --- | --- | --- |
| 5 Nov 2026 | Authorship | All 7 existing commits rewritten so author and committer are `Patience Sombang <92175572+Patience3@users.noreply.github.com>` (GitHub no-reply address; no personal email in history). This is the repo's local git identity from now on. `main`, `setup` and `f1-login` force-pushed once, as an approved exception to "never push to main". File contents unchanged | Repo is going public; authorship belongs to Patience | git history, README.md |
| 5 Nov 2026 | README | Short README: what it is, privacy note, run locally, CI/CD pointer, links to POLICY/ROADMAP/SECURITY, contact via GitHub profile only. No keys, project refs or account IDs | Prepare for making the repo public | README.md |
| 5 Nov 2026 | Secret scan | `.gitleaks.toml`: default rules + a rule that fails on Supabase `sb_secret_` keys; only `sb_publishable_` values are allowed (public by design) | CI flagged the publishable key in wrangler.jsonc | .gitleaks.toml |
| 5 Nov 2026 | Database | Ryan approved `supabase db push` of `20261105000000_init.sql`; Ryan types the DB password himself, never in chat | Policy §7–8 | supabase/ |
| 5 Nov 2026 | Tests | Database rules tested on PGlite with the real migration files; deny cases for every rule | Never touch real data in CI | supabase/tests/rls.test.ts |
| 5 Nov 2026 | Tooling | ESLint + typescript-eslint, `@vitest/coverage-v8`, `@electric-sql/pglite`, `supabase` CLI added as dev tools; TypeScript pinned to ~6.0 (typescript-eslint doesn't support 7 yet) | Needed by the CI steps in the North Anchor | package.json |
| 5 Nov 2026 | Docs | Created POLICY.md, docs/MISSION, TECH_STACK, ROADMAP, SECURITY, TESTING, specs/_TEMPLATE, PR template, ci.yml, deploy.yml from North Anchor v2; CLAUDE.md is now the short entry point | Spec files are the source of truth | those files |
| 5 Nov 2026 | Process | Branches and PRs only, no exceptions; the earlier "one-time push to main" exception is removed | Separation of duties | CLAUDE.md, POLICY.md |
| 5 Nov 2026 | Repo | Home is `Anthropometry/AnthropometryDC`; `Patience3/AnthropometryDC` was a mistake (Ryan handles it) | Correct owner | git remote |
| 5 Nov 2026 | Login | Hidden login id: phone → `233XXXXXXXXX@phone.anthro-collect.invalid`, built in code, never shown, never mailed. Supabase native phone/SMS login not used | Free; no SMS provider needed | src/lib/phone.ts, src/lib/auth.ts |
| 5 Nov 2026 | Login | Phone number + 6-digit PIN only; no email anywhere (collectors or participants) | Many collectors have no email; SMS codes cost money | CLAUDE.md |
| 5 Nov 2026 | Sharing | PWA link for Android and iPhone; no app store and no APK (replaces "optional APK" of 1 Nov) | One link for every phone, no store review | CLAUDE.md |
| 5 Nov 2026 | Framing | Everything framed as a student research project at Ashesi University | Honest consent keeps the data reusable | CLAUDE.md, app shell |
| 5 Nov 2026 | Process | Spec-driven build: mission, stack, specs, roadmap, policy, discussion log | Keep Claude Code on track; keep Ryan in control | — |
| 5 Nov 2026 | Security | Security runs in parallel with every feature | Not an afterthought | — |
| 5 Nov 2026 | Data access | Claude Code never reads the database; it asks Ryan | Least privilege, participant privacy | — |
| 5 Nov 2026 | Quality | Unit tests in every pull request; CI blocks merges on failure | Catch bugs before collectors do | — |
| 5 Nov 2026 | Deploy | GitHub Actions deploys only after tests pass and Ryan approves | Separation of duties | — |
| 1 Nov 2026 | Framing | Consent leads with "student research project at Ashesi"; one line notes possible future app use | Honest consent | — |
| 28 Oct 2026 | Scope | 900 participants: 5 agents × 120, 5 tailors × 60, plus spare collectors | Tailors see fewer people | — |
| 28 Oct 2026 | Units | Collector picks cm or inches once; database stores cm | Tapes differ | — |
| 28 Oct 2026 | Languages | Consent in EN/FR/TW; screens show English plus the chosen language | Not all Twi speakers read Twi | — |
| 28 Oct 2026 | Ethics | Real collection waits for IRB approval; team tests use Practice mode | Human-subject research | — |
| 27 Oct 2026 | Cost | Free services only: GitHub, Cloudflare, Supabase | No budget | — |

## Open questions for Ryan

1. **Supabase Auth dashboard settings** for the hidden login id: Email provider on, Confirm email
   off, Allow new users to sign up off, minimum password length 6. Ryan to set (Claude Code has no
   dashboard access).
2. **Admin script** to create collectors (and Ryan as admin) with the secret key from `.env.admin`:
   write it in F1 or as an M0 follow-up?
3. **Workers test pool**: Worker tests run on plain Vitest for now; switch to
   `@cloudflare/vitest-pool-workers` when it supports Vitest 5?
