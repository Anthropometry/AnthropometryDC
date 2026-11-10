# Admin guide (Ryan only)

Anthro Collect is a student research project at Ashesi University. These steps are done by Ryan
in the Cloudflare and Supabase dashboards or the Supabase **SQL editor**. Claude Code never runs
them on the live database and never sees the secrets.

## One-time setup for F1 (in this order)

1. **Database migration.** `supabase/migrations/…_f1_onboarding.sql` is applied with
   `supabase db push` after Ryan approves it in chat.
2. **Login-guard secret** (PIN lockout). On your laptop, in the project folder:
   ```bash
   node scripts/make-guard-secret.mjs
   ```
   Follow its three printed steps: `wrangler secret put LOGIN_GUARD_SECRET`, one SQL insert (only
   the hash goes into the database), and `.dev.vars` for local testing.

   **Without a script** (what was done on 6 Nov 2026): in the Supabase SQL editor run
   ```sql
   with s as (
     select translate(encode(extensions.gen_random_bytes(36), 'base64'), '+/', '-_') as secret
   )
   insert into private.settings (key, value)
   select 'login_guard_secret_sha256', encode(sha256(convert_to(secret, 'UTF8')), 'hex') from s
   on conflict (key) do update set value = excluded.value
   returning (select secret from s) as copy_this_to_cloudflare;
   ```
   then Cloudflare → Workers & Pages → anthro-collect → Settings → Variables and Secrets → Add →
   Type **Secret**, name `LOGIN_GUARD_SECRET`, value from the result → Save. Never add it to
   `wrangler.jsonc` (that file is public); `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` stay plain
   Variables managed by `wrangler.jsonc`.
3. **Turnstile widget.** Cloudflare dashboard → Turnstile → **Add widget**:
   - name: Anthro Collect; mode: **Managed**;
   - hostnames: `patience-sombang.workers.dev` (covers the live app **and** every pull-request preview,
     e.g. `pr-11-anthro-collect…`, which are not subdomains of the app's own name) and `localhost`.

   Then put the **site key** in GitHub → Settings → Secrets and variables → Actions →
   **Variables** → `VITE_TURNSTILE_SITE_KEY`. Keep the **secret key** for step 7.
4. **Supabase Auth settings.** Authentication → Sign In / Providers → **Email**:
   - enabled: on;
   - **Confirm email: off**;
   - **Allow new users to sign up: on**;
   - minimum password length: 6.
5. **Invite-code hook.** Authentication → **Auth Hooks** → Add hook → **Before User Created** →
   type **Postgres** → schema `public`, function `hook_before_user_created` → Save.
6. **Deploy** the app: merge the F1 pull request and approve the `production` deploy.
7. **CAPTCHA on.** Supabase → Authentication → **Bot and abuse protection** → Enable CAPTCHA →
   provider **Turnstile** → paste the Turnstile **secret key** → Save. From now on every sign-up
   and sign-in needs the check; do this only after step 6.
8. **Make yourself admin** (below).

## Make yourself the first admin

Invite codes are created by admins, so the very first one is made in the SQL editor.

1. Pick an 8-character code using only `A–Z` without I, L, O and digits `2–9` (for example
   `KQ7M2XPA`, but choose your own) and run:
   ```sql
   insert into public.invite_codes (code_hash, label, max_uses, expires_at)
   values (public.invite_code_hash('YOURCODE'), 'Bootstrap (admin)', 1, now() + interval '1 day');
   ```
2. In the app: **Join with invite code** → that code, your name, your phone, your PIN.
3. Back in the SQL editor, with your own phone in international form (`+` and country code, no
   leading 0, no spaces; for example `024 123 4567` → `+233241234567`). It must show **one row**
   with `admin` / `approved`; no row means you haven't joined yet or the phone doesn't match:
   ```sql
   update public.collectors
   set role = 'admin', status = 'approved', decided_at = now()
   where phone = '+233XXXXXXXXX'
   returning display_name, phone, role, status;
   ```
4. Tap **Check again** in the app → Home shows **Admin: collectors and invite codes**.
5. Delete these queries from the SQL editor history.

## Everyday tasks

- **Approve, reject or disable collectors** and **create or revoke invite codes:** in the app,
  Home → **Admin**. Tap **Share** to send the ready message (app link + code) by WhatsApp or SMS,
  or **Copy**. Defaults: 3 joins, 10 days (you can change them per code).
  **Someone lost their code?** Tap **Show code** on that code (only while it is still active) and
  share it again. Codes made in the SQL editor (bootstrap) and collectors' referral codes can't be
  shown again: make a new one instead.

- **Collectors invite collectors:** every approved collector has **Invite a collector** on Home.
  Their codes always allow 3 joins and last 10 days; each collector can have at most 2 active codes.
  On the Admin screen each person shows **Invited by** (a collector's name, or admin). Everyone who
  joins still waits for your approval. Disabling a collector stops their codes at once.

- **Reset a forgotten PIN:**
  ```sql
  select public.admin_reset_pin('024 123 4567', '482916');   -- phone, new PIN
  select public.admin_reset_pin('+234 803 123 4567', '482916'); -- any country: with + and country code
  ```
  This sets the new PIN, signs the collector out on every phone and clears any lockout. Weak PINs
  (000000, 123456, …) are refused. Give the new PIN in person or by phone call, never in a group
  chat. Then delete the query from the SQL editor history, because it contains the PIN.

- **Clear a lockout only** (collector locked after 5 wrong PINs, and can't wait 15 minutes):
  ```sql
  delete from public.login_guard
  where login_key = encode(sha256(convert_to('233XXXXXXXXX@phone.anthro-collect.invalid', 'UTF8')), 'hex');
  ```
  Put the phone number as digits with its country code, without `+`, spaces or a leading 0
  (`024 123 4567` → `233241234567`; `+234 803 123 4567` → `2348031234567`).

- **Rotate the login-guard secret** (if it may have leaked): run step 2 of the setup again.
  Old values stop working at once.

## Phone checks (F2)

Admin screen → **Phone checks** shows each collector's latest check: phone model, passed or needs
attention, and the date. A failing phone is only a reminder for now; before real collection
(Gate A) every collector's phone should show **Passed**.

## Opening real collection (Gate B, after IRB approval only)

This happens once, after IRB approval; there is no button in the app.

1. **Consent text v1 in the app.** Give Claude Code the IRB-approved consent wording. It is added
   word for word as version `v1` (`src/lib/consentText.ts`) in a pull request, and deployed
   **before** step 2. Until the app has `v1`, real collectors see "The approved consent text is
   not in this version of the app yet".
2. **SQL editor.** This deletes every practice participant (practice consents go with them), sets
   the approved consent version and opens collection. Use your own phone number in the last line
   so the log shows who opened it.

   ```sql
   begin;
   delete from public.participants where is_practice;
   update public.app_settings
   set collection_open = true,
       consent_version = 'v1',
       updated_at = now(),
       updated_by = (select id from public.collectors where phone = '+233XXXXXXXXX' and role = 'admin')
   returning collection_open, consent_version, updated_at, updated_by;
   commit;
   ```

   It must return one row with `collection_open = true`, `consent_version = v1` and your id in
   `updated_by`.
3. **Practice images.** Practice signatures (and later photos) are stored under the `practice/`
   folder. In Cloudflare → R2 → each bucket (`anthro-collect-signatures`, `anthro-collect-photos`)
   → Settings → **Object lifecycle rules** → Add rule:
   - prefix `practice/`;
   - delete objects 1 day after upload.

   Keep the rule (practice stays available after opening, so new practice images are cleared
   daily). Real images are never under `practice/`.

Collectors see **Start real participant** the next time their app is online. Practice stays
available, always under the PRACTICE banner. Record the date in DISCUSSION.md.

## Withdrawing a participant (F4)

When someone gives you their **receipt code** and asks to withdraw:

1. Admin screen → **Withdraw a participant**.
2. Type the code → **Look up**. You see practice or real, adult or under 18, the date and the
   collector; never a name.
3. Type the code again → **Withdraw and delete**.

The participant, their consent and their signature images (later also measurements and photos) are
deleted. A log keeps only a fingerprint of the code, the date and you, so a repeat request shows
"Already withdrawn".

If the app says the images could not be deleted, the database part is done. Try again later, or in
Cloudflare → R2 delete the folders `<id>/` and `practice/<id>/` it shows, in both buckets.
