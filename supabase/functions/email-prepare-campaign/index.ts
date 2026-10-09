// "Submit for review" -- resolves the campaign's audience (server-side,
// since it needs to read across every user's profiles.email/lang, which
// no client role can do) and populates email_campaign_recipients, then
// moves the campaign DRAFT -> PENDING_REVIEW. admin+ only.
//
// V1 only implements the "all_opted_in" audience kind (everyone with
// marketing_email_enabled = true) -- matches email_preview_audience's own
// scope; not a general query builder (explicitly out of scope for V1).
// member_filter narrows within that (all/member/not_member) -- consent is
// never optional/overridable by it, only an additional filter on top.
// profiles.is_member is groundwork for a not-yet-built membership feature
// (no payment integration exists), so today "member" always resolves to
// zero rows -- that's correct, not a bug, until membership actually ships.
//
// Idempotent by construction: re-running against the same DRAFT campaign
// (if it somehow failed partway) just adds any newly-matching recipients
// via ON CONFLICT DO NOTHING, never duplicates or overwrites one already
// resolved.
import { requireRole, writeAudit, AuthError } from "./_shared/requireRole.ts";
import { corsHeaders, jsonResponse } from "./_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { user, adminClient } = await requireRole(req, "admin");
    const body = await req.json().catch(() => ({}));
    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : null;
    if (!campaignId) return jsonResponse({ error: "campaign_id is required" }, 400);

    const { data: campaign, error: campaignErr } = await adminClient
      .from("email_campaigns")
      .select("id, status, audience_filter")
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignErr) return jsonResponse({ error: campaignErr.message }, 500);
    if (!campaign) return jsonResponse({ error: "Campaign not found" }, 404);
    if (campaign.status !== "DRAFT") {
      return jsonResponse({ error: `Campaign must be DRAFT to prepare (is ${campaign.status})` }, 409);
    }

    const filter = (campaign.audience_filter as { kind?: string; member_filter?: string }) ?? {};
    const kind = filter.kind ?? "all_opted_in";
    if (kind !== "all_opted_in") {
      return jsonResponse({ error: `Unsupported audience kind: ${kind}` }, 400);
    }
    const memberFilter = filter.member_filter ?? "all";
    if (!["all", "member", "not_member"].includes(memberFilter)) {
      return jsonResponse({ error: `Unsupported member_filter: ${memberFilter}` }, 400);
    }

    let audienceQuery = adminClient
      .from("profiles")
      .select("id, email, lang")
      .eq("marketing_email_enabled", true)
      .not("email", "is", null);
    if (memberFilter === "member") audienceQuery = audienceQuery.eq("is_member", true);
    if (memberFilter === "not_member") audienceQuery = audienceQuery.eq("is_member", false);
    const { data: audience, error: audienceErr } = await audienceQuery;
    if (audienceErr) return jsonResponse({ error: audienceErr.message }, 500);

    const rows = (audience ?? []).map((p) => ({
      campaign_id: campaignId,
      user_id: p.id,
      resolved_email: p.email as string,
      resolved_lang: (p.lang && ["en","fr","ja","zh","ko","es","de","th","pt","hi"].includes(p.lang)) ? p.lang : "en",
    }));

    if (rows.length > 0) {
      const { error: insertErr } = await adminClient
        .from("email_campaign_recipients")
        .upsert(rows, { onConflict: "campaign_id,user_id", ignoreDuplicates: true });
      if (insertErr) return jsonResponse({ error: insertErr.message }, 500);
    }

    const { error: updateErr } = await adminClient
      .from("email_campaigns")
      .update({ status: "PENDING_REVIEW", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (updateErr) return jsonResponse({ error: updateErr.message }, 500);

    await writeAudit(adminClient, {
      admin_user_id: user.id,
      action: "prepare_campaign",
      target_type: "email_campaigns",
      target_id: campaignId,
      after: { recipient_count: rows.length },
    });

    return jsonResponse({ ok: true, recipient_count: rows.length }, 200);
  } catch (e) {
    if (e instanceof AuthError) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
