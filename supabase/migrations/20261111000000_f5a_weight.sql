-- F5 Amendment A: optional weight (Ashesi University student research project).
-- Spec: specs/F5-measurements.md, "Amendment A". NOT APPLIED until Ryan approves `supabase db push`.
-- Earlier migrations are not edited.

-- ---------------------------------------------------------------- consent: own optional tick
alter table public.consents add column agreed_weight boolean not null default false;

-- ---------------------------------------------------------------- participant: weight in kg, with its source
alter table public.participants
  add column weight_ok boolean not null default false,
  add column weight_kg numeric(4, 1) check (weight_kg is null or weight_kg between 2 and 300),
  add column weight_source text check (weight_source is null or weight_source in ('scale', 'told')),
  add constraint participants_weight_has_source check ((weight_kg is null) = (weight_source is null));

-- Collectors record weight and its source; never weight_ok (copied from the write-only consent).
grant update (weight_kg, weight_source) on public.participants to authenticated;

-- The consent's answers go to the participant (no name): intimate (F5) and now weight.
create or replace function private.copy_intimate_ok()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.participants
  set intimate_ok = new.agreed_intimate,
      weight_ok = new.agreed_weight
  where id = new.participant_id;
  return new;
end;
$$;

-- A weight only with the consent tick.
create or replace function private.guard_weight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.weight_kg is not null and not new.weight_ok then
    raise exception 'weight refused: weight was not agreed at consent' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_weight() from public, anon, authenticated;
create trigger participants_guard_weight
  before insert or update of weight_kg, weight_ok on public.participants
  for each row execute function private.guard_weight();

-- ---------------------------------------------------------------- the collector's own list: + weight state
drop function public.my_participants(boolean);
create function public.my_participants(p_practice boolean)
returns table (
  id uuid, practice_no int, age_group text, status text, receipt_code text,
  created_at timestamptz, has_consent boolean, sex text, age_years int, measured boolean, intimate_ok boolean,
  weight_ok boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.practice_no, p.age_group, p.status, p.receipt_code, p.created_at,
         exists (select 1 from public.consents c where c.participant_id = p.id),
         p.sex, p.age_years, p.measurements_done_at is not null, p.intimate_ok, p.weight_ok
  from public.participants p
  where p.collector_id = auth.uid() and public.is_approved() and p.is_practice = p_practice
  order by p.created_at desc;
$$;
revoke execute on function public.my_participants(boolean) from public, anon;
grant execute on function public.my_participants(boolean) to authenticated;

-- ---------------------------------------------------------------- exports: include the weight columns
drop view public.real_participants;
create view public.real_participants
with (security_invoker = true) as
  select * from public.participants where not is_practice;
revoke all on public.real_participants from anon, authenticated;
grant select on public.real_participants to authenticated;
