-- F5 Amendment C (age group instead of exact age) and F6 Amendment A (head blur, photo checks).
-- Ashesi University student research project. Specs: specs/F5-measurements.md (Amendment C),
-- specs/F6-camera.md (Amendment A), both approved by Ryan, 12 Nov 2026.
-- NOT APPLIED until Ryan approves `supabase db push` in chat. Earlier migrations are not edited.

-- ================================================================ F5 Amendment C: age range

alter table public.participants add column age_range text;

-- Rows saved before this change held the exact age: keep only its range. Practice data only (no
-- real participant exists yet). Triggers are paused so the copy isn't refused as an edit.
alter table public.participants disable trigger user;
update public.participants set age_range = case
  when age_years is null then null
  when age_years between 8 and 9 then '8-9'
  when age_years between 10 and 12 then '10-12'
  when age_years between 13 and 14 then '13-14'
  when age_years between 15 and 17 then '15-17'
  when age_years between 18 and 24 then '18-24'
  when age_years between 25 and 34 then '25-34'
  when age_years between 35 and 44 then '35-44'
  when age_years between 45 and 54 then '45-54'
  when age_years between 55 and 64 then '55-64'
  else '65+'
end;
alter table public.participants enable trigger user;

alter table public.participants add constraint participants_age_range_fits_group check (
  age_range is null
  or (age_group = 'adult' and age_range in ('18-24', '25-34', '35-44', '45-54', '55-64', '65+'))
  or (age_group = 'child' and age_range in ('8-9', '10-12', '13-14', '15-17'))
);

-- The first year of a range: enough to choose the measurement set (8-9, 10-12 core; 13+ by sex).
create or replace function private.range_start(p_range text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_range
    when '8-9' then 8 when '10-12' then 10 when '13-14' then 13 when '15-17' then 15
    when '18-24' then 18 when '25-34' then 25 when '35-44' then 35 when '45-54' then 45
    when '55-64' then 55 when '65+' then 65
  end;
$$;
revoke execute on function private.range_start(text) from public, anon, authenticated;

-- Same rules as before (20261110000000_f5_measurements.sql); only the age lines read the range.
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
  if v_p.sex is null or v_p.age_range is null then
    raise exception 'measurement refused: record sex and age group first' using errcode = 'check_violation';
  end if;
  if not (new.code = any (private.measurement_set(v_p.sex, private.range_start(v_p.age_range)))) then
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

create or replace function private.guard_participant_measuring()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing int;
begin
  if (new.sex is distinct from old.sex or new.age_range is distinct from old.age_range)
     and exists (select 1 from public.measurements m where m.participant_id = new.id) then
    raise exception 'sex and age group are fixed once measuring has started' using errcode = 'check_violation';
  end if;
  if new.measurements_done_at is not null and old.measurements_done_at is null then
    select count(*) into v_missing
    from unnest(private.measurement_set(new.sex, private.range_start(new.age_range))) as s(code)
    where not exists (select 1 from public.measurements m where m.participant_id = new.id and m.code = s.code);
    if new.sex is null or new.age_range is null or v_missing > 0 then
      raise exception 'finish refused: % measurement(s) neither taken nor skipped', v_missing using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke update (age_years) on public.participants from authenticated;
grant update (age_range) on public.participants to authenticated;

-- The collector's own list: the range instead of the age.
drop function public.my_participants(boolean);
create function public.my_participants(p_practice boolean)
returns table (
  id uuid, practice_no int, age_group text, status text, receipt_code text,
  created_at timestamptz, has_consent boolean, sex text, age_range text, measured boolean, intimate_ok boolean,
  weight_ok boolean, photos_done boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.practice_no, p.age_group, p.status, p.receipt_code, p.created_at,
         exists (select 1 from public.consents c where c.participant_id = p.id),
         p.sex, p.age_range, p.measurements_done_at is not null, p.intimate_ok, p.weight_ok,
         p.photos_done_at is not null
  from public.participants p
  where p.collector_id = auth.uid() and public.is_approved() and p.is_practice = p_practice
  order by p.created_at desc;
$$;
revoke execute on function public.my_participants(boolean) from public, anon;
grant execute on function public.my_participants(boolean) to authenticated;

-- Exports: the exact age is gone for good.
drop view public.real_participants;
alter table public.participants drop column age_years;
create view public.real_participants
with (security_invoker = true) as
  select * from public.participants where not is_practice;
revoke all on public.real_participants from anon, authenticated;
grant select on public.real_participants to authenticated;

-- ================================================================ F6 Amendment A: photo checks

-- Rows from before (blur version 1) keep their values; every new photo must be version 2, with the
-- people found, the face-hidden answer (always yes on a saved photo), and the head-top and heel
-- positions measured before the blur.
alter table public.photos
  add column blur_version smallint not null default 1 check (blur_version in (1, 2)),
  add column people_detected int check (people_detected is null or people_detected between 0 and 20),
  add column face_hidden_confirmed boolean,
  add column head_top_y int,
  add column heel_y int,
  add constraint photos_v2_complete check (
    blur_version = 1
    or (
      people_detected >= 1
      and face_hidden_confirmed is true
      and head_top_y is not null and heel_y is not null
      and head_top_y >= 0 and head_top_y < heel_y and heel_y < height
    )
  );

-- New photos and retakes must come from the Amendment A blur.
create or replace function private.check_photo_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.blur_version <> 2 then
    raise exception 'photo refused: update the app (old face blur)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_photo_version() from public, anon, authenticated;
create trigger photos_check_version
  before insert or update on public.photos
  for each row execute function private.check_photo_version();

grant update (blur_version, people_detected, face_hidden_confirmed, head_top_y, heel_y) on public.photos to authenticated;
