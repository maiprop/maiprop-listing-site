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
 *   { error: string, code: string, issues?: Array<{ code?: string, path?: Array<string | number>, message: string }> }
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

export type ErrorResponseIssue = {
  code?: string;
  path?: Array<string | number>;
  message: string;
};

export type ErrorResponseOptions = {
  code?: string;
  issues?: ErrorResponseIssue[];
};

function defaultErrorCode(status: number): string {
  const known: Record<number, string> = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    503: "service_unavailable",
  };
  return known[status] ?? (status >= 500 ? "internal_error" : "request_failed");
}

export function errorResponse(
  message: string,
  status = 500,
  extraHeaders: Record<string, string> = {},
  options: ErrorResponseOptions = {},
): Response {
  const body: { error: string; code: string; issues?: ErrorResponseIssue[] } = {
    error: message,
    code: options.code ?? defaultErrorCode(status),
  };
  if (options.issues && options.issues.length > 0) body.issues = options.issues;
  return jsonResponse(body, status, extraHeaders);
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
