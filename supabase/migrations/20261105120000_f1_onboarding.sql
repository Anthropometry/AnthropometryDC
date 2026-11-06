-- F1 onboarding (Ashesi University student research project). Spec: specs/F1-login.md.
-- NOT APPLIED until Ryan approves `supabase db push` in chat.
--
--   * Collectors self sign up with an invite code + their own display name + phone + PIN.
--     A Before User Created hook refuses bad sign-ups; a trigger on auth.users enforces the same
--     rules again (backup), uses up one invite and creates a PENDING collector row.
--   * Pending / rejected / disabled collectors can read only their own collector row.
--   * Only admins approve, reject, disable or rename collectors, and manage invite codes.
--   * Per-account PIN lockout counters (login_guard), reachable only with the Worker's guard secret.
--   * admin_reset_pin(): for Ryan in the SQL editor only.

-- ---------------------------------------------------------------- private schema
create schema if not exists private;
revoke all on schema private from public;

-- Holds the SHA-256 of the Worker's login-guard secret (never the secret itself).
create table private.settings (
  key   text primary key,
  value text not null
);

-- ---------------------------------------------------------------- invite codes
create table public.invite_codes (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  label       text not null check (length(label) between 1 and 80),
  max_uses    int  not null default 10 check (max_uses between 1 and 500),
  uses        int  not null default 0 check (uses >= 0),
  expires_at  timestamptz not null default now() + interval '14 days',
  revoked     boolean not null default false,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  check (uses <= max_uses)
);

-- Upper-case, drop spaces and dashes: "abcd-2345" and "ABCD 2345" are the same code.
create or replace function public.normalise_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
$$;

create or replace function public.invite_code_hash(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(public.normalise_invite_code(p_code), 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------- collectors: name + status
alter table public.collectors
  add column display_name   text check (display_name is null or length(display_name) between 2 and 60),
  add column status         text not null default 'pending'
                            check (status in ('pending', 'approved', 'rejected', 'disabled')),
  add column invite_code_id uuid references public.invite_codes (id),
  add column decided_by     uuid references auth.users (id),
  add column decided_at     timestamptz;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.collectors c where c.id = auth.uid() and c.status = 'approved'
  );
$$;

-- Admins must also be approved (a disabled admin is no admin).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.collectors c
    where c.id = auth.uid() and c.role = 'admin' and c.status = 'approved'
  );
$$;

revoke execute on function public.is_approved() from public, anon;
grant execute on function public.is_approved() to authenticated;

-- ---------------------------------------------------------------- sign-up rules (shared)
-- Returns null when the sign-up is fine, else an error code. Used by the hook and the trigger.
create or replace function public.signup_problem(p_email text, p_meta jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_meta ->> 'display_name', ''));
  v_hash text := public.invite_code_hash(p_meta ->> 'invite_code');
begin
  if coalesce(p_email, '') !~ '^233[25][0-9]{8}@phone\.anthro-collect\.invalid$' then
    return 'invalid_login';
  end if;
  if length(v_name) < 2 or length(v_name) > 60 then
    return 'invalid_name';
  end if;
  if not exists (
    select 1 from public.invite_codes i
    where i.code_hash = v_hash and not i.revoked and i.expires_at > now() and i.uses < i.max_uses
  ) then
    return 'invalid_invite';
  end if;
  return null;
end;
$$;

revoke execute on function public.signup_problem(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- Before User Created hook
-- Dashboard: Authentication → Auth Hooks → Before User Created → public.hook_before_user_created
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_problem text := public.signup_problem(
    event -> 'user' ->> 'email',
    coalesce(event -> 'user' -> 'user_metadata', event -> 'user' -> 'raw_user_meta_data', '{}'::jsonb)
  );
begin
  if v_problem is null then
    return '{}'::jsonb;
  end if;
  -- The message is a code the app turns into plain words; it never echoes the input back.
  return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', v_problem));
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------- new auth user → pending collector
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_problem text  := public.signup_problem(new.email, v_meta);
  v_invite  uuid;
begin
  if v_problem is not null then
    raise exception 'signup refused: %', v_problem using errcode = 'check_violation';
  end if;

  -- Lock the invite row so two people can't both take its last use.
  select i.id into v_invite
  from public.invite_codes i
  where i.code_hash = public.invite_code_hash(v_meta ->> 'invite_code')
    and not i.revoked and i.expires_at > now() and i.uses < i.max_uses
  for update;

  if v_invite is null then
    raise exception 'signup refused: invalid_invite' using errcode = 'check_violation';
  end if;

  update public.invite_codes set uses = uses + 1 where id = v_invite;

  insert into public.collectors (id, phone, display_name, status, invite_code_id)
  values (new.id, '+' || split_part(new.email, '@', 1), btrim(v_meta ->> 'display_name'), 'pending', v_invite);

  -- Keep the code and name only where they belong (hash in invite_codes, name in collectors).
  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'invite_code' - 'display_name'
  where id = new.id;

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------- admin functions
create or replace function public.approve_collector(p_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('approved', 'rejected', 'disabled') then
    raise exception 'bad decision' using errcode = 'check_violation';
  end if;
  if p_id = auth.uid() then
    raise exception 'admins cannot change their own status' using errcode = 'check_violation';
  end if;
  update public.collectors
  set status = p_decision, decided_by = auth.uid(), decided_at = now()
  where id = p_id;
  if not found then
    raise exception 'no such collector' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.admin_rename_collector(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.collectors set display_name = btrim(p_name) where id = p_id;
end;
$$;

-- Creates an invite and returns the plain code ONCE. Only its hash is stored.
create or replace function public.create_invite(p_label text, p_max_uses int default 10, p_days int default 14)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars, no 0 O 1 I L
  v_bytes bytea;
  v_code  text := '';
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_days not between 1 and 90 then
    raise exception 'expiry must be 1 to 90 days' using errcode = 'check_violation';
  end if;
  v_bytes := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i * 2) * 256 + get_byte(v_bytes, i * 2 + 1)) % 31, 1);
  end loop;
  insert into public.invite_codes (code_hash, label, max_uses, expires_at, created_by)
  values (public.invite_code_hash(v_code), btrim(p_label), p_max_uses, now() + make_interval(days => p_days), auth.uid());
  return v_code;
end;
$$;

create or replace function public.revoke_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.invite_codes set revoked = true where id = p_id;
end;
$$;

revoke execute on function public.approve_collector(uuid, text) from public, anon;
revoke execute on function public.admin_rename_collector(uuid, text) from public, anon;
revoke execute on function public.create_invite(text, int, int) from public, anon;
revoke execute on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.approve_collector(uuid, text) to authenticated;
grant execute on function public.admin_rename_collector(uuid, text) to authenticated;
grant execute on function public.create_invite(text, int, int) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;

-- ---------------------------------------------------------------- PIN lockout (Worker only)
create table public.login_guard (
  login_key    text primary key check (login_key ~ '^[0-9a-f]{64}$'), -- sha256(hidden login id)
  failures     int not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);

create or replace function private.guard_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.settings s
    where s.key = 'login_guard_secret_sha256'
      and length(coalesce(p_secret, '')) >= 32
      and s.value = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  );
$$;

-- Seconds the account is still locked (0 = not locked).
create or replace function public.login_guard_check(p_key text, p_secret text)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  if not private.guard_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  select g.locked_until into v_until from public.login_guard g where g.login_key = p_key;
  return greatest(0, ceil(extract(epoch from (coalesce(v_until, now()) - now()))))::int;
end;
$$;

-- Records one attempt. 5 failures within 15 minutes → locked for 15 minutes.
-- Returns seconds locked after this attempt (0 = not locked).
create or replace function public.login_guard_record(p_key text, p_ok boolean, p_secret text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.login_guard;
begin
  if not private.guard_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'bad key' using errcode = 'check_violation';
  end if;
  if p_ok then
    delete from public.login_guard where login_key = p_key;
    return 0;
  end if;

  insert into public.login_guard as g (login_key, failures, window_start)
  values (p_key, 1, now())
  on conflict (login_key) do update
    set failures     = case when g.window_start < now() - interval '15 minutes' then 1 else g.failures + 1 end,
        window_start = case when g.window_start < now() - interval '15 minutes' then now() else g.window_start end
  returning * into v_row;

  if v_row.failures >= 5 then
    update public.login_guard
    set locked_until = now() + interval '15 minutes', failures = 0, window_start = now()
    where login_key = p_key;
    return 900;
  end if;
  return greatest(0, ceil(extract(epoch from (coalesce(v_row.locked_until, now()) - now()))))::int;
end;
$$;

revoke execute on function private.guard_secret_ok(text) from public, anon, authenticated;
revoke execute on function public.login_guard_check(text, text) from public;
revoke execute on function public.login_guard_record(text, boolean, text) from public;
-- The Worker calls these with the publishable key (role anon); the guard secret is the real check.
grant execute on function public.login_guard_check(text, text) to anon, authenticated;
grant execute on function public.login_guard_record(text, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------- admin PIN reset (SQL editor only)
create or replace function public.admin_reset_pin(p_phone text, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_national text := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
  v_email    text;
  v_uid      uuid;
begin
  -- 024..., 233..., +233... → 233XXXXXXXXX
  v_national := regexp_replace(v_national, '^(\+?233|0)', '');
  if v_national !~ '^[25][0-9]{8}$' then
    raise exception 'not a Ghana mobile number' using errcode = 'check_violation';
  end if;
  if p_new_pin !~ '^[0-9]{6}$'
     or p_new_pin ~ '^(.)\1{5}$'
     or p_new_pin in ('012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321', '543210') then
    raise exception 'PIN must be 6 digits and not weak' using errcode = 'check_violation';
  end if;
  v_email := '233' || v_national || '@phone.anthro-collect.invalid';

  select u.id into v_uid from auth.users u where u.email = v_email;
  if v_uid is null then
    raise exception 'no collector with that phone' using errcode = 'no_data_found';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_pin, extensions.gen_salt('bf'))
  where id = v_uid;
  delete from auth.sessions where user_id = v_uid;          -- ends sessions on every phone
  delete from auth.refresh_tokens where user_id = v_uid::text;
  delete from public.login_guard
  where login_key = encode(sha256(convert_to(v_email, 'UTF8')), 'hex');
end;
$$;

revoke execute on function public.admin_reset_pin(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- privileges
revoke all on public.invite_codes, public.login_guard from anon, authenticated;
grant select on public.invite_codes to authenticated;      -- admins only, via RLS below
-- Collectors' column grants on public.collectors are unchanged: update (unit, language) only.

-- ---------------------------------------------------------------- row-level security
alter table public.invite_codes enable row level security;
alter table public.login_guard  enable row level security;   -- no policies: functions only

create policy invites_admin_read on public.invite_codes
  for select to authenticated using (public.is_admin());

-- Approved collectors only, from now on.
drop policy participants_read_own   on public.participants;
drop policy participants_insert_own on public.participants;
drop policy participants_update_own on public.participants;
drop policy consents_insert_own     on public.consents;
drop policy collectors_update_self  on public.collectors;

create policy participants_read_own on public.participants
  for select to authenticated
  using ((collector_id = auth.uid() and public.is_approved()) or public.is_admin());
create policy participants_insert_own on public.participants
  for insert to authenticated
  with check (collector_id = auth.uid() and public.is_approved());
create policy participants_update_own on public.participants
  for update to authenticated
  using (collector_id = auth.uid() and public.is_approved())
  with check (collector_id = auth.uid() and public.is_approved());

create policy consents_insert_own on public.consents
  for insert to authenticated
  with check (
    collector_id = auth.uid()
    and public.is_approved()
    and exists (
      select 1 from public.participants p
      where p.id = participant_id and p.collector_id = auth.uid()
    )
  );

create policy collectors_update_self on public.collectors
  for update to authenticated
  using (id = auth.uid() and public.is_approved())
  with check (id = auth.uid() and public.is_approved());
