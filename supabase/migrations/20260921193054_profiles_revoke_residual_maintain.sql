-- Follow-up to 20260921193002: post-apply verification showed anon and
-- authenticated still held Postgres 17's MAINTAIN privilege (VACUUM/ANALYZE/
-- REINDEX/CLUSTER/LOCK) on public.profiles -- it isn't in the pre-17 list of
-- privileges that migration revoked by name. It grants no read/write access
-- to row data, but nothing needs it, so it's removed (same "residual grant
-- survived a targeted REVOKE" class as 20260819010500).
-- REVOKE ALL also clears the column-level grant, so the intended final
-- state is re-granted explicitly, in this order:
--   authenticated: SELECT (rows still gated by RLS) + UPDATE(display_name) only
--   anon: nothing
begin;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

commit;
