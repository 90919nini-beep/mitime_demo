-- Security fix: parties/party_signups previously had a single
-- "cmd: ALL, qual: true" RLS policy combined with full anon/authenticated
-- table grants -- meaning any holder of the app's anon key could read,
-- update, or delete ANY row, with no ownership check at all (confirmed via
-- pg_policies + information_schema.role_table_grants during an admin-
-- dashboard planning review). This feature intentionally has no auth
-- requirement and no ownership column -- a party's id already doubles as
-- its own public "join code" (shared by the host, entered by attendees),
-- so SELECT/INSERT stay open by design (narrowing SELECT would break
-- joining a private party by code, since RLS can't distinguish a targeted
-- fetch-by-id from a bulk scan). What must close is UPDATE/DELETE: nothing
-- in the app ever legitimately mutates a party/signup it didn't create, so
-- those now require a per-row capability secret returned only once, to the
-- row's own creator, at insert time -- never selectable afterward.

begin;

-- 1. Never-used column: push_token is written nowhere and read nowhere in
--    the shipped app (confirmed via full-file search) -- stop leaking it.
revoke select (push_token) on public.party_signups from anon, authenticated;

-- 2. Capability secrets -- generated automatically, never client-supplied,
--    never selectable (so they can only ever be learned once, from the
--    INSERT response of the row they belong to).
alter table public.parties
  add column edit_secret uuid not null default gen_random_uuid();
revoke select (edit_secret) on public.parties from anon, authenticated;

alter table public.party_signups
  add column cancel_secret uuid not null default gen_random_uuid();
revoke select (cancel_secret) on public.party_signups from anon, authenticated;

-- 3. Replace the single "ALL / true" policy on each table with an explicit
--    SELECT + INSERT pair (unchanged behavior -- still open, matching the
--    feature's own join-by-code / open-hosting design), and drop direct
--    UPDATE/DELETE entirely -- those now only happen through the
--    SECURITY DEFINER functions below.
drop policy if exists public_all on public.parties;
create policy parties_select on public.parties for select using (true);
create policy parties_insert on public.parties for insert with check (true);
revoke update, delete on public.parties from anon, authenticated;

drop policy if exists public_all on public.party_signups;
create policy party_signups_select on public.party_signups for select using (true);
create policy party_signups_insert on public.party_signups for insert with check (true);
revoke update, delete on public.party_signups from anon, authenticated;

-- 4. The only remaining path to mutate/delete a party or cancel a signup:
--    each function re-checks the caller-supplied secret against the row's
--    own stored secret and does nothing if it doesn't match -- the same
--    "resolve identity server-side, never trust the client" shape already
--    used by supabase/functions/delete-account.

create or replace function public.party_set_host_photo(p_id uuid, p_secret uuid, p_host_photo text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update parties set host_photo = p_host_photo where id = p_id and edit_secret = p_secret;
  if not found then raise exception 'not authorized'; end if;
end;
$$;

create or replace function public.party_edit(
  p_id uuid, p_secret uuid,
  p_title text, p_description text, p_date date, p_time text, p_location text,
  p_craft_type text, p_max_attendees int, p_is_public boolean,
  p_latitude double precision, p_longitude double precision,
  p_place_name text, p_formatted_address text, p_host_city text, p_host_photo text,
  p_icon text, p_icon_color text
)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update parties set
    title = p_title, description = p_description, date = p_date, time = p_time,
    location = p_location, craft_type = p_craft_type, max_attendees = p_max_attendees,
    is_public = p_is_public, latitude = p_latitude, longitude = p_longitude,
    place_name = p_place_name, formatted_address = p_formatted_address,
    host_city = p_host_city, host_photo = p_host_photo, icon = p_icon, icon_color = p_icon_color
  where id = p_id and edit_secret = p_secret;
  if not found then raise exception 'not authorized'; end if;
end;
$$;

create or replace function public.party_post_announcement(p_id uuid, p_secret uuid, p_announcement text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update parties set announcement = p_announcement where id = p_id and edit_secret = p_secret;
  if not found then raise exception 'not authorized'; end if;
end;
$$;

create or replace function public.party_delete(p_id uuid, p_secret uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  delete from parties where id = p_id and edit_secret = p_secret;
  if not found then raise exception 'not authorized'; end if;
end;
$$;

create or replace function public.party_signup_cancel(p_signup_id uuid, p_secret uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  delete from party_signups where id = p_signup_id and cancel_secret = p_secret;
  if not found then raise exception 'not authorized'; end if;
end;
$$;

grant execute on function
  public.party_set_host_photo(uuid,uuid,text),
  public.party_edit(uuid,uuid,text,text,date,text,text,text,int,boolean,double precision,double precision,text,text,text,text,text,text),
  public.party_post_announcement(uuid,uuid,text),
  public.party_delete(uuid,uuid),
  public.party_signup_cancel(uuid,uuid)
to anon, authenticated;

commit;
