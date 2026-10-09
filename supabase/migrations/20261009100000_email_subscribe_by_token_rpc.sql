-- email_subscribe_by_token: the opt-in mirror of email_unsubscribe_by_token
-- (20260928203400). Same trust model exactly -- a bearer-capability token
-- proves the right to act on one account, not a Supabase session, since a
-- link clicked from an email (or typed from a page with no app session)
-- has none. Reuses the SAME profiles.unsubscribe_token rather than a new,
-- subscribe-only token: it's a capability secret for "prove you are this
-- account", not named for one single direction of travel, and minting a
-- second token per account would just be duplicate state for no added
-- safety.
--
-- Deliberately idempotent and harmless to call more than once, same as
-- unsubscribe -- an already-subscribed account calling this again is just
-- a no-op success, never an error.
--
-- Unlike unsubscribe, the /subscribe page requires an explicit confirm
-- click before ever calling this RPC (automated link-scanners that
-- pre-fetch email links are a real risk for an opt-IN action in a way
-- they aren't for opt-out -- accidentally unsubscribing someone is
-- harmless, accidentally subscribing someone to marketing they never
-- agreed to is not). That confirmation step lives entirely in the static
-- page's own UI, not here -- this function's authorization is still just
-- "possession of the token", identical in shape to email_unsubscribe_by_token.
create or replace function public.email_subscribe_by_token(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  update public.profiles set marketing_email_enabled = true
  where unsubscribe_token = p_token
  returning id into v_id;
  return v_id is not null;
end;
$$;
revoke execute on function public.email_subscribe_by_token(uuid) from public;
grant execute on function public.email_subscribe_by_token(uuid) to anon, authenticated;
