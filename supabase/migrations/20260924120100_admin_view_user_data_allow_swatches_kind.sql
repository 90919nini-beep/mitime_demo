-- Lets the admin app's audited "view user data" path read the new "swatches"
-- cloud_data kind, alongside the kinds it already allows. The body is the
-- live admin_view_user_data definition verbatim (20260819091829 plus its
-- audit comment) with only 'swatches' added to the kind list. CREATE OR
-- REPLACE keeps the function's existing grants (authenticated + service_role
-- EXECUTE only), so no grant/revoke is restated here.

begin;

create or replace function public.admin_view_user_data(p_user_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_data jsonb;
begin
  if not public.is_staff(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  if p_kind not in ('projects','yarnLib','patterns','settings','dashLayout','swatches') then
    raise exception 'invalid kind';
  end if;

  select data into v_data from public.cloud_data where user_id = p_user_id and kind = p_kind;

  -- Audit write happens before returning anything; if it fails, the whole
  -- call fails (raise propagates), so data is never handed back unlogged.
  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), 'view_user_data', 'cloud_data', p_user_id::text || ':' || p_kind, null, null);

  return v_data;
end;
$$;

commit;
