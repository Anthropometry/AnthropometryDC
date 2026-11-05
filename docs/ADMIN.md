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
3. **Turnstile widget.** Cloudflare dashboard → Turnstile → **Add widget**:
   - name: Anthro Collect; mode: **Managed**;
   - hostnames: `anthro-collect.patience-sombang.workers.dev` (previews are its subdomains) and `localhost`.

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
   `RYAN7K2M`, but choose your own) and run:
   ```sql
   insert into public.invite_codes (code_hash, label, max_uses, expires_at)
   values (public.invite_code_hash('YOURCODE'), 'Bootstrap (Ryan)', 1, now() + interval '1 day');
   ```
2. In the app: **Join with invite code** → that code, your name, your phone, your PIN.
3. Back in the SQL editor (use your own phone, in `+233…` form):
   ```sql
   update public.collectors
   set role = 'admin', status = 'approved', decided_at = now()
   where phone = '+233XXXXXXXXX';
   ```
4. Tap **Check again** in the app → Home shows **Admin: collectors and invite codes**.
5. Delete these queries from the SQL editor history.

## Everyday tasks

- **Approve, reject or disable collectors** and **create or revoke invite codes:** in the app,
  Home → **Admin**. A new invite code is shown once; write it down and share it in person or by
  WhatsApp. Defaults: 10 uses, 14 days.

- **Reset a forgotten PIN:**
  ```sql
  select public.admin_reset_pin('024 123 4567', '482916');   -- phone, new PIN
  ```
  This sets the new PIN, signs the collector out on every phone and clears any lockout. Weak PINs
  (000000, 123456, …) are refused. Give the new PIN in person or by phone call, never in a group
  chat. Then delete the query from the SQL editor history, because it contains the PIN.

- **Clear a lockout only** (collector locked after 5 wrong PINs, and can't wait 15 minutes):
  ```sql
  delete from public.login_guard
  where login_key = encode(sha256(convert_to('233XXXXXXXXX@phone.anthro-collect.invalid', 'UTF8')), 'hex');
  ```
  Put the phone number in the `233…` form, without `+` or the leading 0.

- **Rotate the login-guard secret** (if it may have leaked): run step 2 of the setup again.
  Old values stop working at once.
