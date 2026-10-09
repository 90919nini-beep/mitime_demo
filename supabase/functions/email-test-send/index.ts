// Standalone test-send: verifies the Resend + secrets configuration works
// at all, without touching any campaign machinery. Deliberately separate
// from email-send-campaign rather than a mode flag on it -- this function
// cannot reach a real audience even in principle, because it never queries
// email_campaigns / email_campaign_recipients / email_templates / profiles.
// Subject and body are hardcoded, not caller-supplied, so this can never
// become a general-purpose "send arbitrary content to arbitrary address"
// tool -- only ever this one fixed test message, admin+ only.
import { requireRole, writeAudit, AuthError } from "./_shared/requireRole.ts";
import { corsHeaders, jsonResponse } from "./_shared/cors.ts";

const TEST_SUBJECT = "Miiitime email test";
const TEST_BODY_HTML = "<p>This is a test email from Miiitime.</p>";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { user, adminClient } = await requireRole(req, "admin");
    const body = await req.json().catch(() => ({}));
    const to = typeof body.to === "string" ? body.to.trim() : "";
    if (!to || !EMAIL_RE.test(to)) {
      return jsonResponse({ error: "A valid 'to' address is required" }, 400);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    // Trimmed defensively -- a trailing newline/space pasted into a secrets
    // UI is invisible in the input box but breaks Resend's strict from-field
    // format check. EMAIL_FROM_ADDRESS is not sensitive (it's the public
    // From header on every email sent), so it's safe to echo back below for
    // diagnosis -- unlike RESEND_API_KEY, which is never read into a
    // variable that gets returned or logged anywhere in this function.
    const fromRaw = Deno.env.get("EMAIL_FROM_ADDRESS");
    const fromAddress = fromRaw?.trim();
    if (!resendApiKey || !fromAddress) {
      return jsonResponse({
        ok: false,
        error: "Email provider not configured (RESEND_API_KEY / EMAIL_FROM_ADDRESS missing) -- nothing sent.",
      }, 200);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        reply_to: fromAddress,
        to,
        subject: TEST_SUBJECT,
        html: TEST_BODY_HTML,
      }),
    });
    const resBody = await res.json();

    await writeAudit(adminClient, {
      admin_user_id: user.id,
      action: "send_test_email",
      target_type: "email_test",
      target_id: null,
      after: { to, from: fromAddress, ok: res.ok, resend_status: res.status, resend_id: resBody?.id ?? null },
    });

    if (!res.ok) {
      return jsonResponse({
        ok: false,
        error: resBody,
        from_debug: { raw_length: fromRaw?.length ?? 0, trimmed_length: fromAddress.length, raw_json: JSON.stringify(fromRaw) },
      }, 200);
    }
    return jsonResponse({ ok: true, resend_id: resBody.id, from: fromAddress, reply_to: fromAddress, to }, 200);
  } catch (e) {
    if (e instanceof AuthError) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
