// Scheduled dispatcher for AUTO_SEND email automations (currently just
// "welcome"). Invoked once a minute by a pg_cron job via net.http_post
// (see the 20261008120000 migration) -- never by a client, never with a
// Supabase Auth JWT. Authorization here is a single shared secret, the
// same shape as email-webhook's "fail closed if unconfigured, reject if
// the header doesn't match" pattern, which is why this function must also
// be deployed with verify_jwt=false (custom auth, same documented
// exception as email-webhook/notify-host/notify-attendees).
//
// Scope is intentionally narrow: only campaigns the welcome-automation
// trigger itself tagged audience_filter.kind = "automation" are ever
// selected. A human-authored bulk campaign (email-prepare-campaign always
// writes "all_opted_in") can never match this filter, so this function can
// never be used to send one -- it has no code path that even looks at
// anything else. The campaign id is never taken from the request; the
// query decides what gets sent, not the caller.
//
// Actual sending (status checks, Resend call, consent re-check, status
// transitions, audit write) is 100% the shared sendCampaign() helper --
// identical code to what email-send-campaign uses for human-triggered
// sends. This file only finds eligible campaigns and reports what happened.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "./_shared/cors.ts";
import { sendCampaign } from "./_shared/sendCampaign.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("AUTOMATION_DISPATCH_SECRET");
  if (!secret) {
    // Fail closed: with no secret configured, no caller can ever be
    // trusted, so refuse everything rather than dispatch unauthenticated.
    return jsonResponse({ error: "Automation dispatch not configured" }, 503);
  }
  const provided = req.headers.get("x-automation-secret");
  if (!provided || provided !== secret) {
    return jsonResponse({ error: "Not authorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: campaigns, error: campaignsErr } = await adminClient
    .from("email_campaigns")
    .select("id")
    .eq("status", "APPROVED")
    .eq("audience_filter->>kind", "automation");
  if (campaignsErr) return jsonResponse({ error: campaignsErr.message }, 500);

  const results: Array<
    { campaign_id: string } & (
      | { ok: true; sent: number; failed: number; skipped: number }
      | { ok: false; error: string }
    )
  > = [];

  for (const c of campaigns ?? []) {
    // Not attributed to any admin -- this is a system/scheduled send, and
    // the audit trail must never pretend otherwise.
    const result = await sendCampaign(adminClient, c.id, { adminUserId: null, action: "auto_send_campaign" });
    results.push(
      result.ok
        ? { campaign_id: c.id, ok: true, sent: result.sent, failed: result.failed, skipped: result.skipped }
        : { campaign_id: c.id, ok: false, error: result.error },
    );
  }

  return jsonResponse({ ok: true, campaigns_processed: results.length, results }, 200);
});
