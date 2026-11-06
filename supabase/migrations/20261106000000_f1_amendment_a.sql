-- F1 Amendment A (Ashesi University student research project). Spec: specs/F1-login.md.
-- NOT APPLIED until Ryan approves `supabase db push` in chat. Earlier migrations are not edited.
--
--   A1. Collector phone numbers from any country (E.164: + then 8-15 digits).
--   A3. Collectors invite collectors: referral codes (3 joins, 10 days, max 2 active per
--       collector), admin sees who invited whom; a disabled/rejected creator's codes stop working.
--       Admin code defaults become 3 joins / 10 days.

-- ---------------------------------------------------------------- A1: any-country phones
alter table public.collectors drop constraint collectors_phone_check;
alter table public.collectors add constraint collectors_phone_check check (phone ~ '^\+[1-9][0-9]{7,14}$');

-- ---------------------------------------------------------------- A3: defaults
alter table public.invite_codes alter column max_uses set default 3;
alter table public.invite_codes alter column expires_at set default now() + interval '10 days';

-- An invite works only if it is live AND its creator (if any) is still approved.
create or replace function private.usable_invite_id(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id
  from public.invite_codes i
  where i.code_hash = public.invite_code_hash(p_code)
    and not i.revoked
    and i.expires_at > now()
    and i.uses < i.max_uses
    and not exists (
      select 1 from public.collectors c where c.id = i.created_by and c.status <> 'approved'
    );
$$;
revoke execute on function private.usable_invite_id(text) from public, anon, authenticated;

create or replace function public.signup_problem(p_email text, p_meta jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_meta ->> 'display_name', ''));
begin
  if coalesce(p_email, '') !~ '^[1-9][0-9]{7,14}@phone\.anthro-collect\.invalid$' then
    return 'invalid_login';
  end if;
  if length(v_name) < 2 or length(v_name) > 60 then
    return 'invalid_name';
  end if;
  if private.usable_invite_id(p_meta ->> 'invite_code') is null then
    return 'invalid_invite';
  end if;
  return null;
end;
$$;

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
  where i.id = private.usable_invite_id(v_meta ->> 'invite_code')
  for update;

  if v_invite is null or private.usable_invite_id(v_meta ->> 'invite_code') is distinct from v_invite then
    raise exception 'signup refused: invalid_invite' using errcode = 'check_violation';
  end if;

  update public.invite_codes set uses = uses + 1 where id = v_invite;

  insert into public.collectors (id, phone, display_name, status, invite_code_id)
  values (new.id, '+' || split_part(new.email, '@', 1), btrim(v_meta ->> 'display_name'), 'pending', v_invite);

  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'invite_code' - 'display_name'
  where id = new.id;

  return new;
end;
$$;

-- ---------------------------------------------------------------- shared code generator
create or replace function private.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars, no 0 O 1 I L
  v_bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  v_code  text := '';
begin
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i * 2) * 256 + get_byte(v_bytes, i * 2 + 1)) % 31, 1);
  end loop;
  return v_code;
end;
$$;
revoke execute on function private.new_invite_code() from public, anon, authenticated;

-- Admin codes: defaults now 3 joins / 10 days. Drop and recreate to change the defaults.
drop function public.create_invite(text, int, int);
create function public.create_invite(p_label text, p_max_uses int default 3, p_days int default 10)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := private.new_invite_code();
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_days not between 1 and 90 then
    raise exception 'expiry must be 1 to 90 days' using errcode = 'check_violation';
  end if;
  insert into public.invite_codes (code_hash, label, max_uses, expires_at, created_by)
  values (public.invite_code_hash(v_code), btrim(p_label), p_max_uses, now() + make_interval(days => p_days), auth.uid());
  return v_code;
end;
$$;
revoke execute on function public.create_invite(text, int, int) from public, anon;
grant execute on function public.create_invite(text, int, int) to authenticated;

-- ---------------------------------------------------------------- A3: collector referral codes
-- Any approved collector: 3 joins, 10 days, fixed; at most 2 active codes at a time.
create or replace function public.create_my_invite()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me     public.collectors;
  v_active int;
  v_code   text := private.new_invite_code();
begin
  select * into v_me from public.collectors c where c.id = auth.uid();
  if v_me.id is null or v_me.status <> 'approved' then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  -- One at a time per collector, so two taps can't both pass the limit.
  perform pg_advisory_xact_lock(hashtext('invite:' || v_me.id::text));
  select count(*) into v_active
  from public.invite_codes i
  where i.created_by = v_me.id and not i.revoked and i.expires_at > now() and i.uses < i.max_uses;
  if v_active >= 2 then
    raise exception 'too_many_active_codes' using errcode = 'check_violation';
  end if;
  insert into public.invite_codes (code_hash, label, max_uses, expires_at, created_by)
  values (public.invite_code_hash(v_code), 'Referral from ' || coalesce(v_me.display_name, 'collector'), 3,
          now() + interval '10 days', v_me.id);
  return v_code;
end;
$$;

-- A collector's own codes, without hashes.
create or replace function public.my_invites()
returns table (id uuid, label text, max_uses int, uses int, expires_at timestamptz, revoked boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.label, i.max_uses, i.uses, i.expires_at, i.revoked, i.created_at
  from public.invite_codes i
  where i.created_by = auth.uid()
  order by i.created_at desc;
$$;

create or replace function public.revoke_my_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invite_codes set revoked = true where id = p_id and created_by = auth.uid();
  if not found then
    raise exception 'no such code' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Admin list with "Invited by". Admin only.
create or replace function public.admin_list_collectors()
returns table (
  id uuid, display_name text, phone text, status text, role text, created_at timestamptz,
  invite_label text, invited_by text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
  select c.id, c.display_name, c.phone, c.status, c.role, c.created_at, i.label,
         case
           when i.id is null then null
           when inviter.id is null then 'admin'
           when inviter.role = 'admin' then coalesce(inviter.display_name, 'admin') || ' (admin)'
           else coalesce(inviter.display_name, 'a collector')
         end
  from public.collectors c
  left join public.invite_codes i on i.id = c.invite_code_id
  left join public.collectors inviter on inviter.id = i.created_by
  order by c.created_at desc;
end;
$$;

revoke execute on function public.create_my_invite() from public, anon;
revoke execute on function public.my_invites() from public, anon;
revoke execute on function public.revoke_my_invite(uuid) from public, anon;
revoke execute on function public.admin_list_collectors() from public, anon;
grant execute on function public.create_my_invite() to authenticated;
grant execute on function public.my_invites() to authenticated;
grant execute on function public.revoke_my_invite(uuid) to authenticated;
grant execute on function public.admin_list_collectors() to authenticated;

-- ---------------------------------------------------------------- A1: admin PIN reset, any country
create or replace function public.admin_reset_pin(p_phone text, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw    text := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
  v_digits text;
  v_email  text;
  v_uid    uuid;
begin
  -- 024 123 4567 (Ghana), +233..., 00233..., +234...
  if v_raw ~ '^0[25][0-9]{8}$' then
    v_digits := '233' || substr(v_raw, 2);
  elsif v_raw ~ '^\+' then
    v_digits := substr(v_raw, 2);
  elsif v_raw ~ '^00' then
    v_digits := substr(v_raw, 3);
  else
    v_digits := v_raw;
  end if;
  if v_digits !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'not a phone number with country code' using errcode = 'check_violation';
  end if;
  if p_new_pin !~ '^[0-9]{6}$'
     or p_new_pin ~ '^(.)\1{5}$'
     or p_new_pin in ('012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321', '543210') then
    raise exception 'PIN must be 6 digits and not weak' using errcode = 'check_violation';
  end if;
  v_email := v_digits || '@phone.anthro-collect.invalid';

  select u.id into v_uid from auth.users u where u.email = v_email;
  if v_uid is null then
    raise exception 'no collector with that phone' using errcode = 'no_data_found';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_pin, extensions.gen_salt('bf'))
  where id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;
  delete from public.login_guard
  where login_key = encode(sha256(convert_to(v_email, 'UTF8')), 'hex');
end;
$$;
revoke execute on function public.admin_reset_pin(text, text) from public, anon, authenticated;
