import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { processReconciliationBatch } from "./worker.ts";

Deno.test("an interrupted worker attempt is finalized as retryable without inventing provider facts", async () => {
  const completions: Array<Record<string, unknown>> = [];
  const result = await processReconciliationBatch({
    claim: () =>
      Promise.resolve([{
        audit_id: "11111111-1111-4111-8111-111111111111",
        user_id: "22222222-2222-4222-8222-222222222222",
        lock_token: "33333333-3333-4333-8333-333333333333",
        attempt_count: 1,
      }]),
    loadUser: () =>
      Promise.resolve({
        id: "22222222-2222-4222-8222-222222222222",
        email: "user@example.test",
      }),
    reconcile: () => Promise.reject(new Error("worker interrupted")),
    complete: (completion) => {
      completions.push(completion);
      return Promise.resolve();
    },
  });

  assertEquals(result, {
    claimed: 1,
    completed: 0,
    retryable: 1,
    failed: 0,
    deferred: 0,
    deadlineReached: false,
  });
  assertEquals(completions[0]?.billingOutcome, "unknown");
  assertEquals(completions[0]?.hadActiveSub, null);
  assertEquals(completions[0]?.subscriptionCount, null);
  assertEquals(completions[0]?.cancelledCount, null);
});

Deno.test("successful server reconciliation retains the exact audit and lease binding", async () => {
  const completions: Array<Record<string, unknown>> = [];
  const claim = {
    audit_id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    lock_token: "33333333-3333-4333-8333-333333333333",
    attempt_count: 2,
  };
  const result = await processReconciliationBatch({
    claim: () => Promise.resolve([claim]),
    loadUser: () =>
      Promise.resolve({ id: claim.user_id, email: "user@example.test" }),
    reconcile: () =>
      Promise.resolve({
        billingOutcome: "already_pending" as const,
        billingError: null,
        errorDetail: null,
        hadActiveSub: true,
        subscriptionCount: 1,
        cancelledCount: 1,
        newlyCancelledCount: 0,
        alreadyPendingCount: 1,
      }),
    complete: (completion) => {
      completions.push(completion);
      return Promise.resolve();
    },
  });

  assertEquals(result, {
    claimed: 1,
    completed: 1,
    retryable: 0,
    failed: 0,
    deferred: 0,
    deadlineReached: false,
  });
  assertEquals(completions[0]?.auditId, claim.audit_id);
  assertEquals(completions[0]?.userId, claim.user_id);
  assertEquals(completions[0]?.lockToken, claim.lock_token);
});

Deno.test("work deadline releases the in-flight lease without recording a late provider result", async () => {
  const claims = [
    {
      audit_id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
      lock_token: "33333333-3333-4333-8333-333333333333",
      attempt_count: 1,
    },
    {
      audit_id: "44444444-4444-4444-8444-444444444444",
      user_id: "55555555-5555-4555-8555-555555555555",
      lock_token: "66666666-6666-4666-8666-666666666666",
      attempt_count: 1,
    },
  ];
  const loadedUsers: string[] = [];
  const completions: Array<Record<string, unknown>> = [];
  const releasedClaims: Array<Record<string, unknown>> = [];

  const result = await processReconciliationBatch({
    claim: () => Promise.resolve(claims),
    loadUser: (userId) => {
      loadedUsers.push(userId);
      return Promise.resolve({ id: userId, email: "user@example.test" });
    },
    reconcile: (_claim, _user, signal) =>
      new Promise((resolve) => {
        signal.addEventListener("abort", () => {
          setTimeout(() => {
            resolve({
              billingOutcome: "succeeded",
              billingError: null,
              errorDetail: null,
              hadActiveSub: true,
              subscriptionCount: 1,
              cancelledCount: 1,
              newlyCancelledCount: 1,
              alreadyPendingCount: 0,
            });
          }, 10);
        }, { once: true });
      }),
    complete: (completion) => {
      completions.push(completion);
      return Promise.resolve();
    },
    release: (deferredClaims) => {
      releasedClaims.push(...deferredClaims);
      return Promise.resolve();
    },
  }, {
    requestDeadlineMs: 100,
    completionReserveMs: 80,
  });

  assertEquals(result, {
    claimed: 2,
    completed: 0,
    retryable: 0,
    failed: 0,
    deferred: 2,
    deadlineReached: true,
  });
  assertEquals(loadedUsers, [claims[0].user_id]);
  assertEquals(completions, []);
  assertEquals(releasedClaims, claims);
});
