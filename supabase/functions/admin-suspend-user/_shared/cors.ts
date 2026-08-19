// Shared CORS headers for admin Edge Functions -- same reasoning as
// delete-account/index.ts: the browser treats the app's origin as
// cross-origin from *.supabase.co, so every response needs these and
// OPTIONS must be answered directly.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
