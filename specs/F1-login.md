# F1: Login, sign-up with invite code, and install

**Status:** draft <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M1
**Branch:** `f1-login`

## Goal (one sentence)

A collector joins with an invite code, their name, phone number and 6-digit PIN, waits until Ryan
approves them, then signs in with phone + PIN on Android Chrome and iPhone Safari, installs the
app to the Home Screen and can open it offline.

## User story

- As a **new collector**, I want to join with the invite code Ryan gave me and my own phone and
  PIN, so I don't need an email address or anyone to type my PIN for me.
- As **Ryan (admin)**, I want to see who joined (their name and phone) and approve each one before
  they can see or save any data, so only trained collectors take part in this Ashesi University
  student research project.
- As an **approved collector**, I want to sign in with phone + PIN, install the app with one tap
  (Android) or a clear guide (iPhone), and open it with no signal.

## How it works (summary)

1. Ryan creates an invite code (admin screen). He shares it in person or by WhatsApp with trained collectors.
2. The collector opens the app link and taps **Join**. They enter the invite code, **their own
   name**, their phone, a 6-digit PIN and the PIN again.
3. In code, the phone becomes the hidden login id `233XXXXXXXXX@phone.anthro-collect.invalid`.
   The app calls Supabase `signUp` with that id, the PIN as password, and the invite code and
   display name in the sign-up metadata. No email is ever shown or sent.
4. Supabase runs a **Before User Created hook** (a Postgres function). It refuses the sign-up
   unless the login id has the hidden-id shape, the display name is valid, and the invite code is
   valid (exists, not revoked, not expired, uses left).
5. A trigger on the new auth user then:
   - uses up one invite (row locked, so two people can't take the last use);
   - creates the `collectors` row with status **pending** and the display name;
   - deletes the raw invite code and the name from the user's auth metadata (they are kept only in
     `collectors`).
6. The collector sees **"Waiting for approval"**. While pending, row-level security denies every
   table except their own collector row, which they need to see their status.
7. Ryan opens **Pending collectors** and taps Approve or Reject. Once approved, the collector's
   next app open goes to Home.
8. **Sign-in goes through the Worker** (`POST /api/login`) so wrong PINs can be counted per
   account: 5 wrong PINs within 15 minutes lock that account for 15 minutes (see "PIN lockout").

## Screens

English plus the chosen language where it applies, big buttons, number pad for phone/PIN/code.
Every screen shows "Ashesi University · Student research project".

1. **Welcome:** two buttons, **Sign in** and **Join with invite code**, plus the install area (screen 5).
2. **Join:**
   - fields: invite code (8 characters, letters and numbers, not case-sensitive), **your name**
     (the collector's own name, 2–60 characters, labelled "Your name (collector)"), phone, PIN,
     confirm PIN;
   - plain messages for wrong code, phone already joined, PINs don't match, and weak PIN
     (000000, 123456, all the same digit, straight runs up or down are refused);
   - no email field; no participant information of any kind.
3. **Waiting for approval:** "Hello <name>. Ryan will approve you soon." Shows the collector's
   phone (their own) and a **Check again** button. They stay signed in.
4. **Sign in:** phone + PIN.
   - The only message for a wrong phone or PIN is "Phone number or PIN is not right." It does not
     say which one.
   - When the account is locked: "Too many wrong PINs. Try again in 15 minutes."
   - A rejected or disabled account shows "Your account is not active. Contact Ryan."
   - "Forgot PIN? Contact Ryan." (no self-service reset).
5. **Install** (on Welcome and in the menu; hidden once the app runs installed, i.e. standalone mode):
   - **Android Chrome:** an **Install app** button. It opens Chrome's own install prompt
     (`beforeinstallprompt`). If Chrome hasn't offered it yet, the button is replaced by
     "Tap ⋮ → Add to Home screen".
   - **iPhone Safari:** Apple lets no website show an install button, so the app shows a short
     picture guide: Share → **Add to Home Screen** → Add.
   - **iPhone in Chrome or another browser:** "Open this link in Safari to install."
6. **Admin: Pending collectors** (admin role only):
   - list of pending collectors (**name**, phone, invite code label, joined time) with **Approve** / **Reject**;
   - list of approved collectors with **Disable**;
   - **Invite codes:** create (label, max uses, expiry date), see uses, revoke. The code is shown
     once at creation; after that only its label.
7. **Sign out:** in a small menu. It warns if items are still waiting to sync (F7 fills this in later).

## Data written

| Where | Fields | When |
| --- | --- | --- |
| Supabase `auth.users` (managed by Supabase) | hidden login id, PIN (hashed by Supabase) | Join |
| `public.invite_codes` (new) | `id`, `code_hash` (SHA-256 of the upper-cased code), `label`, `max_uses`, `uses`, `expires_at`, `revoked`, `created_by`, `created_at` | Admin creates/revokes; trigger increments `uses` |
| `public.collectors` (changed) | new: `display_name` (collector's own name, 2–60 chars), `status` (`pending` / `approved` / `rejected` / `disabled`, default `pending`), `invite_code_id`, `decided_by`, `decided_at` | Created by trigger at Join; status set by admin |
| `public.login_guard` (new) | `login_key` (SHA-256 of the hidden login id), `failures`, `window_start`, `locked_until` | Worker, on each sign-in attempt |
| Phone (localStorage via supabase-js) | Supabase session (access + refresh token) | Sign in |

- The plain invite code is never stored; only its hash.
- `display_name` is the **collector's** name. It is visible only to that collector and to admins,
  is never stored beside participant data, and is left out of every export (F8). Participant names
  still live only in `consents`.
- No email and no participant data in any of these tables.

New migration: `supabase/migrations/<timestamp>_f1_onboarding.sql`, applied only after Ryan
approves it in chat.

## PIN lockout (Worker)

- The app sends phone + PIN to `POST /api/login` (same origin, HTTPS). The Worker normalises the
  phone, builds the hidden login id and checks `login_guard`.
  - If the account is locked, it answers 429 without asking Supabase.
  - Otherwise it calls Supabase's password sign-in. On a wrong PIN it counts a failure; 5 failures
    within 15 minutes set `locked_until = now + 15 minutes`. On success it clears the counter and
    returns the session to the app, which stores it with `supabase.auth.setSession`.
- `login_guard` is reachable only through two security-definer functions,
  `login_guard_check(key, guard_secret)` and `login_guard_record(key, ok, guard_secret)`. They
  refuse calls without the right `guard_secret`.
  - The secret is a random value kept as a Cloudflare Worker secret and in Supabase Vault. It can
    only touch lockout counters; it is **not** the Supabase secret key.
- The Worker never logs the phone, PIN, login id or tokens.
- **Limits, stated honestly:**
  - The app uses Supabase's public publishable key, so someone could skip the Worker and send
    PIN guesses straight to Supabase. The Worker lockout does not see those tries; only Supabase's
    per-IP rate limits do. See open question 1 for the fix (CAPTCHA enforced by Supabase).
  - Anyone who knows a collector's phone number could lock that collector out for 15 minutes by
    entering wrong PINs. That is accepted for the pilot; Ryan can clear a lock (see "PIN reset").

## PIN reset (admin, in Supabase)

No email or SMS, so there is no self-service reset. The collector contacts Ryan, who:

1. opens the Supabase SQL editor;
2. runs the "Reset a collector's PIN" snippet from `docs/ADMIN.md` (added in this feature). It
   sets a new PIN hash for that phone's hidden login id, ends that collector's sessions on every
   phone, and clears their `login_guard` lock;
3. tells the collector the new PIN in person or by phone call (never in a group chat).

Claude Code writes the snippet and its PGlite test but never runs it on the live database.

## Supabase settings this needs (Ryan sets them in the dashboard)

- Authentication → Sign In / Providers → Email: **on**; **Confirm email: off**; **Allow new users to sign up: on**.
  Sign-up is open to the internet, which is why the hook is required.
- Authentication → Hooks → **Before User Created** → `public.hook_before_user_created`.
- Minimum password length 6. Rate limits stay at the Supabase defaults or stricter.
- Ryan's own account is created once by joining with a bootstrap invite code. Ryan then runs one
  SQL line in the Supabase SQL editor that sets his row to `role = 'admin', status = 'approved'`.
  Claude Code never runs it.
- Worker secret `LOGIN_GUARD_SECRET` (set with `wrangler secret put`) and the same value in
  Supabase Vault. Ryan sets both; the value never appears in chat or the repo.

## Acceptance criteria (testable)

- [ ] Join with a valid code, a name, a new phone and matching PINs creates a **pending**
  collector with that display name; the app shows "Waiting for approval" with the name.
- [ ] Join with a wrong, revoked, expired or used-up code, or with no name or a name outside
  2–60 characters, is refused with a plain message, and no auth user or collector row is created.
- [ ] Two people joining with the last use of a code: exactly one succeeds.
- [ ] A sign-up sent straight to Supabase (bypassing the app) with no code, a bad code, no name,
  or an email that is not a hidden login id is refused by the hook.
- [ ] The raw invite code and the name are not left in `auth.users` metadata.
- [ ] A pending, rejected or disabled collector can read only their own collector row: no
  participants, no consents, no inserts.
- [ ] After admin approval, the collector reaches Home on the next open, with no new sign-in needed.
- [ ] A collector cannot approve themselves, change their own status, role or display name, read
  invite codes, read `login_guard`, or read other collectors' names.
- [ ] Phone + PIN sign-in works on Android Chrome and iPhone Safari; a wrong PIN shows the plain message.
- [ ] 5 wrong PINs within 15 minutes lock that account for 15 minutes, even with the right PIN; a
  different account is not affected; the lock ends on its own after 15 minutes.
- [ ] `login_guard` functions refuse calls without the guard secret.
- [ ] The admin PIN-reset snippet changes the PIN, ends old sessions and clears the lock.
- [ ] Android Chrome: the **Install app** button opens the install prompt; after installing, the
  install area is hidden. iPhone Safari: the picture guide shows; iPhone Chrome: "open in Safari".
- [ ] After one online sign-in, the installed app opens in airplane mode and shows the last screen
  state (offline banner).
- [ ] No email field anywhere; the only name field is the collector's own name on Join; the hidden
  login id never appears on any screen or in any log.

## Security requirements

- **Inputs validated:**
  - phone, PIN (with the weak-PIN list) and display name on the phone (`src/lib`);
  - invite code format on the phone;
  - phone and PIN shape again in the Worker before any call to Supabase;
  - code validity and name length in the hook (server);
  - `status`, `role` and `display_name` check constraints in the database.
- **Access checked server-side:**
  - every collector policy (participants, consents, settings update) adds "status is approved";
  - `invite_codes` and `login_guard` have no grants for collectors;
  - only an admin can change `status` or `display_name`, through a security-definer function
    `approve_collector(id, decision)` that checks `is_admin()`;
  - collectors' column grants still allow only `unit` and `language`;
  - collectors see only their own collector row (name included); admins see all.
- **Fail-safe:**
  - new accounts start pending, so a failed or skipped check never leaves a collector approved;
  - if the hook is switched off by mistake, the trigger still refuses a sign-up without a valid code;
  - if `login_guard` can't be reached, the Worker refuses sign-in (503) instead of skipping the lockout.
- **Brute force:**
  - invite codes are 8 characters from a 31-character alphabet with no 0/O/1/I/L (≈ 8.5 × 10¹¹ combinations);
  - per-account PIN lockout in the Worker (5 / 15 minutes), plus Supabase's per-IP rate limits;
  - the direct-to-Supabase gap is open question 1.
- **Secrets:**
  - the Supabase secret key is not used anywhere;
  - `LOGIN_GUARD_SECRET` is a Worker secret plus a Vault value, never in code or the repo;
  - the app uses only the publishable key.
- **Logs:** never log name, phone, PIN, login id, tokens or invite code (lint rule `no-console`
  stays; hook and Worker errors return codes, not inputs).
- **Deny cases that must be tested:** every "refused", "cannot" and "locked" line in the acceptance criteria.

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Weak PIN list, PIN match, display name rules, invite code format and normalising | Vitest (`src/lib`) | both |
| `signUpWithInvite` sends the hidden id + code + name, never the raw phone; maps hook errors to plain messages | Vitest + fake client | both |
| Worker `/api/login`: right PIN → session; wrong PIN → generic 401; 5th failure locks; locked → 429 even with right PIN; lock expires; other account unaffected; guard unreachable → 503; bad phone/PIN shape → 400 without calling Supabase | Vitest (Worker) + fakes | both |
| Hook: valid code + name ok; missing/wrong/revoked/expired/used-up code refused; bad name refused; non-hidden-id email refused | PGlite | both |
| Trigger: uses up one invite; last-use race (two inserts, one fails); collector row is pending with name; code and name removed from auth metadata | PGlite | both |
| `login_guard_*` refuse a wrong or missing guard secret; collectors have no access to `login_guard` | PGlite | deny |
| Pending/rejected/disabled collector denied on participants, consents, settings update | PGlite | deny |
| Collector cannot call `approve_collector`, update `status`/`role`/`display_name`, read `invite_codes` or other collectors | PGlite | deny |
| Admin approves → collector can create a practice participant | PGlite | allow |
| PIN-reset snippet: new PIN works, old sessions gone, lock cleared | PGlite | allow |
| Join screen blocks submit until fields are valid; wrong-PIN message is the generic one | React Testing Library | both |
| Install area: button on `beforeinstallprompt`, iPhone guide on iOS Safari, "open in Safari" on iOS Chrome, hidden in standalone | React Testing Library | both |
| Welcome → Waiting → Home routing by status | React Testing Library | both |

## Phone test script

Run on an Android low-cost phone, an Android mid-range phone and an iPhone.

1. Ryan creates an invite code "Pilot test", max uses 2, on the admin screen. Write the code down.
2. On Android, open the preview link in Chrome → **Join with invite code** → enter the code, your
   name, your phone, PIN 482916 twice → you see "Waiting for approval" with your name.
3. Try **Join** again on the iPhone with a wrong code (e.g. AAAA2222) → plain "code is not right" message.
4. On the admin screen, check the Android phone shows with your name, approve it → on Android tap **Check again** → Home opens.
5. Sign out. Sign in with the right phone and PIN 000000 → "Phone number or PIN is not right."
   Repeat 4 more times → "Too many wrong PINs. Try again in 15 minutes." Now the right PIN is also refused.
6. Ryan runs the PIN-reset snippet for that phone → sign in with the new PIN → Home.
7. Android: tap **Install app** → Chrome's install prompt → Install. Open from the Home Screen → no install button shows.
8. iPhone in Chrome → "Open this link in Safari". In Safari → picture guide → Share → Add to Home Screen (after joining with the second use of the code and being approved).
9. Turn on airplane mode, close the app fully, open it from the Home Screen → it opens and shows the offline banner.
10. Join with the same code a third time → refused (used up).

## Decided (5 Nov 2026)

- Collectors give their **own display name** at Join (never a participant's).
- **PIN lockout through the Worker** (5 wrong PINs / 15 minutes per account).
- **PIN reset by Ryan in the Supabase SQL editor**, using the snippet in `docs/ADMIN.md`; no reset
  button and no Supabase secret key in the Worker.
- **Install button on Android** plus an **iPhone picture guide**.

## Open questions for Ryan

1. **CAPTCHA to close the direct-to-Supabase gap.** Supabase can require a Cloudflare Turnstile
   check (free, usually invisible, run by Cloudflare, which we already use) on every sign-in and
   sign-up. Supabase itself enforces it, so PIN guessing that skips the Worker is blocked too. It
   needs internet at sign-in, which sign-in needs anyway. It is a new service setting, so it needs
   your OK. Add it?
2. **Invite code defaults.** Are max 10 uses and expiry after 14 days OK as defaults?
3. **Free plan check.** Please confirm the Before User Created hook is offered on your Supabase
   plan (Authentication → Hooks). If it isn't, the trigger alone enforces the code, but a refused
   sign-up then shows a generic "could not join" message.
