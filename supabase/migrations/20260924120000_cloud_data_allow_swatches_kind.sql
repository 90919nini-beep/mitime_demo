-- Widens cloud_data's kind whitelist to accept the new "swatches" kind (the
-- Swatches Library's own synced list, kept separate from yarnLib). Same shape
-- as the live-only 20260919081413_cloud_data_allow_parties_kind: drop and
-- re-add the one CHECK constraint, now with 'swatches' appended. The new set
-- is a superset of the old one, so every existing row still satisfies it.
--
-- Rollout order matters: app builds from before the pullCloudData
-- unknown-kind guard throw on a cloud_data row whose kind they don't know,
-- which stops cloud sync on that device. Until this is applied no 'swatches'
-- row can exist (the push is rejected here, and the client keeps swatches
-- local and marked dirty), so apply this only once the build containing that
-- guard is what's installed.

alter table public.cloud_data drop constraint cloud_data_kind_check;
alter table public.cloud_data add constraint cloud_data_kind_check
  check (kind = any (array['projects'::text, 'yarnLib'::text, 'patterns'::text, 'settings'::text, 'dashLayout'::text, 'parties'::text, 'swatches'::text]));
