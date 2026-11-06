# F1: Login, sign-up with invite code, and install

**Status:** approved (Ryan, 5 Nov 2026) <!-- draft | approved | built | verified — only Ryan sets "approved" -->
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
9. **Join and Sign in both need a Cloudflare Turnstile check**, which Supabase itself enforces
   (see "CAPTCHA"). That blocks automated guessing even when someone skips the app and calls
   Supabase directly.

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
   - **Invite codes:** create (label, max uses default 10, expiry default 14 days), see uses,
     revoke. The code is shown once at creation; after that only its label.
7. **Sign out:** in a small menu. It warns if items are still waiting to sync (F7 fills this in later).

## Data written

| Where | Fields | When |
| --- | --- | --- |
| Supabase `auth.users` (managed by Supabase) | hidden login id, PIN (hashed by Supabase) | Join |
| `public.invite_codes` (new) | `id`, `code_hash` (SHA-256 of the upper-cased code), `label`, `max_uses` (default 10), `uses`, `expires_at` (default now + 14 days), `revoked`, `created_by`, `created_at` | Admin creates/revokes; trigger increments `uses` |
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
  - The secret is a random value kept as a Cloudflare Worker secret; the database stores only its SHA-256 hash (`private.settings`). It can
    only touch lockout counters; it is **not** the Supabase secret key.
- The Worker never logs the phone, PIN, login id or tokens.
- **Limits, stated honestly:**
  - The app uses Supabase's public publishable key, so someone could skip the Worker and send
    PIN guesses straight to Supabase. The Worker lockout does not see those tries, but every one
    of them still needs a fresh, solved Turnstile check, which makes automated guessing
    impractical (see "CAPTCHA").
  - Anyone who knows a collector's phone number could lock that collector out for 15 minutes by
    entering wrong PINs. That is accepted for the pilot; Ryan can clear a lock (see "PIN reset").

## CAPTCHA (Cloudflare Turnstile, enforced by Supabase)

- Supabase's **Bot and abuse protection** is switched on with **Turnstile**. Supabase then refuses
  any sign-up or password sign-in that does not carry a valid, unused Turnstile token, whether it
  comes from the app, the Worker or a script.
- The Join and Sign in screens show the Turnstile widget in **managed** mode. Most people see
  nothing or a single tap box; a hard challenge appears only for suspicious traffic.
  - Join: the app passes the token to `supabase.auth.signUp` (`options.captchaToken`).
  - Sign in: the app sends the token with phone + PIN to `/api/login`, and the Worker forwards it
    to Supabase unchanged (`gotrue_meta_security.captcha_token`). The Worker never reuses or stores tokens.
- Each token works once. After a wrong PIN the widget resets, so every attempt needs a new check.
- **Offline:** Join and Sign in need internet anyway; the widget loads only on those screens and
  is never cached by the service worker. Opening the installed app offline after a past sign-in
  needs no CAPTCHA.
- **Keys:**
  - site key (public): `VITE_TURNSTILE_SITE_KEY`, a GitHub variable;
  - secret key: pasted by Ryan into the Supabase dashboard only, never in the repo, the Worker or chat;
  - tests and CI use Cloudflare's published test keys, never the real ones.
- **Allowed hostnames** on the widget: the `workers.dev` app domain (previews are subdomains of
  it) and `localhost` for development.
- **Privacy:** Turnstile runs only on collector Join/Sign in screens, never on participant
  screens. It checks the browser, not the person, and the app sends it no phone, PIN or name.

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
  its SHA-256 hash in `private.settings` (`node scripts/make-guard-secret.mjs`). Ryan sets both; the value never appears in chat or the repo.
- Cloudflare dashboard → **Turnstile** → Add widget "Anthro Collect", managed mode, hostnames as
  in "CAPTCHA". Copy the site key into the GitHub variable `VITE_TURNSTILE_SITE_KEY`; paste the
  secret key into Supabase → Authentication → **Bot and abuse protection** → Enable CAPTCHA → Turnstile.
  Switch this on only once the F1 app code is deployed; before that, the current app has no widget,
  but it has no sign-in either, so nothing breaks.

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
- [ ] Join and Sign in cannot be submitted until Turnstile passes; a sign-up or sign-in sent
  straight to Supabase without a valid token is refused; a used token is refused a second time.
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
  - Turnstile on every sign-up and sign-in, enforced by Supabase, so calls that skip the Worker
    still need a solved check each time.
- **Secrets:**
  - the Supabase secret key is not used anywhere;
  - `LOGIN_GUARD_SECRET` is a Worker secret; the database keeps only its hash; never in code or the repo;
  - the Turnstile secret key lives only in the Supabase dashboard;
  - the app uses only public values (Supabase publishable key, Turnstile site key).
- **Logs:** never log name, phone, PIN, login id, tokens or invite code (lint rule `no-console`
  stays; hook and Worker errors return codes, not inputs).
- **Deny cases that must be tested:** every "refused", "cannot" and "locked" line in the acceptance criteria.

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Weak PIN list, PIN match, display name rules, invite code format and normalising | Vitest (`src/lib`) | both |
| `signUpWithInvite` sends the hidden id + code + name, never the raw phone; maps hook errors to plain messages | Vitest + fake client | both |
| Worker `/api/login`: missing Turnstile token → 400 without calling Supabase; token forwarded unchanged, never logged; right PIN → session; wrong PIN → generic 401; 5th failure locks; locked → 429 even with right PIN; lock expires; other account unaffected; guard unreachable → 503; bad phone/PIN shape → 400 without calling Supabase | Vitest (Worker) + fakes | both |
| Hook: valid code + name ok; missing/wrong/revoked/expired/used-up code refused; bad name refused; non-hidden-id email refused | PGlite | both |
| Trigger: uses up one invite; last-use race (two inserts, one fails); collector row is pending with name; code and name removed from auth metadata | PGlite | both |
| `login_guard_*` refuse a wrong or missing guard secret; collectors have no access to `login_guard` | PGlite | deny |
| Pending/rejected/disabled collector denied on participants, consents, settings update | PGlite | deny |
| Collector cannot call `approve_collector`, update `status`/`role`/`display_name`, read `invite_codes` or other collectors | PGlite | deny |
| Admin approves → collector can create a practice participant | PGlite | allow |
| PIN-reset snippet: new PIN works, old sessions gone, lock cleared | PGlite | allow |
| Join screen blocks submit until fields are valid and Turnstile passed (Cloudflare test keys); wrong-PIN message is the generic one; widget resets after a failure | React Testing Library | both |
| Service worker never caches the Turnstile script | Vitest (build config) | deny |
| Install area: button on `beforeinstallprompt`, iPhone guide on iOS Safari, "open in Safari" on iOS Chrome, hidden in standalone | React Testing Library | both |
| Welcome → Waiting → Home routing by status | React Testing Library | both |

## Phone test script

Run on an Android low-cost phone, an Android mid-range phone and an iPhone.

1. Ryan creates an invite code "Pilot test", max uses 2, on the admin screen. Write the code down.
2. On Android, open the preview link in Chrome → **Join with invite code** → enter the code, your
   name, your phone, PIN 482916 twice → complete the Turnstile check if it asks → you see
   "Waiting for approval" with your name.
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
- **Cloudflare Turnstile CAPTCHA** on Join and Sign in, enforced by Supabase.
- **Invite code defaults:** max **10 uses** (10 collectors can join with one code) and expiry
  **14 days** after creation. Both can be changed per code when it is created; a code can be
  revoked at any time. A "use" is one collector joining; registering participants never uses a code.
- **Before User Created hook** is offered on the free plan (Authentication → Auth Hooks, marked
  Beta). The spec uses it; the trigger stays as a backup in case the Beta hook changes or is switched off.

## Amendment A (6 Nov 2026): approved by Ryan, 6 Nov 2026

Built into this same pull request before F1 is merged. Where this amendment and the text above
disagree, the amendment wins.

### A1. Phone numbers from any country

- Collectors may have a phone number from **any country**. They type it **with its country code**
  (`+234 803 123 4567`). A number that starts with `0` and has 10 digits is still read as Ghana
  (`024 123 4567` → `+233241234567`), so Ghanaian collectors type nothing new.
- Accepted format: international E.164, `+` then 8 to 15 digits, first digit not 0. Spaces,
  dashes and brackets are ignored. A wrong-looking number is refused with "Enter your number with
  its country code, for example +233 24 123 4567".
- Hidden login id: the digits without `+`, as before: `<digits>@phone.anthro-collect.invalid`.
  Ghana ids are unchanged, so nothing already stored needs converting.
- Updated in the app, the Worker, the Join/Sign in labels and hints, the database (collector phone
  check, sign-up hook, trigger, `admin_reset_pin`) through a **new** migration; applied migrations
  are never edited.
- Why it is safe: an invite code, a Turnstile check and admin approval still stand between any
  number and the data.

### A2. Neutral wording

- No screen names a person. "Ryan will approve you soon" → "The project lead will approve you
  soon"; "Contact Ryan" → "Contact the project lead"; "Ask Ryan for a new code" → "Ask the person
  who invited you, or the project lead, for a new code".

### A3. Collectors invite collectors (referral codes)

- **Who:** every **approved** collector has an **Invite a collector** button on Home. Admins keep
  their invite-code screen.
- **The code:** random, 8 characters from the same easy-to-read alphabet, shown once.
  It does **not** contain the collector's name: a name inside a code makes codes easier to guess
  and puts the name in every message it is forwarded in. Instead the database records **who
  created each code**, so the admin sees who referred whom.
- **Sharing:** a **Share** button opens the phone's share sheet (WhatsApp, SMS app, etc.) with a
  ready message: "Join the Anthro Collect student research project at Ashesi University: open
  <app link>, tap Join with invite code and enter ABCD-2345." No SMS is sent by the app (free).
  If sharing isn't available, a **Copy** button copies the same message.
- **Limits** (collector codes): **3 joins**, valid **10 days**, fixed. A collector can have at most
  **2 active codes** at a time, so a lost phone or a leaked code can only let a few people *apply*.
  Collectors see their own codes (uses left, expiry) and can **revoke** them; they never see who
  joined.
- **Admin codes:** default also **3 joins / 10 days** (was 10 / 14), still changeable per code
  (1–500 joins, 1–90 days).
- **Admin view:** each pending collector shows **name, phone, the code's label, and "Invited by
  <collector name>"** (or "Invited by admin"). The approved-collectors list keeps "Invited by".
- **Rules in the database:**
  - only approved collectors and admins can create codes;
  - a collector's code always gets 3 joins and 10 days, whatever the app sends;
  - the 2-active-codes limit is enforced by the database;
  - collectors read only their own codes, never others' or their hashes;
  - a disabled or rejected collector's codes stop working at once.
- Joining with any code still makes the new collector **pending** until an admin approves.

### Tests to add for Amendment A

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Phone: Ghana local, `+233`, Nigeria, UK, US formats accepted; too short/long, no country code, letters refused; login id round-trip | Vitest (`src/lib`) | both |
| Worker `/api/login` accepts an international number, refuses a malformed one without calling Supabase | Vitest (Worker) | both |
| Hook and trigger accept an international hidden id; collector phone stored as `+<digits>` | PGlite | allow |
| Approved collector creates a code (3 joins / 10 days even if asked for more); 3rd active code refused; pending/rejected/disabled collector refused; anon refused | PGlite | both |
| Collector sees only own codes; cannot read hashes of others; can revoke own, not others' | PGlite | both |
| Code of a disabled collector stops working | PGlite | deny |
| Admin sees "Invited by" for every collector | PGlite | allow |
| Invite screen: Share uses the share sheet, falls back to Copy; message has no PIN or phone | React Testing Library | both |
| No screen text contains "Ryan" | React Testing Library | deny |

## Amendment B (6 Nov 2026): approved by Ryan, 6 Nov 2026

Asked for after the first real admin session. Where this amendment and the text above disagree, the
amendment wins. Applied migrations are never edited; a **new** migration adds what is below.

### B1. Admins can show an admin code again

- **Why:** a collector who loses the code should not force the admin to revoke and re-create it.
- Each **active** code the admin created in the app has a **Show code** button. It shows the code
  (`ABCD-2345`) with **Share** and **Copy**.
- **What is kept:** the plain code of an *admin-made* code is kept in a table in the `private`
  schema (not reachable through the Supabase API), next to the hash that sign-up still uses. It is
  read only through `admin_show_invite`, which checks `is_admin()` (an approved admin).
- **Erased when no longer usable:** revoked, used up, expired, or its creator no longer approved.
  Revoke and the last join erase it at once; expired ones are erased the next time an admin lists,
  creates or shows codes. "Show code" is refused for any code that is not active.
- **Not changed:** collector referral codes stay **shown once** (the collector shares them straight
  away and can revoke and make another). Codes made in the SQL editor (bootstrap) have no stored
  plain code, so Show code is not offered for them.
- **Risk accepted by Ryan:** someone with full database access (the Supabase dashboard) could read
  the active admin codes. They are short-lived (default 10 days), few-use (default 3), and every
  person who joins still needs approval.

### B2. Share and Copy for admin codes

- The new-code box and every shown code have **Share** (phone share sheet) and **Copy**, with the
  same ready message as collector referrals: the app link, the code, how many joins are left and the
  last day it works. No PIN, phone number or name in the message.

### B3. Admin screen layout

- **Pending card:** name in large text; then **Phone** (`+233 20 555 2668`, spaced), **Joined**
  (`6 Nov`), **Invited by**, **Code** (its label), each on its own line; Approve / Reject underneath.
- **All collectors:** name on the first line; status (and Admin) and "Invited by" on the next;
  Disable / Approve again as a separate button.
- **Invite codes:** a "Make a new code" form, then a list of cards: label; "1 of 3 joined · works
  until 16 Nov" (or Used up / Expired / Revoked); buttons **Show code** and **Revoke** only while
  the code is active. A used-up code no longer offers Revoke.
- Dates read day-month (`6 Nov`).

### Tests to add for Amendment B

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Admin creates a code and shows it again; plain code equals the one returned at creation | PGlite | allow |
| Collector, pending admin, anon cannot show a code; collector codes and bootstrap codes have nothing to show | PGlite | deny |
| Revoked, used-up, expired code: show refused and plain code erased | PGlite | deny |
| `authenticated` and `anon` cannot read `private.invite_code_plain` directly | PGlite | deny |
| Message for an admin code holds link, code, joins left and date; no phone or PIN | Vitest | both |
| Phone shown spaced for Ghana numbers, unchanged otherwise | Vitest | both |
| Admin screen: pending card lines; Show code reveals the code and Share/Copy work; used-up code has no Revoke or Show code | React Testing Library | both |

## Open questions

None.
