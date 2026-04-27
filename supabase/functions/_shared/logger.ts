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

function getMinLevel(): LogLevel {
  // Deno globals are typed loosely in this shared module to keep it
  // testable under both Deno and Node (vitest).
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  const raw: string = env?.get?.("LOG_LEVEL") ?? "info";
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
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
    const line = {
      ts: new Date().toISOString(),
      level,
      fn,
      msg,
      ...baseContext,
      ...(context ?? {}),
    };
    // Always serialise; if it ever throws (cyclic ref) fall back to
    // a plaintext warning so we don't mask the original event.
    let text: string;
    try {
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
  }

  return {
    debug: (msg, ctx) => emit("debug", msg, ctx),
    info: (msg, ctx) => emit("info", msg, ctx),
    warn: (msg, ctx) => emit("warn", msg, ctx),
    error: (msg, ctx) => emit("error", msg, ctx),
    child: (extra) => createLogger(fn, { ...baseContext, ...extra }),
  };
}
