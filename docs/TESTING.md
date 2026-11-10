# Testing

Every feature ships with its tests in the same pull request. CI refuses a merge if any test fails
or coverage of the core logic (`src/lib`, `worker`) drops below 80%.

| What | Tool | Where | Examples of what is tested |
| --- | --- | --- | --- |
| App logic (`src/lib`) | Vitest | `src/lib/*.test.ts` | phone number normalising, hidden login id mapping, sign-in errors; settings saved offline, phone check with fake camera/sensor, phone model, practice queue (`m2.test.ts`); receipt codes, consent text, offline consent queue on fake IndexedDB (`f4.test.ts`); measurement sets, inch ⅛ → cm (matching the database), ×2, unusual and consistency checks (`measurements.test.ts`), measurement queue (`measureQueue.test.ts`); later inch → cm, plausibility, receipt codes, sync order and retry |
| Offline queue | Vitest + fake IndexedDB | F7 | nothing deleted before server confirms; app killed mid-upload loses nothing and duplicates nothing |
| Worker (`/api`) | Vitest (Workers test pool planned) | `worker/*.test.ts` | no token → 401; someone else's participant → 403 (admins included); practice files under `practice/`; withdrawal and practice delete remove images; wrong file type or too large → rejected; unknown route → 404 |
| Database rules | PGlite (in-memory Postgres) | `supabase/tests/*.test.ts` | collector A can't see B's data; collectors can't read consents; no real participant before IRB switch; no self-promotion to admin; invite-code sign-up, pending collectors denied, PIN lockout counters, PIN reset (`f1.test.ts`); any-country phones, referral codes, Invited by (`f1a.test.ts`); admin Show code and erasing finished codes (`f1b.test.ts`); settings once, phone checks, practice numbers, practice fixed, delete own practice only, `real_participants` (`m2.test.ts`); consent rules, receipt codes, `has_consent`, `my_participants`, withdrawal (`f4.test.ts`); measurement rules: consent first, sets by sex and age, intimate tick, cm recomputed, ×2, Finish, cascade (`f5.test.ts`) |
| Screens | React Testing Library + jsdom | `src/**/*.test.tsx` | Join blocks submit until valid + safety check; generic wrong-PIN message; install help per phone; routing by status; Admin pending card, Show code, Share/Copy; later: consent screen blocks "Next" until both boxes are ticked; skip works; Practice label shows |
| Phones | Ryan's test script per PR | PR description | Android low-cost, Android mid-range, iPhone; online and airplane mode |

Tests always include the deny case (what must be refused), because that is where security bugs
hide. Database rule tests apply the real migration files to an in-memory PGlite copy with small
stand-ins for Supabase's `auth` schema and roles, so neither CI nor Claude Code ever touches real data.

## Commands

- `npm test` — everything
- `npm run test:coverage` — with the 80% gate (what CI runs)
- `npm run test:db` — database rules only
