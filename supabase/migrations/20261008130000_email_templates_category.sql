-- Distinguishes transactional email (account/security — never gated on
-- marketing consent) from marketing email (features/patterns/inspiration —
-- gated on profiles.marketing_email_enabled, as today). Lives on
-- email_templates, not email_campaigns or email_automations: a campaign's
-- content IS its template, and templates are the one place every send path
-- (the welcome trigger, a human-prepared bulk campaign, any future
-- automation) already passes through, so classifying here needs no new
-- column anywhere else and nothing can bypass it by skipping a step.
--
-- Defaults to 'marketing' deliberately: a template only becomes exempt
-- from consent by an explicit decision below, never silently by omission
-- of a value. 'welcome' is the only template classified transactional in
-- V1 -- the other four (project_reminder, finished_project, product_update,
-- monthly_inspiration) are all engagement/content email by their own seeded
-- descriptions and correctly keep requiring opt-in.
begin;

alter table public.email_templates
  add column category text not null default 'marketing'
  check (category in ('transactional', 'marketing'));

update public.email_templates set category = 'transactional' where key = 'welcome';

commit;
