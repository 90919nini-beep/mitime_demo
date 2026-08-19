-- audit_log_change is a trigger function only, same class of issue as
-- handle_new_user -- caught this time before reporting rather than after.
revoke execute on function public.audit_log_change() from anon, authenticated, public;
