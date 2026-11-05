# F1: Login, sign-up with invite code, and install

**Status:** draft <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M1
**Branch:** `f1-login`

## Goal (one sentence)

A collector joins with an invite code, phone number and 6-digit PIN, waits until Ryan approves
them, then signs in with phone + PIN on Android Chrome and iPhone Safari, installs the app to the
Home Screen and can open it offline.

## User story

- As a **new collector**, I want to join with the invite code Ryan gave me and my own phone and
  PIN, so I don't need an email address or anyone to type my PIN for me.
- As **Ryan (admin)**, I want to approve each person who joins before they can see or save any
  data, so only trained collectors take part in this Ashesi University student research project.
- As an **approved collector**, I want to sign in with phone + PIN and open the app with no signal.

## How it works (summary)

1. Ryan creates an invite code (admin screen). He shares it in person or by WhatsApp with trained collectors.
2. The collector opens the app link and taps **Join**. They enter the invite code, their phone,
   a 6-digit PIN and the PIN again.
3. In code, the phone becomes the hidden login id `233XXXXXXXXX@phone.anthro-collect.invalid`.
   The app calls Supabase `signUp` with that id, the PIN as password, and the invite code in the
   sign-up metadata. No email is ever shown or sent.
4. Supabase runs a **Before User Created hook** (a Postgres function). It refuses the sign-up
   unless the login id has the hidden-id shape and the invite code is valid (exists, not revoked,
   not expired, uses left).
5. A trigger on the new auth user then:
   - uses up one invite (row locked, so two people can't take the last use);
   - creates the `collectors` row with status **pending**;
   - deletes the raw invite code from the user's metadata.
6. The collector sees **"Waiting for approval"**. While pending, row-level security denies every
   table except their own collector row, which they need to see their status.
7. Ryan opens **Pending collectors** and taps Approve or Reject. Once approved, the collector's
   next app open goes to Home.

## Screens

English plus the chosen language where it applies, big buttons, number pad for phone/PIN/code.
Every screen shows "Ashesi University · Student research project".

1. **Welcome:** two buttons, **Sign in** and **Join with invite code**, plus an **Install the app** link.
2. **Join:**
   - fields: invite code (8 characters, letters and numbers, not case-sensitive), phone, PIN, confirm PIN;
   - plain messages for wrong code, phone already joined, PINs don't match, and weak PIN
     (000000, 123456, all the same digit, straight runs up or down are refused);
   - no email field, no name field.
3. **Waiting for approval:** "Ryan will approve you soon." Shows the collector's phone (their
   own) and a **Check again** button. They stay signed in.
4. **Sign in:** phone + PIN. The only message for a wrong phone or PIN is "Phone number or PIN is
   not right." It does not say which one. Too many tries shows "Too many tries. Wait 15 minutes."
   A rejected or disabled account shows "Your account is not active. Contact Ryan."
5. **Install help:**
   - Android Chrome: menu ⋮ → Add to Home screen (or the Install prompt when it appears);
   - iPhone Safari: Share → Add to Home Screen;
   - pictures of both, and a check showing whether the app is already installed (standalone mode).
6. **Admin: Pending collectors** (admin role only):
   - list of pending collectors (phone, invite code label, joined time) with **Approve** / **Reject**;
   - **Invite codes:** create (label, max uses, expiry date), see uses, revoke. The code is shown
     once at creation; after that only its label.
7. **Sign out:** in a small menu. It warns if items are still waiting to sync (F7 fills this in later).

## Data written

| Where | Fields | When |
| --- | --- | --- |
| Supabase `auth.users` (managed by Supabase) | hidden login id, PIN (hashed by Supabase) | Join |
| `public.invite_codes` (new) | `id`, `code_hash` (SHA-256 of the upper-cased code), `label`, `max_uses`, `uses`, `expires_at`, `revoked`, `created_by`, `created_at` | Admin creates/revokes; trigger increments `uses` |
| `public.collectors` (changed) | new: `status` (`pending` / `approved` / `rejected` / `disabled`, default `pending`), `invite_code_id`, `decided_by`, `decided_at` | Created by trigger at Join; status set by admin |
| Phone (localStorage via supabase-js) | Supabase session (access + refresh token) | Sign in |

The plain invite code is never stored; only its hash. There are no names, no email and no participant data.

New migration: `supabase/migrations/<timestamp>_f1_onboarding.sql`, applied only after Ryan
approves it in chat.

## Supabase settings this needs (Ryan sets them in the dashboard)

- Authentication → Sign In / Providers → Email: **on**; **Confirm email: off**; **Allow new users to sign up: on**.
  Sign-up is open to the internet, which is why the hook is required.
- Authentication → Hooks → **Before User Created** → `public.hook_before_user_created`.
- Minimum password length 6. Rate limits stay at the Supabase defaults or stricter.
- Ryan's own account is created once by joining with a bootstrap invite code. Ryan then runs one
  SQL line in the Supabase SQL editor that sets his row to `role = 'admin', status = 'approved'`.
  Claude Code never runs it.

## Acceptance criteria (testable)

- [ ] Join with a valid code, a new phone and matching PINs creates a **pending** collector; the app shows "Waiting for approval".
- [ ] Join with a wrong, revoked, expired or used-up code is refused with a plain message, and no auth user or collector row is created.
- [ ] Two people joining with the last use of a code: exactly one succeeds.
- [ ] A sign-up sent straight to Supabase (bypassing the app) with no code, a bad code, or an email that is not a hidden login id is refused by the hook.
- [ ] A pending, rejected or disabled collector can read only their own collector row: no participants, no consents, no inserts.
- [ ] After admin approval, the collector reaches Home on the next open, with no new sign-in needed.
- [ ] A collector cannot approve themselves, change their own status or role, or read invite codes.
- [ ] Phone + PIN sign-in works on Android Chrome and iPhone Safari; a wrong PIN shows the plain message.
- [ ] Add to Home Screen works on both. After one online sign-in, the installed app opens in airplane mode and shows the last screen state (offline banner).
- [ ] No email field and no name field anywhere; the hidden login id never appears on any screen or in any log.

## Security requirements

- **Inputs validated:**
  - phone and PIN on the phone (`src/lib/phone.ts`), including the weak-PIN list;
  - invite code format on the phone;
  - code validity in the hook (server);
  - `status` / `role` check constraints in the database.
- **Access checked server-side:**
  - every collector policy (participants, consents, settings update) adds "status is approved";
  - `invite_codes` is admin-only;
  - only an admin can change `status`, through a security-definer function `approve_collector(id, decision)` that checks `is_admin()`;
  - collectors' column grants still allow only `unit` and `language`.
- **Fail-safe:** new accounts start pending, so a failed or skipped check never leaves a collector
  approved. If the hook is switched off by mistake, the trigger still refuses a sign-up without a valid code.
- **Brute force:**
  - invite codes are 8 characters from a 31-character alphabet with no 0/O/1/I/L (≈ 8.5 × 10¹¹ combinations);
  - sign-up and sign-in are limited by Supabase's per-IP rate limits.
  - A 6-digit PIN is weaker than a password, so see open question 2.
- **Secrets:** none in code. The hook runs inside Postgres, and the Worker and app use only the publishable key.
- **Logs:** never log phone, PIN, login id or invite code (lint rule `no-console` stays; hook errors return codes, not inputs).
- **Deny cases that must be tested:** every "refused" line in the acceptance criteria.

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Weak PIN list, PIN match, invite code format and normalising | Vitest (`src/lib`) | both |
| `signUpWithInvite` sends the hidden id + code, never the raw phone; maps hook errors to plain messages | Vitest + fake client | both |
| Hook: valid code ok; missing/wrong/revoked/expired/used-up code refused; non-hidden-id email refused | PGlite | both |
| Trigger: uses up one invite; last-use race (two inserts, one fails); collector row is pending; raw code removed from metadata | PGlite | both |
| Pending/rejected/disabled collector denied on participants, consents, settings update | PGlite | deny |
| Collector cannot call `approve_collector`, update `status`/`role`, read `invite_codes` | PGlite | deny |
| Admin approves → collector can create a practice participant | PGlite | allow |
| Join screen blocks submit until fields are valid; wrong-PIN message is the generic one | React Testing Library | both |
| Welcome → Waiting → Home routing by status | React Testing Library | both |

## Phone test script

Run on an Android low-cost phone, an Android mid-range phone and an iPhone.

1. Ryan creates an invite code "Pilot test", max uses 2, on the admin screen. Write the code down.
2. On Android, open the preview link in Chrome → **Join with invite code** → enter the code, your phone, PIN 482916 twice → you see "Waiting for approval".
3. Try **Join** again on the iPhone with a wrong code (e.g. AAAA2222) → plain "code is not right" message.
4. On the admin screen, approve the Android phone → on Android tap **Check again** → Home opens.
5. Sign out. Sign in with the right phone and PIN 000000 → "Phone number or PIN is not right."
6. Sign in with the correct PIN → Home.
7. Android: ⋮ → Add to Home screen. iPhone: Share → Add to Home Screen (after joining with the second use of the code and being approved).
8. Turn on airplane mode, close the app fully, open it from the Home Screen → it opens and shows the offline banner.
9. Join with the same code a third time → refused (used up).

## Open questions for Ryan

1. **Name at sign-up?** The spec asks for no name, so you identify collectors by phone and invite
   code label. Do you want a collector display name? It would be the collector's own name, never a
   participant's.
2. **PIN lockout.** Supabase only limits tries per IP address. A per-account lockout (for example
   5 wrong PINs → 15-minute wait) would need either the Password Verification hook (paid plans
   only) or sign-in routed through the Worker with a small counter table in Postgres. Is the
   Worker route OK, or are Supabase's IP limits enough for the pilot?
3. **Forgotten PIN.** With no email or SMS, a reset has to go through you. Should the admin screen
   get a "Reset PIN" button (needs a Worker endpoint that checks you are admin, plus the secret key
   stored as a Cloudflare secret), or do you reset in the Supabase dashboard?
4. **Invite code defaults.** Are max 10 uses and expiry after 14 days OK as defaults?
5. **Free plan check.** Please confirm the Before User Created hook is offered on your Supabase
   plan (Authentication → Hooks). If it isn't, the trigger alone enforces the code, but a refused
   sign-up then shows a generic "could not join" message.
