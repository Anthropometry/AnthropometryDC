# POLICY — rules for Claude Code

These rules override convenience; when one blocks a task, Claude Code stops and asks rather than
working around it. Anthro Collect is a student research project at Ashesi University.

## Process

1. Spec first. No code for a feature until its `specs/F#` file is marked approved by Ryan.
2. One feature per branch and pull request. Never push to `main`; never merge without Ryan's "merge it".
3. Every change includes tests, deny cases included. Run all tests and the build before saying "done".
4. Fill in the pull request template: what changed, tests, security checks, decisions needed,
   phone test script.
5. Unsure about scope, wording, data or a trade-off? Ask Ryan, then record the answer in
   `DISCUSSION.md`. Never guess.

## Data and access

6. Never read, query, export or inspect the live database or R2 buckets, and never ask for the
   Supabase secret key. When you need to know what's in the data, ask Ryan.
7. Database changes only as new files in `supabase/migrations/`, applied with `supabase db push`
   only after Ryan approves in chat. Never edit an applied migration.
8. Never put secrets in code, commits, logs or chat. Only public `VITE_*` values in the app.
   Never ask for the database password in chat; Ryan types it into the terminal himself.
9. Never log names, signatures, photos or phone numbers.

## Product rules

10. Consent before any measurement or photo. No unblurred face leaves the camera function.
11. Participant names only in `consents`. The one exception for people who are not participants:
    a collector's own display name in `collectors` (visible to that collector and admins only,
    never beside participant data, never exported). Collectors log in with phone + PIN; never add
    an email field.
    The hidden login id built from the phone (`src/lib/phone.ts`) is never shown or mailed.
12. Offline first: write locally, sync later, delete locally only after the server confirms.
13. Free tier only; no new service or library without a `DISCUSSION.md` entry Ryan approved.
14. Never weaken a security control (row-level security, the IRB gate, auth checks, blur) to make
    a test or feature pass.
15. Share as a PWA link only (Android + iPhone). No app store, no APK.

## Keeping Ryan in the loop

16. Start each session by stating the current milestone, the next task and any open questions.
17. End each task with: done, tested, security checked, waiting on Ryan for …
