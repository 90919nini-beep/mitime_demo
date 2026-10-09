// Shared "resolve caller from their own JWT, re-derive role server-side"
// check, used by every admin Edge Function -- exists in one place so the
// authorization logic can't quietly diverge between functions. Mirrors
// delete-account/index.ts's identity-resolution shape.
import { createClient } from "jsr:@supabase/supabase-js@2";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requireRole(req: Request, minRole: "admin" | "owner") {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new AuthError("Missing authorization", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Resolves *which* user this JWT belongs to -- never trust a user id
  // supplied by the request body for who the caller is.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) throw new AuthError("Not authenticated", 401);

  // is_staff() re-derives the role from user_roles server-side on every
  // call -- the client's own claimed role, if any, is never consulted.
  const { data: isStaff, error: roleError } = await callerClient.rpc("is_staff", {
    uid: user.id,
    min_role: minRole,
  });
  if (roleError || !isStaff) throw new AuthError("Not authorized", 403);

  // Service-role client for the actual privileged action -- this key only
  // ever lives in the function's own environment, never the client.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  return { user, adminClient };
}

export async function writeAudit(
  adminClient: ReturnType<typeof createClient>,
  entry: {
    admin_user_id: string;
    action: string;
    target_type: string;
    target_id?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  const { error } = await adminClient.from("admin_audit_log").insert(entry);
  // Fail closed: if the audit write itself fails, the caller must see an
  // error rather than the privileged action silently succeeding unlogged.
  if (error) throw new Error(`Audit log write failed: ${error.message}`);
}
