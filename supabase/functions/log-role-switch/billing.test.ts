import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BillingResolutionError,
  reconcileRoleSwitchBilling,
  resolveOwnedStripeCustomer,
  stripeRuntimeFromKey,
} from "./billing.ts";

const user = { id: "user-1", email: "user@example.test" };

function stripeCustomerClient(options: {
  searchError?: Error;
  searchCustomerId?: string;
  retrievedCustomerId?: string;
}) {
  return {
    customers: {
      search: () => {
        if (options.searchError) return Promise.reject(options.searchError);
        return Promise.resolve({
          data: options.searchCustomerId
            ? [{ id: options.searchCustomerId }]
            : [],
        });
      },
      retrieve: (id: string) =>
        Promise.resolve({ id: options.retrievedCustomerId ?? id }),
    },
  };
}

Deno.test("Stripe customer resolution fails closed when metadata search and durable fallback cannot prove ownership", async () => {
  await assertRejects(
    () =>
      resolveOwnedStripeCustomer({
        stripe: stripeCustomerClient({ searchError: new Error("timeout") }),
        user,
        lookupDurableCustomerId: () => Promise.resolve(null),
      }),
    BillingResolutionError,
    "Unable to verify Stripe customer ownership",
  );
});

Deno.test("Stripe customer resolution uses durable ownership after metadata search failure", async () => {
  const customer = await resolveOwnedStripeCustomer({
    stripe: stripeCustomerClient({ searchError: new Error("timeout") }),
    user,
    lookupDurableCustomerId: () => Promise.resolve("cus_durable"),
  });
  assertEquals(customer?.id, "cus_durable");
});

Deno.test("a successful metadata search with no durable mapping proves no owned customer", async () => {
  const customer = await resolveOwnedStripeCustomer({
    stripe: stripeCustomerClient({}),
    user,
    lookupDurableCustomerId: () => Promise.resolve(null),
  });
  assertEquals(customer, null);
});

Deno.test("Stripe runtime derives only from an explicit test or live secret key", () => {
  assertEquals(stripeRuntimeFromKey("sk_test_example"), {
    runtimeMode: "test",
    livemode: false,
  });
  assertEquals(stripeRuntimeFromKey("sk_live_example"), {
    runtimeMode: "live",
    livemode: true,
  });
});

Deno.test("an interrupted cancellation preserves partial facts and is safely recoverable", async () => {
  const subscriptions = [
    {
      id: "sub_one",
      status: "active",
      cancel_at_period_end: false,
      metadata: {},
    },
    {
      id: "sub_two",
      status: "active",
      cancel_at_period_end: false,
      metadata: {},
    },
  ];
  const idempotencyKeys: string[] = [];
  let interruptSecond = true;
  const stripe = {
    customers: {
      search: () => Promise.resolve({ data: [{ id: "cus_owned" }] }),
      retrieve: (id: string) => Promise.resolve({ id }),
    },
    subscriptions: {
      list: () => Promise.resolve({ data: subscriptions, has_more: false }),
      update: (
        id: string,
        _payload: { cancel_at_period_end: true },
        options: { idempotencyKey: string },
      ) => {
        idempotencyKeys.push(options.idempotencyKey);
        if (id === "sub_two" && interruptSecond) {
          return Promise.reject(new Error("connection interrupted"));
        }
        const subscription = subscriptions.find((item) => item.id === id);
        if (subscription) subscription.cancel_at_period_end = true;
        return Promise.resolve(subscription);
      },
    },
  };

  const first = await reconcileRoleSwitchBilling({
    stripe,
    user,
    auditId: "11111111-1111-4111-8111-111111111111",
    lookupDurableCustomerId: () => Promise.resolve(null),
  });
  assertEquals(first.billingOutcome, "unknown");
  assertEquals(first.subscriptionCount, 2);
  assertEquals(first.cancelledCount, 1);

  interruptSecond = false;
  const retry = await reconcileRoleSwitchBilling({
    stripe,
    user,
    auditId: "11111111-1111-4111-8111-111111111111",
    lookupDurableCustomerId: () => Promise.resolve(null),
  });
  assertEquals(retry.billingOutcome, "succeeded");
  assertEquals(retry.subscriptionCount, 2);
  assertEquals(retry.cancelledCount, 2);
  assertEquals(
    idempotencyKeys.every((key) =>
      key.startsWith("role-switch:11111111-1111-4111-8111-111111111111:")
    ),
    true,
  );
});

Deno.test("an aborted reconciliation cannot report success after an in-flight Stripe update settles", async () => {
  const controller = new AbortController();
  let resolveUpdate: ((value: unknown) => void) | undefined;
  let updateStarted: (() => void) | undefined;
  const updateStartedPromise = new Promise<void>((resolve) => {
    updateStarted = resolve;
  });
  let updateOptions: Record<string, unknown> | undefined;
  const stripe = {
    customers: {
      search: () => Promise.resolve({ data: [{ id: "cus_owned" }] }),
      retrieve: (id: string) => Promise.resolve({ id }),
    },
    subscriptions: {
      list: () =>
        Promise.resolve({
          data: [{
            id: "sub_late",
            status: "active",
            cancel_at_period_end: false,
            metadata: {},
          }],
          has_more: false,
        }),
      update: (
        _id: string,
        _payload: { cancel_at_period_end: true },
        options: Record<string, unknown>,
      ) => {
        updateOptions = options;
        updateStarted?.();
        return new Promise((resolve) => {
          resolveUpdate = resolve;
        });
      },
    },
  };
  const reconcileWithSignal = reconcileRoleSwitchBilling as unknown as (
    options: Parameters<typeof reconcileRoleSwitchBilling>[0] & {
      signal: AbortSignal;
      providerRequestTimeoutMs: number;
    },
  ) => ReturnType<typeof reconcileRoleSwitchBilling>;

  const operation = reconcileWithSignal({
    stripe,
    user,
    auditId: "11111111-1111-4111-8111-111111111111",
    lookupDurableCustomerId: () => Promise.resolve(null),
    signal: controller.signal,
    providerRequestTimeoutMs: 250,
  });
  await updateStartedPromise;
  controller.abort(new DOMException("deadline exceeded", "AbortError"));
  resolveUpdate?.({ id: "sub_late", cancel_at_period_end: true });

  const error = await assertRejects(() => operation, DOMException);
  assertEquals(error.name, "AbortError");
  assertEquals(updateOptions?.timeout, 250);
  assertEquals(updateOptions?.maxNetworkRetries, 0);
});
