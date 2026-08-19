-- Admin Dashboard Phase 1 (foundation): the server-enforced role table and
-- its hierarchy-check helper. No RLS policy anywhere permits a client to
-- insert/update/delete this table -- the only paths in are (a) this
-- migration's one-time owner bootstrap (run directly, not checked into
-- git -- see the plan doc) and (b) a future owner-only Edge Function for
-- subsequent grants/revokes. Absence of a row means "not staff"; normal
-- consumer users never get one.

begin;

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin')),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

-- Self-read only -- lets the admin app's login screen check "is the
-- signed-in user staff" (see plan §5.0). This is a UX convenience, not the
-- enforcement boundary: every actual admin data access is independently
-- re-gated by is_staff() below, not by whether this select succeeded.
create policy user_roles_select_own on public.user_roles
  for select using (auth.uid() = user_id);

-- Deliberately no insert/update/delete policy at all -- see comment above.

create or replace function public.is_staff(uid uuid, min_role text default 'admin')
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = uid
      and (case ur.role when 'owner' then 2 when 'admin' then 1 else 0 end)
          >= (case min_role when 'owner' then 2 when 'admin' then 1 else 0 end)
  );
$$;

grant execute on function public.is_staff(uuid, text) to authenticated;

commit;
