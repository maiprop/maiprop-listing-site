import { AuthError } from "./auth.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeBase64UrlJson(segment: string): Record<string, unknown> {
  try {
    const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const value = JSON.parse(atob(padded)) as unknown;
    if (!value || typeof value !== "object") {
      throw new AuthError("Invalid bearer token");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError("Invalid bearer token");
  }
}

/**
 * Reads identity claims only after the Supabase Edge Gateway has verified the
 * JWT signature (`verify_jwt = true`). This avoids a second Auth Admin network
 * request on latency-sensitive functions without trusting unsigned browser
 * input.
 */
export function verifiedGatewayUserFromJwt(
  req: Request,
  nowSeconds = Math.floor(Date.now() / 1_000),
): { id: string; email: string | null } {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new AuthError("No authorization header");

  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new AuthError("Empty bearer token");

  const [, payloadSegment] = token.split(".");
  if (!payloadSegment) throw new AuthError("Invalid bearer token");

  const claims = decodeBase64UrlJson(payloadSegment);
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const role = typeof claims.role === "string" ? claims.role : "";
  const expiresAt = typeof claims.exp === "number" ? claims.exp : 0;
  if (
    !UUID_RE.test(sub) || role !== "authenticated" ||
    !Number.isFinite(expiresAt) || expiresAt <= nowSeconds
  ) {
    throw new AuthError("Authentication failed");
  }

  return {
    id: sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
