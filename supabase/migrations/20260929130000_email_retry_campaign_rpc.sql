-- Retries only the FAILED recipients of a campaign, not the whole thing --
-- SENT and SKIPPED rows are untouched (never double-send, never override a
-- consent snapshot that correctly skipped someone). Resets those FAILED
-- rows to PENDING and the campaign back to APPROVED, which is enough:
-- email-send-campaign already only ever processes PENDING rows, so
-- clicking Send again naturally retries exactly these and nothing else.
-- Works whether the campaign ended at FAILED (nothing sent) or SENT (a
-- partial failure -- some recipients succeeded, some didn't, but the
-- campaign-level status still shows SENT since sent>0).
CREATE OR REPLACE FUNCTION public.email_retry_campaign(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_status text; v_retried int;
begin
  if not public.is_staff(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  select status into v_status from public.email_campaigns where id = p_id;
  if v_status is null then raise exception 'campaign not found'; end if;
  if v_status not in ('FAILED','SENT') then
    raise exception 'campaign must be FAILED or SENT to retry (is %)', v_status;
  end if;

  update public.email_campaign_recipients
  set status = 'PENDING', error = null
  where campaign_id = p_id and status = 'FAILED';
  get diagnostics v_retried = row_count;

  if v_retried = 0 then
    raise exception 'no failed recipients to retry';
  end if;

  update public.email_campaigns
  set status = 'APPROVED', updated_at = now()
  where id = p_id;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), 'retry_campaign', 'email_campaigns', p_id::text,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'APPROVED', 'retried_count', v_retried));
end;
$function$;
