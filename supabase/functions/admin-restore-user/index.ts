// Clears a suspension via Supabase Auth's ban mechanism. admin+ only.
import { requireRole, writeAudit, AuthError } from "./_shared/requireRole.ts";
import { corsHeaders, jsonResponse } from "./_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { user, adminClient } = await requireRole(req, "admin");
    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body.user_id === "string" ? body.user_id : null;
    if (!targetUserId) return jsonResponse({ error: "user_id is required" }, 400);

    const { error: restoreError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: "none",
    });
    if (restoreError) return jsonResponse({ error: restoreError.message }, 500);

    try {
      await writeAudit(adminClient, {
        admin_user_id: user.id,
        action: "restore_user",
        target_type: "user",
        target_id: targetUserId,
      });
    } catch (auditErr) {
      // Same reasoning as admin-suspend-user: compensate by re-applying
      // the ban rather than leaving a "successful" restore with no audit
      // record, and never return a 200 in that case.
      const BAN_DURATION = "876000h";
      const { error: compensateErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: BAN_DURATION,
      });
      if (compensateErr) {
        return jsonResponse(
          {
            error:
              `Restore failed: audit log write failed (${(auditErr as Error).message}), and the compensating ` +
              `re-suspend also failed (${compensateErr.message}). This account may be restored with no audit ` +
              `record -- manual intervention required.`,
          },
          500,
        );
      }
      return jsonResponse(
        { error: `Restore failed: audit log write failed, action was rolled back: ${(auditErr as Error).message}` },
        500,
      );
    }

    return jsonResponse({ ok: true }, 200);
  } catch (e) {
    if (e instanceof AuthError) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
