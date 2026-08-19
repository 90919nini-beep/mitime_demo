-- Follow-up to parties_close_unrestricted_anon_write_access: PostgREST's
-- insert-with-RETURNING (.insert().select()) is subject to the SAME
-- column-level SELECT grants as an ordinary SELECT -- so with edit_secret/
-- cancel_secret column SELECT revoked for anon/authenticated, a direct
-- client INSERT could never actually receive its own secret back. Route
-- creation through SECURITY DEFINER functions instead, which run as the
-- function owner and can read+return the secret explicitly regardless of
-- the caller's column grants. Direct INSERT on the base tables is no
-- longer needed once creation goes through these, so it's revoked too --
-- same "no unrestricted anon access" principle already applied to
-- UPDATE/DELETE.

begin;

create or replace function public.party_create(
  p_host_name text, p_host_country text, p_host_bio text, p_host_photo text, p_host_city text,
  p_title text, p_description text, p_date date, p_time text, p_location text,
  p_craft_type text, p_max_attendees int, p_is_public boolean,
  p_latitude double precision, p_longitude double precision,
  p_place_name text, p_formatted_address text, p_icon text, p_icon_color text
) returns table(id uuid, edit_secret uuid)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_secret uuid;
begin
  insert into parties (host_name, host_country, host_bio, host_photo, host_city,
    title, description, date, time, location, craft_type, max_attendees, is_public,
    latitude, longitude, place_name, formatted_address, icon, icon_color)
  values (p_host_name, p_host_country, p_host_bio, p_host_photo, p_host_city,
    p_title, p_description, p_date, p_time, p_location, p_craft_type, p_max_attendees, p_is_public,
    p_latitude, p_longitude, p_place_name, p_formatted_address, p_icon, p_icon_color)
  returning parties.id, parties.edit_secret into v_id, v_secret;
  return query select v_id, v_secret;
end;
$$;

create or replace function public.party_signup_create(
  p_party_id uuid, p_attendee_name text, p_attendee_country text, p_attendee_bio text, p_attendee_photo text
) returns table(id uuid, cancel_secret uuid)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_secret uuid;
begin
  insert into party_signups (party_id, attendee_name, attendee_country, attendee_bio, attendee_photo)
  values (p_party_id, p_attendee_name, p_attendee_country, p_attendee_bio, p_attendee_photo)
  returning party_signups.id, party_signups.cancel_secret into v_id, v_secret;
  return query select v_id, v_secret;
end;
$$;

grant execute on function
  public.party_create(text,text,text,text,text,text,text,date,text,text,text,int,boolean,double precision,double precision,text,text,text,text),
  public.party_signup_create(uuid,text,text,text,text)
to anon, authenticated;

revoke insert on public.parties from anon, authenticated;
revoke insert on public.party_signups from anon, authenticated;
drop policy if exists parties_insert on public.parties;
drop policy if exists party_signups_insert on public.party_signups;

commit;
