import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Called by the SENDING client right after party_message_create succeeds
// (same client-orchestrated pattern as notify-host/notify-attendees). Takes
// party_id + message_id rather than trusting client-supplied message text --
// the actual author name and text are both re-read here from the real row,
// same reasoning as the other two notify functions re-reading their content.
//
// Caller check: the body must carry `secret`, the message author's own
// party secret (the host's edit_secret when signup_id is null, otherwise that
// signup's cancel_secret) -- the same one party_message_create just took --
// and the message must be under MESSAGE_MAX_AGE_MS old. So only the author
// can trigger the push for their message, and only right after sending it.
// Builds from before 2026-09-26 don't send `secret`, so they get a 403 and
// nobody is notified -- the message itself is still posted.
//
// Recipients: everyone in the party except the message's own author -- the
// host (if an attendee posted) plus every other attendee with a token
// registered (whether the host or an attendee posted).
//
// There is no reply-to/threading concept in party_messages yet, so this only
// covers "new chat message" -- a "someone replied to your message"
// notification would need that schema addition first and is intentionally
// not built here (out of scope for this pass).
//
// APNs signing logic is intentionally duplicated from notify-host/
// notify-attendees rather than shared, so each function stays independently
// deployable -- see notify-host's own comment for the required secrets
// (APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, optional APNS_ENVIRONMENT).

const APNS_BUNDLE_ID = "com.miiitime.app.ios";

// The sending client calls this straight after the RPC returns, so a real
// call is always seconds old; anything older is a replay.
const MESSAGE_MAX_AGE_MS = 10 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The client (Capacitor WKWebView, origin capacitor://localhost) calls this
// via supabase-js's functions.invoke(), which always sends apikey/
// authorization/content-type headers -- none of those are CORS "simple"
// headers, so the browser layer sends an OPTIONS preflight before every
// real request. Without a 2xx + Access-Control-Allow-* response to that
// preflight, the actual POST is never sent at all. Same headers are echoed
// on every response below (including error responses) since a response
// missing them is just as unreadable to the calling JS as a blocked
// preflight would be.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importApnsKey(p8: string): Promise<CryptoKey> {
  const pem = p8
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function buildApnsJwt(teamId: string, keyId: string, key: CryptoKey): Promise<string> {
  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) };
  const enc = new TextEncoder();
  const signingInput = `${base64url(enc.encode(JSON.stringify(header)))}.${base64url(enc.encode(JSON.stringify(payload)))}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

function truncate(text: string, max = 100): string {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(0, max - 1) + "…" : trimmed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: corsHeaders });
  }

  let body: { party_id?: string; message_id?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders });
  }
  const { party_id, message_id, secret } = body;
  if (!party_id || !message_id) {
    return new Response(JSON.stringify({ error: "Missing party_id or message_id" }), { status: 400, headers: corsHeaders });
  }
  if (!UUID_RE.test(party_id) || !UUID_RE.test(message_id) || typeof secret !== "string" || !UUID_RE.test(secret)) {
    return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);
  const forbidden = () => new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: corsHeaders });

  // Same 403 for "no such message" and "wrong secret", so this can't be used
  // to probe which ids exist.
  const { data: message, error: messageErr } = await sb
    .from("party_messages")
    .select("author_name, text, signup_id, created_at")
    .eq("id", message_id)
    .eq("party_id", party_id)
    .maybeSingle();
  if (messageErr) {
    return new Response(JSON.stringify({ error: messageErr.message }), { status: 500, headers: corsHeaders });
  }
  if (!message) return forbidden();

  const { data: party, error: partyErr } = await sb
    .from("parties")
    .select("title, host_push_token, edit_secret")
    .eq("id", party_id)
    .maybeSingle();
  if (partyErr) {
    return new Response(JSON.stringify({ error: partyErr.message }), { status: 500, headers: corsHeaders });
  }
  if (!party) return forbidden();

  if (message.signup_id === null) {
    if (party.edit_secret !== secret) return forbidden();
  } else {
    const { data: author, error: authorErr } = await sb
      .from("party_signups")
      .select("id")
      .eq("id", message.signup_id)
      .eq("party_id", party_id)
      .eq("cancel_secret", secret)
      .maybeSingle();
    if (authorErr) {
      return new Response(JSON.stringify({ error: authorErr.message }), { status: 500, headers: corsHeaders });
    }
    if (!author) return forbidden();
  }
  if (Date.now() - new Date(message.created_at).getTime() > MESSAGE_MAX_AGE_MS) {
    return new Response(JSON.stringify({ ok: true, skipped: "message too old to notify" }), { status: 200, headers: corsHeaders });
  }

  const { data: signups, error: signupsErr } = await sb
    .from("party_signups")
    .select("id, push_token")
    .eq("party_id", party_id)
    .not("push_token", "is", null);
  if (signupsErr) {
    return new Response(JSON.stringify({ error: signupsErr.message }), { status: 500, headers: corsHeaders });
  }

  const tokens: string[] = [];
  if (message.signup_id !== null && party.host_push_token) {
    // An attendee posted -- notify the host too, not just the other attendees.
    tokens.push(party.host_push_token);
  }
  for (const s of signups ?? []) {
    if (s.id === message.signup_id) continue; // never notify the author about their own message
    if (s.push_token) tokens.push(s.push_token);
  }
  if (tokens.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "no recipients" }), { status: 200, headers: corsHeaders });
  }

  const apnsKeyRaw = Deno.env.get("APNS_KEY");
  const apnsKeyId = Deno.env.get("APNS_KEY_ID");
  const apnsTeamId = Deno.env.get("APNS_TEAM_ID");
  if (!apnsKeyRaw || !apnsKeyId || !apnsTeamId) {
    console.warn("notify-chat-message: APNS_KEY/APNS_KEY_ID/APNS_TEAM_ID not configured -- skipping send");
    return new Response(JSON.stringify({ ok: true, skipped: "APNs not configured" }), { status: 200, headers: corsHeaders });
  }

  const environment = (Deno.env.get("APNS_ENVIRONMENT") || "sandbox").toLowerCase();
  const host = environment === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";

  const key = await importApnsKey(apnsKeyRaw);
  const jwt = await buildApnsJwt(apnsTeamId, apnsKeyId, key);
  const payload = {
    aps: {
      alert: {
        title: party.title ? `\u{1F4AC} ${party.title}` : "\u{1F4AC} Party chat",
        body: `${message.author_name}: ${truncate(message.text)}`,
      },
      sound: "default",
    },
  };

  const results = await Promise.all(tokens.map(async (token) => {
    try {
      const res = await fetch(`https://${host}/3/device/${token}`, {
        method: "POST",
        headers: {
          "authorization": `bearer ${jwt}`,
          "apns-topic": APNS_BUNDLE_ID,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.warn(`notify-chat-message: APNs responded ${res.status}: ${errBody}`);
        return { ok: false, status: res.status };
      }
      return { ok: true };
    } catch (e) {
      console.warn("notify-chat-message: send failed for a token:", e);
      return { ok: false, error: String(e) };
    }
  }));

  const sent = results.filter((r) => r.ok).length;
  return new Response(JSON.stringify({ ok: true, sent, total: tokens.length }), { status: 200, headers: corsHeaders });
});
