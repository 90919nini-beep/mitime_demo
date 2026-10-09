-- Makes email_automations.mode actually control the welcome-automation
-- workflow (previously schema-complete but unread -- see the 20260928203500
-- comment acknowledging this gap). REVIEW_REQUIRED keeps today's exact
-- behavior (PENDING_REVIEW, human approval, human-triggered send via
-- email-send-campaign). AUTO_SEND now creates the campaign already
-- APPROVED and relies on a new scheduled dispatcher (pg_cron + pg_net +
-- the email-dispatch-automation Edge Function, deployed separately) to
-- invoke the existing, unmodified email-send-campaign sending logic --
-- the trigger itself only ever does plain row inserts, never HTTP/email.
--
-- "Auto-approval" is still logged like any other approval, just with no
-- human actor (admin_user_id = null, action = 'auto_approve_campaign'),
-- so audit history never pretends a real admin clicked approve.
begin;

-- pg_net lets a scheduled job make the one outbound HTTP call into the
-- dispatcher Edge Function; pg_cron is what schedules that job. Neither
-- is installed yet in this project. Both are standard, Supabase-supported
-- extensions and expose no new surface to anon/authenticated roles (their
-- schemas aren't part of this project's exposed PostgREST schemas).
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- One fresh, random, server-only secret the scheduled job sends to the
-- dispatcher so it can tell a legitimate scheduled call from anyone else
-- hitting that URL. Generated here (pgcrypto's gen_random_bytes is already
-- installed), read back into the cron job body below, and must also be
-- set as the email-dispatch-automation Edge Function's own
-- AUTOMATION_DISPATCH_SECRET secret (a separate, manual deploy-time step --
-- Vault secrets and Edge Function secrets are not the same store and
-- cannot be synced by a SQL migration).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'email_automation_dispatch_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'email_automation_dispatch_secret',
      'Internal secret the pg_cron automation-dispatch job sends to the email-dispatch-automation Edge Function. Never exposed to any client. Must match that function''s AUTOMATION_DISPATCH_SECRET Edge Function secret.'
    );
  end if;
end $$;

create or replace function public.email_trigger_welcome_automation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_automation record;
  v_campaign_id uuid;
  v_match_statuses text[];
begin
  select * into v_automation from public.email_automations where key = 'welcome';
  if v_automation is null or not v_automation.is_active or v_automation.template_id is null then
    return new;
  end if;

  -- AUTO_SEND also reuses a campaign still sitting at APPROVED (not yet
  -- picked up by the dispatcher), so near-simultaneous signups land in the
  -- same not-yet-sent batch instead of spawning one campaign each.
  -- Deliberately NOT SENDING/SENT/FAILED: a campaign currently being sent,
  -- or already finished, must never gain a new recipient the dispatcher
  -- has already stopped looking at -- that signup gets its own fresh
  -- campaign instead, picked up on a later tick.
  v_match_statuses := case when v_automation.mode = 'AUTO_SEND'
    then array['DRAFT', 'PENDING_REVIEW', 'APPROVED']
    else array['DRAFT', 'PENDING_REVIEW']
  end;

  select id into v_campaign_id from public.email_campaigns
  where template_id = v_automation.template_id
    and status = any(v_match_statuses)
    and name = 'Welcome (automated)'
  order by created_at desc limit 1;

  if v_campaign_id is null then
    if v_automation.mode = 'AUTO_SEND' then
      insert into public.email_campaigns
        (name, template_id, status, audience_filter, approved_by, approved_at)
      values
        ('Welcome (automated)', v_automation.template_id, 'APPROVED', '{"kind":"automation"}'::jsonb, null, now())
      returning id into v_campaign_id;

      insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
      values (null, 'auto_approve_campaign', 'email_campaigns', v_campaign_id::text,
        null, jsonb_build_object('status', 'APPROVED'));
    else
      insert into public.email_campaigns (name, template_id, status, audience_filter)
      values ('Welcome (automated)', v_automation.template_id, 'PENDING_REVIEW', '{"kind":"automation"}'::jsonb)
      returning id into v_campaign_id;
    end if;
  end if;

  insert into public.email_campaign_recipients (campaign_id, user_id, resolved_email, resolved_lang)
  values (v_campaign_id, new.id, new.email, 'en')
  on conflict (campaign_id, user_id) do nothing;

  return new;
end;
$$;

-- Runs every minute, looking only at campaigns the welcome-automation
-- trigger itself tagged { "kind": "automation" } -- a human-authored bulk
-- campaign (email-prepare-campaign always writes "all_opted_in") can never
-- match this filter, so this job can never pick one of those up. The
-- secret is re-read from Vault on every run (not baked into the job
-- definition), so rotating it later is a Vault update, not a new migration.
-- cron.schedule() upserts by job name, so re-running this migration is safe.
select cron.schedule(
  'email-dispatch-automation-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://ebpealpuihlqnppptglb.supabase.co/functions/v1/email-dispatch-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automation-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_automation_dispatch_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);

commit;
