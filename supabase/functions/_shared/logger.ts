/**
 * Structured JSON logger for Supabase edge functions.
 *
 * Why this exists: Supabase pipes stdout from edge functions into Logflare
 * (visible in the dashboard). Logflare indexes structured JSON fields, so
 * `{ level: "error", fn: "ai-search", err: "...", request_id: "..." }`
 * is searchable and aggregatable, while `console.error("ai-search error:", e)`
 * is just a plaintext line that can only be grepped.
 *
 * Usage:
 *   const log = createLogger("ai-search");
 *   log.info("request received", { user_id, query_length: q.length });
 *   log.warn("upstream slow", { latency_ms });
 *   log.error("upstream failed", { err: String(e) });
 *
 * Output (one line per call, JSON):
 *   {"ts":"2026-04-27T16:50:00.000Z","level":"info","fn":"ai-search",
 *    "msg":"request received","user_id":"...","query_length":12}
 *
 * Levels follow syslog-ish convention: debug < info < warn < error.
 * Default minimum level is info; set LOG_LEVEL=debug in the function env to
 * include debug lines.
 *
 * Sentry forwarding (optional):
 *   If `SENTRY_DSN` env is set, every `.error()` call is also forwarded as
 *   a Sentry event via the Sentry Store HTTP API. No SDK is imported — the
 *   integration is a fire-and-forget POST that never blocks the handler.
 *   Failures to reach Sentry are intentionally swallowed so they cannot
 *   themselves cascade into production errors.
 *
 * See docs/ENTERPRISE_ASSESSMENT_2026-04-27.md (Quadrant II, observability
 * gap) for context.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = "[redacted]";

const SENSITIVE_KEY_PATTERN =
  /(^|_)(authorization|access_token|refresh_token|token|password|secret|api_key|apikey|rawbody|errorbody|requestbody|responsebody|prompt|messages|email)($|_)/i;

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bsk_(?:test|live)_[A-Za-z0-9]+/g, REDACTED)
    .replace(/\bcfat_[A-Za-z0-9_-]+/g, REDACTED)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED);
}

function sanitizeLogValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) throw new TypeError("cyclic log context");
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? REDACTED
      : sanitizeLogValue(nestedValue, seen);
  }
  return output;
}

function sanitizeLogContext(context: Record<string, unknown>): Record<string, unknown> {
  return sanitizeLogValue(context, new WeakSet()) as Record<string, unknown>;
}

function getEnv(key: string): string | undefined {
  // Deno globals are typed loosely in this shared module to keep it
  // testable under both Deno and Node (vitest). We narrow via structural
  // check so we never introduce an `any` escape hatch.
  const denoObj = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
  return denoObj?.env?.get?.(key);
}

function getMinLevel(): LogLevel {
  const raw: string = getEnv("LOG_LEVEL") ?? "info";
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

// ─── Sentry forwarding (optional, opt-in via SENTRY_DSN) ─────────────────────
//
// Sentry exposes an HTTP Store API that accepts JSON events directly:
//   POST https://<host>/api/<project_id>/store/
//   X-Sentry-Auth: Sentry sentry_key=<public_key>, sentry_version=7
//
// We parse the DSN once on first use, cache the result, and fire-and-forget
// a POST per error event. Any failure (network, auth, malformed DSN) is
// swallowed — Sentry is observability, not a critical-path dependency.
//
// Reference: https://develop.sentry.dev/sdk/store/

interface ParsedDsn {
  endpoint: string; // full URL to POST to
  authHeader: string; // X-Sentry-Auth value
}

let dsnCache: { parsed: ParsedDsn | null } | undefined;

function parseSentryDsn(): ParsedDsn | null {
  if (dsnCache) return dsnCache.parsed;
  const dsn = getEnv("SENTRY_DSN");
  if (!dsn) {
    dsnCache = { parsed: null };
    return null;
  }
  try {
    // DSN format: https://<public_key>@<host>/<project_id>
    // (newer DSNs may also include a path prefix before the project id)
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.split("/").filter(Boolean).pop();
    if (!publicKey || !projectId) {
      dsnCache = { parsed: null };
      return null;
    }
    const host = url.host;
    const protocol = url.protocol; // "https:" typically
    // Path prefix support: if the DSN path has more than one segment, all
    // but the last become the path prefix (some self-hosted Sentry installs
    // use this).
    const pathParts = url.pathname.split("/").filter(Boolean);
    const pathPrefix = pathParts.length > 1 ? "/" + pathParts.slice(0, -1).join("/") : "";
    const endpoint = `${protocol}//${host}${pathPrefix}/api/${projectId}/store/`;
    const authHeader = [
      "Sentry sentry_version=7",
      `sentry_client=maiprop-edge/1.0`,
      `sentry_key=${publicKey}`,
    ].join(", ");
    const parsed: ParsedDsn = { endpoint, authHeader };
    dsnCache = { parsed };
    return parsed;
  } catch {
    dsnCache = { parsed: null };
    return null;
  }
}

// Visible to tests so they can reset the cached DSN parse.
export function _resetSentryDsnCache(): void {
  dsnCache = undefined;
}

interface SentryEvent {
  event_id: string;
  timestamp: number; // unix seconds
  platform: "javascript";
  level: "error";
  logger: string;
  message: string;
  environment: string;
  release?: string;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  exception?: { values: Array<{ type: string; value: string }> };
}

function buildSentryEvent(
  fn: string,
  msg: string,
  context: Record<string, unknown>,
): SentryEvent {
  // event_id is a 32-char hex string; crypto.randomUUID() gives us 32 hex
  // chars after stripping dashes.
  const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`)
    .replace(/-/g, "")
    .padEnd(32, "0")
    .slice(0, 32);
  const errStr = typeof context.err === "string" ? context.err : undefined;
  return {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    logger: fn,
    message: msg,
    environment: getEnv("ENVIRONMENT") ?? getEnv("DENO_DEPLOYMENT_ID") ?? "production",
    tags: { fn },
    extra: context,
    ...(errStr ? { exception: { values: [{ type: "Error", value: errStr }] } } : {}),
  };
}

function forwardToSentry(fn: string, msg: string, context: Record<string, unknown>): void {
  const dsn = parseSentryDsn();
  if (!dsn) return;
  // Fire-and-forget: never await, never throw. If Sentry is down or the
  // network drops the request, we don't want that to surface as an error
  // in the function that's already trying to log an error.
  try {
    const body = JSON.stringify(buildSentryEvent(fn, msg, context));
    void fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": dsn.authHeader,
      },
      body,
    }).catch(() => undefined);
  } catch {
    // Swallow synchronous failures (e.g. JSON.stringify throws on cycle).
    // The local stdout log already captured the error event.
  }
}

export interface Logger {
  debug(msg: string, context?: Record<string, unknown>): void;
  info(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
  /** Returns a child logger that merges the given context into every line. */
  child(context: Record<string, unknown>): Logger;
}

/**
 * Build a logger bound to a function name. Pass a plain object as
 * `baseContext` to attach fields (e.g. request_id, user_id) to every log
 * line — typically you'll call `.child({ request_id })` inside the request
 * handler.
 */
export function createLogger(
  fn: string,
  baseContext: Record<string, unknown> = {},
): Logger {
  const minRank = LEVEL_RANK[getMinLevel()];

  function emit(level: LogLevel, msg: string, context?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < minRank) return;
    let sentryContext: Record<string, unknown> | null = null;
    // Always serialise; if it ever throws (cyclic ref) fall back to
    // a plaintext warning so we don't mask the original event.
    let text: string;
    try {
      sentryContext = {
        ...sanitizeLogContext(baseContext),
        ...sanitizeLogContext(context ?? {}),
      };
      const line = {
        ts: new Date().toISOString(),
        level,
        fn,
        msg,
        ...sentryContext,
      };
      text = JSON.stringify(line);
    } catch {
      text = JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        fn,
        msg: "logger_serialize_failed",
        original_msg: msg,
      });
    }
    // Route through console.* so Supabase's stdout capture picks it up
    // and the level distinction is preserved in the dashboard.
    if (level === "error") console.error(text);
    else if (level === "warn") console.warn(text);
    else console.log(text);

    // Forward error-level events to Sentry if SENTRY_DSN is configured.
    // Fire-and-forget so logging latency is not affected.
    if (level === "error" && sentryContext) {
      forwardToSentry(fn, msg, sentryContext);
    }
  }

  return {
    debug: (msg, ctx) => emit("debug", msg, ctx),
    info: (msg, ctx) => emit("info", msg, ctx),
    warn: (msg, ctx) => emit("warn", msg, ctx),
    error: (msg, ctx) => emit("error", msg, ctx),
    child: (extra) => createLogger(fn, { ...baseContext, ...extra }),
  };
}
