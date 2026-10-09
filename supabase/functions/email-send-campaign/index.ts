// Admin-JWT-authenticated entry point for the "Send" action. All of the
// actual sending logic (status checks, Resend call, consent re-check,
// status transitions, audit write) now lives in ./_shared/sendCampaign.ts,
// shared with the scheduled email-dispatch-automation function -- this
// file is only responsible for authenticating the human caller and
// reporting the result over HTTP. Behavior for a human-triggered send is
// unchanged from before this split.
import { requireRole, AuthError } from "./_shared/requireRole.ts";
import { corsHeaders, jsonResponse } from "./_shared/cors.ts";
import { sendCampaign } from "./_shared/sendCampaign.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { user, adminClient } = await requireRole(req, "admin");
    const body = await req.json().catch(() => ({}));
    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : null;
    if (!campaignId) return jsonResponse({ error: "campaign_id is required" }, 400);

    const result = await sendCampaign(adminClient, campaignId, { adminUserId: user.id, action: "send_campaign" });
    if (!result.ok) {
      // Matches the exact pre-refactor response shapes: the "provider not
      // configured" case (200) used to carry `ok: false`, every other
      // failure status just carried `error`.
      const body = result.status === 200 ? { ok: false, error: result.error } : { error: result.error };
      return jsonResponse(body, result.status);
    }
    return jsonResponse({ ok: true, sent: result.sent, failed: result.failed, skipped: result.skipped }, 200);
  } catch (e) {
    if (e instanceof AuthError) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
