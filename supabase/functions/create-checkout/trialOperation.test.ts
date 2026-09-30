// deno-lint-ignore-file no-import-prefix -- Repository frozen dependency policy.
import Stripe from "npm:stripe@22.3.0";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dispatchTrialCreate } from "./trialOperation.ts";

Deno.test("trial SDK observers count exact operations and remove each listener on rejection", async () => {
  const listeners = new Set<(value: unknown) => void>();
  const requests: string[] = [];
  const stripe = new Stripe("sk_test_local", {
    apiVersion: "2026-06-24.dahlia",
    httpClient: Stripe.createFetchHttpClient((_url, init) => {
      requests.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              type: "invalid_request_error",
              message: "local typed rejection",
            },
          }),
          { status: 400 },
        ),
      );
    }),
  });
  const on = stripe.on.bind(stripe), off = stripe.off.bind(stripe);
  stripe.on = (event: string, listener: (value: unknown) => void) => {
    listeners.add(listener);
    on(event, listener);
  };
  stripe.off = (event: string, listener: (value: unknown) => void) => {
    assertEquals(listeners.delete(listener), true);
    off(event, listener);
  };
  const operation = (key: string) => ({
    version: 1 as const,
    key,
    params: { mode: "subscription" as const },
    api_version: "2026-06-24.dahlia",
    created_at: "2026-09-30T00:00:00.000Z",
    replay_before: "2026-09-30T23:00:00.000Z",
    dispatch_count: 1,
    revision: "00000000-0000-4000-8000-000000000123",
  });
  const results = await Promise.all([
    dispatchTrialCreate(stripe, operation("one")),
    dispatchTrialCreate(stripe, operation("two")),
  ]);
  assertEquals(requests.sort(), ["one", "two"]);
  assertEquals(
    results.map((
      r,
    ) => [
      r.attempts,
      r.reliable,
      r.error instanceof Stripe.errors.StripeError,
    ]),
    [[1, true, true], [1, true, true]],
  );
  assertEquals(listeners.size, 0);
  stripe.on = (event: string, listener: (value: unknown) => void) => {
    listeners.add(listener);
    on(event, listener);
    listener({ method: "POST", path: "/v1/checkout/sessions" });
  };
  const malformed = await dispatchTrialCreate(stripe, operation("three"));
  assertEquals(malformed.attempts, 1);
  assertEquals(malformed.reliable, false);
  assertEquals(listeners.size, 0);
  stripe.on = (_event: string, listener: (value: unknown) => void) => {
    listeners.add(listener);
  };
  const absent = await dispatchTrialCreate(stripe, operation("four"));
  assertEquals(absent.attempts, 0);
  assertEquals(listeners.size, 0);
});
