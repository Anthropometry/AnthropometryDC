-- F5: Measurements (Ashesi University student research project). Spec: specs/F5-measurements.md.
-- Also the F4 amendment: an optional third consent tick for intimate measurements.
-- NOT APPLIED until Ryan approves `supabase db push` in chat. Earlier migrations are not edited.

-- ---------------------------------------------------------------- F4 amendment: intimate tick
alter table public.consents add column agreed_intimate boolean not null default false;

-- ---------------------------------------------------------------- participant details for measuring
alter table public.participants
  add column age_years int,
  add column clothing text check (clothing is null or clothing in ('light', 'medium', 'heavy')),
  add column intimate_ok boolean not null default false,
  add column measurements_done_at timestamptz,
  add constraint participants_age_fits_group check (
    age_years is null
    or (age_group = 'adult' and age_years between 18 and 100)
    or (age_group = 'child' and age_years between 8 and 17)
  );

-- Collectors may record sex, age, clothing and Finish; never intimate_ok (copied from the consent).
grant update (age_years, clothing, measurements_done_at) on public.participants to authenticated;

-- The consent's intimate answer goes to the participant (no name), so measuring never reads consents.
create or replace function private.copy_intimate_ok()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.participants set intimate_ok = new.agreed_intimate where id = new.participant_id;
  return new;
end;
$$;
revoke execute on function private.copy_intimate_ok() from public, anon, authenticated;
create trigger consents_copy_intimate
  after insert on public.consents
  for each row execute function private.copy_intimate_ok();

-- ---------------------------------------------------------------- the catalogue
-- Sets (spec "Measurement catalogue"): adults and 13-17 by sex; 8-12 the core set.
create or replace function private.measurement_set(p_sex text, p_age int)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_sex is null or p_age is null then array[]::text[]
    when p_age <= 12 then array['height', 'neck_girth', 'shoulder_width', 'chest_girth', 'back_length',
                                'waist_girth', 'hip_girth', 'arm_length', 'inseam']
    when p_sex = 'female' then array['height', 'neck_girth', 'shoulder_width', 'shoulder_length', 'bust_girth',
                                'underbust_girth', 'bust_point_distance', 'shoulder_to_bust_point', 'front_length',
                                'back_length', 'waist_girth', 'high_hip_girth', 'hip_girth', 'waist_to_hip',
                                'arm_length', 'upper_arm_girth', 'wrist_girth', 'inseam', 'outseam', 'thigh_girth',
                                'knee_girth', 'calf_girth', 'waist_to_knee', 'shoulder_to_knee']
    else array['height', 'neck_girth', 'shoulder_width', 'shoulder_length', 'chest_girth', 'front_length',
               'back_length', 'waist_girth', 'hip_girth', 'waist_to_hip', 'arm_length', 'upper_arm_girth',
               'wrist_girth', 'inseam', 'outseam', 'thigh_girth', 'knee_girth', 'calf_girth']
  end;
$$;

create or replace function private.is_intimate(p_code text)
returns boolean language sql immutable set search_path = '' as $$
  select p_code in ('bust_girth', 'underbust_girth', 'bust_point_distance', 'shoulder_to_bust_point', 'inseam');
$$;

create or replace function private.is_double(p_code text)
returns boolean language sql immutable set search_path = '' as $$
  select p_code in ('height', 'bust_girth', 'chest_girth', 'waist_girth', 'hip_girth');
$$;

-- One typed reading → cm to 0.1, or null if malformed. cm: "87.3"; inches: "34", "34 3/8", "34 1/2"
-- (fractions of 2, 4 or 8 in lowest terms). Same rules as src/lib/measurements.ts.
create or replace function private.reading_cm(p_typed text, p_unit text)
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
    if coalesce(p_typed, '') !~ '^[0-9]{1,3}(\.[0-9])?$' then
      return null;
    end if;
    v := p_typed::numeric;
  elsif p_unit = 'in' then
    m := regexp_match(coalesce(p_typed, ''), '^([0-9]{1,3})(?: ([1-7])/([248]))?$');
    if m is null then
      return null;
    end if;
    if m[2] is not null then
      -- lowest terms and below 1: 1/2, 1/4, 3/4, 1/8, 3/8, 5/8, 7/8
      if not ((m[3] = '2' and m[2] = '1') or (m[3] = '4' and m[2] in ('1', '3'))
              or (m[3] = '8' and m[2] in ('1', '3', '5', '7'))) then
        return null;
      end if;
    end if;
    v := (m[1]::numeric + coalesce(m[2]::numeric / m[3]::numeric, 0)) * 2.54;
  else
    return null;
  end if;
  v := round(v, 1);
  if v < 1 or v > 300 then
    return null;
  end if;
  return v;
end;
$$;

-- Value of a measured code: one reading, or for ×2 codes the mean of the two closest readings.
create or replace function private.measurement_value(p_cm numeric[], p_double boolean)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  n int := coalesce(array_length(p_cm, 1), 0);
  best numeric;
  d numeric;
  v numeric;
begin
  if not p_double then
    return case when n = 1 then p_cm[1] else null end;
  end if;
  if n = 2 then
    if abs(p_cm[1] - p_cm[2]) > 1.0 then
      return null;  -- a third reading is needed
    end if;
    return round((p_cm[1] + p_cm[2]) / 2, 1);
  end if;
  if n = 3 and abs(p_cm[1] - p_cm[2]) > 1.0 then
    -- closest pair; ties keep the earlier pair
    best := abs(p_cm[1] - p_cm[2]); v := round((p_cm[1] + p_cm[2]) / 2, 1);
    d := abs(p_cm[1] - p_cm[3]); if d < best then best := d; v := round((p_cm[1] + p_cm[3]) / 2, 1); end if;
    d := abs(p_cm[2] - p_cm[3]); if d < best then best := d; v := round((p_cm[2] + p_cm[3]) / 2, 1); end if;
    return v;
  end if;
  return null;
end;
$$;

revoke execute on function private.measurement_set(text, int) from public, anon, authenticated;
revoke execute on function private.is_intimate(text) from public, anon, authenticated;
revoke execute on function private.is_double(text) from public, anon, authenticated;
revoke execute on function private.reading_cm(text, text) from public, anon, authenticated;
revoke execute on function private.measurement_value(numeric[], boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- measurements
create table public.measurements (
  id                uuid primary key default gen_random_uuid(),
  participant_id    uuid not null references public.participants (id) on delete cascade,
  collector_id      uuid not null default auth.uid() references public.collectors (id),
  code              text not null,
  unit              text check (unit is null or unit in ('cm', 'in')),
  readings_typed    text[] not null default '{}',
  readings_cm       numeric(4, 1)[] not null default '{}',
  value_cm          numeric(4, 1),
  skipped           boolean not null default false,
  skip_reason       text check (skip_reason is null or skip_reason in ('declined', 'could_not_measure', 'other', 'declined_at_consent')),
  skip_note         text check (skip_note is null or length(skip_note) <= 80),
  confirmed_unusual boolean not null default false,
  height_method     text check (height_method is null or height_method in ('steel_tape', 'wall_100')),
  hair_adds_height  boolean,
  measured_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (participant_id, code)
);
create index measurements_collector_idx on public.measurements (collector_id);

-- Every rule a measurement must meet; the database recomputes all centimetre values itself.
create or replace function private.check_measurement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p     public.participants;
  v_cm    numeric[] := '{}';
  v_r     numeric;
  v_typed text;
  v_n     int;
  v_dbl   boolean := private.is_double(new.code);
begin
  select * into v_p from public.participants p where p.id = new.participant_id;
  if v_p.id is null then
    raise exception 'measurement refused: no such participant' using errcode = 'check_violation';
  end if;
  if v_p.status = 'rejected' then
    raise exception 'measurement refused: participant rejected' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.consents c where c.participant_id = v_p.id) then
    raise exception 'measurement refused: no consent' using errcode = 'check_violation';
  end if;
  if v_p.sex is null or v_p.age_years is null then
    raise exception 'measurement refused: record sex and age first' using errcode = 'check_violation';
  end if;
  if not (new.code = any (private.measurement_set(v_p.sex, v_p.age_years))) then
    raise exception 'measurement refused: % is not in the set for this participant', new.code using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and (new.participant_id <> old.participant_id or new.code <> old.code) then
    raise exception 'measurement refused: participant and code are fixed' using errcode = 'check_violation';
  end if;
  new.collector_id := v_p.collector_id;

  if new.skipped then
    if new.skip_reason is null then
      raise exception 'measurement refused: a skip needs a reason' using errcode = 'check_violation';
    end if;
    new.unit := null;
    new.readings_typed := '{}';
    new.readings_cm := '{}';
    new.value_cm := null;
    new.confirmed_unusual := false;
    new.height_method := null;
    new.hair_adds_height := null;
  else
    if private.is_intimate(new.code) and not v_p.intimate_ok then
      raise exception 'measurement refused: intimate measurements were not agreed at consent' using errcode = 'check_violation';
    end if;
    new.skip_reason := null;
    new.skip_note := null;
    if new.code = 'height' then
      if new.height_method is null then
        raise exception 'measurement refused: say how height was measured' using errcode = 'check_violation';
      end if;
      if new.height_method = 'wall_100' and new.unit <> 'cm' then
        raise exception 'measurement refused: the 100 cm wall mark is read in cm' using errcode = 'check_violation';
      end if;
    else
      new.height_method := null;
      new.hair_adds_height := null;
    end if;
    v_n := coalesce(array_length(new.readings_typed, 1), 0);
    if (not v_dbl and v_n <> 1) or (v_dbl and v_n not in (2, 3)) then
      raise exception 'measurement refused: wrong number of readings for %', new.code using errcode = 'check_violation';
    end if;
    foreach v_typed in array new.readings_typed loop
      v_r := private.reading_cm(v_typed, new.unit);
      if v_r is null then
        raise exception 'measurement refused: unreadable value' using errcode = 'check_violation';
      end if;
      if new.height_method = 'wall_100' then
        v_r := v_r + 100;
      end if;
      v_cm := v_cm || v_r;
    end loop;
    if v_dbl and v_n = 3 and abs(v_cm[1] - v_cm[2]) <= 1.0 then
      raise exception 'measurement refused: a third reading only when the first two differ by more than 1 cm' using errcode = 'check_violation';
    end if;
    new.readings_cm := v_cm;
    new.value_cm := private.measurement_value(v_cm, v_dbl);
    if new.value_cm is null then
      raise exception 'measurement refused: the two readings differ by more than 1 cm; take a third' using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.check_measurement() from public, anon, authenticated;

create trigger measurements_check
  before insert or update on public.measurements
  for each row execute function private.check_measurement();

revoke all on public.measurements from anon, authenticated;
grant select, insert on public.measurements to authenticated;
grant update (unit, readings_typed, skipped, skip_reason, skip_note, confirmed_unusual, height_method,
              hair_adds_height, measured_at) on public.measurements to authenticated;
alter table public.measurements enable row level security;

create policy measurements_read on public.measurements
  for select to authenticated
  using ((collector_id = auth.uid() and public.is_approved()) or public.is_admin());
create policy measurements_insert_own on public.measurements
  for insert to authenticated
  with check (
    public.is_approved()
    and exists (select 1 from public.participants p where p.id = participant_id and p.collector_id = auth.uid())
  );
create policy measurements_update_own on public.measurements
  for update to authenticated
  using (collector_id = auth.uid() and public.is_approved())
  with check (collector_id = auth.uid() and public.is_approved());

-- ---------------------------------------------------------------- sex and age fixed once measuring starts; Finish complete
create or replace function private.guard_participant_measuring()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing int;
begin
  if (new.sex is distinct from old.sex or new.age_years is distinct from old.age_years)
     and exists (select 1 from public.measurements m where m.participant_id = new.id) then
    raise exception 'sex and age are fixed once measuring has started' using errcode = 'check_violation';
  end if;
  if new.measurements_done_at is not null and old.measurements_done_at is null then
    select count(*) into v_missing
    from unnest(private.measurement_set(new.sex, new.age_years)) as s(code)
    where not exists (select 1 from public.measurements m where m.participant_id = new.id and m.code = s.code);
    if new.sex is null or new.age_years is null or v_missing > 0 then
      raise exception 'finish refused: % measurement(s) neither taken nor skipped', v_missing using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_participant_measuring() from public, anon, authenticated;
create trigger participants_guard_measuring
  before update on public.participants
  for each row execute function private.guard_participant_measuring();

-- ---------------------------------------------------------------- the collector's own list, with measuring state
drop function public.my_participants(boolean);
create function public.my_participants(p_practice boolean)
returns table (
  id uuid, practice_no int, age_group text, status text, receipt_code text,
  created_at timestamptz, has_consent boolean, sex text, age_years int, measured boolean, intimate_ok boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.practice_no, p.age_group, p.status, p.receipt_code, p.created_at,
         exists (select 1 from public.consents c where c.participant_id = p.id),
         p.sex, p.age_years, p.measurements_done_at is not null, p.intimate_ok
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
