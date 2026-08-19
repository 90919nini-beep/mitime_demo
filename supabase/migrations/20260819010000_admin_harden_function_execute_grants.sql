-- Closes two findings from the post-Phase-1 security review: both
-- functions ended up directly callable by anon/authenticated due to
-- Supabase's default per-function EXECUTE grant to those roles (separate
-- from, and not covered by, a REVOKE ... FROM PUBLIC -- the same root
-- cause already hit once with the parties edit_secret/push_token column
-- grants). Revoking directly from the actual grantees this time.

begin;

-- handle_new_user is a trigger function only; no client (anon or
-- authenticated) has any legitimate reason to call it directly, and
-- trigger firing does not depend on the inserting role's own EXECUTE
-- privilege on the trigger function, so this cannot break signup.
revoke execute on function public.handle_new_user() from anon, authenticated;

-- is_staff needs to stay callable by `authenticated` -- the
-- profiles_select_staff RLS policy invokes it as the querying role, and an
-- authenticated user's own SELECT on profiles would fail outright if that
-- role lost EXECUTE on a function its own applicable policy calls. `anon`
-- has no such requirement: profiles_select_own and profiles_select_staff
-- both evaluate to false for anon regardless (auth.uid() is null), so
-- nothing anon does needs is_staff() -- its only use was letting anyone
-- directly probe "is this uuid staff" via /rest/v1/rpc/is_staff.
revoke execute on function public.is_staff(uuid, text) from anon;

commit;
