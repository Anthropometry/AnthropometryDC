# Testing

Every feature ships with its tests in the same pull request. CI refuses a merge if any test fails
or coverage of the core logic (`src/lib`, `worker`) drops below 80%.

| What | Tool | Where | Examples of what is tested |
| --- | --- | --- | --- |
| App logic (`src/lib`) | Vitest | `src/lib/*.test.ts` | phone number normalising, hidden login id mapping, sign-in errors; later inch → cm, plausibility, receipt codes, sync order and retry |
| Offline queue | Vitest + fake IndexedDB | F7 | nothing deleted before server confirms; app killed mid-upload loses nothing and duplicates nothing |
| Worker (`/api`) | Vitest (Workers test pool planned) | `worker/*.test.ts` | no token → 401; someone else's participant → 403; wrong file type or too large → rejected; unknown route → 404 |
| Database rules | PGlite (in-memory Postgres) | `supabase/tests/*.test.ts` | collector A can't see B's data; collectors can't read consents; no real participant before IRB switch; no self-promotion to admin |
| Screens | React Testing Library | F1 onwards | consent screen blocks "Next" until both boxes are ticked; skip works; Practice label shows |
| Phones | Ryan's test script per PR | PR description | Android low-cost, Android mid-range, iPhone; online and airplane mode |

Tests always include the deny case (what must be refused), because that is where security bugs
hide. Database rule tests apply the real migration files to an in-memory PGlite copy with small
stand-ins for Supabase's `auth` schema and roles, so neither CI nor Claude Code ever touches real data.

## Commands

- `npm test` — everything
- `npm run test:coverage` — with the 80% gate (what CI runs)
- `npm run test:db` — database rules only
