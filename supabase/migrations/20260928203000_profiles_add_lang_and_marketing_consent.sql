-- Foundation for the Email Marketing system.
--
-- lang: there is currently NO existing per-account language field anywhere
-- -- the app's language (LANGS in index.html, currently
-- en/fr/ja/zh/ko/es/de/th/pt/hi) lives only in localStorage ("sc_lang"),
-- deliberately device-local and never cloud-synced (unlike `settings`/
-- `dashLayout`, which do go through useCloudPush). This column is a new,
-- additive mirror -- NOT a duplicate of an existing synced field -- so the
-- server has a single source of truth for "which language to email this
-- user in". NULL means "not yet reported by any client"; email send logic
-- must treat NULL (and any value that doesn't match a shipped template) as
-- English, the defined fallback.
--
-- marketing_email_enabled: no existing consent field found anywhere
-- (grepped index.html/supabase/ for marketing|consent|unsubscribe --
-- every hit was OAuth "consent screen" or unrelated). Defaults to FALSE:
-- having an account is not consent to marketing email. This is entirely
-- separate from transactional email (signup confirmation, password
-- reset), which Supabase Auth's own built-in mail already handles and
-- must never be gated by this flag.
--
-- unsubscribe_token: a per-account capability secret, same pattern as
-- parties.edit_secret (20260818223454) -- lets a one-click unsubscribe
-- link in an email work without an app session, by proving possession of
-- an unguessable token rather than requiring auth. Never selectable by
-- any client role, same reasoning as edit_secret.

begin;

alter table public.profiles
  add column lang text,
  add column marketing_email_enabled boolean not null default false,
  add column unsubscribe_token uuid not null default gen_random_uuid();

alter table public.profiles
  add constraint profiles_lang_ck check (
    lang is null or lang in ('en','fr','ja','zh','ko','es','de','th','pt','hi')
  );

-- New columns start with zero grants (nothing pre-existing to narrow) --
-- explicitly opening exactly what's needed, same as display_name.
grant update (lang) on public.profiles to authenticated;
grant update (marketing_email_enabled) on public.profiles to authenticated;

-- profiles currently has a TABLE-WIDE select grant to authenticated
-- (covers every column, including the two just added) -- unsubscribe_token
-- must be excluded, and a column-level REVOKE cannot narrow a table-wide
-- GRANT (confirmed the hard way on parties.edit_secret, 20260818223853 /
-- SECURITY_BASELINE.md). Revoke the table-wide grant and re-grant the
-- explicit safe column list instead.
revoke select on public.profiles from authenticated;
grant select (
  id, email, display_name, created_at, last_seen_at, lang, marketing_email_enabled
) on public.profiles to authenticated;

commit;
