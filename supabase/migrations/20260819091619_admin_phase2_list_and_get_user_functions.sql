-- profiles alone has no ban status or last-sign-in time -- those live only
-- on auth.users, which PostgREST never exposes directly. These two
-- SECURITY DEFINER, is_staff-gated functions close that gap. Both check
-- is_staff() explicitly inside the function body (not just relying on
-- caller-side EXECUTE grants) since that's the actual authorization
-- boundary, not merely who can invoke the function.

begin;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table(id uuid, email text, display_name text, created_at timestamptz, last_seen_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.is_staff(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  return query
    select p.id, p.email, p.display_name, p.created_at, p.last_seen_at, u.last_sign_in_at, u.banned_until
    from public.profiles p
    join auth.users u on u.id = p.id
    where p_search is null
       or p.email ilike '%' || p_search || '%'
       or p.display_name ilike '%' || p_search || '%'
       or p.id::text = p_search
    order by p.created_at desc
    limit least(p_limit, 200) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_get_user(p_id uuid)
returns table(
  id uuid, email text, display_name text, created_at timestamptz, last_seen_at timestamptz,
  last_sign_in_at timestamptz, banned_until timestamptz,
  cloud_data_summary jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.is_staff(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  return query
    select p.id, p.email, p.display_name, p.created_at, p.last_seen_at, u.last_sign_in_at, u.banned_until,
      coalesce((
        select jsonb_agg(jsonb_build_object('kind', cd.kind, 'updated_at', cd.updated_at, 'size_bytes', pg_column_size(cd.data)))
        from public.cloud_data cd where cd.user_id = p.id
      ), '[]'::jsonb) as cloud_data_summary
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = p_id;
end;
$$;

grant execute on function public.admin_list_users(text, int, int) to authenticated;
grant execute on function public.admin_get_user(uuid) to authenticated;
revoke execute on function public.admin_list_users(text, int, int) from anon, public;
revoke execute on function public.admin_get_user(uuid) from anon, public;

commit;
