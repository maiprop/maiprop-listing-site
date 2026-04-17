/**
 * Standard response builders for edge functions.
 *
 * Centralises status codes, Content-Type, and degraded-mode signalling so
 * individual functions don't each define their own error shapes.
 *
 * Degraded-mode contract (used when an upstream dependency is unavailable):
 *   { available: false, reason: "upstream_unavailable" | "not_configured" | string }
 *   HTTP 503
 *
 * Error contract:
 *   { error: string }
 *   HTTP 4xx/5xx
 *
 * Success contract:
 *   any JSON object
 *   HTTP 200
 */

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export function errorResponse(
  message: string,
  status = 500,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse({ error: message }, status, extraHeaders);
}

/**
 * Signals that the endpoint is temporarily unavailable (upstream down, not configured, etc.).
 * Callers should show a graceful degraded UI rather than an error.
 */
export function unavailableResponse(
  reason: "upstream_unavailable" | "not_configured" | string = "upstream_unavailable",
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse({ available: false, reason }, 503, extraHeaders);
}
