-- Server functions the app switches to before row access on parties /
-- party_signups is narrowed (unlisted parties and sign-ups stop being
-- listable). Additive only: nothing here changes what existing clients see.
--
-- Capability model, same as the rest of Parties:
--   * a party's UUID or join code is what lets you open it (unguessable /
--     shared by the host), so lookups by id or code need nothing else;
--   * attendee details are for the party's own people, so the list needs the
--     host's edit_secret, or an attendee's signup id + cancel_secret
--     (identical check to party_messages_list);
--   * attendee counts carry no personal data, so anyone can ask.
-- None of these ever return edit_secret, cancel_secret or push tokens.
begin;

create or replace function public.party_get_many(p_ids uuid[])
returns table(
  id uuid, host_name text, host_country text, host_bio text, host_city text, host_photo text,
  title text, description text, date date, "time" text, location text, craft_type text,
  max_attendees integer, is_public boolean, announcement text,
  latitude double precision, longitude double precision, place_name text, formatted_address text,
  icon text, icon_color text, join_code text, created_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, public as $$
  select p.id, p.host_name, p.host_country, p.host_bio, p.host_city, p.host_photo,
         p.title, p.description, p.date, p.time, p.location, p.craft_type,
         p.max_attendees, p.is_public, p.announcement,
         p.latitude, p.longitude, p.place_name, p.formatted_address,
         p.icon, p.icon_color, p.join_code, p.created_at
  from parties p
  where p.id = any((coalesce(p_ids, '{}'::uuid[]))[1:200])
  order by p.date nulls last;
$$;

create or replace function public.party_get_by_code(p_code text)
returns table(
  id uuid, host_name text, host_country text, host_bio text, host_city text, host_photo text,
  title text, description text, date date, "time" text, location text, craft_type text,
  max_attendees integer, is_public boolean, announcement text,
  latitude double precision, longitude double precision, place_name text, formatted_address text,
  icon text, icon_color text, join_code text, created_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, public as $$
  select p.id, p.host_name, p.host_country, p.host_bio, p.host_city, p.host_photo,
         p.title, p.description, p.date, p.time, p.location, p.craft_type,
         p.max_attendees, p.is_public, p.announcement,
         p.latitude, p.longitude, p.place_name, p.formatted_address,
         p.icon, p.icon_color, p.join_code, p.created_at
  from parties p
  where p.join_code = upper(btrim(coalesce(p_code, '')))
  limit 1;
$$;

create or replace function public.party_attendee_counts(p_ids uuid[])
returns table(party_id uuid, attendee_count integer)
language sql stable security definer set search_path = pg_catalog, public as $$
  select s.party_id, count(*)::int
  from party_signups s
  where s.party_id = any((coalesce(p_ids, '{}'::uuid[]))[1:500])
  group by s.party_id;
$$;

create or replace function public.party_signups_list(p_id uuid, p_secret uuid, p_signup_id uuid default null)
returns table(id uuid, attendee_name text, attendee_country text, attendee_bio text, attendee_photo text, created_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_ok boolean;
begin
  if p_signup_id is null then
    select exists(select 1 from parties where parties.id = p_id and edit_secret = p_secret) into v_ok;
  else
    select exists(
      select 1 from party_signups
      where party_signups.id = p_signup_id and party_signups.party_id = p_id and cancel_secret = p_secret
    ) into v_ok;
  end if;
  if not coalesce(v_ok, false) then
    raise exception 'Not authorized to see this party''s guests';
  end if;
  return query
    select s.id, s.attendee_name, s.attendee_country, s.attendee_bio, s.attendee_photo, s.created_at
    from party_signups s where s.party_id = p_id order by s.created_at;
end;
$$;

revoke all on function
  public.party_get_many(uuid[]),
  public.party_get_by_code(text),
  public.party_attendee_counts(uuid[]),
  public.party_signups_list(uuid, uuid, uuid)
from public;
grant execute on function
  public.party_get_many(uuid[]),
  public.party_get_by_code(text),
  public.party_attendee_counts(uuid[]),
  public.party_signups_list(uuid, uuid, uuid)
to anon, authenticated;

commit;
