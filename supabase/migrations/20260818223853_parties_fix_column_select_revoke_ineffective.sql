-- Correction: the previous migration's "revoke select (col) ... from anon,
-- authenticated" was silently ineffective, because a table-wide
-- "grant select on parties/party_signups to anon/authenticated" already
-- existed (from before this project) and table-level SELECT independently
-- permits every column regardless of a column-level revoke -- confirmed
-- live via information_schema.column_privileges (edit_secret/cancel_secret/
-- push_token all still showed granted) and by directly selecting
-- edit_secret as anon, which succeeded. Postgres column-level privileges
-- can only NARROW access below what a table-level grant already gives by
-- removing the table-level grant first and re-granting an explicit column
-- list.

begin;

revoke select on public.parties from anon, authenticated;
grant select (
  id, host_name, host_country, host_bio, host_photo, host_city,
  title, description, date, time, location, craft_type, max_attendees,
  created_at, is_public, announcement, latitude, longitude,
  place_name, formatted_address, icon, icon_color
) on public.parties to anon, authenticated;

revoke select on public.party_signups from anon, authenticated;
grant select (
  id, party_id, attendee_name, attendee_country, created_at,
  attendee_bio, attendee_photo
) on public.party_signups to anon, authenticated;

commit;
