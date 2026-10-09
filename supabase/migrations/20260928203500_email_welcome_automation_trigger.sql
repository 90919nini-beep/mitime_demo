-- The one automation actually wired live in V1: Welcome, on auth.users
-- INSERT. Chosen deliberately over project_reminder/finished_project
-- because those trigger on conditions *inside* cloud_data's JSONB
-- (projects kind) -- observing that safely from a trigger would mean this
-- system reaching into private user content the same way admin_view_user_data
-- does, which needs its own explicit design, not a side effect of this
-- migration. product_update's trigger ("Admin creates a campaign") needs
-- no DB trigger at all -- it's just the normal manual Campaigns flow.
--
-- Still fully REVIEW_REQUIRED regardless of email_automations.mode: this
-- always creates/appends to a PENDING_REVIEW campaign, never sends
-- anything itself. AUTO_SEND is schema-complete (owner-only to set, per
-- the previous migration) but not yet consumed by anything -- a real gap,
-- not silently pretended otherwise; see the implementation report.
--
-- Reuses one open ("Welcome (automated)", DRAFT/PENDING_REVIEW) campaign
-- across multiple signups rather than one campaign per user, so Admin
-- reviews a batch, not a flood. Does not pre-filter by
-- marketing_email_enabled -- consent is enforced at send time
-- (email-send-campaign skips non-opted-in recipients), so Admin can see
-- the true signup count vs. how many would actually receive it.

begin;

create or replace function public.email_trigger_welcome_automation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_automation record;
  v_campaign_id uuid;
begin
  select * into v_automation from public.email_automations where key = 'welcome';
  if v_automation is null or not v_automation.is_active or v_automation.template_id is null then
    return new;
  end if;

  select id into v_campaign_id from public.email_campaigns
  where template_id = v_automation.template_id
    and status in ('DRAFT','PENDING_REVIEW')
    and name = 'Welcome (automated)'
  order by created_at desc limit 1;

  if v_campaign_id is null then
    insert into public.email_campaigns (name, template_id, status, audience_filter)
    values ('Welcome (automated)', v_automation.template_id, 'PENDING_REVIEW', '{"kind":"automation"}'::jsonb)
    returning id into v_campaign_id;
  end if;

  insert into public.email_campaign_recipients (campaign_id, user_id, resolved_email, resolved_lang)
  values (v_campaign_id, new.id, new.email, 'en')
  on conflict (campaign_id, user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.email_trigger_welcome_automation() from public, anon, authenticated;

create trigger on_auth_user_created_queue_welcome_email
  after insert on auth.users
  for each row execute function public.email_trigger_welcome_automation();

commit;
