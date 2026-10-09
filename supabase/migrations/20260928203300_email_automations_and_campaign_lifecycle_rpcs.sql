-- Email Marketing foundation, part 4: automations, and the campaign/
-- automation actions that need server-side authorization beyond plain RLS.
--
-- Every automation defaults to mode = REVIEW_REQUIRED and there is no
-- schema path to create one already in AUTO_SEND -- the column default
-- and the check constraint both enforce this, and the only function that
-- can ever set AUTO_SEND (email_set_automation_mode) is owner-only. This
-- mirrors admin_grant_admin_role's shape (20260819091749): a narrow
-- SECURITY DEFINER function for one sensitive transition, rather than a
-- general-purpose update endpoint a client could misuse.
--
-- email_automations has no client write policy at all (fail closed) --
-- both email_update_automation (admin+, cannot touch mode) and
-- email_set_automation_mode (owner-only) go through RPCs so "can edit
-- description" and "can enable auto-send" are enforced independently,
-- the same reasoning as splitting admin_grant_admin_role from ordinary
-- staff actions.

begin;

create table public.email_automations (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  trigger_description text not null,
  template_id uuid references public.email_templates(id),
  mode text not null default 'REVIEW_REQUIRED' check (mode in ('REVIEW_REQUIRED','AUTO_SEND')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.email_automations enable row level security;
create policy email_automations_select_staff on public.email_automations
  for select using (public.is_staff(auth.uid(), 'admin'));
-- Deliberately no insert/update/delete policy -- see comment above.

create or replace function public.email_update_automation(
  p_id uuid, p_name text, p_trigger_description text, p_template_id uuid, p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_staff(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  update public.email_automations
  set name = p_name, trigger_description = p_trigger_description,
      template_id = p_template_id, is_active = p_is_active,
      updated_by = auth.uid(), updated_at = now()
  where id = p_id;
  if not found then raise exception 'automation not found'; end if;
end;
$$;

create or replace function public.email_set_automation_mode(p_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_before text;
begin
  if not public.is_staff(auth.uid(), 'owner') then
    raise exception 'not authorized';
  end if;
  if p_mode not in ('REVIEW_REQUIRED','AUTO_SEND') then
    raise exception 'invalid mode';
  end if;
  select mode into v_before from public.email_automations where id = p_id;
  if v_before is null then raise exception 'automation not found'; end if;
  update public.email_automations
  set mode = p_mode, updated_by = auth.uid(), updated_at = now()
  where id = p_id;
  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), 'set_automation_mode', 'email_automations', p_id::text,
    jsonb_build_object('mode', v_before), jsonb_build_object('mode', p_mode));
end;
$$;

-- Campaign lifecycle: approve/cancel. (Submit-for-review and send are
-- handled by Edge Functions, since both need service-role -- resolving
-- the audience across all users' profiles, and actually calling the email
-- provider, respectively.)

create or replace function public.email_approve_campaign(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_status text;
begin
  if not public.is_staff(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  select status into v_status from public.email_campaigns where id = p_id;
  if v_status is null then raise exception 'campaign not found'; end if;
  if v_status <> 'PENDING_REVIEW' then
    raise exception 'campaign must be PENDING_REVIEW to approve (is %)', v_status;
  end if;
  update public.email_campaigns
  set status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_id;
  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), 'approve_campaign', 'email_campaigns', p_id::text,
    jsonb_build_object('status', v_status), jsonb_build_object('status', 'APPROVED'));
end;
$$;

create or replace function public.email_cancel_campaign(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_status text;
begin
  if not public.is_staff(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  select status into v_status from public.email_campaigns where id = p_id;
  if v_status is null then raise exception 'campaign not found'; end if;
  if v_status in ('SENT','CANCELLED') then
    raise exception 'campaign already % -- cannot cancel', v_status;
  end if;
  update public.email_campaigns set status = 'CANCELLED', updated_at = now() where id = p_id;
  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), 'cancel_campaign', 'email_campaigns', p_id::text,
    jsonb_build_object('status', v_status), jsonb_build_object('status', 'CANCELLED'));
end;
$$;

revoke execute on function public.email_update_automation(uuid,text,text,uuid,boolean) from anon, public;
revoke execute on function public.email_set_automation_mode(uuid,text) from anon, public;
revoke execute on function public.email_approve_campaign(uuid) from anon, public;
revoke execute on function public.email_cancel_campaign(uuid) from anon, public;
grant execute on function public.email_update_automation(uuid,text,text,uuid,boolean) to authenticated;
grant execute on function public.email_set_automation_mode(uuid,text) to authenticated;
grant execute on function public.email_approve_campaign(uuid) to authenticated;
grant execute on function public.email_cancel_campaign(uuid) to authenticated;

commit;
