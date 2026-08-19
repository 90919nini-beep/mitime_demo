-- Follow-up to admin_harden_function_execute_grants: revoking EXECUTE
-- from anon directly was not sufficient -- is_staff's ACL
-- ({=X/postgres,...}) still carried a separate grant to the PUBLIC
-- pseudo-role (confirmed via pg_proc.proacl), which anon inherits
-- independent of its own now-revoked direct grant. authenticated's grant
-- is its own separate ACL entry, so revoking PUBLIC does not affect it.
revoke execute on function public.is_staff(uuid, text) from public;
