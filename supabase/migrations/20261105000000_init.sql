-- Anthro Collect — first migration (Ashesi University student research project).
-- NOT APPLIED. Apply with `supabase db push` only after Ryan approves in chat.
--
-- Rules enforced here (defence in depth with the Worker):
--   * Collectors see and change only their own participants.
--   * Collectors may write consents but never read them (names live only in consents).
--   * Collectors may change only their own unit and language (column-level grant).
--   * No real (non-practice) participant until an admin turns collection_open on after IRB approval.
--   * No self-promotion to admin; no deletes by collectors; nothing for anonymous users.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- settings
create table public.app_settings (
  id              boolean primary key default true check (id),   -- single row
  collection_open boolean not null default false,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id)
);
insert into public.app_settings (id) values (true);

-- ---------------------------------------------------------------- collectors
-- One row per login. Created only by the admin script (phone + 6-digit PIN, no email).
create table public.collectors (
  id         uuid primary key references auth.users (id) on delete cascade,
  phone      text not null unique check (phone ~ '^\+233[25][0-9]{8}$'),
  role       text not null default 'collector' check (role in ('collector', 'admin')),
  unit       text not null default 'cm' check (unit in ('cm', 'in')),
  language   text not null default 'en' check (language in ('en', 'fr', 'tw')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.collectors c where c.id = auth.uid() and c.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------- participants
-- No names, phones or emails here. The id may be generated on the phone (offline first).
create table public.participants (
  id           uuid primary key default gen_random_uuid(),
  collector_id uuid not null default auth.uid() references public.collectors (id),
  is_practice  boolean not null default true,
  age_group    text not null check (age_group in ('adult', 'child')),
  sex          text check (sex in ('female', 'male')),
  receipt_code text,
  status       text not null default 'draft'
               check (status in ('draft', 'complete', 'rejected')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index participants_collector_idx on public.participants (collector_id);

-- IRB gate: refuse real participants while collection is closed.
create or replace function public.enforce_collection_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_practice
     and not (select s.collection_open from public.app_settings s where s.id) then
    raise exception 'Real collection is closed until IRB approval; use Practice mode.'
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger participants_collection_gate
  before insert or update on public.participants
  for each row execute function public.enforce_collection_gate();

-- ---------------------------------------------------------------- consents
-- The only table that holds names. Collectors insert (with Prefer: return=minimal) but never read.
create table public.consents (
  id                uuid primary key default gen_random_uuid(),
  participant_id    uuid not null unique references public.participants (id),
  collector_id      uuid not null default auth.uid() references public.collectors (id),
  participant_name  text not null check (length(participant_name) between 1 and 200),
  guardian_name     text check (guardian_name is null or length(guardian_name) between 1 and 200),
  language          text not null check (language in ('en', 'fr', 'tw')),
  consent_version   text not null,
  agreed_data       boolean not null check (agreed_data),
  agreed_photos     boolean not null check (agreed_photos),
  child_assent      boolean,
  signed_at         timestamptz not null,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------- privileges
revoke all on public.app_settings, public.collectors, public.participants, public.consents
  from anon, authenticated;

grant select on public.app_settings to authenticated;
grant update (collection_open, updated_at, updated_by) on public.app_settings to authenticated;

grant select on public.collectors to authenticated;
grant update (unit, language) on public.collectors to authenticated;   -- nothing else, ever

grant select, insert on public.participants to authenticated;
grant update (sex, receipt_code, status) on public.participants to authenticated;

grant insert on public.consents to authenticated;
grant select on public.consents to authenticated;   -- filtered to admins only by RLS below

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------- row-level security
alter table public.app_settings enable row level security;
alter table public.collectors   enable row level security;
alter table public.participants enable row level security;
alter table public.consents     enable row level security;

create policy settings_read on public.app_settings
  for select to authenticated using (true);
create policy settings_admin_update on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy collectors_read_self on public.collectors
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy collectors_update_self on public.collectors
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy participants_read_own on public.participants
  for select to authenticated using (collector_id = auth.uid() or public.is_admin());
create policy participants_insert_own on public.participants
  for insert to authenticated with check (collector_id = auth.uid());
create policy participants_update_own on public.participants
  for update to authenticated
  using (collector_id = auth.uid()) with check (collector_id = auth.uid());

create policy consents_insert_own on public.consents
  for insert to authenticated
  with check (
    collector_id = auth.uid()
    and exists (
      select 1 from public.participants p
      where p.id = participant_id and p.collector_id = auth.uid()
    )
  );
create policy consents_admin_read on public.consents
  for select to authenticated using (public.is_admin());
