/**
 * Deno unit tests for the circuit breaker.
 *
 * Run: deno test supabase/functions/_shared/circuitBreaker.test.ts
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeCircuitBreaker, CircuitOpenError } from "./circuitBreaker.ts";

Deno.test("starts in CLOSED state", () => {
  const cb = makeCircuitBreaker({ name: "test-closed", failureThreshold: 3 });
  assertEquals(cb.state, "CLOSED");
});

Deno.test("stays CLOSED on success", async () => {
  const cb = makeCircuitBreaker({ name: "test-success", failureThreshold: 3 });
  const result = await cb.call(async () => 42);
  assertEquals(result, 42);
  assertEquals(cb.state, "CLOSED");
});

Deno.test("opens after failureThreshold consecutive failures", async () => {
  const cb = makeCircuitBreaker({ name: "test-open", failureThreshold: 2 });
  const fail = () => Promise.reject(new Error("boom"));

  await assertRejects(() => cb.call(fail));
  assertEquals(cb.state, "CLOSED");

  await assertRejects(() => cb.call(fail));
  assertEquals(cb.state, "OPEN");
});

Deno.test("rejects immediately when OPEN", async () => {
  const cb = makeCircuitBreaker({ name: "test-reject", failureThreshold: 1, resetTimeoutMs: 60_000 });
  await assertRejects(() => cb.call(() => Promise.reject(new Error("fail"))));
  assertEquals(cb.state, "OPEN");

  await assertRejects(
    () => cb.call(async () => "should not run"),
    CircuitOpenError,
  );
});

Deno.test("transitions to HALF_OPEN after resetTimeout", async () => {
  const cb = makeCircuitBreaker({ name: "test-halfopen", failureThreshold: 1, resetTimeoutMs: 50 });
  await assertRejects(() => cb.call(() => Promise.reject(new Error("fail"))));
  assertEquals(cb.state, "OPEN");

  // Wait for reset timeout
  await new Promise(r => setTimeout(r, 60));

  const result = await cb.call(async () => "recovered");
  assertEquals(result, "recovered");
  assertEquals(cb.state, "CLOSED");
});

Deno.test("HALF_OPEN failure re-opens circuit", async () => {
  const cb = makeCircuitBreaker({ name: "test-halfopen-fail", failureThreshold: 1, resetTimeoutMs: 50 });
  await assertRejects(() => cb.call(() => Promise.reject(new Error("fail1"))));

  await new Promise(r => setTimeout(r, 60));

  await assertRejects(() => cb.call(() => Promise.reject(new Error("fail2"))));
  assertEquals(cb.state, "OPEN");
});

Deno.test("reset() restores CLOSED state", async () => {
  const cb = makeCircuitBreaker({ name: "test-reset", failureThreshold: 1 });
  await assertRejects(() => cb.call(() => Promise.reject(new Error("fail"))));
  assertEquals(cb.state, "OPEN");

  cb.reset();
  assertEquals(cb.state, "CLOSED");
});

Deno.test("success after failures resets failure count", async () => {
  const cb = makeCircuitBreaker({ name: "test-reset-count", failureThreshold: 3 });
  await assertRejects(() => cb.call(() => Promise.reject(new Error("f1"))));
  await assertRejects(() => cb.call(() => Promise.reject(new Error("f2"))));
  assertEquals(cb.state, "CLOSED"); // 2 < 3

  await cb.call(async () => "ok");
  assertEquals(cb.state, "CLOSED");

  // After success, failures should be reset — need 3 more to open
  await assertRejects(() => cb.call(() => Promise.reject(new Error("f3"))));
  await assertRejects(() => cb.call(() => Promise.reject(new Error("f4"))));
  assertEquals(cb.state, "CLOSED"); // Still 2 < 3
});
