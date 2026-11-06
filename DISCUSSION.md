# DISCUSSION — Ryan's decisions, newest first

Each entry: date, topic, decision, why, files changed.

| Date | Topic | Decision | Why | Changed |
| --- | --- | --- | --- | --- |
| 6 Nov 2026 | Referral codes | Approved collectors can create invite codes to refer new collectors; admin sees who invited whom. Codes: random (no name inside), **3 joins, 10 days**; admin defaults also change to 3 / 10. Proposed: max 2 active codes per collector | One code for 10 people could fall into the wrong hands; referrals show who vouched for whom | specs/F1-login.md (Amendment A3, draft) |
| 6 Nov 2026 | Phone numbers | Collectors may have **any country's** number (typed with country code; `0…` still means Ghana) | Collectors may be recruited outside Ghana; invite code, CAPTCHA and approval still gate access | specs/F1-login.md (Amendment A1, draft) |
| 6 Nov 2026 | Wording | Screens never name a person: "the project lead" instead of "Ryan" | Neutral, works whoever is admin | specs/F1-login.md (Amendment A2, draft) |
| 6 Nov 2026 | Bootstrap | First invite code created in the SQL editor (label with Patience's name). The promote step must be re-run after joining in the deployed F1 app | The collector row exists only after Join | docs/ADMIN.md |
| 5 Nov 2026 | Database | Ryan approved `supabase db push`; `20261105120000_f1_onboarding.sql` applied to `vafxojfaylrlgupvahdo`. Local and remote migration history match (2 migrations). No table data read | Policy §7 | supabase/migrations |
| 5 Nov 2026 | F1 guard secret | The PIN-lockout guard secret is a Worker secret; the database stores only its **SHA-256 hash** in `private.settings` (instead of Supabase Vault as first written in the spec). `scripts/make-guard-secret.mjs` makes it | Nothing reversible in the database, and testable on PGlite | specs/F1-login.md, migration, docs/ADMIN.md |
| 5 Nov 2026 | F1 test tools | `@testing-library/react`, `@testing-library/dom`, `jsdom` added (dev only) for the screen tests TESTING.md already lists; no jest-dom | Needed to test the Join/Sign in/Install screens | package.json |
| 5 Nov 2026 | F1 approved | Ryan approved `specs/F1-login.md` | All open questions answered | specs/F1-login.md |
| 5 Nov 2026 | F1 hook | Supabase's Before User Created hook is on the free plan (Auth Hooks, Beta); F1 uses it, with the database trigger kept as a backup | Ryan checked the dashboard; Beta features can change | specs/F1-login.md |
| 5 Nov 2026 | F1 invite defaults | Invite codes default to **10 uses** and **14 days** to expiry, changeable per code; a use = one collector joining (participants never use codes) | Covers one training batch; limits a leaked code | specs/F1-login.md |
| 5 Nov 2026 | F1 CAPTCHA | **Cloudflare Turnstile** (free) on Join and Sign in, enforced by Supabase's Bot and abuse protection. Site key public (`VITE_TURNSTILE_SITE_KEY`); secret key only in the Supabase dashboard; Cloudflare test keys in CI | Closes the gap where PIN guesses skip the Worker lockout; approved new service | specs/F1-login.md, docs/TECH_STACK.md |
| 5 Nov 2026 | F1 install | Android: in-app **Install app** button (Chrome's install prompt); iPhone: picture guide (Share → Add to Home Screen); "open in Safari" on iPhone Chrome | Apple allows no install button; Android first-time install worked via the Chrome menu | specs/F1-login.md |
| 5 Nov 2026 | F1 PIN reset | Ryan resets a forgotten PIN in the Supabase SQL editor with a snippet in `docs/ADMIN.md`; no reset button, no Supabase secret key in the Worker | Less can go wrong; least privilege | specs/F1-login.md |
| 5 Nov 2026 | F1 PIN lockout | Sign-in goes through the Worker (`/api/login`): 5 wrong PINs in 15 min lock that account for 15 min; counters in Postgres behind a narrow guard secret. Known gap: direct calls to Supabase bypass it (CAPTCHA proposed as open question) | 6-digit PINs need a per-account limit | specs/F1-login.md |
| 5 Nov 2026 | F1 collector name | Collectors give their **own** display name at Join; stored only in `collectors`, visible to self + admin, never exported. Participant names still only in `consents` | Ryan recognises who to approve | specs/F1-login.md, POLICY.md §11, docs/SECURITY.md |
| 5 Nov 2026 | Authorship | All 7 existing commits rewritten so author and committer are `Patience Sombang <92175572+Patience3@users.noreply.github.com>` (GitHub no-reply address; no personal email in history). This is the repo's local git identity from now on. `main`, `setup` and `f1-login` force-pushed once, as an approved exception to "never push to main". File contents unchanged | Repo is going public; authorship belongs to Patience | git history, README.md |
| 5 Nov 2026 | README | Short README: what it is, privacy note, run locally, CI/CD pointer, links to POLICY/ROADMAP/SECURITY, contact via GitHub profile only. No keys, project refs or account IDs | Prepare for making the repo public | README.md |
| 5 Nov 2026 | Secret scan | `.gitleaks.toml`: default rules + a rule that fails on Supabase `sb_secret_` keys; only `sb_publishable_` values are allowed (public by design) | CI flagged the publishable key in wrangler.jsonc | .gitleaks.toml |
| 5 Nov 2026 | Onboarding | Collectors **self sign up with an invite code**, then **Ryan approves** them before they can see or save anything. Replaces "accounts made only by the admin script". Login stays phone + 6-digit PIN with the hidden login id; still no email | North Anchor decision by Ryan | specs/F1-login.md (draft), CLAUDE.md, docs/TECH_STACK.md, docs/SECURITY.md, docs/ROADMAP.md |
| 5 Nov 2026 | Config | Supabase URL + publishable key set as `VITE_SUPABASE_*` (Vite only exposes `VITE_` names, so the `NEXT_PUBLIC_` names were not used) in `.env.local` / `.dev.vars` (git-ignored) and `wrangler.jsonc` vars | Publishable key is public by design | wrangler.jsonc |
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

1. **F1 spec open questions** (name at sign-up, PIN lockout, forgotten PIN, invite defaults,
   hook on free plan): see `specs/F1-login.md`. Supabase Auth settings change with F1: sign-ups
   **on** (guarded by the invite hook), Confirm email off.
2. **Workers test pool**: Worker tests run on plain Vitest for now; switch to
   `@cloudflare/vitest-pool-workers` when it supports Vitest 5?
