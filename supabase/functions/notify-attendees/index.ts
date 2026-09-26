import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Called by the HOST's device right after the relevant action succeeds --
// party_post_announcement (kind omitted / "announcement"), party_edit when
// date/time or location actually changed ("time_change" / "location_change"),
// or right before party_delete for a cancellation ("cancelled", called BEFORE
// the delete RPC since this function needs the party row to still exist).
// Same client-orchestrated pattern as notify-host's own call site -- no DB
// trigger/webhook involved.
//
// Only the announcement path re-reads content from the row (the just-written
// parties.announcement column) rather than trusting the request body -- the
// other three kinds have fixed body text.
//
// Caller check: the body must carry `secret`, the party's edit_secret, which
// only the host's device has. Without it, anyone who knew a party_id could
// send its attendees a fake "This party has been cancelled" or a changed
// time/place. Builds from before 2026-09-26 don't send `secret`, so they get
// a 403 and attendees get no push -- the edit/announcement/delete itself is
// unaffected (it went through its own secret-checked RPC).
//
// APNs signing logic is intentionally duplicated from notify-host rather
// than shared, so each function stays independently deployable -- see that
// function's own comment for the required secrets (APNS_KEY, APNS_KEY_ID,
// APNS_TEAM_ID, optional APNS_ENVIRONMENT).

const APNS_BUNDLE_ID = "com.miiitime.app.ios";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// old_when / old_location are the only client-supplied text that reaches a
// push. Only the host can send them now, but keep them to a sane length.
const MAX_OLD_TEXT = 200;

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

// Same shape parseAnnouncements/latestAnnouncement use client-side in
// index.html -- parties.announcement is a JSON-stringified array of
// {text, ts}, newest first. Mirrored here rather than shared since this is
// a different runtime (Deno) than the client.
function latestAnnouncementText(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return arr[0]?.text ?? null;
  } catch {
    return raw;
  }
  return null;
}

type Kind = "announcement" | "time_change" | "location_change" | "cancelled";
const KNOWN_KINDS: Kind[] = ["time_change", "location_change", "cancelled"];

// Same display convention formatPartyDateTime/displayLocation use client-side
// in index.html -- mirrored here (different runtime) so the "new" side of a
// time/location change reads identically to how the app shows it everywhere
// else. The "old" side can't be computed here at all: by the time this runs,
// party_edit has already overwritten the row, so old_when/old_location have
// to arrive from the client, which captured them before the edit.
function formatPartyDateTime(date: string | null, time: string | null): string {
  let dateStr = "";
  if (date) {
    try {
      const d = new Date(date + "T00:00:00");
      dateStr = d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
    } catch {
      dateStr = date;
    }
  }
  let timeStr = "";
  if (time) {
    try {
      const [h, m] = time.split(":");
      const hr = parseInt(h);
      timeStr = `${hr % 12 || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
    } catch {
      timeStr = time;
    }
  }
  if (dateStr && timeStr) return `${dateStr} · ${timeStr}`;
  return dateStr || timeStr;
}

function displayLocation(p: { place_name?: string | null; formatted_address?: string | null; location?: string | null }): string {
  return p.place_name || p.formatted_address || (p.location && !p.location.startsWith("http") ? p.location : "") || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: corsHeaders });
  }

  let body: { party_id?: string; kind?: string; old_when?: string; old_location?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders });
  }
  const { party_id, secret } = body;
  if (!party_id) {
    return new Response(JSON.stringify({ error: "Missing party_id" }), { status: 400, headers: corsHeaders });
  }
  if (!UUID_RE.test(party_id) || typeof secret !== "string" || !UUID_RE.test(secret)) {
    return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: corsHeaders });
  }
  const kind: Kind = KNOWN_KINDS.includes(body.kind as Kind) ? (body.kind as Kind) : "announcement";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // Same 403 for "no such party" and "wrong secret", so this can't be used
  // to probe which ids exist.
  const { data: party, error: partyErr } = await sb
    .from("parties")
    .select("title, announcement, date, time, location, place_name, formatted_address")
    .eq("id", party_id)
    .eq("edit_secret", secret)
    .maybeSingle();
  if (partyErr) {
    return new Response(JSON.stringify({ error: partyErr.message }), { status: 500, headers: corsHeaders });
  }
  if (!party) {
    return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: corsHeaders });
  }

  // Title/body convention (all notify-* functions): title = the party's own
  // name, body = a short description of what happened. The chat-style emoji
  // prefix is specific to the announcement path -- the other three read as
  // plain status updates, not social content, so they stay unprefixed.
  let title: string;
  let notifBody: string;
  if (kind === "announcement") {
    const text = latestAnnouncementText(party.announcement);
    if (!text) {
      return new Response(JSON.stringify({ ok: true, skipped: "no announcement text" }), { status: 200, headers: corsHeaders });
    }
    title = party.title ? `\u{1F4E3} ${party.title}` : "\u{1F4E3} Party update";
    notifBody = text;
  } else if (kind === "time_change") {
    title = party.title || "Party update";
    const newWhen = formatPartyDateTime(party.date, party.time);
    const oldWhen = typeof body.old_when === "string" ? body.old_when.trim().slice(0, MAX_OLD_TEXT) : "";
    // Falls back to the generic line if either side is missing/blank --
    // an older client that doesn't send old_when yet, or a party with no
    // date/time set, shouldn't produce a broken "Changed from  to X." string.
    notifBody = oldWhen && newWhen ? `Changed from ${oldWhen} to ${newWhen}.` : "The party time has been updated.";
  } else if (kind === "location_change") {
    title = party.title || "Party update";
    const newLocation = displayLocation(party);
    const oldLocation = typeof body.old_location === "string" ? body.old_location.trim().slice(0, MAX_OLD_TEXT) : "";
    notifBody = oldLocation && newLocation ? `Changed from ${oldLocation} to ${newLocation}.` : "The party location has been updated.";
  } else {
    title = party.title || "Party update";
    notifBody = "This party has been cancelled.";
  }

  const { data: signups, error: signupsErr } = await sb
    .from("party_signups")
    .select("push_token")
    .eq("party_id", party_id)
    .not("push_token", "is", null);
  if (signupsErr) {
    return new Response(JSON.stringify({ error: signupsErr.message }), { status: 500, headers: corsHeaders });
  }
  const tokens = (signups ?? []).map((s) => s.push_token).filter((t): t is string => !!t);
  if (tokens.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "no attendee push tokens" }), { status: 200, headers: corsHeaders });
  }

  const apnsKeyRaw = Deno.env.get("APNS_KEY");
  const apnsKeyId = Deno.env.get("APNS_KEY_ID");
  const apnsTeamId = Deno.env.get("APNS_TEAM_ID");
  if (!apnsKeyRaw || !apnsKeyId || !apnsTeamId) {
    console.warn("notify-attendees: APNS_KEY/APNS_KEY_ID/APNS_TEAM_ID not configured -- skipping send");
    return new Response(JSON.stringify({ ok: true, skipped: "APNs not configured" }), { status: 200, headers: corsHeaders });
  }

  const environment = (Deno.env.get("APNS_ENVIRONMENT") || "sandbox").toLowerCase();
  const host = environment === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";

  const key = await importApnsKey(apnsKeyRaw);
  const jwt = await buildApnsJwt(apnsTeamId, apnsKeyId, key);
  const payload = {
    aps: {
      alert: { title, body: notifBody },
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
        console.warn(`notify-attendees: APNs responded ${res.status} for a token`);
        return { ok: false, status: res.status };
      }
      return { ok: true };
    } catch (e) {
      console.warn("notify-attendees: send failed for a token:", e);
      return { ok: false, error: String(e) };
    }
  }));

  const sent = results.filter((r) => r.ok).length;
  return new Response(JSON.stringify({ ok: true, sent, total: tokens.length }), { status: 200, headers: corsHeaders });
});
