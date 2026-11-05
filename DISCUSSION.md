# DISCUSSION — Ryan's decisions, newest first

Each entry: date, topic, decision, why, files changed.

| Date | Topic | Decision | Why | Changed |
| --- | --- | --- | --- | --- |
| 5 Nov 2026 | Repo | Initial scaffold committed and pushed straight to `main` (one-time); later work uses branches + PRs | Empty repo needs a first commit | — |
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

1. **Supabase phone login without SMS.** Supabase's native phone + password login needs the Phone
   provider switched on, which may ask for an SMS provider even though we never send codes. The
   scaffold uses native phone login. If the dashboard won't enable it for free, the fallback is the
   plan's "internal username": the phone number is turned into a never-mailed login id inside the
   code (never shown, no email field). Which do you want?
