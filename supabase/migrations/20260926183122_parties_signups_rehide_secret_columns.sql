-- Re-hide the capability secrets and push tokens. 20260818223853 limited
-- anon/authenticated SELECT to non-secret columns, but
-- 20260822154149 then re-granted SELECT on the whole tables (to fix reads
-- failing, most likely because the column list was missing a column the app
-- selects), which silently re-exposed edit_secret / cancel_secret and, later,
-- host_push_token / push_token. Anyone holding the public anon key could read
-- them and then edit/delete any party, cancel any sign-up, or read/post in
-- any party chat through the secret-gated RPCs.
--
-- Column list = exactly what the app reads or filters on directly
-- (PARTY_COLS + created_at for parties; id/party_id/attendee_* /created_at
-- for signups). Secrets stay readable only inside the SECURITY DEFINER
-- functions that check them.
begin;

revoke select on public.parties from anon, authenticated;
grant select (
  id, host_name, host_country, host_bio, host_city, host_photo,
  title, description, date, time, location, craft_type, max_attendees,
  created_at, is_public, announcement, latitude, longitude,
  place_name, formatted_address, icon, icon_color, join_code
) on public.parties to anon, authenticated;

revoke select on public.party_signups from anon, authenticated;
grant select (
  id, party_id, attendee_name, attendee_country, attendee_bio,
  attendee_photo, created_at
) on public.party_signups to anon, authenticated;

commit;
