-- Closes a defense-in-depth gap flagged in the Phase 2 security review:
-- profiles.unsubscribe_token (20260928203000) had no uniqueness guarantee
-- at the database level -- only gen_random_uuid()'s own astronomically
-- low collision odds. That was already true for email_unsubscribe_by_token
-- (20260928203400), and matters more now that the same token also drives
-- email_subscribe_by_token (20261009100000): both do
-- `update ... where unsubscribe_token = p_token`, so if two rows ever
-- shared a token, either RPC would silently act on both. Verified clean
-- before writing this (0 nulls, 0 duplicate non-null values, 9/9 rows
-- distinct) -- this constraint only formalizes what is already true today.
alter table public.profiles
  add constraint profiles_unsubscribe_token_key unique (unsubscribe_token);
