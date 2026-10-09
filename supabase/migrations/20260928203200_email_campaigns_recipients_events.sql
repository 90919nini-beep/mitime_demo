-- Email Marketing foundation, part 3: campaigns, their resolved recipient
-- list, and provider delivery events.
--
-- audience_filter is a small, server-interpreted jsonb shape -- NOT
-- arbitrary SQL/a query builder (explicitly out of scope: "do not
-- over-engineer this"). V1 ships exactly one kind, {"kind":"all_opted_in"}
-- (everyone with marketing_email_enabled = true), with room to add more
-- kinds later without a schema change.
--
-- email_campaign_recipients has NO client write policy at all, by anyone,
-- staff included -- only the email-prepare-campaign / email-send-campaign
-- Edge Functions (service-role) populate and update it. Same for
-- email_events (only the email-webhook Edge Function writes). This is
-- stricter than error_logs/stitch_metadata on purpose: these rows are
-- system-computed delivery state, never hand-edited.
--
-- resolved_email/resolved_lang are snapshotted at prepare time (not
-- looked up again at send time) so what Admin reviewed and approved is
-- exactly what gets sent, even if the recipient changes their email or
-- language in between.

begin;

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  template_id uuid not null references public.email_templates(id),
  status text not null default 'DRAFT' check (status in (
    'DRAFT','PENDING_REVIEW','APPROVED','SCHEDULED','SENDING','SENT','FAILED','CANCELLED'
  )),
  audience_filter jsonb not null default '{"kind":"all_opted_in"}'::jsonb,
  scheduled_at timestamptz,
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index email_campaigns_status_idx on public.email_campaigns(status);

create table public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  resolved_email text not null,
  resolved_lang text not null check (resolved_lang in ('en','fr','ja','zh','ko','es','de','th','pt','hi')),
  status text not null default 'PENDING' check (status in (
    'PENDING','SENT','FAILED','SKIPPED','BOUNCED','UNSUBSCRIBED'
  )),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (campaign_id, user_id)
);
create index email_campaign_recipients_campaign_id_idx on public.email_campaign_recipients(campaign_id);
create index email_campaign_recipients_status_idx on public.email_campaign_recipients(status);

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.email_campaign_recipients(id) on delete cascade,
  event_type text not null check (event_type in (
    'sent','delivered','opened','clicked','bounced','complained','failed','unsubscribed'
  )),
  occurred_at timestamptz not null default now(),
  raw jsonb,
  created_at timestamptz not null default now()
);
create index email_events_recipient_id_idx on public.email_events(recipient_id);
create index email_events_type_occurred_idx on public.email_events(event_type, occurred_at);

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.email_events enable row level security;

-- Campaigns: staff can read everything; DRAFT create/edit is a plain
-- admin+ update (name/template/audience_filter/scheduled_at) -- but never
-- lets a client set status directly (see with_check), since every real
-- status transition (submit for review, approve, send, cancel) goes
-- through its own RPC/Edge Function below, each independently
-- authorized and audited. This keeps "who can approve" and "who can send"
-- enforceable in one place instead of "whatever a client PATCH claims".
create policy email_campaigns_select_staff on public.email_campaigns
  for select using (public.is_staff(auth.uid(), 'admin'));
create policy email_campaigns_insert_staff on public.email_campaigns
  for insert with check (public.is_staff(auth.uid(), 'admin') and status = 'DRAFT' and created_by = auth.uid());
create policy email_campaigns_update_draft_staff on public.email_campaigns
  for update using (public.is_staff(auth.uid(), 'admin') and status = 'DRAFT')
  with check (public.is_staff(auth.uid(), 'admin') and status = 'DRAFT');

-- No insert/update/delete policy at all for recipients/events -- fail
-- closed; only service-role Edge Functions touch these.
create policy email_campaign_recipients_select_staff on public.email_campaign_recipients
  for select using (public.is_staff(auth.uid(), 'admin'));
create policy email_events_select_staff on public.email_events
  for select using (public.is_staff(auth.uid(), 'admin'));

create trigger email_campaigns_audit
  after update on public.email_campaigns
  for each row execute function public.audit_log_change('id');

commit;
