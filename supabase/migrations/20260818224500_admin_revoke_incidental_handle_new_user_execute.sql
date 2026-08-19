-- handle_new_user is a trigger function only -- it's invoked automatically
-- when Supabase Auth's own service role inserts into auth.users, which
-- never goes through anon/authenticated's own EXECUTE privileges. Postgres
-- grants EXECUTE on new functions to PUBLIC by default though, which is
-- what put it on the security advisor as "callable via /rest/v1/rpc/..." --
-- same class of pre-existing, harmless-in-practice finding as
-- rls_auto_enable (calling a trigger function outside a real trigger
-- context errors immediately since NEW/OLD aren't set), but there's no
-- reason to leave an avoidable one on a function this project just added.
revoke execute on function public.handle_new_user() from public;
