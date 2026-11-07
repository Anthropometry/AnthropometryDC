-- F4: Participant and consent (Ashesi University student research project). Spec: specs/F4-consent.md.
-- NOT APPLIED until Ryan approves `supabase db push` in chat. Earlier migrations are not edited.
--
-- Consents stay write-only for collectors (they can never read one back). This adds the rules a
-- consent must meet, receipt codes, a yes/no "has consent" check, and admin withdrawal.

-- ---------------------------------------------------------------- receipt codes
alter table public.participants
  add constraint participants_receipt_code_check
  check (receipt_code is null or receipt_code ~ '^[A-HJKMNP-Z2-9]{7}$');
create unique index participants_receipt_code_idx on public.participants (receipt_code)
  where receipt_code is not null;

-- ---------------------------------------------------------------- the approved consent version
-- Null until Gate B (IRB approval): no real consent can be saved before then.
alter table public.app_settings add column consent_version text
  check (consent_version is null or consent_version ~ '^v[0-9]+(\.[0-9]+)?$');

-- ---------------------------------------------------------------- which signatures arrived
alter table public.consents add column signatures text[] not null default '{}'
  check (signatures <@ array['participant', 'guardian', 'assent']::text[]);

-- ---------------------------------------------------------------- rules every consent must meet
create or replace function private.check_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p       public.participants;
  v_version text;
begin
  select * into v_p from public.participants p where p.id = new.participant_id;
  if v_p.id is null then
    raise exception 'consent refused: no such participant' using errcode = 'check_violation';
  end if;
  if v_p.status = 'rejected' then
    raise exception 'consent refused: participant rejected' using errcode = 'check_violation';
  end if;

  -- Children: guardian consent and the child's own Yes. Adults: no guardian.
  if v_p.age_group = 'child' then
    if new.guardian_name is null or new.child_assent is distinct from true then
      raise exception 'consent refused: a child needs a guardian and the child''s assent' using errcode = 'check_violation';
    end if;
  elsif new.guardian_name is not null or new.child_assent is not null then
    raise exception 'consent refused: an adult consents for themself' using errcode = 'check_violation';
  end if;

  -- Versions: practice uses 'practice'; real uses the IRB-approved version (none before Gate B).
  if v_p.is_practice then
    if new.consent_version <> 'practice' then
      raise exception 'consent refused: practice consent must use version practice' using errcode = 'check_violation';
    end if;
  else
    select s.consent_version into v_version from public.app_settings s where s.id;
    if v_version is null or new.consent_version is distinct from v_version then
      raise exception 'consent refused: not the approved consent version' using errcode = 'check_violation';
    end if;
  end if;

  if new.signed_at > now() + interval '5 minutes' then
    raise exception 'consent refused: signed in the future' using errcode = 'check_violation';
  end if;
  new.signatures := '{}';   -- set only by mark_signature_uploaded
  return new;
end;
$$;
revoke execute on function private.check_consent() from public, anon, authenticated;

create trigger consents_check
  before insert on public.consents
  for each row execute function private.check_consent();

-- ---------------------------------------------------------------- yes/no: does my participant have consent?
-- Reveals nothing but true/false, and only to the participant's own collector (or an admin).
create or replace function public.has_consent(p_participant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.consents c
    join public.participants p on p.id = c.participant_id
    where c.participant_id = p_participant
      and ((p.collector_id = auth.uid() and public.is_approved()) or public.is_admin())
  );
$$;
revoke execute on function public.has_consent(uuid) from public, anon;
grant execute on function public.has_consent(uuid) to authenticated;

-- After a signature image is stored (through the Worker), the app records its slot.
create or replace function public.mark_signature_uploaded(p_participant uuid, p_slot text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_slot not in ('participant', 'guardian', 'assent') then
    raise exception 'bad slot' using errcode = 'check_violation';
  end if;
  update public.consents c
  set signatures = (select array_agg(distinct s order by s) from unnest(c.signatures || p_slot) s)
  from public.participants p
  where c.participant_id = p_participant
    and p.id = c.participant_id
    and p.collector_id = auth.uid()
    and public.is_approved();
  if not found then
    raise exception 'no such consent' using errcode = 'no_data_found';
  end if;
end;
$$;
revoke execute on function public.mark_signature_uploaded(uuid, text) from public, anon;
grant execute on function public.mark_signature_uploaded(uuid, text) to authenticated;

-- ---------------------------------------------------------------- withdrawal (Admin screen + Worker)
create table public.withdrawals (
  id             uuid primary key default gen_random_uuid(),
  receipt_sha256 text not null unique check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  was_practice   boolean not null,
  withdrawn_by   uuid not null references public.collectors (id),
  withdrawn_at   timestamptz not null default now()
);
revoke all on public.withdrawals from anon, authenticated;
grant select on public.withdrawals to authenticated;
alter table public.withdrawals enable row level security;
create policy withdrawals_admin_read on public.withdrawals
  for select to authenticated using (public.is_admin());

-- "ABC-2345", "abc 2345" → "ABC2345"
create or replace function private.clean_receipt(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
$$;
revoke execute on function private.clean_receipt(text) from public, anon, authenticated;

-- What the admin sees before confirming: never a name.
create or replace function public.admin_withdraw_preview(p_receipt text)
returns table (
  is_found boolean, already_withdrawn boolean, is_practice boolean, age_group text,
  created_at timestamptz, collector_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := private.clean_receipt(p_receipt);
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
  select (p.id is not null),
         exists (select 1 from public.withdrawals w
                 where w.receipt_sha256 = encode(sha256(convert_to(v_code, 'UTF8')), 'hex')),
         p.is_practice, p.age_group, p.created_at, c.display_name
  from (select 1) one
  left join public.participants p on p.receipt_code = v_code
  left join public.collectors c on c.id = p.collector_id;
end;
$$;

-- Deletes the participant (consent cascades) and returns its id, so the Worker can remove the
-- signature images (and later photos) from R2. Null if there is nothing to withdraw.
create or replace function public.admin_withdraw(p_receipt text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := private.clean_receipt(p_receipt);
  v_p    public.participants;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if v_code !~ '^[A-HJKMNP-Z2-9]{7}$' then
    return null;
  end if;
  select * into v_p from public.participants p where p.receipt_code = v_code for update;
  if v_p.id is null then
    return null;
  end if;
  insert into public.withdrawals (receipt_sha256, was_practice, withdrawn_by)
  values (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_p.is_practice, auth.uid())
  on conflict (receipt_sha256) do nothing;
  delete from public.participants where id = v_p.id;
  return v_p.id;
end;
$$;

revoke execute on function public.admin_withdraw_preview(text) from public, anon;
revoke execute on function public.admin_withdraw(text) from public, anon;
grant execute on function public.admin_withdraw_preview(text) to authenticated;
grant execute on function public.admin_withdraw(text) to authenticated;

-- ---------------------------------------------------------------- the collector's own list
-- Own participants only (even for admins), with a yes/no for consent: never the consent itself.
create or replace function public.my_participants(p_practice boolean)
returns table (
  id uuid, practice_no int, age_group text, status text, receipt_code text,
  created_at timestamptz, has_consent boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.practice_no, p.age_group, p.status, p.receipt_code, p.created_at,
         exists (select 1 from public.consents c where c.participant_id = p.id)
  from public.participants p
  where p.collector_id = auth.uid() and public.is_approved() and p.is_practice = p_practice
  order by p.created_at desc;
$$;
revoke execute on function public.my_participants(boolean) from public, anon;
grant execute on function public.my_participants(boolean) to authenticated;
