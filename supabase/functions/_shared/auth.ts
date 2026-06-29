/**
 * Shared auth helper for edge functions.
 * Verifies the Bearer token from the Authorization header and returns the
 * authenticated Supabase user, or throws a typed error if auth fails.
 *
 * Usage:
 *   import { verifyBearerToken } from "../_shared/auth.ts";
 *   const user = await verifyBearerToken(req, supabaseClient);
 */

// Structurally compatible with both our test mocks and the real
// `@supabase/supabase-js` v2 client. The real client's `User.email` is
// `string | undefined`; our older signature required `string | null`,
// which broke assignability. Widening to `email?: string | null` lets
// callers pass the real client without casting.
type SupabaseAuth = {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string; email?: string | null } | null };
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

const DEFAULT_AUTH_VERIFY_TIMEOUT_MS = 5_000;

function readPositiveIntEnv(key: string, fallback: number): number {
  try {
    const raw = Deno.env.get(key);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function withAuthTimeout<T>(promise: Promise<T>): Promise<T> {
  const timeoutMs = readPositiveIntEnv(
    "AUTH_VERIFY_TIMEOUT_MS",
    DEFAULT_AUTH_VERIFY_TIMEOUT_MS,
  );
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new AuthError("Authentication service timeout", 503));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
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

  const { data, error } = await withAuthTimeout(supabase.auth.getUser(token));
  if (error || !data.user?.email) {
    throw new AuthError(error?.message ?? "Authentication failed");
  }

  return { id: data.user.id, email: data.user.email };
}
