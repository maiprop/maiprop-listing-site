/**
 * Deno unit tests for the structured logger.
 * Run: deno test supabase/functions/_shared/logger.test.ts
 */
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createLogger } from "./logger.ts";

// Capture stdout/stderr by stubbing the routed console methods.
function captureLines<T>(fn: () => T): { lines: { stream: "log" | "warn" | "error"; text: string }[]; result: T } {
  const lines: { stream: "log" | "warn" | "error"; text: string }[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (...args: unknown[]) => lines.push({ stream: "log", text: String(args[0]) });
  console.warn = (...args: unknown[]) => lines.push({ stream: "warn", text: String(args[0]) });
  console.error = (...args: unknown[]) => lines.push({ stream: "error", text: String(args[0]) });
  try {
    const result = fn();
    return { lines, result };
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
}

// ── basic emission ────────────────────────────────────────────────────────────

Deno.test("info: emits one line as JSON to console.log", () => {
  const { lines } = captureLines(() => {
    createLogger("test-fn").info("hello");
  });
  assertStrictEquals(lines.length, 1);
  assertStrictEquals(lines[0].stream, "log");
  const parsed = JSON.parse(lines[0].text);
  assertStrictEquals(parsed.level, "info");
  assertStrictEquals(parsed.fn, "test-fn");
  assertStrictEquals(parsed.msg, "hello");
});

Deno.test("warn: routes to console.warn", () => {
  const { lines } = captureLines(() => {
    createLogger("test-fn").warn("careful");
  });
  assertStrictEquals(lines[0].stream, "warn");
  assertStrictEquals(JSON.parse(lines[0].text).level, "warn");
});

Deno.test("error: routes to console.error", () => {
  const { lines } = captureLines(() => {
    createLogger("test-fn").error("kaboom");
  });
  assertStrictEquals(lines[0].stream, "error");
  assertStrictEquals(JSON.parse(lines[0].text).level, "error");
});

// ── context merging ───────────────────────────────────────────────────────────

Deno.test("info: per-call context is included as top-level fields", () => {
  const { lines } = captureLines(() => {
    createLogger("test-fn").info("user request", { user_id: "abc", count: 3 });
  });
  const parsed = JSON.parse(lines[0].text);
  assertStrictEquals(parsed.user_id, "abc");
  assertStrictEquals(parsed.count, 3);
});

Deno.test("child: child context is merged into every line", () => {
  const { lines } = captureLines(() => {
    const root = createLogger("test-fn");
    const req = root.child({ request_id: "r1" });
    req.info("step 1");
    req.warn("step 2", { stage: "validate" });
  });
  assertStrictEquals(lines.length, 2);
  const a = JSON.parse(lines[0].text);
  const b = JSON.parse(lines[1].text);
  assertStrictEquals(a.request_id, "r1");
  assertStrictEquals(b.request_id, "r1");
  assertStrictEquals(b.stage, "validate");
});

Deno.test("child: per-call context overrides child context on key collision", () => {
  const { lines } = captureLines(() => {
    const log = createLogger("test-fn").child({ tenant: "default" });
    log.info("x", { tenant: "override" });
  });
  assertStrictEquals(JSON.parse(lines[0].text).tenant, "override");
});

// ── timestamp ─────────────────────────────────────────────────────────────────

Deno.test("info: emits a parseable ISO timestamp", () => {
  const { lines } = captureLines(() => {
    createLogger("test-fn").info("hi");
  });
  const ts = JSON.parse(lines[0].text).ts;
  assertStrictEquals(typeof ts, "string");
  // round-trip parse must succeed
  const ms = Date.parse(ts);
  assertEquals(Number.isFinite(ms), true);
});

// ── log level filtering ───────────────────────────────────────────────────────

Deno.test("debug: suppressed by default (info threshold)", () => {
  const { lines } = captureLines(() => {
    createLogger("test-fn").debug("noisy");
  });
  assertStrictEquals(lines.length, 0);
});

// ── JSON safety ───────────────────────────────────────────────────────────────

Deno.test("info: cyclic context falls back to a serialise-failure record", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const { lines } = captureLines(() => {
    createLogger("test-fn").info("with-cycle", cyclic);
  });
  assertStrictEquals(lines.length, 1);
  const parsed = JSON.parse(lines[0].text);
  assertStrictEquals(parsed.msg, "logger_serialize_failed");
  assertStrictEquals(parsed.original_msg, "with-cycle");
  assertStrictEquals(parsed.level, "warn");
});
