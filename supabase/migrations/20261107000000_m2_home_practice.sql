-- M2: F2 Home + settings + phone check, F3 Practice mode (Ashesi University student research
-- project). Specs: specs/F2-home-settings.md, specs/F3-practice-mode.md.
-- NOT APPLIED until Ryan approves `supabase db push` in chat. Earlier migrations are not edited.

-- ---------------------------------------------------------------- F2: settings chosen once
alter table public.collectors add column settings_chosen_at timestamptz;

-- Set by the database whenever unit or language is saved; collectors can't write it (no grant).
create or replace function private.mark_settings_chosen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.settings_chosen_at := now();
  return new;
end;
$$;
revoke execute on function private.mark_settings_chosen() from public, anon, authenticated;

create trigger collectors_settings_chosen
  before update of unit, language on public.collectors
  for each row execute function private.mark_settings_chosen();

-- ---------------------------------------------------------------- F2: phone checks
create table public.device_checks (
  id                uuid primary key default gen_random_uuid(),
  collector_id      uuid not null default auth.uid() references public.collectors (id) on delete cascade,
  phone_model       text check (phone_model is null or length(phone_model) between 1 and 80),
  os                text check (os is null or length(os) between 1 and 40),
  browser           text check (browser is null or length(browser) between 1 and 40),
  camera_ok         boolean not null,
  camera_resolution text check (camera_resolution is null or camera_resolution ~ '^[0-9]{2,5}x[0-9]{2,5}$'),
  motion_ok         boolean not null,
  storage_ok        boolean not null,
  storage_mb        int check (storage_mb is null or storage_mb between 0 and 10000000),
  detector_ok       boolean,                                  -- F6
  passed            boolean not null,
  checked_at        timestamptz not null default now(),
  check (passed = (camera_ok and motion_ok and storage_ok))
);
create index device_checks_collector_idx on public.device_checks (collector_id, checked_at desc);

revoke all on public.device_checks from anon, authenticated;
grant select, insert on public.device_checks to authenticated;   -- no update, no delete
alter table public.device_checks enable row level security;

create policy device_checks_insert_own on public.device_checks
  for insert to authenticated
  with check (collector_id = auth.uid() and public.is_approved() and checked_at > now() - interval '1 minute');
create policy device_checks_read_own on public.device_checks
  for select to authenticated
  using ((collector_id = auth.uid() and public.is_approved()) or public.is_admin());

-- Latest check per collector, for the Admin screen. Admin only.
create or replace function public.admin_phone_checks()
returns table (
  collector_id uuid, display_name text, phone_model text, os text, browser text,
  camera_ok boolean, motion_ok boolean, storage_ok boolean, passed boolean, checked_at timestamptz
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
  select distinct on (d.collector_id)
         d.collector_id, c.display_name, d.phone_model, d.os, d.browser,
         d.camera_ok, d.motion_ok, d.storage_ok, d.passed, d.checked_at
  from public.device_checks d
  join public.collectors c on c.id = d.collector_id
  order by d.collector_id, d.checked_at desc;
end;
$$;
revoke execute on function public.admin_phone_checks() from public, anon;
grant execute on function public.admin_phone_checks() to authenticated;

-- ---------------------------------------------------------------- F3: practice numbers
alter table public.participants add column practice_no int;
create unique index participants_practice_no_idx on public.participants (collector_id, practice_no);

-- P-0001, P-0002 … per collector, set by the database (whatever the phone sends).
create or replace function private.set_practice_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_practice then
    perform pg_advisory_xact_lock(hashtext('practice:' || new.collector_id::text));
    select coalesce(max(p.practice_no), 0) + 1 into new.practice_no
    from public.participants p where p.collector_id = new.collector_id;
  else
    new.practice_no := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.set_practice_no() from public, anon, authenticated;

create trigger participants_practice_no
  before insert on public.participants
  for each row execute function private.set_practice_no();

-- ---------------------------------------------------------------- F3: practice never becomes real
create or replace function private.keep_practice_fixed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_practice is distinct from old.is_practice then
    raise exception 'is_practice is fixed once saved' using errcode = 'check_violation';
  end if;
  if new.practice_no is distinct from old.practice_no then
    raise exception 'practice_no is fixed once saved' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.keep_practice_fixed() from public, anon, authenticated;

create trigger participants_practice_fixed
  before update on public.participants
  for each row execute function private.keep_practice_fixed();

-- ---------------------------------------------------------------- F3: collectors delete own practice only
-- A practice consent (practice names) goes with its practice participant.
alter table public.consents drop constraint consents_participant_id_fkey;
alter table public.consents
  add constraint consents_participant_id_fkey
  foreign key (participant_id) references public.participants (id) on delete cascade;

grant delete on public.participants to authenticated;
create policy participants_delete_own_practice on public.participants
  for delete to authenticated
  using (collector_id = auth.uid() and public.is_approved() and is_practice);

-- ---------------------------------------------------------------- F3: exports start here
-- Same row-level security as participants (security_invoker), never practice rows.
create view public.real_participants
with (security_invoker = true) as
  select * from public.participants where not is_practice;
revoke all on public.real_participants from anon, authenticated;
grant select on public.real_participants to authenticated;
