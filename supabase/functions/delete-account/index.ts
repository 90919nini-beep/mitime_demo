// Deletes the calling user's own Supabase auth account. Invoked by the app
// via sb.functions.invoke('delete-account'), which automatically attaches
// the current session's JWT as the Authorization header. verify_jwt is on
// for this function at the platform level (rejects anything without a
// valid session before this code even runs), and this handler additionally
// resolves *which* user that JWT belongs to (via the anon-key client) so it
// only ever deletes the caller's own account — never an arbitrary user id
// supplied by the request itself, since none is accepted.
//
// The actual deletion needs the service-role key (Supabase's admin API is
// the only way to delete an auth.users row), which must never be shipped to
// the client app — that's the whole reason this exists as a server-side
// function instead of a direct client call. Both SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are populated automatically in every Edge
// Function's environment; nothing to configure manually.
//
// public.cloud_data.user_id has ON DELETE CASCADE on its auth.users(id)
// foreign key, so deleting the user takes their synced projects/patterns/
// yarnLib/settings/dashLayout rows with it — no extra cleanup needed here.
//
// CORS: the app calls this from a Capacitor WKWebView origin, which the
// browser treats as cross-origin from *.supabase.co — a real first attempt
// at this without CORS handling failed its OPTIONS preflight outright
// (confirmed by hand before shipping this version), so every response here
// carries permissive CORS headers and OPTIONS is answered directly.
//
// Deployed via the Supabase MCP tools (not the CLI) — this file is kept
// here purely for version control/discoverability; redeploy by passing its
// contents to deploy_edge_function if it's ever edited.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Resolve the caller's identity from their own JWT — this is what ties
  // the deletion to "whoever is asking" rather than any id the request body
  // could otherwise claim (this function accepts no body/user id at all).
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500);
  }

  return jsonResponse({ ok: true }, 200);
});
