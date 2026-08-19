-- Bug found during Stage 1 smoke test: the generic audit trigger hardcoded
-- to_jsonb(new)->>'id' for target_id, which is correct for error_logs (pk
-- = id) but silently null for stitch_metadata (pk = stitch_key) -- an
-- audit row for a stitch edit didn't actually say which stitch. Fixed by
-- passing the primary key column name as a trigger argument (TG_ARGV[0])
-- instead of assuming a column name.

begin;

drop trigger stitch_metadata_audit on public.stitch_metadata;
drop trigger error_logs_audit on public.error_logs;

create or replace function public.audit_log_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_key text;
  v_pk_col text := coalesce(TG_ARGV[0], 'id');
begin
  for v_key in select jsonb_object_keys(to_jsonb(new)) loop
    if to_jsonb(old) -> v_key is distinct from to_jsonb(new) -> v_key then
      v_before := v_before || jsonb_build_object(v_key, to_jsonb(old) -> v_key);
      v_after := v_after || jsonb_build_object(v_key, to_jsonb(new) -> v_key);
    end if;
  end loop;
  if v_before <> '{}'::jsonb then
    insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
    values (auth.uid(), TG_OP || '_' || TG_TABLE_NAME, TG_TABLE_NAME, (to_jsonb(new) ->> v_pk_col), v_before, v_after);
  end if;
  return new;
end;
$$;

revoke execute on function public.audit_log_change() from anon, authenticated, public;

create trigger stitch_metadata_audit
  after update on public.stitch_metadata
  for each row execute function public.audit_log_change('stitch_key');

create trigger error_logs_audit
  after update on public.error_logs
  for each row execute function public.audit_log_change('id');

commit;
