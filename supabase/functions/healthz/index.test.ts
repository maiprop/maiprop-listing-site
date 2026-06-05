/**
 * Tests for healthz edge function.
 *
 * The DB connectivity check will fail in the test environment (no live
 * Supabase), so we expect either 200 (healthy) or 503 (degraded). We verify
 * the response shape rather than the specific status. Detailed integration
 * state is intentionally hidden unless a monitor secret or authorized admin
 * request is supplied.
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("public GET returns coarse JSON without detailed checks", async () => {
  Deno.env.set("HEALTHZ_MONITOR_SECRET", crypto.randomUUID());
  const res = await handler(req("GET"));
  assertEquals([200, 503].includes(res.status), true);
  const body = await res.json() as Record<string, unknown>;
  assertExists(body.status);
  assertExists(body.timestamp);
  assertEquals(body.checks, undefined);
  assertEquals(body.billing_mode, undefined);
  Deno.env.delete("HEALTHZ_MONITOR_SECRET");
});

Deno.test("POST also returns health JSON (method-agnostic)", async () => {
  const res = await handler(req("POST"));
  assertEquals([200, 503].includes(res.status), true);
  const body = await res.json() as Record<string, unknown>;
  assertEquals(typeof body.status, "string");
});

Deno.test("monitor secret reveals detailed checks", async () => {
  const monitorValue = crypto.randomUUID();
  Deno.env.set("HEALTHZ_MONITOR_SECRET", monitorValue);
  const res = await handler(req("GET", undefined, {
    "x-healthz-monitor-secret": monitorValue,
  }));
  const body = await res.json() as {
    billing_mode: string;
    checks: Record<string, string>;
  };
  const checks = body.checks;
  assertExists(checks.database);
  assertExists(checks.env_vars);
  assertExists(checks.openai);
  assertExists(checks.stripe);
  assertExists(body.billing_mode);
  Deno.env.delete("HEALTHZ_MONITOR_SECRET");
});

Deno.test("wrong monitor secret still returns coarse public shape", async () => {
  const monitorValue = crypto.randomUUID();
  Deno.env.set("HEALTHZ_MONITOR_SECRET", monitorValue);
  const res = await handler(req("GET", undefined, {
    "x-healthz-monitor-secret": crypto.randomUUID(),
  }));
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.checks, undefined);
  assertEquals(body.billing_mode, undefined);
  Deno.env.delete("HEALTHZ_MONITOR_SECRET");
});

Deno.test("monitor Bearer secret reveals mock billing detail", async () => {
  const monitorValue = crypto.randomUUID();
  Deno.env.set("BILLING_MODE", "mock");
  Deno.env.set("HEALTHZ_MONITOR_SECRET", monitorValue);
  Deno.env.delete("STRIPE_SECRET_KEY");
  Deno.env.delete("STRIPE_WEBHOOK_SECRET");
  const res = await handler(req("GET", undefined, {
    authorization: `Bearer ${monitorValue}`,
  }));
  const body = await res.json() as {
    billing_mode: string;
    checks: Record<string, string>;
  };
  assertEquals(body.billing_mode, "mock");
  assertEquals(body.checks.stripe, "mock");
  assertEquals([200, 503].includes(res.status), true);
  Deno.env.delete("BILLING_MODE");
  Deno.env.delete("HEALTHZ_MONITOR_SECRET");
});

Deno.test("public GET is shallow and does not perform DB fetches", async () => {
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (() => {
    fetches += 1;
    return Promise.reject(new Error("public health must not fetch"));
  }) as typeof fetch;

  try {
    const res = await handler(req("GET"));
    assertEquals(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assertEquals(typeof body.status, "string");
    assertEquals(body.checks, undefined);
    assertEquals(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("public bearer requests stay shallow unless detailed checks are requested", async () => {
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (() => {
    fetches += 1;
    return Promise.reject(new Error("public bearer health must not fetch"));
  }) as typeof fetch;

  try {
    const res = await handler(req("GET", undefined, {
      authorization: "Bearer user-session-token",
    }));
    assertEquals(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assertEquals(body.checks, undefined);
    assertEquals(body.billing_mode, undefined);
    assertEquals(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("database health check uses an abortable fetch", async () => {
  const originalFetch = globalThis.fetch;
  let observedSignal: AbortSignal | null = null;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    observedSignal = init?.signal instanceof AbortSignal ? init.signal : null;
    return Promise.reject(new DOMException("Timeout", "AbortError"));
  }) as typeof fetch;

  try {
    const monitorValue = crypto.randomUUID();
    Deno.env.set("HEALTHZ_MONITOR_SECRET", monitorValue);
    const res = await handler(req("GET", undefined, {
      "x-healthz-monitor-secret": monitorValue,
    }));
    assertEquals(res.status, 503);
    assertExists(observedSignal);
    const body = await res.json() as { checks: Record<string, string> };
    assertEquals(body.checks.database, "fail");
    Deno.env.delete("HEALTHZ_MONITOR_SECRET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
