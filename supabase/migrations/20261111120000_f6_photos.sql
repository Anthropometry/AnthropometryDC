-- F6 Camera and face blur + F5 Amendment B (stated height and weight).
-- Ashesi University student research project. Specs: specs/F6-camera.md, specs/F5-measurements.md.
-- NOT APPLIED until Ryan approves `supabase db push`. Earlier migrations are not edited.

-- ================================================================ F5 Amendment B: what the person says
alter table public.participants
  add column height_told_typed text check (height_told_typed is null or length(height_told_typed) <= 20),
  add column height_told_unit text check (height_told_unit is null or height_told_unit in ('cm', 'ftin')),
  add column height_told_cm numeric(4, 1),
  add column weight_told_kg numeric(4, 1) check (weight_told_kg is null or weight_told_kg between 2 and 300),
  add constraint participants_height_told_pair check ((height_told_typed is null) = (height_told_unit is null));

grant update (height_told_typed, height_told_unit, weight_told_kg) on public.participants to authenticated;

-- Stated height → cm, recomputed by the database (the app never sends cm). cm: "170.5";
-- feet and inches: "5 7", "5 7 1/2" (inches 0–11, halves/quarters/eighths in lowest terms). 50–250 cm.
create or replace function private.told_height_cm(p_typed text, p_unit text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  m text[];
  v numeric;
begin
  if p_unit = 'cm' then
    v := private.reading_cm(p_typed, 'cm');
  elsif p_unit = 'ftin' then
    m := regexp_match(coalesce(p_typed, ''), '^([1-8]) ([0-9]|1[01])(?: ([1-7])/([248]))?$');
    if m is null then
      return null;
    end if;
    if m[3] is not null and not ((m[4] = '2' and m[3] = '1') or (m[4] = '4' and m[3] in ('1', '3'))
                                 or (m[4] = '8' and m[3] in ('1', '3', '5', '7'))) then
      return null;
    end if;
    v := round((m[1]::numeric * 12 + m[2]::numeric + coalesce(m[3]::numeric / m[4]::numeric, 0)) * 2.54, 1);
  else
    return null;
  end if;
  if v is null or v < 50 or v > 250 then
    return null;
  end if;
  return v;
end;
$$;
revoke execute on function private.told_height_cm(text, text) from public, anon, authenticated;

create or replace function private.set_told_height()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.height_told_typed is null then
    new.height_told_cm := null;
  else
    new.height_told_cm := private.told_height_cm(new.height_told_typed, new.height_told_unit);
    if new.height_told_cm is null then
      raise exception 'stated height refused: unreadable value' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.set_told_height() from public, anon, authenticated;
create trigger participants_told_height
  before insert or update of height_told_typed, height_told_unit, height_told_cm on public.participants
  for each row execute function private.set_told_height();

-- Weight (scale or told) and stated weight only with the consent tick.
create or replace function private.guard_weight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.weight_kg is not null or new.weight_told_kg is not null) and not new.weight_ok then
    raise exception 'weight refused: weight was not agreed at consent' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger participants_guard_weight on public.participants;
create trigger participants_guard_weight
  before insert or update of weight_kg, weight_told_kg, weight_ok on public.participants
  for each row execute function private.guard_weight();

-- ================================================================ F6: photos (records only; images live in R2)
create table public.photos (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  collector_id   uuid not null default auth.uid() references public.collectors (id),
  slot           text not null check (slot in ('front', 'side', 'back')),
  width          int not null check (width between 100 and 8000),
  height         int not null check (height between 100 and 8000),
  bytes          int not null check (bytes between 1 and 4194304),
  taken_at       timestamptz not null,
  faces_detected int not null check (faces_detected between 0 and 20),
  level_pitch    numeric(4, 1) check (level_pitch is null or level_pitch between -90 and 90),
  level_roll     numeric(4, 1) check (level_roll is null or level_roll between -90 and 90),
  phone_model    text check (phone_model is null or length(phone_model) <= 80),
  a4_confirmed   boolean not null,
  updated_at     timestamptz not null default now(),
  unique (participant_id, slot)
);
create index photos_collector_idx on public.photos (collector_id);

-- Photos only after consent and finished measurements (every photo has its ground truth).
create or replace function private.check_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.participants;
begin
  select * into v_p from public.participants p where p.id = new.participant_id;
  if v_p.id is null then
    raise exception 'photo refused: no such participant' using errcode = 'check_violation';
  end if;
  if v_p.status = 'rejected' then
    raise exception 'photo refused: participant rejected' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.consents c where c.participant_id = v_p.id) then
    raise exception 'photo refused: no consent' using errcode = 'check_violation';
  end if;
  if v_p.measurements_done_at is null then
    raise exception 'photo refused: finish the measurements first' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and (new.participant_id <> old.participant_id or new.slot <> old.slot) then
    raise exception 'photo refused: participant and slot are fixed' using errcode = 'check_violation';
  end if;
  new.collector_id := v_p.collector_id;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.check_photo() from public, anon, authenticated;
create trigger photos_check
  before insert or update on public.photos
  for each row execute function private.check_photo();

revoke all on public.photos from anon, authenticated;
grant select, insert on public.photos to authenticated;
grant update (width, height, bytes, taken_at, faces_detected, level_pitch, level_roll, phone_model, a4_confirmed)
  on public.photos to authenticated;
alter table public.photos enable row level security;

create policy photos_read on public.photos
  for select to authenticated
  using ((collector_id = auth.uid() and public.is_approved()) or public.is_admin());
create policy photos_insert_own on public.photos
  for insert to authenticated
  with check (
    public.is_approved()
    and exists (select 1 from public.participants p where p.id = participant_id and p.collector_id = auth.uid())
  );
create policy photos_update_own on public.photos
  for update to authenticated
  using (collector_id = auth.uid() and public.is_approved())
  with check (collector_id = auth.uid() and public.is_approved());

-- ---------------------------------------------------------------- photos done: front and side required
alter table public.participants add column photos_done_at timestamptz;
grant update (photos_done_at) on public.participants to authenticated;

create or replace function private.guard_photos_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photos_done_at is not null and old.photos_done_at is null then
    if (select count(*) from public.photos f where f.participant_id = new.id and f.slot in ('front', 'side')) < 2 then
      raise exception 'photos refused: front and side photos are needed' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_photos_done() from public, anon, authenticated;
create trigger participants_guard_photos
  before update of photos_done_at on public.participants
  for each row execute function private.guard_photos_done();

-- ---------------------------------------------------------------- the collector's own list: + photos state
drop function public.my_participants(boolean);
create function public.my_participants(p_practice boolean)
returns table (
  id uuid, practice_no int, age_group text, status text, receipt_code text,
  created_at timestamptz, has_consent boolean, sex text, age_years int, measured boolean, intimate_ok boolean,
  weight_ok boolean, photos_done boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.practice_no, p.age_group, p.status, p.receipt_code, p.created_at,
         exists (select 1 from public.consents c where c.participant_id = p.id),
         p.sex, p.age_years, p.measurements_done_at is not null, p.intimate_ok, p.weight_ok,
         p.photos_done_at is not null
  from public.participants p
  where p.collector_id = auth.uid() and public.is_approved() and p.is_practice = p_practice
  order by p.created_at desc;
$$;
revoke execute on function public.my_participants(boolean) from public, anon;
grant execute on function public.my_participants(boolean) to authenticated;

-- ---------------------------------------------------------------- exports: include the new columns
drop view public.real_participants;
create view public.real_participants
with (security_invoker = true) as
  select * from public.participants where not is_practice;
revoke all on public.real_participants from anon, authenticated;
grant select on public.real_participants to authenticated;
