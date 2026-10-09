// Receives delivery events from the email provider (Resend, which signs
// webhooks the Svix way: svix-id/svix-timestamp/svix-signature headers,
// HMAC-SHA256 over "{id}.{timestamp}.{raw body}" using the base64 secret
// from RESEND_WEBHOOK_SECRET, whsec_ prefix stripped). No requireRole
// check here -- the caller is Resend's servers, not a Miiitime user --
// this function's entire authorization IS the signature check, which is
// why it must be deployed with verify_jwt=false (custom auth, matching
// this project's stated pattern for that exception) and why an unset/
// wrong secret must reject everything rather than trust the payload.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "./_shared/cors.ts";

async function verifySvixSignature(
  secret: string, svixId: string, svixTimestamp: string, rawBody: string, svixSignatureHeader: string,
): Promise<boolean> {
  const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  let bin = "";
  for (const b of new Uint8Array(sigBytes)) bin += String.fromCharCode(b);
  const expected = btoa(bin);

  // svix-signature can carry multiple space-separated "v1,<base64>" values
  // (key rotation) -- match if any of them equals ours.
  return svixSignatureHeader
    .split(" ")
    .some((entry) => {
      const [version, sig] = entry.split(",");
      return version === "v1" && sig === expected;
    });
}

// Resend's own event names -> this project's email_events.event_type.
const EVENT_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "failed",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) {
    // Fail closed: with no secret configured, no payload can ever be
    // trusted, so refuse everything rather than accept unverified events.
    return jsonResponse({ error: "Webhook not configured" }, 503);
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  const rawBody = await req.text();
  if (!svixId || !svixTimestamp || !svixSignature) {
    return jsonResponse({ error: "Missing signature headers" }, 400);
  }
  const valid = await verifySvixSignature(secret, svixId, svixTimestamp, rawBody, svixSignature);
  if (!valid) return jsonResponse({ error: "Invalid signature" }, 401);

  let payload: { type?: string; data?: { email_id?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const eventType = EVENT_MAP[payload.type ?? ""];
  const messageId = payload.data?.email_id;
  if (!eventType || !messageId) {
    return jsonResponse({ ok: true, skipped: "unrecognized event or missing email_id" }, 200);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const { data: recipient } = await sb
    .from("email_campaign_recipients")
    .select("id, user_id")
    .eq("provider_message_id", messageId)
    .maybeSingle();
  if (!recipient) {
    // A message id we don't recognize -- log nothing rather than insert an
    // orphaned event row with no recipient_id to make sense of.
    return jsonResponse({ ok: true, skipped: "unknown message id" }, 200);
  }

  await sb.from("email_events").insert({ recipient_id: recipient.id, event_type: eventType, raw: payload });

  if (eventType === "bounced") {
    await sb.from("email_campaign_recipients").update({ status: "BOUNCED" }).eq("id", recipient.id);
  } else if (eventType === "complained") {
    // A spam complaint is an explicit signal, unlike a bounce (a delivery
    // problem, not necessarily "stop emailing me") -- suppress future
    // marketing mail for this account immediately.
    await sb.from("email_campaign_recipients").update({ status: "UNSUBSCRIBED" }).eq("id", recipient.id);
    await sb.from("profiles").update({ marketing_email_enabled: false }).eq("id", recipient.user_id);
  }

  return jsonResponse({ ok: true }, 200);
});
