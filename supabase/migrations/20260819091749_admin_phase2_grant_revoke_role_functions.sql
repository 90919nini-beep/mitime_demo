-- Owner-only grant/revoke of the `admin` role. Implemented as a single
-- SECURITY DEFINER function per action (not an Edge Function): granting or
-- revoking a role is a pure Postgres write with no Supabase Auth Admin API
-- involvement, so doing the role check + write + audit insert in one
-- transaction is both simpler and strictly more atomic than an Edge
-- Function making two separate service-role HTTP calls (write, then
-- audit). Deviates from the Phase 2 plan's original "Edge Function" sketch
-- for these two actions specifically; every approved constraint is still
-- met: owner-only, admin-grant cannot accept an arbitrary role (the
-- parameter doesn't exist), admin-revoke refuses any 'owner' target,
-- audited.

begin;

create or replace function public.admin_grant_admin_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_existing text;
begin
  if not public.is_staff(auth.uid(), 'owner') then
    raise exception 'not authorized';
  end if;
  select role into v_existing from public.user_roles where user_id = p_user_id;
  if v_existing is not null then
    raise exception 'user already has a role: %', v_existing;
  end if;
  insert into public.user_roles (user_id, role, granted_by) values (p_user_id, 'admin', auth.uid());
  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), 'grant_role', 'user_roles', p_user_id::text, null, jsonb_build_object('role','admin'));
end;
$$;

create or replace function public.admin_revoke_admin_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_existing text;
begin
  if not public.is_staff(auth.uid(), 'owner') then
    raise exception 'not authorized';
  end if;
  select role into v_existing from public.user_roles where user_id = p_user_id;
  if v_existing is null then
    raise exception 'user has no staff role to revoke';
  end if;
  if v_existing = 'owner' then
    raise exception 'cannot revoke an owner role';
  end if;
  delete from public.user_roles where user_id = p_user_id;
  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), 'revoke_role', 'user_roles', p_user_id::text, jsonb_build_object('role', v_existing), null);
end;
$$;

grant execute on function public.admin_grant_admin_role(uuid) to authenticated;
grant execute on function public.admin_revoke_admin_role(uuid) to authenticated;
revoke execute on function public.admin_grant_admin_role(uuid) from anon, public;
revoke execute on function public.admin_revoke_admin_role(uuid) from anon, public;

commit;
