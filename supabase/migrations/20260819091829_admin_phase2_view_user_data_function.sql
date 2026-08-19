-- The one explicit, auditable path to another user's actual cloud_data
-- content -- everything else in the admin app sees counts/metadata only
-- (admin_get_user's cloud_data_summary). Implemented as a SECURITY DEFINER
-- function rather than an Edge Function for the same reason as
-- grant/revoke: no Supabase Auth Admin API is involved here, so doing the
-- read and the audit insert in one Postgres transaction is both simpler
-- and more atomic than two separate service-role HTTP calls. Always
-- writes an audit row -- success or "not found" alike -- before returning
-- anything, and the whole call fails (no data returned) if that insert
-- fails, since this is the one place "fail closed on audit integrity" is
-- actually achievable in a single transaction.

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
  if p_kind not in ('projects','yarnLib','patterns','settings','dashLayout') then
    raise exception 'invalid kind';
  end if;

  select data into v_data from public.cloud_data where user_id = p_user_id and kind = p_kind;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), 'view_user_data', 'cloud_data', p_user_id::text || ':' || p_kind, null, null);

  return v_data;
end;
$$;

grant execute on function public.admin_view_user_data(uuid, text) to authenticated;
revoke execute on function public.admin_view_user_data(uuid, text) from anon, public;

commit;
