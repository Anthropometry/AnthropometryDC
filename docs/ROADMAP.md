# Roadmap

Eight milestones in order, one pull request per feature. Real collection starts only after
Gate A (tool test) and Gate B (IRB approval).

```
M0 Setup + CI → M1 Login (F1) → M2 Home + practice (F2, F3) → M3 Consent (F4)
→ M4 Measurements (F5) → M5 Camera + blur (F6) → M6 Offline sync (F7) → M7 Admin + export (F8)
→ Gate A: tool test → Gate B: IRB approval → real collection
```

Must-pass checks. A box is ticked only after Ryan tests it on a phone.

## M0 Setup + CI: done, 6 Nov 2026

- [x] Spec files from the North Anchor merged
- [x] CI runs on a pull request: typecheck, tests, audit, secret scan, build
- [x] Deploy waits for Ryan's approval, then the live URL returns `/api/health` OK
- [x] First migration applied with row-level security; deny tests pass in CI
- [x] Ryan exists as the admin collector (joins with a bootstrap invite code, then promoted in the SQL editor by Ryan — see F1)

## M1 Login (F1): done, tested by Ryan on Android and iPhone, 6 Nov 2026

- [x] Join with invite code → pending → approved by Ryan; phone + PIN login works on Android and iPhone; wrong PIN shows a plain message
- [x] Installs to the Home Screen; opens offline

## M2 Home + practice (F2, F3): done, tested by Ryan on Android and iPhone, 7 Nov 2026

- [x] Unit, language, sync badge, self-check saved
- [x] Practice records marked and refused as real data while collection is closed

## M3 Consent (F4): done, tested by Ryan on Android and iPhone, 9 Nov 2026

- [x] Adult and under-18 paths, signature, receipt code (French and Twi deferred until translated, decided 7 Nov)
- [x] Works fully in airplane mode; collectors can't read consents back

## M4 Measurements (F5): done, tested by Ryan on phones, 10 Nov 2026

- [x] Number pad, skip, inch ⅛, plausibility warnings; cm stored

## M5 Camera + blur (F6)

- [ ] Level lock and auto-shutter on a low-cost Android first
- [ ] Blur confirmed on 20 test photos; no raw frame stored

## M6 Offline sync (F7)

- [ ] App killed mid-upload loses nothing and duplicates nothing
- [ ] Worker refuses another collector's participant (tested)

## M7 Admin + export (F8)

- [ ] Progress and coverage views; export skips practice and consents; one backup done

## Gate A: tool test

- [ ] 5 practice participants reach Supabase and R2 from 2 Android phones and 1 iPhone
- [ ] Unit conversion checked against a real tape

## Gate B: IRB approval

- [ ] IRB approval received; consent text frozen as v1
- [ ] Ryan switches `collection_open` on; collectors created and trained

## Features

| ID | Feature | Done when (acceptance) | Security built in |
| --- | --- | --- | --- |
| F1 | Login + install | Join with invite code + phone + PIN; Ryan approves; phone + 6-digit PIN logs in on Android Chrome and iPhone Safari; Add to Home Screen works; app opens offline after first load | Invite code checked by a database hook; pending accounts denied everything until approved; rate-limited login; no email field |
| F2 | Home + settings + device self-check | Unit (cm/in) and app language set once; sync badge; 10-second camera/sensor/detector check saved with phone model | Collector can change only unit and language (column-level grant) |
| F3 | Practice mode | Practice participants clearly marked, flagged `is_practice`, excluded from every export | Database refuses real participants until collection opens after IRB approval |
| F4 | Participant + consent | Adult / under-18 path; consent in EN/FR/TW with English always shown; two required ticks; signature; guardian + child assent; "capture later"; receipt code | Names only in `consents`; collectors can write but never read consents; later screens locked until consent exists |
| F5 | Measurements | One per screen, number pad, skip, inch ⅛ buttons, stores typed value + unit + cm, plausibility warning | Input validated on phone and by database checks |
| F6 | Camera + face blur | Level lock (pitch 90±1.5°, roll ±1°), silhouette guide, 3-second auto-shutter, front + side (+ back optional) | Detector blur plus fixed head-zone blur before saving; raw frame never stored; EXIF stripped by re-encoding |
| F7 | Offline sync + upload | Queue uploads in order with retries; badge shows waiting/synced; local copy deleted only after server confirms; Wi-Fi-only switch | Worker checks login and ownership before every write to R2; size and type limits; no storage keys on phones |
| F8 | Admin + export | Progress and coverage views; export script makes images, `measurements.csv` (cm), `metadata.json` per participant | Admin role checked in the database; export skips practice, rejected and consent data; weekly backup |

Cut order if time runs short: back photo, then Wi-Fi switch, then bilingual labels on optional
measurements. **Never cut:** consent, face blur, offline saving, security checks.
