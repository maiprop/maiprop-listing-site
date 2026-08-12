import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resumeSubscriptionSafely } from "./resumeSubscription.ts";

Deno.test("subscription resume scopes idempotency to one user intent and verifies canonical state", async () => {
  const requestKeys: string[] = [];
  let retrieveCalls = 0;
  const stripe = {
    subscriptions: {
      update: (
        _id: string,
        _params: { cancel_at_period_end: false },
        options: {
          idempotencyKey: string;
          timeout: number;
          maxNetworkRetries: number;
        },
      ) => {
        requestKeys.push(options.idempotencyKey);
        return Promise.resolve({ cancel_at_period_end: false });
      },
      retrieve: () => {
        retrieveCalls += 1;
        return Promise.resolve({ cancel_at_period_end: false });
      },
    },
  };
  const first = await resumeSubscriptionSafely(
    stripe,
    "sub_123",
    "11111111-1111-4111-8111-111111111111",
  );
  await resumeSubscriptionSafely(
    stripe,
    "sub_123",
    "11111111-1111-4111-8111-111111111111",
  );
  await resumeSubscriptionSafely(
    stripe,
    "sub_123",
    "22222222-2222-4222-8222-222222222222",
  );

  assertEquals(first.reconciled, false);
  assertEquals(requestKeys[0], requestKeys[1]);
  assertEquals(requestKeys[0] === requestKeys[2], false);
  assertEquals(retrieveCalls, 3);
});

Deno.test("ambiguous subscription resume reconciles canonical Stripe state", async () => {
  const result = await resumeSubscriptionSafely({
    subscriptions: {
      update: () => Promise.reject(new Error("connection reset")),
      retrieve: () => Promise.resolve({ cancel_at_period_end: false }),
    },
  }, "sub_123", "11111111-1111-4111-8111-111111111111");

  assertEquals(result.reconciled, true);
});

Deno.test("subscription resume fails when canonical Stripe state remains pending cancellation", async () => {
  await assertRejects(
    () => resumeSubscriptionSafely({
      subscriptions: {
        update: () => Promise.reject(new Error("connection reset")),
        retrieve: () => Promise.resolve({ cancel_at_period_end: true }),
      },
    }, "sub_123", "11111111-1111-4111-8111-111111111111"),
    Error,
    "connection reset",
  );
});

Deno.test("subscription resume rejects a stale cached update when canonical state is still cancelling", async () => {
  await assertRejects(
    () => resumeSubscriptionSafely({
      subscriptions: {
        update: () => Promise.resolve({ cancel_at_period_end: false }),
        retrieve: () => Promise.resolve({ cancel_at_period_end: true }),
      },
    }, "sub_123", "11111111-1111-4111-8111-111111111111"),
    Error,
    "still pending cancellation",
  );
});
