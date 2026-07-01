/**
 * Deno unit tests for the structured logger.
 * Run: deno test supabase/functions/_shared/logger.test.ts
 */
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createLogger, _resetSentryDsnCache } from "./logger.ts";

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

// ── Sentry forwarding ─────────────────────────────────────────────────────────

interface CapturedSentryRequest {
  url: string;
  authHeader: string;
  body: unknown;
}

function withSentryStub<T>(
  dsn: string | undefined,
  fn: () => T,
): { result: T; captured: CapturedSentryRequest[] } {
  // Replace globalThis.fetch and Deno.env.get to simulate a Sentry-configured
  // environment without making real network calls.
  const captured: CapturedSentryRequest[] = [];
  const origFetch = globalThis.fetch;
  const origDenoEnvGet = Deno.env.get;

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: unknown = undefined;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
    } catch { /* leave undefined */ }
    captured.push({
      url,
      authHeader: String((init?.headers as Record<string, string>)?.["X-Sentry-Auth"] ?? ""),
      body,
    });
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof globalThis.fetch;

  Deno.env.get = ((key: string): string | undefined => {
    if (key === "SENTRY_DSN") return dsn;
    if (key === "ENVIRONMENT") return "test";
    return origDenoEnvGet.call(Deno.env, key);
  }) as typeof Deno.env.get;

  _resetSentryDsnCache();
  try {
    const result = fn();
    return { result, captured };
  } finally {
    globalThis.fetch = origFetch;
    Deno.env.get = origDenoEnvGet;
    _resetSentryDsnCache();
  }
}

Deno.test("sentry: error events POST to the Sentry store endpoint when DSN is set", () => {
  const dsn = "https://abc123@o12345.ingest.sentry.io/67890";
  const { captured } = withSentryStub(dsn, () => {
    captureLines(() => {
      createLogger("test-fn").error("boom", { err: "kaboom" });
    });
  });
  assertStrictEquals(captured.length, 1);
  assertStrictEquals(captured[0].url, "https://o12345.ingest.sentry.io/api/67890/store/");
  assertEquals(captured[0].authHeader.includes("sentry_key=abc123"), true);
  assertEquals(captured[0].authHeader.includes("sentry_version=7"), true);
});

Deno.test("sentry: event payload contains expected Sentry-shaped fields", () => {
  const dsn = "https://abc123@o12345.ingest.sentry.io/67890";
  const { captured } = withSentryStub(dsn, () => {
    captureLines(() => {
      createLogger("ai-search").error("upstream failed", { err: "503", user_id: "u1" });
    });
  });
  const evt = captured[0].body as Record<string, unknown>;
  assertStrictEquals(evt.platform, "javascript");
  assertStrictEquals(evt.level, "error");
  assertStrictEquals(evt.message, "upstream failed");
  assertStrictEquals(evt.logger, "ai-search");
  assertStrictEquals(evt.environment, "test");
  assertEquals(typeof evt.event_id, "string");
  assertStrictEquals((evt.event_id as string).length, 32);
  assertEquals(typeof evt.timestamp, "number");
  // err string should surface as an exception value
  const exception = (evt.exception as { values: Array<{ type: string; value: string }> } | undefined);
  assertStrictEquals(exception?.values[0].type, "Error");
  assertStrictEquals(exception?.values[0].value, "503");
  // tag.fn must equal the logger name
  assertStrictEquals((evt.tags as Record<string, string>).fn, "ai-search");
  // extra context preserves user_id
  assertStrictEquals((evt.extra as Record<string, unknown>).user_id, "u1");
});

Deno.test("logger redacts sensitive payload fields before stdout and Sentry", () => {
  const dsn = "https://abc123@o12345.ingest.sentry.io/67890";
  const stripeSecretLikeValue = "sk_" + "test" + "_1234567890abcdef";
  const { captured } = withSentryStub(dsn, () => {
    const { lines } = captureLines(() => {
      createLogger("ai-search").error("provider failed", {
        err: `OpenAI rejected key ${stripeSecretLikeValue} and Bearer abc.def.ghi`,
        authorization: "Bearer secret-token",
        prompt: "User asks for a valuation of 11 Private Street",
        messages: [{ role: "user", content: "private prompt" }],
        nested: {
          rawBody: "{\"email\":\"buyer@example.com\"}",
          safe_count: 3,
        },
        user_id: "u1",
      });
    });

    const stdout = JSON.parse(lines[0].text);
    assertStrictEquals(stdout.user_id, "u1");
    assertStrictEquals(stdout.authorization, "[redacted]");
    assertStrictEquals(stdout.prompt, "[redacted]");
    assertStrictEquals(stdout.messages, "[redacted]");
    assertStrictEquals(stdout.nested.rawBody, "[redacted]");
    assertStrictEquals(stdout.nested.safe_count, 3);
    assertEquals(String(stdout.err).includes("sk_test_"), false);
    assertEquals(String(stdout.err).includes("Bearer abc.def.ghi"), false);
  });

  const evt = captured[0].body as Record<string, unknown>;
  const extra = evt.extra as Record<string, unknown>;
  assertStrictEquals(extra.authorization, "[redacted]");
  assertStrictEquals(extra.prompt, "[redacted]");
  assertEquals(JSON.stringify(extra).includes("buyer@example.com"), false);
  assertEquals(JSON.stringify(evt).includes(stripeSecretLikeValue), false);
});

Deno.test("sentry: no fetch when SENTRY_DSN is unset", () => {
  const { captured } = withSentryStub(undefined, () => {
    captureLines(() => {
      createLogger("test-fn").error("boom", { err: "kaboom" });
    });
  });
  assertStrictEquals(captured.length, 0);
});

Deno.test("sentry: no fetch for non-error levels", () => {
  const dsn = "https://abc123@o12345.ingest.sentry.io/67890";
  const { captured } = withSentryStub(dsn, () => {
    captureLines(() => {
      const log = createLogger("test-fn");
      log.info("hi");
      log.warn("careful");
    });
  });
  assertStrictEquals(captured.length, 0);
});

Deno.test("sentry: malformed DSN is silently skipped (no throw)", () => {
  const { captured } = withSentryStub("not-a-real-url", () => {
    captureLines(() => {
      createLogger("test-fn").error("boom", { err: "kaboom" });
    });
  });
  assertStrictEquals(captured.length, 0);
});
