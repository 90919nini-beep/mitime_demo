-- email_unsubscribe_by_token: the ONE anon-callable function in the whole
-- email system, mirroring party_signup_cancel's shape (20260818223454) --
-- a bearer-capability token proves the right to act, not a Supabase
-- session, since a link clicked from an email client has no app auth.
-- Deliberately separate from account deletion (delete-account Edge
-- Function): this only ever flips marketing_email_enabled, never touches
-- the account itself, and it is genuinely idempotent/harmless to call
-- more than once (unlike a party-secret RPC that consumes/deletes a row).
create or replace function public.email_unsubscribe_by_token(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  update public.profiles set marketing_email_enabled = false
  where unsubscribe_token = p_token
  returning id into v_id;
  return v_id is not null;
end;
$$;
revoke execute on function public.email_unsubscribe_by_token(uuid) from public;
grant execute on function public.email_unsubscribe_by_token(uuid) to anon, authenticated;

-- Read-only audience preview for the Admin Campaigns UI ("Audience: 1,284
-- users / English 824 / ..."). Only supports the one V1 audience kind
-- (all_opted_in); a not-yet-implemented kind returns zero rather than
-- erroring, so the UI degrades instead of breaking.
create or replace function public.email_preview_audience(p_filter jsonb)
returns table(lang text, user_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_staff(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  if coalesce(p_filter->>'kind', 'all_opted_in') <> 'all_opted_in' then
    return;
  end if;
  return query
    select coalesce(p.lang, 'en') as lang, count(*)::bigint as user_count
    from public.profiles p
    where p.marketing_email_enabled = true
    group by coalesce(p.lang, 'en');
end;
$$;
revoke execute on function public.email_preview_audience(jsonb) from anon, public;
grant execute on function public.email_preview_audience(jsonb) to authenticated;

-- Seed: the 5 templates named in the brief. Only `welcome`'s English copy
-- is pre-written, as one concrete, on-brand example to preview against --
-- everything else (other templates, other languages) is deliberately left
-- for Admin to write, not invented on Miiitime's behalf.
insert into public.email_templates (key, name, description) values
  ('welcome', 'Welcome', 'Sent once, shortly after signup.'),
  ('project_reminder', 'Project reminder', 'A project or pattern has been inactive for a while.'),
  ('finished_project', 'Finished project', 'Sent when a user marks a project complete.'),
  ('product_update', 'Product update', 'Manual campaigns announcing something new.'),
  ('monthly_inspiration', 'Monthly inspiration', 'A recurring, non-automated inspiration campaign.');

insert into public.email_template_versions (template_id, lang, subject, body_html, status)
select id, 'en',
  'A little time for making.',
  '<p>Hi {{first_name}},</p><p>Welcome to Miiitime. A little time for making, whenever you have it.</p><p><a href="{{project_url}}">Open Miiitime</a></p>',
  'active'
from public.email_templates where key = 'welcome';

-- Seed: the 4 automations. All REVIEW_REQUIRED, all active as
-- *definitions* -- this does not mean triggers actually fire yet (see the
-- Welcome trigger below and the implementation report for what is/isn't
-- wired in V1).
insert into public.email_automations (key, name, trigger_description, template_id)
select 'welcome', 'Welcome', 'New user signup', id from public.email_templates where key = 'welcome';
insert into public.email_automations (key, name, trigger_description, template_id)
select 'project_reminder', 'Project reminder', 'A project/pattern has been inactive for a defined period', id from public.email_templates where key = 'project_reminder';
insert into public.email_automations (key, name, trigger_description, template_id)
select 'finished_project', 'Finished project', 'User completes a project', id from public.email_templates where key = 'finished_project';
insert into public.email_automations (key, name, trigger_description, template_id)
select 'product_update', 'Product update', 'Admin creates a campaign', id from public.email_templates where key = 'product_update';
