-- F8: Admin progress (Ashesi University student research project). Spec: specs/F8-admin-export.md,
-- approved by Ryan, 13 Nov 2026. Admins only; counts only: never a participant's name, receipt code,
-- photo or single values. Practice and real are reported apart (p_practice).
-- NOT APPLIED until Ryan approves `supabase db push` in chat. Earlier migrations are not edited.

-- Participants that count: consented, not rejected.
create or replace function private.counted(p_practice boolean)
returns setof public.participants
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.participants p
  where p.is_practice = p_practice
    and p.status <> 'rejected'
    and exists (select 1 from public.consents c where c.participant_id = p.id);
$$;
revoke execute on function private.counted(boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- totals by sex, age group and range
create or replace function public.admin_progress(p_practice boolean)
returns table (sex text, age_group text, age_range text, complete int, measured_no_photos int, consented_not_measured int)
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
    select coalesce(p.sex, 'unknown'), p.age_group, coalesce(p.age_range, 'unknown'),
           count(*) filter (where p.measurements_done_at is not null and p.photos_done_at is not null)::int,
           count(*) filter (where p.measurements_done_at is not null and p.photos_done_at is null)::int,
           count(*) filter (where p.measurements_done_at is null)::int
    from private.counted(p_practice) p
    group by 1, 2, 3
    order by 2, 1, 3;
end;
$$;

-- ---------------------------------------------------------------- complete per week (last 8 weeks)
create or replace function public.admin_weekly(p_practice boolean)
returns table (week_start date, complete int)
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
    select date_trunc('week', p.photos_done_at)::date, count(*)::int
    from private.counted(p_practice) p
    where p.measurements_done_at is not null and p.photos_done_at is not null
      and p.photos_done_at >= date_trunc('week', now()) - interval '7 weeks'
    group by 1
    order by 1;
end;
$$;

-- ---------------------------------------------------------------- per collector (follow-up)
create or replace function public.admin_collector_progress()
returns table (
  collector_id uuid,
  complete_total int,
  complete_week int,
  measured_no_photos int,
  consented_not_measured int,
  practice_complete int,
  last_sent_at timestamptz,
  measurements_taken int,
  measurements_skipped int,
  unusual_kept int,
  photos_more_people int
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
    with rl as (select * from private.counted(false)),
         prac as (select * from private.counted(true))
    select c.id,
           (select count(*) from rl r where r.collector_id = c.id and r.measurements_done_at is not null and r.photos_done_at is not null)::int,
           (select count(*) from rl r where r.collector_id = c.id and r.photos_done_at >= date_trunc('week', now()) and r.measurements_done_at is not null)::int,
           (select count(*) from rl r where r.collector_id = c.id and r.measurements_done_at is not null and r.photos_done_at is null)::int,
           (select count(*) from rl r where r.collector_id = c.id and r.measurements_done_at is null)::int,
           (select count(*) from prac r where r.collector_id = c.id and r.measurements_done_at is not null and r.photos_done_at is not null)::int,
           greatest(
             (select max(p.created_at) from public.participants p where p.collector_id = c.id),
             (select max(m.updated_at) from public.measurements m where m.collector_id = c.id),
             (select max(f.updated_at) from public.photos f where f.collector_id = c.id)
           ),
           (select count(*) from public.measurements m join rl r on r.id = m.participant_id where m.collector_id = c.id and not m.skipped)::int,
           (select count(*) from public.measurements m join rl r on r.id = m.participant_id where m.collector_id = c.id and m.skipped and m.skip_reason <> 'declined_at_consent')::int,
           (select count(*) from public.measurements m join rl r on r.id = m.participant_id where m.collector_id = c.id and m.confirmed_unusual)::int,
           (select count(*) from public.photos f join rl r on r.id = f.participant_id where f.collector_id = c.id and f.people_detected > 1)::int
    from public.collectors c
    where c.status = 'approved'
    order by c.created_at;
end;
$$;

-- ---------------------------------------------------------------- spread of measured heights (10 cm bands)
create or replace function public.admin_height_bands(p_practice boolean)
returns table (sex text, age_group text, band_cm int, n int)
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
    select coalesce(p.sex, 'unknown'), p.age_group, (floor(m.value_cm / 10) * 10)::int, count(*)::int
    from private.counted(p_practice) p
    join public.measurements m on m.participant_id = p.id and m.code = 'height' and not m.skipped and m.value_cm is not null
    group by 1, 2, 3
    order by 1, 2, 3;
end;
$$;

-- ---------------------------------------------------------------- quality across the study
create or replace function public.admin_quality(p_practice boolean)
returns table (item text, detail text, n numeric)
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
    with p as (select * from private.counted(p_practice)),
         m as (select m.* from public.measurements m join p on p.id = m.participant_id)
    select 'skipped'::text, m.skip_reason, count(*)::numeric from m where m.skipped and m.skip_reason <> 'declined_at_consent' group by m.skip_reason
    union all
    select 'skipped_code', x.code, x.n from (
      select m.code, count(*)::numeric as n from m where m.skipped and m.skip_reason <> 'declined_at_consent' group by m.code order by 2 desc limit 5
    ) x
    union all
    select 'unusual_kept', null, count(*)::numeric from m where m.confirmed_unusual
    union all
    select 'photos_more_people', null, count(*)::numeric from public.photos f join p on p.id = f.participant_id where f.people_detected > 1
    union all
    select 'weight', coalesce(p.weight_source, 'none'), count(*)::numeric from p where p.weight_ok group by p.weight_source
    union all
    select 'intimate_agreed', null, count(*)::numeric from p where p.intimate_ok
    union all
    select 'height_stated_minus_measured_cm', null, round(avg(p.height_told_cm - h.value_cm), 1)
      from p join m h on h.participant_id = p.id and h.code = 'height' and not h.skipped
      where p.height_told_cm is not null
    union all
    select 'weight_stated_minus_scale_kg', null, round(avg(p.weight_told_kg - p.weight_kg), 1)
      from p where p.weight_told_kg is not null and p.weight_source = 'scale'
    union all
    select 'withdrawals', null, count(*)::numeric from public.withdrawals w where w.was_practice = p_practice;
end;
$$;

-- ---------------------------------------------------------------- free-tier space
create or replace function public.admin_space()
returns table (database_bytes bigint, photo_bytes bigint, photos int)
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
    select pg_database_size(current_database())::bigint, coalesce(sum(f.bytes), 0)::bigint, count(*)::int from public.photos f;
end;
$$;

revoke execute on function public.admin_progress(boolean) from public, anon;
revoke execute on function public.admin_weekly(boolean) from public, anon;
revoke execute on function public.admin_collector_progress() from public, anon;
revoke execute on function public.admin_height_bands(boolean) from public, anon;
revoke execute on function public.admin_quality(boolean) from public, anon;
revoke execute on function public.admin_space() from public, anon;
grant execute on function public.admin_progress(boolean) to authenticated;
grant execute on function public.admin_weekly(boolean) to authenticated;
grant execute on function public.admin_collector_progress() to authenticated;
grant execute on function public.admin_height_bands(boolean) to authenticated;
grant execute on function public.admin_quality(boolean) to authenticated;
grant execute on function public.admin_space() to authenticated;
