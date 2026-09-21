-- Miiitime user display name: profiles.display_name becomes the canonical,
-- user-chosen, Miiitime-owned display name (independent of whatever a
-- Google/Apple provider says after account creation).
--
-- This migration only NARROWS existing client privileges and adds a shape
-- guard; it adds no table, no policy, no function beyond redefining the
-- existing signup trigger function, and does not touch user_roles/is_staff.
-- The three existing RLS policies on profiles (select_own, select_staff,
-- update_own) are unchanged -- update_own still restricts WHICH ROW a client
-- may update; the column grant below restricts WHICH COLUMN.

begin;

-- 1. Shape guard. NULL stays valid ("no name set" -- we never invent a
--    placeholder). Clients trim before writing; the trigger below
--    sanitizes provider-supplied names so it can never violate this.
alter table public.profiles
  add constraint profiles_display_name_ck check (
    display_name is null or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 40
      and display_name !~ '[[:cntrl:]]'
    )
  );

-- 2. Column-level lockdown. profiles had a table-wide arwdDxtm grant to
--    anon and authenticated (so a signed-in user could rewrite their own
--    email/created_at/last_seen_at, which the Admin app displays). As with
--    the parties columns (see 20260818223853), a column-level grant can only
--    narrow access after the table-level grant is revoked first.
--    SELECT is kept as-is (profiles_select_own / profiles_select_staff
--    still gate rows). anon needs nothing on this table at all.
--    service_role and the SECURITY DEFINER admin functions (which run as
--    postgres) are unaffected.
revoke insert, update, delete, truncate, references, trigger
  on public.profiles from anon, authenticated;
revoke select on public.profiles from anon;
grant update (display_name) on public.profiles to authenticated;

-- 3. Seed display_name from provider metadata at account creation ONLY.
--    This trigger fires on auth.users INSERT and nothing else writes
--    display_name from provider data afterwards, so a later provider login
--    can never overwrite a Miiitime display name. Provider metadata is
--    untrusted text, so it is sanitized before insert (strip control
--    chars, trim, truncate to 40, trim again, blank -> NULL): a constraint
--    violation inside this trigger would abort signup outright.
--    Apple (and any provider with no name) yields NULL, deliberately.
--    CREATE OR REPLACE preserves the existing ACL; the revokes below just
--    re-assert it (see 20260818224500 / 20260819010000).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, email, display_name, created_at)
  values (
    new.id,
    new.email,
    nullif(btrim(left(btrim(regexp_replace(
      coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
               nullif(btrim(new.raw_user_meta_data->>'name'), ''), ''),
      '[[:cntrl:]]', '', 'g')), 40)), ''),
    new.created_at
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
