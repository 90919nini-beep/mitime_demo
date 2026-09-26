import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Called by the JOINING client right after party_signup_create succeeds
// (same client-orchestrated pattern as schedulePartyReminder elsewhere in
// this app -- no DB trigger/webhook involved). Takes party_id + signup_id
// rather than trusting client-supplied attendee text directly: the actual
// attendee_name and party title are both looked up here, server-side, from
// the real rows -- so a caller can't fabricate arbitrary push content, only
// trigger a push for a signup that genuinely exists.
//
// Caller check: the body must also carry `secret`, the signup's own
// cancel_secret (only the device that joined ever has it), and the signup
// must be under SIGNUP_MAX_AGE_MS old. Without this, anyone who knew a
// party_id and one of its signup ids could replay "X joined your party" to
// the host at will. Builds from before 2026-09-26 don't send `secret`, so
// they get a 403 and no push is sent -- the join itself is unaffected (this
// call is fire-and-forget).
//
// Title/body convention (all notify-* functions): title = the party's own
// name, body = a short description of what happened, without repeating the
// party name a second time since the title already carries it.
//
// Requires three secrets set on this project (Dashboard -> Edge Functions ->
// Secrets, or `supabase secrets set`) -- never paste the actual APNs key
// content anywhere it isn't a secret store:
//   APNS_KEY          the .p8 auth key file's contents, exactly as downloaded
//   APNS_KEY_ID        the Key ID shown next to it in the Developer Portal
//   APNS_TEAM_ID       the Apple Developer Team ID
// Optional:
//   APNS_ENVIRONMENT   "sandbox" (default -- matches the app's current
//                       aps-environment=development entitlement) or
//                       "production", once this ships to the App Store.

const APNS_BUNDLE_ID = "com.miiitime.app.ios";

// The joining client calls this straight after the RPC returns, so a real
// call is always seconds old; anything older is a replay.
const SIGNUP_MAX_AGE_MS = 10 * 60 * 1000;
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

// APNs provider authentication token -- a short-lived ES256 JWT, distinct
// from any Supabase JWT. WebCrypto's ECDSA signatures are already raw r||s
// (IEEE P1363), which is exactly the format JWT ES256 expects -- no DER
// conversion needed, unlike most other ECDSA/JWT combinations.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: corsHeaders });
  }

  let body: { party_id?: string; signup_id?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders });
  }
  const { party_id, signup_id, secret } = body;
  if (!party_id || !signup_id) {
    return new Response(JSON.stringify({ error: "Missing party_id or signup_id" }), { status: 400, headers: corsHeaders });
  }
  if (!UUID_RE.test(party_id) || !UUID_RE.test(signup_id) || typeof secret !== "string" || !UUID_RE.test(secret)) {
    return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // Same 403 for "no such signup" and "wrong secret", so this can't be used
  // to probe which ids exist.
  const { data: signup, error: signupErr } = await sb
    .from("party_signups")
    .select("attendee_name, created_at")
    .eq("id", signup_id)
    .eq("party_id", party_id)
    .eq("cancel_secret", secret)
    .maybeSingle();
  if (signupErr) {
    return new Response(JSON.stringify({ error: signupErr.message }), { status: 500, headers: corsHeaders });
  }
  if (!signup) {
    return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: corsHeaders });
  }
  if (Date.now() - new Date(signup.created_at).getTime() > SIGNUP_MAX_AGE_MS) {
    return new Response(JSON.stringify({ ok: true, skipped: "signup too old to notify" }), { status: 200, headers: corsHeaders });
  }

  const { data: party, error: partyErr } = await sb
    .from("parties")
    .select("title, host_push_token")
    .eq("id", party_id)
    .single();
  if (partyErr || !party) {
    return new Response(JSON.stringify({ error: "Party not found" }), { status: 404, headers: corsHeaders });
  }
  if (!party.host_push_token) {
    // Not an error -- the host just never registered for push (older app
    // version, denied the permission prompt, etc.). Nothing to send.
    return new Response(JSON.stringify({ ok: true, skipped: "no host_push_token" }), { status: 200, headers: corsHeaders });
  }

  const apnsKeyRaw = Deno.env.get("APNS_KEY");
  const apnsKeyId = Deno.env.get("APNS_KEY_ID");
  const apnsTeamId = Deno.env.get("APNS_TEAM_ID");
  if (!apnsKeyRaw || !apnsKeyId || !apnsTeamId) {
    console.warn("notify-host: APNS_KEY/APNS_KEY_ID/APNS_TEAM_ID not configured -- skipping send");
    return new Response(JSON.stringify({ ok: true, skipped: "APNs not configured" }), { status: 200, headers: corsHeaders });
  }

  const environment = (Deno.env.get("APNS_ENVIRONMENT") || "sandbox").toLowerCase();
  const host = environment === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";

  try {
    const key = await importApnsKey(apnsKeyRaw);
    const jwt = await buildApnsJwt(apnsTeamId, apnsKeyId, key);

    const payload = {
      aps: {
        alert: {
          title: party.title || "Craft Party",
          body: `${signup.attendee_name} joined your party`,
        },
        sound: "default",
      },
    };

    const res = await fetch(`https://${host}/3/device/${party.host_push_token}`, {
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
      console.warn(`notify-host: APNs responded ${res.status}: ${errBody}`);
      return new Response(JSON.stringify({ ok: false, apnsStatus: res.status, apnsBody: errBody }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("notify-host failed:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
