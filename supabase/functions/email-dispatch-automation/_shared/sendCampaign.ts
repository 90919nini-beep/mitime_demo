// The actual "Send" action, extracted so both email-send-campaign (human,
// admin-JWT-authenticated) and email-dispatch-automation (scheduled,
// secret-authenticated) can call the exact same sending logic -- this file
// is a mechanical extraction, not a rewrite: every check, status
// transition, and Resend call below is unchanged from before the split.
//
// Only from status APPROVED -- there is no path from DRAFT/PENDING_REVIEW
// straight to sending; approval (email_approve_campaign, or the welcome
// trigger's own auto-approval for AUTO_SEND automations) must have
// happened first, and cancelling (email_cancel_campaign) is still possible
// right up until this runs.
//
// Consent is enforced HERE, not at prepare time: a recipient's current
// profiles.marketing_email_enabled is re-checked (not the value at
// prepare time) immediately before sending, so an unsubscribe that
// happened after a campaign was reviewed/approved is still honoured.
// This only applies to campaigns whose email_templates.category is
// 'marketing' (the default) -- a 'transactional' template (currently just
// 'welcome') is sent regardless of consent, and never carries an
// unsubscribe footer/header, since there is nothing marketing-related to
// opt out of and a transactional email is not what marketing_email_enabled
// governs (see the 20261008130000 migration).
//
// Variable substitution is a fixed allow-list, plain string replace --
// never eval/Function/template-engine execution -- so a template can never
// contain anything beyond static HTML plus these known placeholders.
//
// Marketing emails get a List-Unsubscribe header AND a footer link
// appended automatically (not something a template author has to
// remember), pointing at the miiitime-auth-style static /unsubscribe page
// with that recipient's own profiles.unsubscribe_token.
//
// From and Reply-To are both EMAIL_FROM_ADDRESS (set to create@miiitime.com)
// -- one env var, not two, since the two are meant to always match.
//
// Requires RESEND_API_KEY (and EMAIL_FROM_ADDRESS, UNSUBSCRIBE_BASE_URL)
// as Edge Function secrets. Deliberately NOT configured in this
// environment ("do not send real emails during development unless
// explicitly requested") -- calling this without them returns a clear
// "provider not configured" result and reverts the campaign back to
// APPROVED (not SENDING), matching notify-host/notify-attendees's
// existing "not configured -- skipping" convention rather than a Resend
// SDK dependency.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Local copy rather than importing requireRole.ts's writeAudit: that one
// types admin_user_id as a non-null string (every existing admin-JWT
// caller always has one), but an automated send legitimately has none.
// Kept to the same shape and the same "fail closed on audit write
// failure" behavior, just with a nullable actor.
async function writeAudit(
  adminClient: SupabaseClient,
  entry: {
    admin_user_id: string | null;
    action: string;
    target_type: string;
    target_id?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  const { error } = await adminClient.from("admin_audit_log").insert(entry);
  if (error) throw new Error(`Audit log write failed: ${error.message}`);
}

const ALLOWED_VARS = ["first_name", "project_name", "pattern_name", "project_url"] as const;

function renderTemplate(html: string, vars: Partial<Record<(typeof ALLOWED_VARS)[number], string>>): string {
  return html.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name) => {
    if ((ALLOWED_VARS as readonly string[]).includes(name)) {
      return vars[name as (typeof ALLOWED_VARS)[number]] ?? "";
    }
    return match; // unknown placeholder left as-is, never evaluated
  });
}

export type SendCampaignActor = {
  // null for an automated/system send (e.g. the scheduled dispatcher) --
  // never attribute an automated send to a real admin.
  adminUserId: string | null;
  action: string;
};

export type SendCampaignResult =
  | { ok: true; sent: number; failed: number; skipped: number }
  | { ok: false; status: number; error: string };

export async function sendCampaign(
  adminClient: SupabaseClient,
  campaignId: string,
  actor: SendCampaignActor,
): Promise<SendCampaignResult> {
  const { data: campaign, error: campaignErr } = await adminClient
    .from("email_campaigns")
    .select("id, status, template_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignErr) return { ok: false, status: 500, error: campaignErr.message };
  if (!campaign) return { ok: false, status: 404, error: "Campaign not found" };
  if (campaign.status !== "APPROVED") {
    return { ok: false, status: 409, error: `Campaign must be APPROVED to send (is ${campaign.status})` };
  }

  // Unknown/missing template defaults to marketing (fail-safe, same as the
  // column's own default) -- a template can only become exempt from
  // consent by an explicit 'transactional' classification.
  const { data: template, error: templateErr } = await adminClient
    .from("email_templates")
    .select("category")
    .eq("id", campaign.template_id)
    .maybeSingle();
  if (templateErr) return { ok: false, status: 500, error: templateErr.message };
  const isTransactional = template?.category === "transactional";

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("EMAIL_FROM_ADDRESS");
  const unsubscribeBaseUrl = Deno.env.get("UNSUBSCRIBE_BASE_URL");
  if (!resendApiKey || !fromAddress || !unsubscribeBaseUrl) {
    return {
      ok: false,
      status: 200,
      error: "Email provider not configured (RESEND_API_KEY / EMAIL_FROM_ADDRESS / UNSUBSCRIBE_BASE_URL missing) -- campaign left APPROVED, nothing sent.",
    };
  }

  // Mark SENDING immediately as a simple concurrency guard -- a second
  // concurrent call sees SENDING, not APPROVED, and bails at the check above.
  await adminClient.from("email_campaigns").update({ status: "SENDING", updated_at: new Date().toISOString() }).eq("id", campaignId);

  const { data: versions, error: versionsErr } = await adminClient
    .from("email_template_versions")
    .select("lang, subject, body_html")
    .eq("template_id", campaign.template_id)
    .eq("status", "active");
  if (versionsErr) return { ok: false, status: 500, error: versionsErr.message };
  const versionByLang = new Map((versions ?? []).map((v) => [v.lang, v]));
  const fallback = versionByLang.get("en");
  if (!fallback) {
    await adminClient.from("email_campaigns").update({ status: "FAILED", updated_at: new Date().toISOString() }).eq("id", campaignId);
    return { ok: false, status: 422, error: "No active English template version -- cannot send (English is the required fallback)." };
  }

  const { data: recipients, error: recipientsErr } = await adminClient
    .from("email_campaign_recipients")
    .select("id, user_id, resolved_email, resolved_lang, status")
    .eq("campaign_id", campaignId)
    .eq("status", "PENDING");
  if (recipientsErr) return { ok: false, status: 500, error: recipientsErr.message };

  let sent = 0, failed = 0, skipped = 0;
  for (const r of recipients ?? []) {
    // Re-check consent NOW, not what it was at prepare time.
    const { data: profile } = await adminClient
      .from("profiles")
      .select("marketing_email_enabled, display_name, unsubscribe_token")
      .eq("id", r.user_id)
      .maybeSingle();
    if (!profile || (!isTransactional && !profile.marketing_email_enabled)) {
      await adminClient.from("email_campaign_recipients")
        .update({ status: "SKIPPED", error: "unsubscribed since prepare" }).eq("id", r.id);
      skipped++;
      continue;
    }

    const version = versionByLang.get(r.resolved_lang) ?? fallback;
    // Transactional sends have nothing to unsubscribe from -- no footer,
    // no List-Unsubscribe header, same reasoning as why they skip the
    // consent check above.
    const unsubscribeUrl = isTransactional ? null : `${unsubscribeBaseUrl}?token=${profile.unsubscribe_token}`;
    const firstName = profile.display_name?.split(" ")[0] ?? "";
    const html = renderTemplate(version.body_html, { first_name: firstName, project_url: "https://miiitime.com/app" })
      + (unsubscribeUrl ? `<p style="font-size:12px;color:#888;margin-top:24px;">Miiitime · <a href="${unsubscribeUrl}">Unsubscribe</a></p>` : "");
    const subject = renderTemplate(version.subject, { first_name: firstName });

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromAddress,
          // Reply-To intentionally mirrors From rather than being a
          // second env var -- they're meant to be the same address
          // (create@miiitime.com), and a separate var would just be
          // duplicate configuration for a value that's never different.
          reply_to: fromAddress,
          to: r.resolved_email,
          subject,
          html,
          ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } } : {}),
        }),
      });
      const resBody = await res.json();
      if (!res.ok) {
        await adminClient.from("email_campaign_recipients")
          .update({ status: "FAILED", error: JSON.stringify(resBody) }).eq("id", r.id);
        await adminClient.from("email_events").insert({ recipient_id: r.id, event_type: "failed", raw: resBody });
        failed++;
        continue;
      }
      await adminClient.from("email_campaign_recipients")
        .update({ status: "SENT", provider_message_id: resBody.id, sent_at: new Date().toISOString() }).eq("id", r.id);
      await adminClient.from("email_events").insert({ recipient_id: r.id, event_type: "sent", raw: resBody });
      sent++;
    } catch (e) {
      await adminClient.from("email_campaign_recipients")
        .update({ status: "FAILED", error: String(e) }).eq("id", r.id);
      failed++;
    }
  }

  const finalStatus = sent > 0 || skipped > 0 ? "SENT" : "FAILED";
  await adminClient.from("email_campaigns").update({ status: finalStatus, updated_at: new Date().toISOString() }).eq("id", campaignId);

  await writeAudit(adminClient, {
    admin_user_id: actor.adminUserId,
    action: actor.action,
    target_type: "email_campaigns",
    target_id: campaignId,
    after: { sent, failed, skipped },
  });

  return { ok: true, sent, failed, skipped };
}
