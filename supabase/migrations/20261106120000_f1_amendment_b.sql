-- F1 Amendment B (Ashesi University student research project). Spec: specs/F1-login.md.
-- NOT APPLIED until Ryan approves `supabase db push` in chat. Earlier migrations are not edited.
--
--   B1. Admins can show an active admin-made code again. Its plain code is kept in the private
--       schema (not reachable through the API), read only by admin_show_invite, and erased as
--       soon as the code can no longer be used. Collector referral codes stay "shown once".

create table private.invite_code_plain (
  invite_id uuid primary key references public.invite_codes (id) on delete cascade,
  code      text not null check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$')
);
revoke all on private.invite_code_plain from public, anon, authenticated;

-- True while a code can still be used (same rule as private.usable_invite_id).
create or replace function private.invite_is_active(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.invite_codes i
    where i.id = p_id
      and not i.revoked
      and i.expires_at > now()
      and i.uses < i.max_uses
      and not exists (
        select 1 from public.collectors c where c.id = i.created_by and c.status <> 'approved'
      )
  );
$$;
revoke execute on function private.invite_is_active(uuid) from public, anon, authenticated;

-- Erase every kept code that can no longer be used.
create or replace function private.forget_inactive_codes()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.invite_code_plain p where not private.invite_is_active(p.invite_id);
$$;
revoke execute on function private.forget_inactive_codes() from public, anon, authenticated;

-- Revoke or the last join erases the kept code at once.
create or replace function private.forget_code_when_finished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revoked or new.uses >= new.max_uses then
    delete from private.invite_code_plain where invite_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function private.forget_code_when_finished() from public, anon, authenticated;

create trigger invite_codes_forget_plain
  after update of revoked, uses, max_uses on public.invite_codes
  for each row execute function private.forget_code_when_finished();

-- Admin codes: same signature and defaults (3 joins / 10 days); now also keeps the plain code.
create or replace function public.create_invite(p_label text, p_max_uses int default 3, p_days int default 10)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := private.new_invite_code();
  v_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_days not between 1 and 90 then
    raise exception 'expiry must be 1 to 90 days' using errcode = 'check_violation';
  end if;
  perform private.forget_inactive_codes();
  insert into public.invite_codes (code_hash, label, max_uses, expires_at, created_by)
  values (public.invite_code_hash(v_code), btrim(p_label), p_max_uses, now() + make_interval(days => p_days), auth.uid())
  returning id into v_id;
  insert into private.invite_code_plain (invite_id, code) values (v_id, v_code);
  return v_code;
end;
$$;

-- Admin list of every code, with whether "Show code" is possible. Admin only.
create or replace function public.admin_list_invites()
returns table (
  id uuid, label text, max_uses int, uses int, expires_at timestamptz, revoked boolean,
  created_at timestamptz, can_show boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  perform private.forget_inactive_codes();
  return query
  select i.id, i.label, i.max_uses, i.uses, i.expires_at, i.revoked, i.created_at,
         exists (select 1 from private.invite_code_plain p where p.invite_id = i.id)
  from public.invite_codes i
  order by i.created_at desc;
end;
$$;

-- The plain code of one active admin-made code, or null. Admin only.
create or replace function public.admin_show_invite(p_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  perform private.forget_inactive_codes();
  -- Null when the code can't be shown. No error here: an error would undo the clean-up above.
  select p.code into v_code from private.invite_code_plain p where p.invite_id = p_id;
  return v_code;
end;
$$;

revoke execute on function public.create_invite(text, int, int) from public, anon;
revoke execute on function public.admin_list_invites() from public, anon;
revoke execute on function public.admin_show_invite(uuid) from public, anon;
grant execute on function public.create_invite(text, int, int) to authenticated;
grant execute on function public.admin_list_invites() to authenticated;
grant execute on function public.admin_show_invite(uuid) to authenticated;
