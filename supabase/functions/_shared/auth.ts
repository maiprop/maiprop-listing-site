/**
 * Shared auth helper for edge functions.
 * Verifies the Bearer token from the Authorization header and returns the
 * authenticated Supabase user, or throws a typed error if auth fails.
 *
 * Usage:
 *   import { verifyBearerToken } from "../_shared/auth.ts";
 *   const user = await verifyBearerToken(req, supabaseClient);
 */

type SupabaseAuth = {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string; email: string | null } | null };
      error: { message: string } | null;
    }>;
  };
};

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function verifyBearerToken(
  req: Request,
  supabase: SupabaseAuth,
): Promise<{ id: string; email: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new AuthError("No authorization header");

  const token = authHeader.replace(/^Bearer\s*/i, "").trim();
  if (!token) throw new AuthError("Empty bearer token");

  let result: Awaited<ReturnType<SupabaseAuth["auth"]["getUser"]>>;
  try {
    result = await supabase.auth.getUser(token);
  } catch (err) {
    // Network/DNS errors — treat as auth failure so functions return 401, not 500.
    throw new AuthError(
      err instanceof Error ? err.message : "Authentication failed",
      401,
    );
  }
  const { data, error } = result;
  if (error || !data.user?.email) {
    throw new AuthError(error?.message ?? "Authentication failed");
  }

  return { id: data.user.id, email: data.user.email };
}
