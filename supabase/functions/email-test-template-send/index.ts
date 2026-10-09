// Restricted admin tool: render one stored template version with sample
// data and send it through Resend, to preview a draft before activation --
// deliberately NOT a generalization of email-test-send (that function's
// whole point is a fixed, hardcoded message to verify Resend/secrets are
// configured at all, never caller-supplied content) and deliberately NOT
// routed through sendCampaign() (no campaign, no recipient row, no
// email_events, no consent check, no status transition -- this never
// touches any of that machinery).
//
// Security model, same shape as every other admin Edge Function here:
// requireRole(req, "admin") re-derives the caller's role server-side via
// is_staff(), never trusts anything the client claims. The recipient is
// NOT accepted from the request body at all -- it is always the verified
// caller's own `user.email` from that same JWT, so this can only ever
// send a test to the admin who is actually calling it, never to an
// arbitrary address.
//
// Content is never caller-supplied either: only `template_id` and `lang`
// are accepted, and the subject/body are fetched fresh from
// email_templates / email_template_versions -- the same tables
// sendCampaign() itself reads from, so a passing test reflects what a
// real send would actually render.
//
// Sample values only, never real subscriber data: first_name/project_name/
// pattern_name are fixed placeholders, and a template's unsubscribe
// footer/header (when its category is 'marketing') is built from a nil
// UUID that matches no real account -- never a real profiles.unsubscribe_token.
//
// Known, intentional deviations from a real send (documented, not hidden):
//   - Unsupported {{variables}} are a hard error here; sendCampaign()
//     silently leaves them as literal text in a real send.
//   - The unsubscribe link (marketing templates only) is a placeholder
//     token, not a real subscriber's -- clicking it in the test email
//     would be a harmless no-op (email_unsubscribe_by_token returns false
//     for an unrecognized token).
//   - No email_campaigns / email_campaign_recipients / email_events rows
//     are created, and no consent check runs, since there is no real
//     recipient being evaluated -- only the admin's own verified address.
import { requireRole, writeAudit, AuthError } from "./_shared/requireRole.ts";
import { corsHeaders, jsonResponse } from "./_shared/cors.ts";
import { ALLOWED_VARS, renderTemplate, findUnsupportedVariables } from "./_shared/renderTemplate.ts";

const SAMPLE_VARS: Record<(typeof ALLOWED_VARS)[number], string> = {
  first_name: "Sam",
  project_name: "Sample Project",
  pattern_name: "Sample Pattern",
  project_url: "https://miiitime.com/app",
};

// Matches no real account -- a nil UUID can never equal a gen_random_uuid()
// value, so this is always a safe, inert placeholder.
const PLACEHOLDER_UNSUBSCRIBE_TOKEN = "00000000-0000-0000-0000-000000000000";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { user, adminClient } = await requireRole(req, "admin");
    if (!user.email) {
      return jsonResponse({ error: "Your admin account has no email on file -- cannot send a test." }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const templateId = typeof body.template_id === "string" ? body.template_id : null;
    const lang = typeof body.lang === "string" ? body.lang : null;
    if (!templateId || !lang) {
      return jsonResponse({ error: "template_id and lang are both required" }, 400);
    }

    const { data: template, error: templateErr } = await adminClient
      .from("email_templates")
      .select("id, key, category")
      .eq("id", templateId)
      .maybeSingle();
    if (templateErr) return jsonResponse({ error: templateErr.message }, 500);
    if (!template) return jsonResponse({ error: "Template not found" }, 404);

    const { data: version, error: versionErr } = await adminClient
      .from("email_template_versions")
      .select("subject, body_html, body_text")
      .eq("template_id", templateId)
      .eq("lang", lang)
      .maybeSingle();
    if (versionErr) return jsonResponse({ error: versionErr.message }, 500);
    if (!version) return jsonResponse({ error: `No '${lang}' version exists for this template` }, 404);

    const unsupported = findUnsupportedVariables(
      [version.subject, version.body_html, version.body_text ?? ""].join("\n"),
    );
    if (unsupported.length > 0) {
      return jsonResponse({
        error: `Unsupported template variable(s): ${unsupported.map((v) => `{{${v}}}`).join(", ")}. ` +
          `Supported variables are: ${ALLOWED_VARS.map((v) => `{{${v}}}`).join(", ")}.`,
      }, 422);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromAddress = Deno.env.get("EMAIL_FROM_ADDRESS");
    const unsubscribeBaseUrl = Deno.env.get("UNSUBSCRIBE_BASE_URL");
    if (!resendApiKey || !fromAddress) {
      return jsonResponse({
        ok: false,
        error: "Email provider not configured (RESEND_API_KEY / EMAIL_FROM_ADDRESS missing) -- nothing sent.",
      }, 200);
    }

    // Same category-conditional footer logic as sendCampaign(), minus any
    // real subscriber data -- see the file-level comment on the token.
    const isTransactional = template.category === "transactional";
    const unsubscribeUrl = (!isTransactional && unsubscribeBaseUrl)
      ? `${unsubscribeBaseUrl}?token=${PLACEHOLDER_UNSUBSCRIBE_TOKEN}`
      : null;

    const subject = `[TEST] ${renderTemplate(version.subject, SAMPLE_VARS)}`;
    const html = renderTemplate(version.body_html, SAMPLE_VARS)
      + (unsubscribeUrl
        ? `<p style="font-size:12px;color:#888;margin-top:24px;">Miiitime · <a href="${unsubscribeUrl}">Unsubscribe</a></p>`
        : "");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        reply_to: fromAddress,
        to: user.email,
        subject,
        html,
        ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } } : {}),
      }),
    });
    const resBody = await res.json();

    await writeAudit(adminClient, {
      admin_user_id: user.id,
      action: "template_test_send",
      target_type: "email_templates",
      target_id: templateId,
      after: { lang, to: user.email, ok: res.ok, resend_status: res.status, resend_id: resBody?.id ?? null },
    });

    if (!res.ok) return jsonResponse({ ok: false, error: resBody }, 200);
    return jsonResponse({ ok: true, to: user.email, subject, resend_id: resBody.id }, 200);
  } catch (e) {
    if (e instanceof AuthError) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
