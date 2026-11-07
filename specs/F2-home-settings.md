# F2: Home, settings and device self-check

**Status:** approved by Ryan, 6 Nov 2026 <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M2
**Branch:** `m2-home-practice` (F2 and F3 ship in one pull request)

Anthro Collect is a student research project at Ashesi University.

## Goal (one sentence)

An approved collector picks a measuring unit and a language once, sees at a glance whether the
phone is ready and whether anything is waiting to upload, and proves in about 10 seconds that the
phone's camera and motion sensor work.

## User story

As a collector, I want the app to remember my tape's unit and my language and to tell me whether my
phone is ready, so that I don't find out in front of a participant that something is wrong.

As the project lead, I want to see which phone model each collector used and whether its check
passed, so that I can lend a phone or help before collection starts.

## Screens

1. **First-time setup** (shown once, right after approval, before Home):
   - "Which tape do you use?" two big buttons: **Centimetres (cm)** / **Inches (in)**.
   - "Second language on screens": **French**, **Twi**, or **English only**. English is always shown.
   - **Save** → Home. Works offline: saved on the phone and sent when online.
2. **Home** (replaces today's placeholder):
   - Name, **Practice** or **Real collection** status (from F3), unit and language in small text.
   - **Sync badge:** "All saved" (green), "3 waiting to upload" (amber), "Offline: saved on this
     phone" (grey). Until F7 builds uploads, nothing waits, so it shows "All saved" or "Offline".
   - **Phone check** card: "Last check: passed on 6 Nov" or "Not checked yet" with **Check this phone**.
   - Buttons kept from F1: Invite a collector, Admin (admins), Sign out. New: **Settings**.
3. **Settings:** change unit and language (same buttons as setup). Nothing else can be changed.
4. **Phone check** (about 10 seconds, each line turns ✓ or ✗ with a plain fix):
   - **Camera:** asks permission, opens the back camera, reads its resolution, closes it. No
     picture is saved or sent.
   - **Motion sensor:** reads tilt for 2 seconds (iPhone asks permission first). Needed for F6's
     level lock.
   - **Storage:** the phone can keep data offline (IndexedDB available, space estimate).
   - **Face detector:** see open question 2.
   - **Phone model:** Android Chrome reports the model (e.g. "TECNO KI5"); iPhones report only
     "iPhone" and the iOS version.
   - Result saved with the date. Failing lines say what to do ("Allow the camera in Chrome
     settings", "Use another phone for photos").

## Data written

| Where | Fields | When |
| --- | --- | --- |
| Supabase `collectors` (existing columns) | `unit` (`cm`/`in`), `language` (`en`/`fr`/`tw`) | Setup, Settings |
| Supabase `collectors` (new column) | `settings_chosen_at` (set by the database when unit or language is saved; the collector can't write it) | Setup |
| Supabase `device_checks` (new) | `id`, `collector_id`, `phone_model`, `os`, `browser`, `camera_ok`, `camera_resolution`, `motion_ok`, `storage_ok`, `storage_mb`, `detector_ok` (null until decided), `passed`, `checked_at` | Each phone check |
| Phone (localStorage) | chosen unit and language, last check result, pending settings change | Offline copies |

No names, no phone numbers, no pictures in any of these. The camera check never keeps a frame.

## Acceptance criteria (testable)

- [ ] A newly approved collector sees Setup once; after Save, Home shows the chosen unit and language.
- [ ] Settings changes unit and language; the database refuses any other column change by a collector.
- [ ] Setup and Settings work offline and reach Supabase when the phone is back online.
- [ ] The sync badge shows All saved / Offline correctly (waiting count wired to F7 later).
- [ ] Phone check finishes in about 10 seconds and saves one `device_checks` row with the phone model.
- [ ] A refused camera or missing motion sensor shows a plain fix and saves `passed = false`.
- [ ] Collectors see only their own checks; admins see all; anon sees nothing.
- [ ] Pending, rejected and disabled collectors can't save settings or checks.

## Security requirements

- Inputs validated on the phone and by database checks (`unit`, `language` lists; text lengths on
  `phone_model`, `os`, `browser`; numbers in range).
- Access: RLS on `device_checks` (insert/read own, approved only; admin reads all; no update or
  delete); column grant on `collectors` stays `unit, language` only.
- Camera stream stopped after the check; no frame drawn to a canvas, stored or uploaded.
- Secrets: none. Logs: no phone numbers or names.
- Deny cases tested: collector changes `role`/`status`/`settings_chosen_at`; reads another's
  checks; pending collector saves a check; anon reads checks; bad unit or language.

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Setup shown once, then Home; Settings saves unit/language | React Testing Library | allow |
| Offline save queued in localStorage and sent when online | Vitest | allow |
| Phone check with fake camera/sensor: all pass; camera refused; no sensor | Vitest + RTL | both |
| Phone model text from userAgentData / user agent (Android, iPhone, unknown) | Vitest | allow |
| `collectors` column grant: unit/language only; `settings_chosen_at` set by database | PGlite | both |
| `device_checks` RLS: own/admin read, approved-only insert, no update/delete, anon nothing | PGlite | both |

## Phone test script

1. Approve a new test collector → they see Setup → choose Inches and Twi → Home shows "in · Twi".
2. Airplane mode → Settings → change to cm → Home shows cm and "Offline" → airplane off → reopen
   the app → Admin can confirm the change (SQL editor or the collector's Home).
3. Check this phone → allow camera and motion → all ✓ in about 10 seconds → Home shows "passed today".
4. Deny the camera → check again → camera ✗ with the fix text.
5. Repeat 3 on an iPhone (Safari, from the Home Screen icon).

## Decided (6 Nov 2026, Ryan accepted all suggestions)

1. **Screen languages:** screens stay English for now. The language choice is stored and first used
   for the consent text in F4.
2. **Face detector:** not in the F2 phone check; it comes with F6. F2 checks camera, motion sensor
   and storage (`detector_ok` stays empty).
3. **Failing phones:** a reminder only for now; a passed check becomes required before real
   collection (Gate A).
4. **Admin view:** the Admin screen lists each collector's latest phone check (name, phone model,
   passed or failed, date).

