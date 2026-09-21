-- One-time backfill of profiles.display_name for accounts that existed
-- before the display-name system. Precedence:
--   1. the user's own in-app name (cloud_data 'settings' -> profileName) --
--      it's what they chose, so it beats a provider-supplied name;
--   2. provider metadata (full_name, then name);
--   3. otherwise leave NULL (no placeholders are ever generated).
-- Same sanitization as handle_new_user: strip control chars, trim, truncate
-- to 40, trim again, blank -> NULL. Idempotent and non-destructive: only
-- rows whose display_name is still NULL are touched, so re-running it (or
-- running it after a user has set a name) never overwrites anything.
-- This is deliberately a one-shot data fix, not an ongoing sync -- there is
-- no cloud_data -> profiles mirror; the client is the single writer going
-- forward.

begin;

update public.profiles p
set display_name = src.name
from (
  select
    p2.id,
    nullif(btrim(left(btrim(regexp_replace(
      coalesce(
        nullif(btrim(s.data->>'profileName'), ''),
        nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data->>'name'), ''),
        ''),
      '[[:cntrl:]]', '', 'g')), 40)), '') as name
  from public.profiles p2
  join auth.users u on u.id = p2.id
  left join public.cloud_data s on s.user_id = p2.id and s.kind = 'settings'
  where p2.display_name is null
) src
where p.id = src.id
  and p.display_name is null
  and src.name is not null;

commit;
