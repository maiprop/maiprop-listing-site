import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reconcileRoleSwitchBilling } from "./billing.ts";
import { processReconciliationBatch } from "../reconcile-role-switch-billing/worker.ts";

Deno.test("103 core subscriptions paginate, exclude add-ons, and retry through worker with the same operation keys", async () => {
  const auditId = "7c020000-0000-4000-8000-000000000001";
  const subscriptions = Array.from(
    { length: 103 },
    (_, n) => ({
      id: `sub_${n}`,
      status: "active",
      cancel_at_period_end: false,
      metadata: {} as Record<string, string>,
    }),
  );
  subscriptions.push({
    id: "sub_addon",
    status: "active",
    cancel_at_period_end: false,
    metadata: { checkout_type: "addon" },
  });
  const keys: string[] = [];
  const cursors: Array<string | undefined> = [];
  let timeoutAfterSuccess = true;
  const stripe = {
    customers: {
      search: () => Promise.resolve({ data: [{ id: "cus_owned" }] }),
      retrieve: (id: string) => Promise.resolve({ id }),
    },
    subscriptions: {
      list: (args: { starting_after?: string }) => {
        cursors.push(args.starting_after);
        const start = args.starting_after
          ? subscriptions.findIndex((s) => s.id === args.starting_after) + 1
          : 0;
        return Promise.resolve({
          data: subscriptions.slice(start, start + 100),
          has_more: start + 100 < subscriptions.length,
        });
      },
      update: (
        id: string,
        payload: { cancel_at_period_end: true },
        opts: { idempotencyKey: string },
      ) => {
        assertEquals(payload, { cancel_at_period_end: true });
        keys.push(opts.idempotencyKey);
        const sub = subscriptions.find((s) => s.id === id)!;
        sub.cancel_at_period_end = true;
        if (id === "sub_1" && timeoutAfterSuccess) {
          timeoutAfterSuccess = false;
          return Promise.reject(new Error("response lost after cancellation"));
        }
        return Promise.resolve(sub);
      },
    },
  };
  const reconcile = () =>
    reconcileRoleSwitchBilling({
      stripe,
      user: { id: "actor", email: "actor@example.test" },
      auditId,
      lookupDurableCustomerId: () => Promise.resolve(null),
    });
  const first = await reconcile();
  assertEquals(first.billingOutcome, "unknown");
  assertEquals(first.subscriptionCount, 103);
  assertEquals(first.cancelledCount, 1);
  let result: Record<string, unknown> | undefined;
  const worker = await processReconciliationBatch({
    claim: () =>
      Promise.resolve([{
        audit_id: auditId,
        user_id: "actor",
        lock_token: "worker-token",
        attempt_count: 1,
      }]),
    loadUser: () =>
      Promise.resolve({ id: "actor", email: "actor@example.test" }),
    reconcile,
    complete: (completion) => {
      result = completion;
      return Promise.resolve();
    },
  });
  assertEquals(worker.completed, 1);
  assertEquals(result?.billingOutcome, "succeeded");
  assertEquals(result?.cancelledCount, 103);
  assertEquals(cursors, [undefined, "sub_99", undefined, "sub_99"]);
  assertEquals(
    keys,
    Array.from({ length: 103 }, (_, n) => `role-switch:${auditId}:sub_${n}`),
  );
  assertEquals(subscriptions.at(-1)?.cancel_at_period_end, false);
  const replay = await reconcile();
  assertEquals(replay.billingOutcome, "already_pending");
  assertEquals(keys.length, 103);
  assert(subscriptions.slice(0, 103).every((s) => s.cancel_at_period_end));
});
