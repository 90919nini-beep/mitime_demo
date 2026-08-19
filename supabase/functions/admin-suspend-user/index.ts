// Suspends a user via Supabase Auth's ban mechanism -- blocks sign-in
// entirely (the approved suspension architecture). admin+ only. Refuses to
// suspend any account that itself holds a staff role, so an admin session
// can never be used to lock out another admin or the owner.
import { requireRole, writeAudit, AuthError } from "./_shared/requireRole.ts";
import { corsHeaders, jsonResponse } from "./_shared/cors.ts";

// ~100 years -- Supabase has no "permanent" ban value, this is the
// conventional stand-in; admin-restore-user clears it explicitly.
const BAN_DURATION = "876000h";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { user, adminClient } = await requireRole(req, "admin");
    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body.user_id === "string" ? body.user_id : null;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!targetUserId) return jsonResponse({ error: "user_id is required" }, 400);
    if (!reason) return jsonResponse({ error: "reason is required" }, 400);

    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (existingRole) {
      return jsonResponse({ error: "Cannot suspend a staff account" }, 403);
    }

    const { error: banError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: BAN_DURATION,
    });
    if (banError) return jsonResponse({ error: banError.message }, 500);

    try {
      await writeAudit(adminClient, {
        admin_user_id: user.id,
        action: "suspend_user",
        target_type: "user",
        target_id: targetUserId,
        after: { reason },
      });
    } catch (auditErr) {
      // The suspension already took effect (Auth Admin API isn't
      // transactional with a Postgres insert) -- surface this distinctly
      // so it isn't mistaken for the suspension itself having failed.
      return jsonResponse({ ok: true, warning: `Suspended, but audit log failed: ${(auditErr as Error).message}` }, 200);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (e) {
    if (e instanceof AuthError) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
