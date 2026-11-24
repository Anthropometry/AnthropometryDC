-- F6 Amendment C (approved by Ryan, 24 Nov 2026): face-detector finds on the participant's own body
-- below the neck are not blurred (they were shirt prints, arms and shoes). Photos made this way are
-- blur version 3 and say how many finds were ignored. Version 2 photos still waiting on phones are
-- accepted (their whole-head blur is the same); version 1 stays refused.

alter table public.photos
  drop constraint photos_blur_version_check,
  add constraint photos_blur_version_check check (blur_version in (1, 2, 3)),
  add column faces_ignored_on_body smallint
    check (faces_ignored_on_body is null or faces_ignored_on_body between 0 and 20),
  add constraint photos_v3_complete check (blur_version <> 3 or faces_ignored_on_body is not null);

create or replace function private.check_photo_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.blur_version not in (2, 3) then
    raise exception 'photo refused: update the app (old face blur)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_photo_version() from public, anon, authenticated;

grant update (faces_ignored_on_body) on public.photos to authenticated;
