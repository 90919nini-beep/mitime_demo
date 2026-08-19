-- Admin Dashboard Phase 1 (foundation), continued: a queryable per-user
-- table the admin app can search/list (auth.users itself isn't exposed to
-- PostgREST). Populated automatically on signup via trigger; backfilled
-- once here for the 3 accounts that already existed before this migration.

begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_select_staff on public.profiles
  for select using (public.is_staff(auth.uid(), 'admin'));

-- No insert/delete policy for any client role -- rows are created only by
-- the trigger below (and removed only via the auth.users cascade).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, email, created_at)
  values (new.id, new.email, new.created_at)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill the accounts that already existed before this trigger existed.
insert into public.profiles (id, email, created_at)
select id, email, created_at from auth.users
on conflict (id) do nothing;

commit;
