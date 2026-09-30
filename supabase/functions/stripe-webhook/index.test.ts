/**
 * Tests for stripe-webhook edge function (Stripe HMAC-verified webhook).
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";
import Stripe from "npm:stripe@22.3.0";
import { buildIdempotencyKey } from "../_shared/stripeClient.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    STRIPE_RUNTIME_MODE: "test",
    STRIPE_EXPECTED_ACCOUNT_ID: "acct_testmaiprop",
  },
);
const webhookModule = await import("./index.ts");
const {
  addonCreditsGranted,
  addonPurchaseStatusForSubscription,
  findProvisionedReplacementSubscription,
  investorPaymentAccessPeriodDays,
  investorPaymentExpiresAt,
  mapSubscriptionTrialStatus,
  withWebhookProcessingDeadline,
} = webhookModule;
const fulfillAddonCheckoutSession = (
  webhookModule as unknown as {
    fulfillAddonCheckoutSession?: (
      supabase: unknown,
      session: unknown,
    ) => Promise<boolean>;
  }
).fulfillAddonCheckoutSession;
const retrieveCanonicalSubscriptionForEvent = (
  webhookModule as unknown as {
    retrieveCanonicalSubscriptionForEvent?: (
      stripe: unknown,
      eventSubscription: { id: string },
    ) => Promise<Record<string, unknown>>;
  }
).retrieveCanonicalSubscriptionForEvent;
const addonRefundInputsFromCharge = (
  webhookModule as unknown as {
    addonRefundInputsFromCharge?: (
      stripe: unknown,
      charge: unknown,
    ) => Promise<Array<Record<string, unknown>>>;
  }
).addonRefundInputsFromCharge;
const applyAddonRefund = (
  webhookModule as unknown as {
    applyAddonRefund?: (
      supabase: unknown,
      input: Record<string, unknown>,
    ) => Promise<boolean>;
  }
).applyAddonRefund;
const addonRefundInputsFromCreditNote = (
  webhookModule as unknown as {
    addonRefundInputsFromCreditNote?: (
      stripe: unknown,
      creditNote: unknown,
    ) => Promise<Array<Record<string, unknown>>>;
  }
).addonRefundInputsFromCreditNote;
const resolveSubscriptionEntitlement = (
  webhookModule as unknown as {
    resolveSubscriptionEntitlement?: (
      supabase: unknown,
      subscription: unknown,
    ) => Promise<Record<string, unknown> | null>;
  }
).resolveSubscriptionEntitlement;
const resolveHistoricalSubscriptionEntitlement = (
  webhookModule as unknown as {
    resolveHistoricalSubscriptionEntitlement?: (
      supabase: unknown,
      subscription: unknown,
    ) => Promise<Record<string, unknown> | null>;
  }
).resolveHistoricalSubscriptionEntitlement;

const addonFulfillmentClient = (input: {
  profileUserId: string;
  billingRuntimeMode?: "test" | "live";
  billingCustomer: {
    user_id: string;
    stripe_customer_id: string;
    runtime_mode: "test" | "live";
    livemode: boolean;
  };
}) => {
  const purchases = new Map<string, Record<string, unknown>>();
  const upserts: Array<{
    payload: Record<string, unknown>;
    options: Record<string, unknown>;
  }> = [];

  const rowQuery = (row: Record<string, unknown> | null) => {
    let matches = Boolean(row);
    return {
      select(_columns: string) {
        return this;
      },
      eq(column: string, value: unknown) {
        matches = matches && row?.[column] === value;
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: matches ? row : null, error: null });
      },
    };
  };

  return {
    purchases,
    upserts,
    client: {
      rpc(name: string) {
        if (name !== "current_billing_runtime_mode") {
          throw new Error(`unexpected rpc: ${name}`);
        }
        return Promise.resolve({
          data: input.billingRuntimeMode ?? input.billingCustomer.runtime_mode,
          error: null,
        });
      },
      from(table: string) {
        if (table === "profiles") {
          return rowQuery({ user_id: input.profileUserId });
        }
        if (table === "billing_customers") {
          return rowQuery(input.billingCustomer);
        }
        if (table === "addon_purchases") {
          return {
            upsert(
              payload: Record<string, unknown>,
              options: Record<string, unknown>,
            ) {
              upserts.push({ payload, options });
              const sessionId = String(payload.stripe_session_id);
              if (!options.ignoreDuplicates || !purchases.has(sessionId)) {
                purchases.set(sessionId, payload);
              }
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    },
  };
};

const paidPromotionSession = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: "cs_test_featured",
  client_reference_id: "user-1",
  payment_status: "paid",
  mode: "payment",
  customer: "cus_user_1",
  payment_intent: "pi_featured",
  subscription: null,
  amount_total: 3900,
  currency: "eur",
  livemode: false,
  metadata: {
    checkout_type: "addon",
    user_id: "user-1",
    addon_key: "featured_listing",
    module: "adhoc_charges",
    audience: "participant",
    unit: "per_listing",
    quantity: "1",
    runtime_mode: "test",
  },
  ...overrides,
});

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing Stripe-Signature header returns 400", async () => {
  const res = await handler(
    req("POST", { type: "checkout.session.completed" }),
  );
  // Stripe webhook verifies HMAC; missing signature → webhook error, not 200
  assertEquals(res.status, 400);
});

Deno.test("wrong Stripe-Signature returns error response", async () => {
  const r = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": "t=bad,v1=bad",
    },
    body: JSON.stringify({ type: "checkout.session.completed" }),
  });
  const res = await handler(r);
  assertEquals([400, 500].includes(res.status), true);
});

Deno.test("webhook handler records event idempotency and durable billing state", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const eventLedgerIndex = source.indexOf("beginStripeWebhookEvent");
  const switchIndex = source.indexOf("switch (event.type)");
  const duplicateIndex = source.indexOf("webhook event already handled");

  assertEquals(source.includes("finishStripeWebhookEvent"), true);
  assertEquals(source.includes('eventStart.state === "in_progress"'), true);
  assertEquals(source.includes("verifyStripeAccountIdentity"), true);
  assertEquals(source.includes("claimToken"), true);
  assertEquals(source.includes("Retry-After"), true);
  assertEquals(source.includes("status: 503"), true);
  assertEquals(source.includes("upsertBillingCustomer"), true);
  assertEquals(source.includes("upsertBillingSubscription"), true);
  assertEquals(eventLedgerIndex >= 0, true);
  assertEquals(switchIndex > eventLedgerIndex, true);
  assertEquals(duplicateIndex > eventLedgerIndex, true);
});

Deno.test("webhook processing has a bounded whole-request deadline", async () => {
  await assertRejects(
    () => withWebhookProcessingDeadline(new Promise(() => undefined), 1),
    Error,
    "Stripe webhook processing timed out",
  );
});

Deno.test("active subscription entitlement resolution fails closed on pricing read errors", async () => {
  assertEquals(typeof resolveSubscriptionEntitlement, "function");
  if (!resolveSubscriptionEntitlement) return;

  const supabase = {
    from(table: string) {
      assertEquals(table, "pricing_configs");
      return {
        select() {
          return this;
        },
        eq() {
          return Promise.resolve({
            data: null,
            error: new Error("pricing lookup unavailable"),
          });
        },
      };
    },
  };
  const subscription = {
    id: "sub_active_pricing_failure",
    status: "active",
    livemode: false,
    metadata: { plan_key: "pro" },
    items: {
      data: [{
        price: {
          id: "price_pro_monthly",
          product: "prod_pro",
          recurring: { interval: "month" },
        },
      }],
    },
  };

  await assertRejects(
    () => resolveSubscriptionEntitlement(supabase, subscription),
    Error,
    "pricing lookup unavailable",
  );
});

Deno.test("deleted subscriptions resolve retired pricing configurations for revocation", async () => {
  assertEquals(typeof resolveHistoricalSubscriptionEntitlement, "function");
  if (!resolveHistoricalSubscriptionEntitlement) return;

  const activeFilters: boolean[] = [];
  const supabase = {
    from(table: string) {
      assertEquals(table, "pricing_configs");
      return {
        select() {
          return this;
        },
        eq(column: string, value: boolean) {
          assertEquals(column, "is_active");
          activeFilters.push(value);
          return Promise.resolve({
            data: value
              ? []
              : [{
                key: "retired_pro",
                audience: "participant",
                module: "user_subscription",
                metadata: {
                  stripe_product_id: "prod_retired",
                  stripe_price_id_monthly: "price_retired",
                },
              }],
            error: null,
          });
        },
      };
    },
  };
  const subscription = {
    id: "sub_retired",
    status: "canceled",
    livemode: true,
    metadata: { plan_key: "retired_pro" },
    items: {
      data: [{
        price: {
          id: "price_retired",
          product: "prod_retired",
        },
      }],
    },
  };

  assertEquals(
    await resolveHistoricalSubscriptionEntitlement(supabase, subscription),
    {
      planKey: "retired_pro",
      audience: "participant",
      role: "participant",
      productId: "prod_retired",
    },
  );
  assertEquals(activeFilters, [true, false]);
});

Deno.test("deleted subscriptions fall back to their exact durable entitlement ledger", async () => {
  assertEquals(typeof resolveHistoricalSubscriptionEntitlement, "function");
  if (!resolveHistoricalSubscriptionEntitlement) return;

  const selectedSubscriptions: string[] = [];
  const supabase = {
    from(table: string) {
      if (table === "pricing_configs") {
        return {
          select() {
            return this;
          },
          eq(_column: string, _value: boolean) {
            return Promise.resolve({ data: [], error: null });
          },
        };
      }
      assertEquals(table, "billing_subscriptions");
      return {
        select() {
          return this;
        },
        eq(column: string, value: string) {
          assertEquals(column, "stripe_subscription_id");
          selectedSubscriptions.push(value);
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: {
              plan_key: "legacy_professional",
              audience: "professional",
              stripe_product_id: "prod_legacy_professional",
              livemode: false,
            },
            error: null,
          });
        },
      };
    },
  };
  const subscription = {
    id: "sub_legacy_professional",
    status: "canceled",
    livemode: false,
    metadata: {},
    items: {
      data: [{
        price: {
          id: "price_legacy_professional",
          product: "prod_legacy_professional",
        },
      }],
    },
  };

  assertEquals(
    await resolveHistoricalSubscriptionEntitlement(supabase, subscription),
    {
      planKey: "legacy_professional",
      audience: "professional",
      role: "professional",
      productId: "prod_legacy_professional",
    },
  );
  assertEquals(selectedSubscriptions, ["sub_legacy_professional"]);

  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const clearStart = source.indexOf("async function clearSubscription");
  const clearEnd = source.indexOf(
    "/** Update professionals.subscription_tier",
    clearStart,
  );
  const clearBlock = source.slice(clearStart, clearEnd);
  assertEquals(
    clearBlock.includes("resolveHistoricalSubscriptionEntitlement"),
    true,
  );
});

Deno.test("subscription webhooks retrieve canonical current state instead of trusting event order", async () => {
  assertEquals(typeof retrieveCanonicalSubscriptionForEvent, "function");
  if (!retrieveCanonicalSubscriptionForEvent) return;

  const retrievedIds: string[] = [];
  const canonical = await retrieveCanonicalSubscriptionForEvent({
    subscriptions: {
      retrieve(id: string) {
        retrievedIds.push(id);
        return Promise.resolve({ id, status: "canceled" });
      },
    },
  }, {
    id: "sub_ordered",
    status: "active",
  } as never);

  assertEquals(retrievedIds, ["sub_ordered"]);
  assertEquals(canonical.status, "canceled");
});

Deno.test("subscription webhook persistence carries event-created ordering context", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const subscriptionCase = source.indexOf(
    'case "customer.subscription.created"',
  );
  const subscriptionEnd = source.indexOf(
    'case "customer.subscription.deleted"',
    subscriptionCase,
  );
  const block = source.slice(subscriptionCase, subscriptionEnd);

  assertEquals(block.includes("retrieveCanonicalSubscriptionForEvent"), true);
  assertEquals(block.includes("event.created"), true);
  assertEquals(block.includes("event.id"), true);
});

Deno.test("deleted subscriptions reconcile active replacements before clearing profile access", async () => {
  const nowSeconds = 1_800_000_000;
  const replacement = {
    id: "sub_new",
    status: "active",
    created: nowSeconds - 60,
    metadata: {
      checkout_type: "subscription",
      plan_key: "developer_pro",
    },
    items: {
      data: [{
        current_period_end: nowSeconds + 3_600,
        price: {
          id: "price_developer_monthly",
          product: "prod_developer",
        },
      }],
    },
  };
  const stripe = {
    subscriptions: {
      list(params: Record<string, unknown>) {
        assertEquals(params.customer, "cus_123");
        assertEquals(params.status, "all");
        return Promise.resolve({
          data: [
            { id: "sub_old", status: "canceled", metadata: {} },
            {
              id: "sub_addon",
              status: "active",
              metadata: { checkout_type: "addon" },
            },
            {
              id: "sub_wrong_audience",
              status: "active",
              created: nowSeconds,
              metadata: {
                checkout_type: "subscription",
                plan_key: "pro",
              },
              items: {
                data: [{
                  current_period_end: nowSeconds + 7_200,
                  price: {
                    id: "price_participant_monthly",
                    product: "prod_participant",
                  },
                }],
              },
            },
            replacement,
          ],
        });
      },
    },
  };
  const supabase = {
    from(table: string) {
      assertEquals(table, "pricing_configs");
      return {
        select() {
          return this;
        },
        eq() {
          return Promise.resolve({
            data: [
              {
                key: "pro",
                audience: "participant",
                module: "user_subscription",
                metadata: {
                  stripe_product_id: "prod_participant",
                  stripe_price_id_monthly: "price_participant_monthly",
                },
              },
              {
                key: "developer_pro",
                audience: "developer",
                module: "developer_subscription",
                metadata: {
                  stripe_product_id: "prod_developer",
                  stripe_price_id_monthly: "price_developer_monthly",
                },
              },
            ],
            error: null,
          });
        },
      };
    },
  };

  assertEquals(
    await findProvisionedReplacementSubscription(
      supabase as never,
      stripe as never,
      "cus_123",
      "sub_old",
      "developer",
      nowSeconds * 1_000,
    ),
    replacement as never,
  );

  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const clearStart = source.indexOf("async function clearSubscription");
  const replacementIndex = source.indexOf(
    "findProvisionedReplacementSubscription",
    clearStart,
  );
  const profileClearIndex = source.indexOf(
    "subscription_product_id: null",
    clearStart,
  );

  assertEquals(clearStart >= 0, true);
  assertEquals(replacementIndex > clearStart, true);
  assertEquals(profileClearIndex > replacementIndex, true);
});

Deno.test("replacement reconciliation ignores expired and malformed subscriptions and chooses deterministically", async () => {
  const nowSeconds = 1_800_000_000;
  const validOlder = {
    id: "sub_valid_older",
    status: "past_due",
    created: nowSeconds - 200,
    metadata: {
      checkout_type: "subscription",
      plan_key: "developer_pro",
    },
    items: {
      data: [{
        current_period_end: nowSeconds + 3_600,
        price: {
          id: "price_developer_monthly",
          product: "prod_developer",
        },
      }],
    },
  };
  const validNewest = {
    ...validOlder,
    id: "sub_valid_newest",
    status: "trialing",
    created: nowSeconds - 100,
    trial_end: nowSeconds + 7_200,
  };
  const stripe = {
    subscriptions: {
      list() {
        return Promise.resolve({
          data: [
            {
              ...validOlder,
              id: "sub_expired",
              created: nowSeconds + 10,
              items: {
                data: [{
                  current_period_end: nowSeconds - 1,
                  price: {
                    id: "price_developer_monthly",
                    product: "prod_developer",
                  },
                }],
              },
            },
            {
              id: "sub_malformed",
              status: "active",
              created: nowSeconds + 20,
              metadata: { checkout_type: "subscription" },
              items: { data: [] },
            },
            validOlder,
            validNewest,
          ],
        });
      },
    },
  };
  const supabase = {
    from(table: string) {
      assertEquals(table, "pricing_configs");
      return {
        select() {
          return this;
        },
        eq() {
          return Promise.resolve({
            data: [{
              key: "developer_pro",
              audience: "developer",
              module: "developer_subscription",
              metadata: {
                stripe_product_id: "prod_developer",
                stripe_price_id_monthly: "price_developer_monthly",
              },
            }],
            error: null,
          });
        },
      };
    },
  };

  assertEquals(
    await findProvisionedReplacementSubscription(
      supabase as never,
      stripe as never,
      "cus_123",
      "sub_deleted",
      "developer",
      nowSeconds * 1_000,
    ),
    validNewest as never,
  );
});

Deno.test("add-on subscription lifecycle maps to add-on ledger status without profile entitlement sync", async () => {
  assertEquals(
    addonPurchaseStatusForSubscription({ status: "active" } as never),
    "active",
  );
  assertEquals(
    addonPurchaseStatusForSubscription({ status: "trialing" } as never),
    "active",
  );
  assertEquals(
    addonPurchaseStatusForSubscription({ status: "past_due" } as never),
    "active",
  );
  assertEquals(
    addonPurchaseStatusForSubscription({ status: "canceled" } as never),
    "cancelled",
  );

  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const syncStart = source.indexOf("async function syncSubscription");
  const clearStart = source.indexOf("async function clearSubscription");
  assertEquals(
    source.indexOf("syncAddonSubscriptionLifecycle", syncStart) > syncStart,
    true,
  );
  assertEquals(
    source.indexOf("syncAddonSubscriptionLifecycle", clearStart) > clearStart,
    true,
  );
});

Deno.test("subscription sync stamps company invoice settings before fulfillment", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const syncStart = source.indexOf("async function syncSubscription");
  const companySettingsIndex = source.indexOf(
    "ensureSubscriptionCompanyInvoiceSettings",
    syncStart,
  );
  const addonLifecycleIndex = source.indexOf(
    "syncAddonSubscriptionLifecycle",
    syncStart,
  );
  const customerRetrieveIndex = source.indexOf(
    "stripe.customers.retrieve",
    syncStart,
  );

  assertEquals(syncStart >= 0, true);
  assertEquals(companySettingsIndex > syncStart, true);
  assertEquals(companySettingsIndex < addonLifecycleIndex, true);
  assertEquals(companySettingsIndex < customerRetrieveIndex, true);
});

Deno.test("subscription trial status mapping covers post-trial lifecycle", () => {
  assertEquals(mapSubscriptionTrialStatus("trialing"), "trialing");
  assertEquals(mapSubscriptionTrialStatus("active"), "active");
  assertEquals(mapSubscriptionTrialStatus("past_due"), "past_due");
  assertEquals(mapSubscriptionTrialStatus("canceled"), "canceled");
  assertEquals(mapSubscriptionTrialStatus("unpaid"), "expired");
  assertEquals(mapSubscriptionTrialStatus("paused"), "expired");
  assertEquals(mapSubscriptionTrialStatus("incomplete_expired"), "expired");
  assertEquals(mapSubscriptionTrialStatus("incomplete"), "checkout_created");
});

Deno.test("webhook post-trial events resync subscriptions and lapse terminal states", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const updatedCase = source.indexOf('case "customer.subscription.updated"');
  const pausedCase = source.indexOf('case "customer.subscription.paused"');
  const deletedCase = source.indexOf('case "customer.subscription.deleted"');
  const paymentSucceededCase = source.indexOf(
    'case "invoice.payment_succeeded"',
  );
  const paymentFailedCase = source.indexOf('case "invoice.payment_failed"');
  const syncStart = source.indexOf("async function syncSubscription");
  const clearStart = source.indexOf("async function clearSubscription");

  assertEquals(updatedCase >= 0, true);
  assertEquals(pausedCase > updatedCase, true);
  assertEquals(deletedCase > updatedCase, true);
  assertEquals(paymentSucceededCase > updatedCase, true);
  assertEquals(paymentFailedCase > updatedCase, true);
  assertEquals(
    source.indexOf(
      "await syncSubscriptionTrialStatus(supabase, sub)",
      updatedCase,
    ) >
      updatedCase,
    true,
  );
  assertEquals(
    source.indexOf("await syncInvoiceSubscription(", paymentSucceededCase) >
      paymentSucceededCase,
    true,
  );
  assertEquals(
    source.indexOf("await syncInvoiceSubscription(", paymentFailedCase) >
      paymentFailedCase,
    true,
  );
  assertEquals(
    source.indexOf("applySubscriptionLapseControls", syncStart) > syncStart,
    true,
  );
  assertEquals(
    source.indexOf("applySubscriptionLapseControls", clearStart) > clearStart,
    true,
  );
});

Deno.test("add-on fulfillment only grants explicitly supported self-serve credits", () => {
  assertEquals(addonCreditsGranted("valuation_single", 2), 2);
  assertEquals(addonCreditsGranted("valuation_bundle", 2), 10);
  assertEquals(addonCreditsGranted("property_report_single", 3), 3);
  assertEquals(addonCreditsGranted("neighbourhood_report_single", 1), 1);
  assertEquals(addonCreditsGranted("neighbourhood_report_bundle", 2), 6);
  assertEquals(addonCreditsGranted("featured_listing", 1), 1);
  assertEquals(addonCreditsGranted("priority_placement", 1), 1);
  assertEquals(addonCreditsGranted("featured_priority_bundle", 1), 1);

  let threw = false;
  try {
    addonCreditsGranted("new_unmapped_report", 1);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("promotion fulfillment is idempotent per Stripe session", async () => {
  assertEquals(typeof fulfillAddonCheckoutSession, "function");
  if (!fulfillAddonCheckoutSession) return;

  const state = addonFulfillmentClient({
    profileUserId: "user-1",
    billingCustomer: {
      user_id: "user-1",
      stripe_customer_id: "cus_user_1",
      runtime_mode: "test",
      livemode: false,
    },
  });
  const session = paidPromotionSession();

  assertEquals(
    await fulfillAddonCheckoutSession(state.client, session),
    true,
  );
  assertEquals(
    await fulfillAddonCheckoutSession(
      state.client,
      paidPromotionSession({
        metadata: {
          checkout_type: "addon",
          user_id: "user-1",
          addon_key: "priority_placement",
          module: "adhoc_charges",
          audience: "participant",
          unit: "per_listing",
          quantity: "1",
          runtime_mode: "test",
        },
      }),
    ),
    true,
  );
  assertEquals(state.purchases.size, 1);
  assertEquals(state.upserts.length, 2);
  assertEquals(state.upserts[0].options, {
    onConflict: "stripe_session_id",
    ignoreDuplicates: true,
  });
  assertEquals(state.upserts[0].payload.user_id, "user-1");
  assertEquals(state.upserts[0].payload.addon_key, "featured_listing");
  assertEquals(state.upserts[0].payload.credits_granted, 1);
  assertEquals(state.upserts[0].payload.runtime_mode, "test");
  assertEquals(state.upserts[0].payload.stripe_amount_total, 3900);
  assertEquals(state.upserts[0].payload.stripe_currency, "eur");
  assertEquals(
    state.purchases.get("cs_test_featured")?.addon_key,
    "featured_listing",
  );
});

Deno.test("promotion fulfillment rejects unsupported add-on keys before ledger write", async () => {
  assertEquals(typeof fulfillAddonCheckoutSession, "function");
  if (!fulfillAddonCheckoutSession) return;

  const state = addonFulfillmentClient({
    profileUserId: "user-1",
    billingCustomer: {
      user_id: "user-1",
      stripe_customer_id: "cus_user_1",
      runtime_mode: "test",
      livemode: false,
    },
  });
  const session = paidPromotionSession({
    metadata: {
      checkout_type: "addon",
      user_id: "user-1",
      addon_key: "unsupported_promotion",
      module: "adhoc_charges",
      audience: "participant",
      unit: "per_listing",
      quantity: "1",
      runtime_mode: "test",
    },
  });

  await assertRejects(
    () => fulfillAddonCheckoutSession(state.client, session),
    Error,
    "unsupported self-serve add-on key",
  );
  assertEquals(state.purchases.size, 0);
  assertEquals(state.upserts.length, 0);
});

Deno.test("promotion fulfillment rejects a Stripe customer owned by another user", async () => {
  assertEquals(typeof fulfillAddonCheckoutSession, "function");
  if (!fulfillAddonCheckoutSession) return;

  const state = addonFulfillmentClient({
    profileUserId: "user-2",
    billingCustomer: {
      user_id: "user-1",
      stripe_customer_id: "cus_user_1",
      runtime_mode: "test",
      livemode: false,
    },
  });
  const session = paidPromotionSession({
    client_reference_id: "user-2",
    metadata: {
      checkout_type: "addon",
      user_id: "user-2",
      addon_key: "priority_placement",
      module: "adhoc_charges",
      audience: "participant",
      unit: "per_listing",
      quantity: "1",
      runtime_mode: "test",
    },
  });

  assertEquals(
    await fulfillAddonCheckoutSession(state.client, session),
    true,
  );
  assertEquals(state.purchases.size, 0);
  assertEquals(state.upserts.length, 0);
});

Deno.test("promotion fulfillment rejects a cross-user client reference", async () => {
  assertEquals(typeof fulfillAddonCheckoutSession, "function");
  if (!fulfillAddonCheckoutSession) return;

  const state = addonFulfillmentClient({
    profileUserId: "user-1",
    billingCustomer: {
      user_id: "user-1",
      stripe_customer_id: "cus_user_1",
      runtime_mode: "test",
      livemode: false,
    },
  });

  assertEquals(
    await fulfillAddonCheckoutSession(
      state.client,
      paidPromotionSession({ client_reference_id: "user-2" }),
    ),
    true,
  );
  assertEquals(state.purchases.size, 0);
  assertEquals(state.upserts.length, 0);
});

Deno.test("promotion fulfillment rejects sessions outside the active billing runtime", async () => {
  assertEquals(typeof fulfillAddonCheckoutSession, "function");
  if (!fulfillAddonCheckoutSession) return;

  const state = addonFulfillmentClient({
    profileUserId: "user-1",
    billingRuntimeMode: "live",
    billingCustomer: {
      user_id: "user-1",
      stripe_customer_id: "cus_user_1",
      runtime_mode: "test",
      livemode: false,
    },
  });

  assertEquals(
    await fulfillAddonCheckoutSession(state.client, paidPromotionSession()),
    true,
  );
  assertEquals(state.purchases.size, 0);
  assertEquals(state.upserts.length, 0);
});

Deno.test("subscription trials never fulfill promotion credits", async () => {
  assertEquals(typeof fulfillAddonCheckoutSession, "function");
  if (!fulfillAddonCheckoutSession) return;

  const state = addonFulfillmentClient({
    profileUserId: "user-1",
    billingCustomer: {
      user_id: "user-1",
      stripe_customer_id: "cus_user_1",
      runtime_mode: "test",
      livemode: false,
    },
  });
  const trialSession = paidPromotionSession({
    payment_status: "no_payment_required",
    metadata: {
      checkout_type: "subscription_trial",
      user_id: "user-1",
      plan_key: "pro",
      trial: "true",
    },
  });

  assertEquals(
    await fulfillAddonCheckoutSession(state.client, trialSession),
    false,
  );
  assertEquals(state.purchases.size, 0);
});

Deno.test("webhook handles add-on refunds and checkout expiration idempotently", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  assertEquals(source.includes('case "charge.refunded"'), true);
  assertEquals(source.includes('case "refund.created"'), true);
  assertEquals(source.includes('case "refund.updated"'), true);
  assertEquals(source.includes('case "credit_note.created"'), true);
  assertEquals(source.includes('case "credit_note.updated"'), true);
  assertEquals(source.includes('case "credit_note.voided"'), true);
  assertEquals(source.includes('case "checkout.session.expired"'), true);
  assertEquals(source.includes("syncAddonRefund"), true);
  assertEquals(source.includes("expireAbandonedTrialCheckoutSession"), true);
  assertEquals(source.includes("reconcile_addon_refund_event"), true);
  assertEquals(source.includes("addonRefundInputsFromCharge"), true);
  assertEquals(source.includes("stripe_amount_total"), true);
});

Deno.test("charge.refunded expands each immutable Stripe refund instead of reusing the cumulative charge amount", async () => {
  assertEquals(typeof addonRefundInputsFromCharge, "function");
  if (!addonRefundInputsFromCharge) return;

  const inputs = await addonRefundInputsFromCharge(
    {
      paymentIntents: {
        retrieve() {
          return Promise.resolve({
            metadata: {
              checkout_type: "addon",
              user_id: "user-1",
              addon_key: "featured_listing",
            },
          });
        },
      },
    },
    {
      id: "ch_partial_refunds",
      object: "charge",
      amount: 3900,
      amount_refunded: 1500,
      currency: "eur",
      livemode: false,
      customer: "cus_user_1",
      payment_intent: "pi_featured",
      metadata: {},
      refunds: {
        data: [
          { id: "re_first", amount: 500, status: "succeeded", metadata: {} },
          { id: "re_second", amount: 1000, status: "succeeded", metadata: {} },
        ],
      },
    },
  );

  assertEquals(inputs.map((input) => input.refundId), [
    "re_first",
    "re_second",
  ]);
  assertEquals(inputs.map((input) => input.refundedAmount), [500, 1000]);
  assertEquals(inputs.map((input) => input.totalAmount), [3900, 3900]);
});

Deno.test("add-on refunds reconcile through the transactional RPC with runtime and customer identity", async () => {
  assertEquals(typeof applyAddonRefund, "function");
  if (!applyAddonRefund) return;

  const filters: Array<[string, unknown]> = [];
  const rpcCalls: Array<Record<string, unknown>> = [];
  const purchase = {
    id: "purchase-1",
    stripe_customer_id: "cus_user_1",
    runtime_mode: "test",
    livemode: false,
    stripe_amount_total: 3900,
  };
  const supabase = {
    from(table: string) {
      assertEquals(table, "addon_purchases");
      return {
        select() {
          return this;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: purchase, error: null });
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      assertEquals(name, "reconcile_addon_refund_event");
      rpcCalls.push(args);
      return Promise.resolve({ data: { credits_refunded: 1 }, error: null });
    },
  };

  assertEquals(
    await applyAddonRefund(supabase, {
      refundId: "re_first",
      chargeId: "ch_partial_refunds",
      customerId: "cus_user_1",
      paymentIntentId: "pi_featured",
      totalAmount: 3900,
      refundedAmount: 500,
      currency: "eur",
      livemode: false,
      metadata: { checkout_type: "addon" },
      status: "succeeded",
    }),
    true,
  );
  assertEquals(
    filters.some(([column, value]) =>
      column === "runtime_mode" && value === "test"
    ),
    true,
  );
  assertEquals(
    filters.some(([column, value]) => column === "livemode" && value === false),
    true,
  );
  assertEquals(
    filters.some(([column, value]) =>
      column === "stripe_customer_id" && value === "cus_user_1"
    ),
    true,
  );
  assertEquals(rpcCalls[0]?.p_stripe_refund_id, "re_first");
  assertEquals(rpcCalls[0]?.p_refunded_amount, 500);
});

Deno.test("add-on refunds match immutable charge-only events within the active Stripe runtime", async () => {
  assertEquals(typeof applyAddonRefund, "function");
  if (!applyAddonRefund) return;

  const filters: Array<[string, unknown]> = [];
  const purchase = {
    id: "purchase-charge-only",
    stripe_charge_id: "ch_charge_only",
    stripe_customer_id: "cus_user_1",
    runtime_mode: "test",
    livemode: false,
    stripe_amount_total: 3900,
  };
  const supabase = {
    from(table: string) {
      assertEquals(table, "addon_purchases");
      return {
        select() {
          return this;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: purchase, error: null });
        },
      };
    },
    rpc() {
      return Promise.resolve({ data: { credits_refunded: 1 }, error: null });
    },
  };

  assertEquals(
    await applyAddonRefund(supabase, {
      refundId: "re_charge_only",
      chargeId: "ch_charge_only",
      customerId: "cus_user_1",
      paymentIntentId: null,
      totalAmount: 3900,
      refundedAmount: 500,
      currency: "eur",
      livemode: false,
      metadata: {},
      status: "succeeded",
    }),
    true,
  );
  assertEquals(
    filters.some(([column, value]) =>
      column === "stripe_charge_id" && value === "ch_charge_only"
    ),
    true,
  );
});

Deno.test("add-on refund matching fails closed without an immutable Stripe purchase reference", async () => {
  assertEquals(typeof applyAddonRefund, "function");
  if (!applyAddonRefund) return;

  let queried = false;
  const supabase = {
    from() {
      queried = true;
      throw new Error("metadata fallback must not query purchases");
    },
  };

  assertEquals(
    await applyAddonRefund(supabase, {
      refundId: "re_ambiguous",
      chargeId: null,
      customerId: "cus_user_1",
      paymentIntentId: null,
      totalAmount: 3900,
      refundedAmount: 500,
      currency: "eur",
      livemode: false,
      metadata: {
        checkout_type: "addon",
        user_id: "user-1",
        addon_key: "featured_listing",
      },
      status: "succeeded",
    }),
    false,
  );
  assertEquals(queried, false);
});

Deno.test("out-of-order tagged add-on refunds stay retryable until checkout fulfillment exists", async () => {
  assertEquals(typeof applyAddonRefund, "function");
  if (!applyAddonRefund) return;

  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };

  await assertRejects(
    () =>
      applyAddonRefund(supabase, {
        refundId: "re_before_checkout",
        chargeId: "ch_before_checkout",
        customerId: "cus_user_1",
        paymentIntentId: "pi_before_checkout",
        totalAmount: 3900,
        refundedAmount: 3900,
        currency: "eur",
        livemode: false,
        metadata: {
          checkout_type: "addon",
          addon_key: "featured_listing",
        },
        status: "succeeded",
      }),
    Error,
    "add-on refund purchase is not available yet",
  );
});

Deno.test("credit notes reuse canonical Stripe refund IDs and invoice identity", async () => {
  assertEquals(typeof addonRefundInputsFromCreditNote, "function");
  if (!addonRefundInputsFromCreditNote) return;

  const inputs = await addonRefundInputsFromCreditNote(
    {
      invoices: {
        retrieve(invoiceId: string) {
          assertEquals(invoiceId, "in_addon_partial");
          return Promise.resolve({
            id: invoiceId,
            object: "invoice",
            amount_paid: 0,
            total: 5900,
            currency: "eur",
            livemode: false,
            customer: "cus_user_1",
            payment_intent: "pi_priority",
            charge: "ch_priority",
            metadata: {
              checkout_type: "addon",
              addon_key: "priority_placement",
            },
          });
        },
      },
      refunds: {
        retrieve(refundId: string) {
          assertEquals(refundId, "re_credit_note_partial");
          return Promise.resolve({
            id: refundId,
            object: "refund",
            amount: 1000,
            status: "succeeded",
            livemode: false,
            charge: {
              id: "ch_priority",
              object: "charge",
              amount: 5900,
              currency: "eur",
              customer: "cus_user_1",
              payment_intent: "pi_priority",
              metadata: {},
            },
            metadata: {},
          });
        },
      },
      paymentIntents: {
        retrieve(paymentIntentId: string) {
          assertEquals(paymentIntentId, "pi_priority");
          return Promise.resolve({ metadata: {} });
        },
      },
    },
    {
      id: "cn_partial",
      object: "credit_note",
      status: "issued",
      invoice: "in_addon_partial",
      customer: "cus_user_1",
      total: 1000,
      post_payment_amount: 1000,
      pre_payment_amount: 0,
      out_of_band_amount: 0,
      refunds: [{
        type: "refund",
        refund: "re_credit_note_partial",
        amount_refunded: 1000,
      }],
      currency: "eur",
      livemode: false,
      metadata: {},
    },
  );

  assertEquals(inputs.length, 1);
  const input = inputs[0];
  assertEquals(input?.refundId, "re_credit_note_partial");
  assertEquals(input?.refundId === "cn_partial", false);
  assertEquals(input?.invoiceId, "in_addon_partial");
  assertEquals(input?.paymentIntentId, "pi_priority");
  assertEquals(input?.chargeId, "ch_priority");
  assertEquals(input?.totalAmount, 5900);
  assertEquals(input?.refundedAmount, 1000);
  assertEquals(
    (input?.metadata as Record<string, string>)?.checkout_type,
    "addon",
  );
});

Deno.test("credit notes count only non-refund post-payment residual once", async () => {
  assertEquals(typeof addonRefundInputsFromCreditNote, "function");
  if (!addonRefundInputsFromCreditNote) return;

  const inputs = await addonRefundInputsFromCreditNote(
    {
      invoices: {
        retrieve() {
          return Promise.resolve({
            id: "in_external_credit",
            object: "invoice",
            amount_paid: 3900,
            total: 3900,
            currency: "eur",
            livemode: false,
            customer: "cus_user_1",
            payment_intent: "pi_spotlight",
            charge: "ch_spotlight",
            metadata: { checkout_type: "addon", addon_key: "featured_listing" },
          });
        },
      },
      refunds: {
        retrieve() {
          return Promise.resolve({
            id: "re_linked",
            object: "refund",
            amount: 600,
            status: "succeeded",
            livemode: false,
            charge: {
              id: "ch_spotlight",
              object: "charge",
              amount: 3900,
              currency: "eur",
              customer: "cus_user_1",
              payment_intent: "pi_spotlight",
              metadata: {},
            },
            metadata: {},
          });
        },
      },
      paymentIntents: {
        retrieve() {
          return Promise.resolve({ metadata: {} });
        },
      },
    },
    {
      id: "cn_mixed",
      object: "credit_note",
      status: "issued",
      invoice: "in_external_credit",
      customer: "cus_user_1",
      total: 1000,
      post_payment_amount: 1000,
      pre_payment_amount: 0,
      out_of_band_amount: 400,
      refunds: [{ type: "refund", refund: "re_linked", amount_refunded: 600 }],
      currency: "eur",
      livemode: false,
      metadata: {},
    },
  );

  assertEquals(inputs.map((input) => input.refundId), [
    "re_linked",
    "credit_note:cn_mixed:external",
  ]);
  assertEquals(inputs.map((input) => input.refundedAmount), [600, 400]);
});

Deno.test("voided pre-payment credit notes do not revoke paid add-on entitlements", async () => {
  assertEquals(typeof addonRefundInputsFromCreditNote, "function");
  if (!addonRefundInputsFromCreditNote) return;

  const inputs = await addonRefundInputsFromCreditNote(
    {},
    {
      id: "cn_void",
      object: "credit_note",
      status: "void",
      invoice: "in_open",
      total: 1000,
      post_payment_amount: 0,
      pre_payment_amount: 1000,
      refunds: [],
      currency: "eur",
      livemode: false,
      metadata: {},
    },
  );

  assertEquals(inputs, []);
});

Deno.test("add-on, investor, and trial webhook writes persist Stripe runtime mode", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const addonSource = await Deno.readTextFile(
    new URL("../_shared/addonFulfillment.ts", import.meta.url),
  );
  const investorStart = source.indexOf(
    "async function activateInvestorPaymentSession",
  );
  const trialStart = source.indexOf(
    "async function syncSubscriptionTrialClaim",
  );
  const investorBlock = source.slice(investorStart, trialStart);

  assertEquals(
    addonSource.includes("const livemode = Boolean(session.livemode)"),
    true,
  );
  assertEquals(addonSource.includes("runtime_mode: runtimeMode"), true);
  assertEquals(
    investorBlock.includes("livemode: Boolean(session.livemode)"),
    true,
  );
  assertEquals(
    investorBlock.includes("runtime_mode: stripeRuntimeModeFromLivemode"),
    true,
  );

});

Deno.test("agent data-input discount is provider-idempotent and durably records the Stripe credit", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const discountStart = source.indexOf(
    "async function applyAgentDataInputDiscount",
  );
  const discountBlock = source.slice(discountStart);
  const invoiceCreatedStart = source.indexOf('case "invoice.created"');
  const invoiceCreatedEnd = source.indexOf(
    'case "checkout.session.completed"',
    invoiceCreatedStart,
  );
  const invoiceCreatedBlock = source.slice(
    invoiceCreatedStart,
    invoiceCreatedEnd,
  );

  assertEquals(discountStart >= 0, true);
  assertEquals(
    discountBlock.includes("agentDataInputCreditIdempotencyKey"),
    true,
  );
  assertEquals(discountBlock.includes("idempotencyKey"), true);
  assertEquals(
    discountBlock.indexOf("findAgentDataInputInvoiceCredit") <
      discountBlock.indexOf("stripe.invoiceItems.create"),
    true,
  );
  assertEquals(discountBlock.includes("operation_key: idempotencyKey"), true);
  assertEquals(source.includes("stripe_credit_id: credit.id"), true);
  assertEquals(
    source.includes("stripe_credit_amount_cents: amountMinor"),
    true,
  );
  assertEquals(
    source.includes("stripe_credit_currency: credit.currency"),
    true,
  );
  assertEquals(
    discountBlock.includes("Ambiguous Stripe credit outcome remains reserved"),
    true,
  );
  assertEquals(
    invoiceCreatedBlock.includes(
      "await applyAgentDataInputDiscount(supabase, stripe, invoice);",
    ),
    true,
  );
  assertEquals(invoiceCreatedBlock.includes("best-effort"), false);
  assertEquals(source.includes('case "invoice.finalized"'), true);
  assertEquals(
    source.includes("await reconcileFinalizedAgentDataInputDiscount("),
    true,
  );
  assertEquals(
    discountBlock.indexOf("const subtotalMinor = invoice.subtotal ?? 0;") <
      discountBlock.indexOf('"apply_verified_data_input_discount"'),
    true,
  );
  assertEquals(
    discountBlock.indexOf("const idempotencyKey = await agentDataInputCreditIdempotencyKey") <
      discountBlock.indexOf('"apply_verified_data_input_discount"'),
    true,
  );
  assertEquals(discountBlock.includes("p_subtotal_minor: subtotalMinor"), true);
  assertEquals(discountBlock.includes("p_operation_key: idempotencyKey"), true);
  assertEquals(
    discountBlock.includes("persistAgentDataInputCreditExpectation"),
    false,
  );
  assertEquals(
    discountBlock.includes("releaseAgentDataInputCreditReservation"),
    true,
  );
  assertEquals(source.includes('.select<{ id: string }[]>("id")'), true);
  assertEquals(
    source.includes("persistedRows.length !== expectedCount"),
    true,
  );
  assertEquals(
    discountBlock.includes("stripe invoiceItem create failed, rolling back DB"),
    false,
  );
});

Deno.test("one-time checkout fulfillment requires paid status and metadata-owned customers", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertEquals(
    source.includes('return session.payment_status === "paid";'),
    true,
  );
  assertEquals(source.includes('session.status === "complete"'), false);
  assertEquals(source.includes("resolveUserIdByEmail"), false);
  assertEquals(source.includes('return { column: "email"'), false);
  assertEquals(source.includes('.eq("stripe_session_id", session.id)'), true);
});

Deno.test("add-on fulfillment skips orphaned sessions before ledger insert", async () => {
  const source = await Deno.readTextFile(
    new URL("../_shared/addonFulfillment.ts", import.meta.url),
  );
  const addonStart = source.indexOf(
    "async function reconcileAddonCheckoutSession",
  );
  const addonBlock = source.slice(addonStart);
  const profileCheck = addonBlock.indexOf(
    "await addonCheckoutProfileExists(supabase, userId)",
  );
  const ledgerInsert = addonBlock.indexOf('.from("addon_purchases")');

  assertEquals(profileCheck > 0, true);
  assertEquals(ledgerInsert > profileCheck, true);
  assertEquals(addonBlock.includes("orphaned add-on checkout session"), true);
  assertEquals(addonBlock.includes('return "rejected";'), true);
});

Deno.test("investor payment activation computes a one-year expiry from one activation timestamp", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const activationStart = source.indexOf(
    "async function activateInvestorPaymentSession",
  );
  const activationEnd = source.indexOf(
    "type SubscriptionTrialClaimStatus",
    activationStart,
  );
  const activationBlock = source.slice(activationStart, activationEnd);

  assertEquals(
    investorPaymentAccessPeriodDays({ access_period_days: "365" } as never),
    365,
  );
  assertEquals(
    investorPaymentAccessPeriodDays({ access_period_days: "0" } as never),
    365,
  );
  assertEquals(
    investorPaymentExpiresAt(
      new Date("2026-01-01T00:00:00.000Z"),
      { access_period_days: "365" } as never,
    ).toISOString(),
    "2027-01-01T00:00:00.000Z",
  );
  assertEquals(
    activationBlock.includes("const activatedAt = new Date();"),
    true,
  );
  assertEquals(
    activationBlock.includes(
      "const activatedAtIso = activatedAt.toISOString();",
    ),
    true,
  );
  assertEquals(activationBlock.includes("started_at: activatedAtIso"), true);
  assertEquals(activationBlock.includes("activated_at: activatedAtIso"), true);
  assertEquals(activationBlock.includes("updated_at: activatedAtIso"), true);
  assertEquals(
    activationBlock.includes(
      "expires_at: investorPaymentExpiresAt(activatedAt, metadata).toISOString()",
    ),
    true,
  );
  assertEquals(activationBlock.includes("expires_at: null"), false);
});

restore();

type SignedWebhookCall = { method: string; url: URL; body: string; form: URLSearchParams; key: string | null };
const webhookJson = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
let signedWebhookNumber = 0;

const signedWebhookEvent = async (type: string, object: Record<string, unknown>, overrides: Record<string, unknown> = {}) => {
  const payload = JSON.stringify({ id: `evt_handler_${++signedWebhookNumber}`, object: "event", api_version: "2026-06-24.dahlia", created: Math.floor(Date.now() / 1000), livemode: false, type, data: { object }, ...overrides });
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: "placeholder-stripe-webhook", timestamp: Math.floor(Date.now() / 1000) });
  return new Request("https://functions.supabase.co/fn", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature, origin: "https://maiprop.co" }, body: payload });
};

const signedWebhookFixture = async (
  options: {
    route?: (call: SignedWebhookCall) => Response | null | Promise<Response | null>;
    stored?: Map<string, Record<string, unknown>>;
    account?: string;
    finishNoRows?: boolean;
    failFailureMark?: boolean;
  },
  exercise: (invoke: (type: string, object: Record<string, unknown>, overrides?: Record<string, unknown>) => Promise<{ response: Response; body: Record<string, unknown> }>, calls: SignedWebhookCall[], stored: Map<string, Record<string, unknown>>) => void | Promise<void>,
) => {
  const oldFetch = globalThis.fetch;
  const previousKey = Deno.env.get("STRIPE_SECRET_KEY");
  Deno.env.set("STRIPE_SECRET_KEY", `sk_test_signed_handler_${++signedWebhookNumber}`);
  const stored = options.stored ?? new Map<string, Record<string, unknown>>();
  const calls: SignedWebhookCall[] = [];
  const unknown: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const body = await request.text();
    const call = { method, url, body, form: new URLSearchParams(body), key: request.headers.get("Idempotency-Key") };
    calls.push(call);
    if (url.hostname === "api.stripe.com") {
      if (method === "GET" && url.pathname === "/v1/account") return webhookJson({ id: options.account ?? "acct_testmaiprop" });
      if (method === "GET" && url.pathname === "/v1/balance") return webhookJson({ livemode: false, available: [], pending: [] });
    }
    if (url.hostname === "test.supabase.co" && url.pathname === "/rest/v1/stripe_webhook_events") {
      if (method === "POST") {
        const row = JSON.parse(body) as Record<string, unknown>;
        const eventId = String(row.event_id);
        if (stored.has(eventId)) return webhookJson({ code: "23505", message: "duplicate event" }, 409);
        stored.set(eventId, { ...row, updated_at: new Date().toISOString() });
        return new Response(null, { status: 201 });
      }
      if (method === "GET") {
        const eventId = String(url.searchParams.get("event_id") ?? "").replace(/^eq\./, "");
        return webhookJson(stored.get(eventId) ?? null);
      }
      if (method === "PATCH") {
        const eventId = String(url.searchParams.get("event_id") ?? "").replace(/^eq\./, "");
        const row = stored.get(eventId);
        const next = JSON.parse(body) as Record<string, unknown>;
        if (options.failFailureMark && next.status === "failed") return webhookJson({ message: "synthetic failure-mark error" }, 500);
        if (options.finishNoRows && next.status === "processed" && row) {
          row.metadata = { processing_started_at: new Date().toISOString(), processing_claim_token: "replacement-worker-token" };
          return webhookJson(null);
        }
        const token = String(url.searchParams.get("metadata->>processing_claim_token") ?? "").replace(/^eq\./, "");
        const requiredStatus = String(url.searchParams.get("status") ?? "").replace(/^eq\./, "");
        if (!row || row.status !== requiredStatus || (token && (row.metadata as Record<string, unknown>)?.processing_claim_token !== token)) return webhookJson(null);
        Object.assign(row, next, { updated_at: new Date().toISOString() });
        return webhookJson({ event_id: eventId });
      }
    }
    const routed = await options.route?.(call);
    if (routed) return routed;
    unknown.push(`${method} ${url}`);
    throw new Error(`Unexpected signed webhook transport ${method} ${url}`);
  };
  const invoke = async (type: string, object: Record<string, unknown>, overrides: Record<string, unknown> = {}) => {
    const response = await handler(await signedWebhookEvent(type, object, overrides));
    return { response, body: await response.json() as Record<string, unknown> };
  };
  try {
    await exercise(invoke, calls, stored);
    assertEquals(unknown, []);
  } finally {
    globalThis.fetch = oldFetch;
    if (previousKey === undefined) Deno.env.delete("STRIPE_SECRET_KEY");
    else Deno.env.set("STRIPE_SECRET_KEY", previousKey);
  }
};

Deno.test("signed webhook dispatch claims, finishes, deduplicates, and retries an in-progress lease", async () => {
  await signedWebhookFixture({}, async (invoke, calls, stored) => {
    const eventId = "evt_signed_ledger";
    const first = await invoke("unrecognized.billing.event", { id: "obj_unknown" }, { id: eventId });
    assertEquals(first.response.status, 200, JSON.stringify(calls.map((call) => `${call.method} ${call.url}`)));
    assertEquals(first.body.received, true);
    assertEquals(stored.get(eventId)?.status, "processed");
    assertEquals(stored.get(eventId)?.runtime_mode, "test");
    const claimsBefore = calls.filter((call) => call.url.pathname === "/rest/v1/stripe_webhook_events" && call.method === "PATCH").length;
    const duplicate = await invoke("unrecognized.billing.event", { id: "obj_unknown" }, { id: eventId });
    assertEquals(duplicate.response.status, 200);
    assertEquals(duplicate.body.duplicate, true);
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/stripe_webhook_events" && call.method === "PATCH").length, claimsBefore);
    stored.set("evt_processing_ledger", { event_id: "evt_processing_ledger", status: "processing", updated_at: new Date().toISOString(), metadata: { processing_started_at: new Date().toISOString(), processing_claim_token: "existing-token" } });
    const processing = await invoke("unrecognized.billing.event", { id: "obj_processing" }, { id: "evt_processing_ledger" });
    assertEquals(processing.response.status, 503);
    assertEquals(processing.response.headers.get("Retry-After"), "30");
    assertEquals(processing.body.in_progress, true);
    assertEquals(stored.get("evt_processing_ledger")?.status, "processing");
  });
});

Deno.test("signed webhook rejects wrong event account before creating ledger row", async () => {
  await signedWebhookFixture({}, async (invoke, calls) => {
    const result = await invoke("unrecognized.billing.event", { id: "obj_bad_account" }, { account: "acct_wrongaccount" });
    assertEquals(result.response.status, 500);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/stripe_webhook_events"), false);
  });
});

Deno.test("signed webhook does not finish a lease whose claim token was replaced", async () => {
  await signedWebhookFixture({ finishNoRows: true }, async (invoke, calls, stored) => {
    const eventId = "evt_finish_replaced";
    const result = await invoke("unrecognized.billing.event", { id: "obj_finish_replaced" }, { id: eventId });
    assertEquals(result.response.status, 200);
    assertEquals(stored.get(eventId)?.status, "processing");
    assertEquals((stored.get(eventId)?.metadata as Record<string, unknown>).processing_claim_token, "replacement-worker-token");
    const finish = calls.find((call) => call.url.pathname === "/rest/v1/stripe_webhook_events" && call.method === "PATCH");
    assertEquals(JSON.parse(finish!.body).status, "processed");
    assertEquals(finish!.url.searchParams.get("status"), "eq.processing");
    assertEquals(finish!.url.searchParams.has("metadata->>processing_claim_token"), true);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/billing_customers" || call.url.pathname === "/rest/v1/billing_subscriptions"), false);
  });
});

Deno.test("signed subscription customer or history failure stays retryable without entitlement writes", async () => {
  const actor = "00000000-0000-4000-8000-000000000098";
  const canonical = { id: "sub_history_failure", customer: "cus_history_failure", status: "active", livemode: false, current_period_end: 4102444800, metadata: { plan_key: "professional_pro", audience: "professional" }, invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] }, items: { data: [{ current_period_end: 4102444800, price: { id: "price_professional", product: "prod_professional" } }] } };
  for (const failPath of ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"]) {
    const route = (call: SignedWebhookCall) => {
      if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_history_failure") return webhookJson(canonical);
      if (call.method === "GET" && call.url.pathname === "/v1/customers/cus_history_failure") return webhookJson({ id: canonical.customer, metadata: { user_id: actor } });
      if (call.method === "GET" && call.url.pathname === "/rest/v1/pricing_configs") return webhookJson([{ key: "professional_pro", audience: "professional", module: "professional_subscription", metadata: { stripe_product_id: "prod_professional", stripe_price_id: "price_professional" } }]);
      if (call.method === "GET" && call.url.pathname === "/rest/v1/profiles") return webhookJson({ role: "professional", role_switch_in_progress_at: null });
      if (call.method === "POST" && ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"].includes(call.url.pathname)) return call.url.pathname === failPath ? webhookJson({ message: "synthetic billing persistence failure" }, 500) : new Response(null, { status: 201 });
      return null;
    };
    const eventId = failPath.endsWith("customers") ? "evt_customer_failure" : "evt_history_failure";
    await signedWebhookFixture({ route, failFailureMark: failPath.endsWith("subscriptions") }, async (invoke, calls, stored) => {
      const result = await invoke("customer.subscription.updated", { id: canonical.id, customer: canonical.customer, livemode: false }, { id: eventId });
      assertEquals(result.response.status, 500);
      assertEquals(calls.some((call) => call.url.pathname === failPath && call.method === "POST"), true);
      assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH"), false);
      assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/professionals"), false);
      const failureMark = calls.find((call) => call.url.pathname === "/rest/v1/stripe_webhook_events" && call.method === "PATCH");
      assertEquals(JSON.parse(failureMark!.body).status, "failed");
      assertEquals(failureMark!.url.searchParams.get("status"), "eq.processing");
      assertEquals(failureMark!.url.searchParams.has("metadata->>processing_claim_token"), true);
      assertEquals(stored.get(eventId)?.status, failPath.endsWith("customers") ? "failed" : "processing");
    });
  }
});

Deno.test("signed paid add-on dispatch writes one session identity across event retries", async () => {
  const purchaseSessions = new Set<string>();
  const route = (call: SignedWebhookCall) => {
    if (call.url.pathname === "/rest/v1/rpc/current_billing_runtime_mode" && call.method === "POST") return webhookJson("test");
    if (call.url.pathname === "/rest/v1/profiles" && call.method === "GET") return webhookJson({ user_id: "user-1" });
    if (call.url.pathname === "/rest/v1/billing_customers" && call.method === "GET") return webhookJson({ user_id: "user-1", stripe_customer_id: "cus_user_1" });
    if (call.url.pathname === "/rest/v1/addon_purchases" && call.method === "POST") {
      purchaseSessions.add(String(JSON.parse(call.body).stripe_session_id));
      return new Response(null, { status: 201 });
    }
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls, stored) => {
    const session = paidPromotionSession();
    const first = await invoke("checkout.session.completed", session, { id: "evt_addon_paid_1" });
    assertEquals(first.response.status, 200);
    assertEquals(stored.get("evt_addon_paid_1")?.status, "processed");
    const duplicate = await invoke("checkout.session.completed", session, { id: "evt_addon_paid_1" });
    assertEquals(duplicate.body.duplicate, true);
    const replay = await invoke("checkout.session.completed", session, { id: "evt_addon_paid_2" });
    assertEquals(replay.response.status, 200);
    const writes = calls.filter((call) => call.url.pathname === "/rest/v1/addon_purchases" && call.method === "POST");
    assertEquals(writes.length, 2);
    assertEquals(purchaseSessions.size, 1);
    assertEquals(JSON.parse(writes[0].body).stripe_session_id, "cs_test_featured");
    assertEquals(JSON.parse(writes[0].body).runtime_mode, "test");
    assertEquals(writes[0].url.searchParams.get("on_conflict"), "stripe_session_id");
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/billing_subscriptions" || call.url.pathname === "/rest/v1/professionals"), false);
  });
});

Deno.test("signed unpaid add-on session is acknowledged without a purchase", async () => {
  await signedWebhookFixture({}, async (invoke, calls) => {
    const result = await invoke("checkout.session.completed", paidPromotionSession({ payment_status: "unpaid" }));
    assertEquals(result.response.status, 200);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/addon_purchases"), false);
  });
});

const trialRow = (overrides: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000111", user_id: "user-1", runtime_mode: "test", livemode: false,
  stripe_customer_id: "cus_trial", stripe_checkout_session_id: null, stripe_subscription_id: null,
  status: "checkout_started", plan_key: "pro", pricing_audience: "participant", trial_days: 7,
  metadata: { checkout_operation_v1: { revision: "00000000-0000-4000-8000-000000000112", dispatch_count: 1, key: "preserved" } }, ...overrides,
});
const trialLedgerRoute = (row: Record<string, unknown>, fail = false, loseCas = false) => (call: SignedWebhookCall) => {
  if (call.url.pathname !== "/rest/v1/subscription_trial_claims") return null;
  const matches = [...call.url.searchParams].every(([key, expected]) => {
    if (key === "select") return true;
    const value = key.startsWith("metadata->checkout_operation_v1->>") ? (row.metadata as { checkout_operation_v1?: Record<string, unknown> })?.checkout_operation_v1?.[key.split(">>")[1]] : row[key];
    return expected === "is.null" ? value === null : expected.startsWith("eq.") && String(value) === expected.slice(3);
  });
  if (call.method === "GET") return webhookJson(matches ? [row] : []);
  if (call.method === "PATCH") {
    if (fail) return webhookJson({ message: "synthetic claim write failure" }, 500);
    if (loseCas || !matches) return webhookJson([]);
    Object.assign(row, JSON.parse(call.body)); return webhookJson([row]);
  }
  throw new Error("unexpected trial ledger verb");
};
Deno.test("signed expired trial binds null session by exact claim and duplicate expiry is harmless", async () => {
  const row = trialRow();
  await signedWebhookFixture({ route: trialLedgerRoute(row) }, async (invoke, calls) => {
    const session = { id: "cs_expired_trial", customer: "cus_trial", subscription: null, livemode: false, metadata: { checkout_type: "subscription_trial", user_id: "user-1", trial_claim_id: row.id } };
    assertEquals((await invoke("checkout.session.expired", session)).response.status, 200);
    assertEquals(row.status, "checkout_abandoned"); assertEquals(row.stripe_checkout_session_id, session.id);
    assertEquals(row.metadata.checkout_operation_v1.key, "preserved");
    assertEquals((await invoke("checkout.session.expired", session)).response.status, 200);
    assertEquals(calls.filter((c) => c.url.pathname === "/rest/v1/subscription_trial_claims" && c.method === "PATCH").length, 1);
    const patch = calls.find((c) => c.url.pathname === "/rest/v1/subscription_trial_claims" && c.method === "PATCH")!;
    assertEquals(patch.url.searchParams.get("stripe_subscription_id"), "is.null");
    assertEquals(patch.url.searchParams.get("metadata->checkout_operation_v1->>revision"), "eq.00000000-0000-4000-8000-000000000112");
  });
});
Deno.test("signed expired legacy trial requires exact linked session and preserves owner runtime customer", async () => {
  const row = trialRow({ metadata: {}, stripe_checkout_session_id: "cs_legacy" });
  await signedWebhookFixture({ route: trialLedgerRoute(row) }, async (invoke) => {
    const result = await invoke("checkout.session.expired", { id: "cs_legacy", customer: "cus_trial", subscription: null, livemode: false, metadata: { checkout_type: "subscription_trial", user_id: "user-1" } });
    assertEquals(result.response.status, 200); assertEquals(row.status, "checkout_abandoned");
  });
});
Deno.test("signed expired trial write failure or lost CAS is retryable rather than released", async () => {
  for (const loseCas of [false, true]) {
    const row = trialRow();
    await signedWebhookFixture({ route: trialLedgerRoute(row, !loseCas, loseCas) }, async (invoke, _calls, stored) => {
      const result = await invoke("checkout.session.expired", { id: "cs_expired_trial", customer: "cus_trial", subscription: null, livemode: false, metadata: { checkout_type: "subscription_trial", user_id: "user-1", trial_claim_id: row.id } }, { id: "evt_claim_write_failure" });
      assertEquals(result.response.status, 500); assertEquals(stored.get("evt_claim_write_failure")?.status, "failed"); assertEquals(row.status, "checkout_started");
    });
  }
});
Deno.test("signed trial expiry rejects identity mismatch old session and consumed admission", async () => {
  for (const change of [
    { customer: "cus_other" }, { livemode: true }, { subscription: "sub_exists" },
    { metadata: { checkout_type: "subscription_trial", user_id: "other", trial_claim_id: "00000000-0000-4000-8000-000000000111" } },
    { metadata: { checkout_type: "subscription_trial", user_id: "user-1", trial_claim_id: "00000000-0000-4000-8000-000000000999" } },
    { metadata: { checkout_type: "subscription_trial", user_id: "user-1" } },
  ]) {
    const row = trialRow();
    await signedWebhookFixture({ route: trialLedgerRoute(row) }, async (invoke) => {
      assertEquals((await invoke("checkout.session.expired", { id: "cs_expired_trial", customer: "cus_trial", subscription: null, livemode: false, metadata: { checkout_type: "subscription_trial", user_id: "user-1", trial_claim_id: row.id }, ...change })).response.status, 500);
      assertEquals(row.status, "checkout_started");
    });
  }
  for (const status of ["trialing", "active", "canceled", "expired", "checkout_created"]) {
    const row = trialRow({ status, stripe_subscription_id: "sub_bound" });
    await signedWebhookFixture({ route: trialLedgerRoute(row) }, async (invoke) => {
      assertEquals((await invoke("checkout.session.expired", { id: "cs_expired_trial", customer: "cus_trial", subscription: null, livemode: false, metadata: { checkout_type: "subscription_trial", user_id: "user-1", trial_claim_id: row.id } })).response.status, 500);
      assertEquals(row.status, status);
    });
  }
});

Deno.test("signed add-on subscription update retrieves canonical state and only updates purchase status", async () => {
  const canonical = {
    id: "sub_addon_canonical", customer: "cus_addon", status: "canceled", livemode: false,
    metadata: { checkout_type: "addon", addon_key: "featured_listing", user_id: "user-1" },
    invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] },
    items: { data: [] },
  };
  const route = (call: SignedWebhookCall) => {
    if (call.url.pathname === "/v1/subscriptions/sub_addon_canonical" && call.method === "GET") return webhookJson(canonical);
    if (call.url.pathname === "/rest/v1/addon_purchases" && call.method === "PATCH") return new Response(null, { status: 204 });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls) => {
    const result = await invoke("customer.subscription.updated", { id: canonical.id, status: "active", customer: canonical.customer, livemode: false });
    assertEquals(result.response.status, 200);
    const update = calls.find((call) => call.url.pathname === "/rest/v1/addon_purchases" && call.method === "PATCH");
    assertEquals(JSON.parse(update!.body).status, "cancelled");
    assertEquals(update!.url.searchParams.get("stripe_subscription_id"), "eq.sub_addon_canonical");
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/profiles" || call.url.pathname === "/rest/v1/billing_subscriptions"), false);
  });
});

Deno.test("signed add-on subscription update failure leaves the event retryable without profile writes", async () => {
  const canonical = { id: "sub_addon_write_failure", customer: "cus_addon_write_failure", status: "canceled", livemode: false, metadata: { checkout_type: "addon", addon_key: "featured_listing" }, invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] }, items: { data: [] } };
  const route = (call: SignedWebhookCall) => {
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_addon_write_failure") return webhookJson(canonical);
    if (call.method === "PATCH" && call.url.pathname === "/rest/v1/addon_purchases") return webhookJson({ message: "synthetic add-on status write failure" }, 500);
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls, stored) => {
    const result = await invoke("customer.subscription.updated", { id: canonical.id, customer: canonical.customer, status: "active", livemode: false }, { id: "evt_addon_write_failure" });
    assertEquals(result.response.status, 500);
    assertEquals(stored.get("evt_addon_write_failure")?.status, "failed");
    const update = calls.find((call) => call.url.pathname === "/rest/v1/addon_purchases" && call.method === "PATCH");
    assertEquals(JSON.parse(update!.body).status, "cancelled");
    assertEquals(update!.url.searchParams.get("stripe_subscription_id"), "eq.sub_addon_write_failure");
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/profiles" || call.url.pathname === "/rest/v1/billing_subscriptions"), false);
  });
});

Deno.test("signed professional subscription cannot update a different actor from conflicting metadata", async () => {
  const actorA = "00000000-0000-4000-8000-000000000081";
  const actorB = "00000000-0000-4000-8000-000000000082";
  const canonical = {
    id: "sub_professional_conflict", customer: "cus_professional_a", status: "active", livemode: false,
    current_period_end: 4102444800,
    metadata: { checkout_type: "subscription", user_id: actorB, plan_key: "professional_pro", audience: "professional", billing_cycle: "monthly" },
    invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] },
    items: { data: [{ id: "si_conflict", current_period_end: 4102444800, price: { id: "price_professional", product: "prod_professional" } }] },
  };
  const route = (call: SignedWebhookCall) => {
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_professional_conflict") return webhookJson(canonical);
    if (call.method === "GET" && call.url.pathname === "/v1/customers/cus_professional_a") return webhookJson({ id: "cus_professional_a", email: "actor-a@maiprop.test", metadata: { user_id: actorA } });
    if (call.method === "GET" && call.url.pathname === "/rest/v1/pricing_configs") return webhookJson([{ key: "professional_pro", audience: "professional", module: "professional_subscription", metadata: { stripe_product_id: "prod_professional", stripe_price_id: "price_professional" } }]);
    if (call.method === "GET" && call.url.pathname === "/rest/v1/profiles") return webhookJson({ role: "professional", participant_type: null, role_switch_in_progress_at: null });
    if (call.method === "POST" && ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"].includes(call.url.pathname)) return new Response(null, { status: 201 });
    if (call.method === "PATCH" && call.url.pathname === "/rest/v1/profiles") return new Response(null, { status: 204 });
    if (call.method === "PATCH" && call.url.pathname === "/rest/v1/professionals") return new Response(null, { status: 204 });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls) => {
    const result = await invoke("customer.subscription.updated", { id: canonical.id, status: "old", customer: canonical.customer, livemode: false });
    assertEquals(result.response.status, 200);
    const customer = calls.find((call) => call.url.pathname === "/rest/v1/billing_customers" && call.method === "POST");
    const subscription = calls.find((call) => call.url.pathname === "/rest/v1/billing_subscriptions" && call.method === "POST");
    assertEquals(JSON.parse(customer!.body).user_id, actorA);
    assertEquals(JSON.parse(subscription!.body).user_id, actorA);
    const profile = calls.find((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH");
    assertEquals(profile!.url.searchParams.get("user_id"), `eq.${actorA}`);
    const professional = calls.find((call) => call.url.pathname === "/rest/v1/professionals" && call.method === "PATCH");
    assertEquals(professional?.url.searchParams.get("user_id"), `eq.${actorA}`, "the subscription's untrusted B metadata must not mutate B's professional entitlement");
  });
});

const agentInvoiceCreditFixture = async (
  mode: "create" | "existing" | "definitive_failure" | "ambiguous_failure" | "finalized_missing" | "finalized_existing" | "finalized_persisted_missing" | "persistence_failure" | "persistence_retry" | "release_failure",
  inspect: (result: { response: Response; body: Record<string, unknown> }, calls: SignedWebhookCall[], context: { retry: () => Promise<{ response: Response; body: Record<string, unknown> }>; stored: Map<string, Record<string, unknown>> }) => void | Promise<void>,
) => {
  const userId = "00000000-0000-4000-8000-000000000091";
  const invoiceId = "in_credit_handler";
  let operationKey = await buildIdempotencyKey("agent-data-input-invoice-credit", [invoiceId, userId]);
  let created = false;
  let persistenceAttempts = 0;
  const credit = () => ({
    id: "ii_credit_handler", object: "invoiceitem", amount: -100, currency: "eur", customer: "cus_credit_handler", invoice: invoiceId,
    metadata: { type: "agent_data_input_discount", user_id: userId, applied_count: "2", applied_pct: "1", operation_key: operationKey, expected_amount_cents: "100", invoice_id: invoiceId },
  });
  const reservations = () => [1, 2].map((n) => ({ id: `adi_credit_${n}`, stripe_credit_id: mode === "finalized_persisted_missing" ? "ii_missing" : null, stripe_credit_expected_amount_cents: 100, stripe_credit_operation_key: operationKey }));
  const route = (call: SignedWebhookCall) => {
    if (call.method === "GET" && call.url.pathname === "/v1/customers/cus_credit_handler") return webhookJson({ id: "cus_credit_handler", metadata: { user_id: userId } });
    if (call.method === "POST" && call.url.pathname === "/rest/v1/rpc/apply_verified_data_input_discount") {
      operationKey = JSON.parse(call.body).p_operation_key;
      return webhookJson({ applied_count: 2, applied_pct: 1, expected_amount_cents: 100, operation_key: operationKey });
    }
    if (call.method === "GET" && call.url.pathname === "/rest/v1/agent_data_inputs") return webhookJson(reservations());
    if (call.method === "PATCH" && call.url.pathname === "/rest/v1/agent_data_inputs") {
      persistenceAttempts += 1;
      return webhookJson(mode === "persistence_failure" || mode === "release_failure" || (mode === "persistence_retry" && persistenceAttempts === 1) ? [{ id: "adi_credit_1" }] : [{ id: "adi_credit_1" }, { id: "adi_credit_2" }]);
    }
    if (call.method === "GET" && call.url.pathname === "/v1/invoiceitems") return webhookJson({ object: "list", data: created || mode === "existing" || mode === "finalized_existing" ? [credit()] : [], has_more: false });
    if (call.method === "POST" && call.url.pathname === "/v1/invoiceitems") {
      if (mode === "definitive_failure" || mode === "release_failure") return webhookJson({ error: { message: "definitive synthetic rejection", type: "invalid_request_error" } }, 400);
      if (mode === "ambiguous_failure") return webhookJson({ error: { message: "ambiguous synthetic provider error", type: "api_error" } }, 500);
      created = true;
      return webhookJson(credit());
    }
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls, stored) => {
    const type = mode.startsWith("finalized_") ? "invoice.finalized" : "invoice.created";
    const object = { id: invoiceId, customer: "cus_credit_handler", status: "draft", billing_reason: "subscription_cycle", subtotal: 10000, currency: "eur", livemode: false };
    const retry = () => invoke(type, object, { id: "evt_credit_same_state" });
    const result = await retry();
    await inspect(result, calls, { retry, stored });
  });
};

Deno.test("signed draft invoice reserves, validates, creates one provider credit, then persists rows", async () => {
  await agentInvoiceCreditFixture("create", (result, calls) => {
    assertEquals(result.response.status, 200);
    const reserve = calls.find((call) => call.url.pathname === "/rest/v1/rpc/apply_verified_data_input_discount");
    const read = calls.find((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "GET");
    const list = calls.find((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "GET");
    const create = calls.find((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST");
    const persist = calls.find((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH");
    assertEquals(Boolean(reserve && read && list && create && persist), true);
    assertEquals(calls.indexOf(reserve!) < calls.indexOf(read!), true);
    assertEquals(calls.indexOf(read!) < calls.indexOf(list!), true);
    assertEquals(calls.indexOf(list!) < calls.indexOf(create!), true);
    assertEquals(calls.indexOf(create!) < calls.indexOf(persist!), true);
    const key = JSON.parse(reserve!.body).p_operation_key;
    assertEquals(create!.form.get("amount"), "-100");
    assertEquals(create!.form.get("invoice"), "in_credit_handler");
    assertEquals(create!.form.get("metadata[operation_key]"), key);
    assertEquals(create!.url.pathname, "/v1/invoiceitems");
    assertEquals(JSON.parse(persist!.body).stripe_credit_id, "ii_credit_handler");
    assertEquals(persist!.url.searchParams.get("user_id"), "eq.00000000-0000-4000-8000-000000000091");
    assertEquals(persist!.url.searchParams.get("discount_invoice_id"), "eq.in_credit_handler");
  });
});

Deno.test("signed draft invoice finds canonical existing credit and never creates a duplicate", async () => {
  await agentInvoiceCreditFixture("existing", (result, calls) => {
    assertEquals(result.response.status, 200);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST").length, 0);
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH").length, 1);
  });
});

Deno.test("signed draft invoice releases reservations on definitive Stripe rejection", async () => {
  await agentInvoiceCreditFixture("definitive_failure", (result, calls) => {
    assertEquals(result.response.status, 200);
    const release = calls.find((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH");
    assertEquals(JSON.parse(release!.body).discount_applied, false);
    assertEquals(release!.url.searchParams.get("discount_invoice_id"), "eq.in_credit_handler");
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST").length, 1);
  });
});

Deno.test("signed draft invoice keeps reservations retryable after ambiguous Stripe failure", async () => {
  await agentInvoiceCreditFixture("ambiguous_failure", async (result, calls, context) => {
    assertEquals(result.response.status, 500);
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH").length, 0);
    const beforeRetry = calls.filter((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST");
    assertEquals(beforeRetry.length > 0, true);
    assertEquals(beforeRetry[0].form.get("description"), "Data Input reward \u2014 2 verified closing(s) \u00d7 0.5% (1% off)");
    assertEquals(beforeRetry[0].key, beforeRetry[0].form.get("metadata[operation_key]"));
    assertEquals((await context.retry()).response.status, 500);
    const allCreates = calls.filter((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST");
    assertEquals(allCreates.length > beforeRetry.length, true);
    assertEquals(allCreates.every((call) => call.key === beforeRetry[0].key && call.body === beforeRetry[0].body), true);
  });
});

Deno.test("signed draft invoice reports persistence failure after provider credit and keeps reservation", async () => {
  await agentInvoiceCreditFixture("persistence_failure", (result, calls) => {
    assertEquals(result.response.status, 500);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST").length, 1);
    const patches = calls.filter((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH");
    assertEquals(patches.length, 1);
    assertEquals(JSON.parse(patches[0].body).stripe_credit_id, "ii_credit_handler");
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH" && JSON.parse(call.body).discount_applied === false), false);
  });
});

Deno.test("signed draft invoice retry finds the provider credit created before failed durable persistence", async () => {
  await agentInvoiceCreditFixture("persistence_retry", async (first, calls, context) => {
    assertEquals(first.response.status, 500);
    assertEquals(context.stored.get("evt_credit_same_state")?.status, "failed");
    const firstCreates = calls.filter((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST");
    const firstPatches = calls.filter((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH");
    assertEquals(firstCreates.length, 1);
    assertEquals(firstCreates[0].form.get("description"), "Data Input reward \u2014 2 verified closing(s) \u00d7 0.5% (1% off)");
    assertEquals(firstPatches.length, 1);
    assertEquals(JSON.parse(firstPatches[0].body).stripe_credit_id, "ii_credit_handler");
    const firstKey = firstCreates[0].form.get("metadata[operation_key]");
    const beforeRetry = calls.length;
    const second = await context.retry();
    assertEquals(second.response.status, 200);
    assertEquals(context.stored.get("evt_credit_same_state")?.status, "processed");
    const retried = calls.slice(beforeRetry);
    const secondReservation = retried.find((call) => call.url.pathname === "/rest/v1/rpc/apply_verified_data_input_discount");
    const secondList = retried.find((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "GET");
    const secondPersist = retried.find((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH");
    assertEquals(Boolean(secondReservation && secondList && secondPersist), true);
    assertEquals(JSON.parse(secondReservation!.body).p_operation_key, firstKey);
    assertEquals(calls.indexOf(secondReservation!) < calls.indexOf(secondList!), true);
    assertEquals(calls.indexOf(secondList!) < calls.indexOf(secondPersist!), true);
    assertEquals(retried.some((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST"), false);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST").length, 1);
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH").length, 2);
    assertEquals(JSON.parse(secondPersist!.body).stripe_credit_id, "ii_credit_handler");
  });
});

Deno.test("signed invoice finalization persists canonical credit or releases unfulfilled reservations", async () => {
  await agentInvoiceCreditFixture("finalized_existing", (result, calls) => {
    assertEquals(result.response.status, 200);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST").length, 0);
    const patch = calls.find((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH");
    assertEquals(JSON.parse(patch!.body).stripe_credit_id, "ii_credit_handler");
  });
  await agentInvoiceCreditFixture("finalized_missing", (result, calls) => {
    assertEquals(result.response.status, 200);
    const patch = calls.find((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH");
    assertEquals(JSON.parse(patch!.body).discount_applied, false);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/invoiceitems" && call.method === "POST").length, 0);
  });
});

Deno.test("signed invoice finalization refuses persisted credit absent from Stripe", async () => {
  await agentInvoiceCreditFixture("finalized_persisted_missing", (result, calls) => {
    assertEquals(result.response.status, 500);
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH").length, 0);
  });
});

Deno.test("signed invoice credit release-row mismatch fails the event", async () => {
  await agentInvoiceCreditFixture("release_failure", (result, calls) => {
    assertEquals(result.response.status, 500);
    const patch = calls.find((call) => call.url.pathname === "/rest/v1/agent_data_inputs" && call.method === "PATCH");
    assertEquals(JSON.parse(patch!.body).discount_applied, false);
  });
});

Deno.test("signed tagged refund stays failed until purchase exists, then reconciles immutable identity", async () => {
  let purchaseExists = false;
  const purchase = { id: "purchase_refund_handler", user_id: "user-1", addon_key: "featured_listing", stripe_payment_intent_id: "pi_refund_handler", stripe_customer_id: "cus_refund_handler", stripe_amount_total: 3900, runtime_mode: "test", livemode: false };
  const route = (call: SignedWebhookCall) => {
    if (call.method === "GET" && call.url.pathname === "/v1/payment_intents/pi_refund_handler") return webhookJson({ id: "pi_refund_handler", metadata: { checkout_type: "addon", addon_key: "featured_listing" } });
    if (call.method === "GET" && call.url.pathname === "/rest/v1/addon_purchases") return webhookJson(purchaseExists ? purchase : null);
    if (call.method === "POST" && call.url.pathname === "/rest/v1/rpc/reconcile_addon_refund_event") return webhookJson({ credits_refunded: 1 });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls, stored) => {
    const refund = {
      id: "re_refund_handler", object: "refund", amount: 1300, status: "succeeded", livemode: false,
      charge: { id: "ch_refund_handler", object: "charge", amount: 3900, customer: "cus_refund_handler", payment_intent: "pi_refund_handler", currency: "eur" },
      payment_intent: "pi_refund_handler", metadata: { checkout_type: "addon", addon_key: "featured_listing", stripe_session_id: "cs_refund_handler" },
    };
    const first = await invoke("refund.updated", refund, { id: "evt_refund_handler" });
    assertEquals(first.response.status, 500);
    assertEquals(stored.get("evt_refund_handler")?.status, "failed");
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/rpc/reconcile_addon_refund_event"), false);
    purchaseExists = true;
    const retry = await invoke("refund.updated", refund, { id: "evt_refund_handler" });
    assertEquals(retry.response.status, 200);
    assertEquals(stored.get("evt_refund_handler")?.status, "processed");
    const rpc = calls.find((call) => call.url.pathname === "/rest/v1/rpc/reconcile_addon_refund_event");
    const payload = JSON.parse(rpc!.body);
    assertEquals(payload.p_purchase_id, "purchase_refund_handler");
    assertEquals(payload.p_stripe_refund_id, "re_refund_handler");
    assertEquals(payload.p_refunded_amount, 1300);
    assertEquals(payload.p_total_amount, 3900);
    assertEquals(payload.p_runtime_mode, "test");
    assertEquals(rpc!.url.pathname, "/rest/v1/rpc/reconcile_addon_refund_event");
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/addon_purchases" && call.method !== "GET"), false);
  });
});

Deno.test("signed investor payment activates only the exact pending user-tier-session row", async () => {
  const userId = "00000000-0000-4000-8000-000000000092";
  const session = { id: "cs_investor_handler", customer: "cus_investor_handler", payment_status: "paid", mode: "payment", livemode: false, metadata: { checkout_type: "investor_payment", user_id: userId, plan_key: "investor_private", access_period_days: "365" } };
  const route = (call: SignedWebhookCall) => {
    if (call.url.pathname === "/rest/v1/investor_subscriptions" && call.method === "PATCH") return webhookJson({ id: "is_investor_handler", status: "active", stripe_session_id: session.id });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls) => {
    const result = await invoke("checkout.session.completed", session);
    assertEquals(result.response.status, 200);
    const update = calls.find((call) => call.url.pathname === "/rest/v1/investor_subscriptions" && call.method === "PATCH");
    assertEquals(update!.url.searchParams.get("user_id"), `eq.${userId}`);
    assertEquals(update!.url.searchParams.get("tier"), "eq.private");
    assertEquals(update!.url.searchParams.get("stripe_session_id"), "eq.cs_investor_handler");
    assertEquals(update!.url.searchParams.get("status"), "eq.pending_payment");
    const payload = JSON.parse(update!.body);
    assertEquals(payload.runtime_mode, "test");
    assertEquals(payload.status, "active");
    assertEquals(new Date(payload.expires_at).getTime() - new Date(payload.started_at).getTime(), 365 * 86400000);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/billing_subscriptions" || call.url.pathname === "/rest/v1/addon_purchases"), false);
  });
});

Deno.test("signed unpaid investor session acknowledges without activating", async () => {
  await signedWebhookFixture({}, async (invoke, calls) => {
    const result = await invoke("checkout.session.completed", { id: "cs_investor_unpaid", payment_status: "unpaid", livemode: false, metadata: { checkout_type: "investor_payment", user_id: "user-1", plan_key: "investor_private" } });
    assertEquals(result.response.status, 200);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/investor_subscriptions"), false);
  });
});

Deno.test("signed schedule and invoice events retrieve the named canonical add-on subscription", async () => {
  const canonical = { id: "sub_schedule_handler", customer: "cus_schedule_handler", status: "active", livemode: false, metadata: { checkout_type: "addon", addon_key: "valuation_single" }, invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] }, items: { data: [] } };
  const route = (call: SignedWebhookCall) => {
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_schedule_handler") return webhookJson(canonical);
    if (call.method === "PATCH" && call.url.pathname === "/rest/v1/addon_purchases") return new Response(null, { status: 204 });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls) => {
    const schedule = await invoke("subscription_schedule.updated", { id: "sub_sched_1", subscription: { id: canonical.id } });
    assertEquals(schedule.response.status, 200);
    const invoice = await invoke("invoice.payment_succeeded", { id: "in_schedule_1", customer: null, parent: { subscription_details: { subscription: canonical.id } } });
    assertEquals(invoice.response.status, 200);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/subscriptions/sub_schedule_handler").length, 2);
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/addon_purchases" && call.method === "PATCH").length, 2);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/profiles"), false);
  });
});

Deno.test("signed invoice payment without subscription finishes without entitlement mutation", async () => {
  await signedWebhookFixture({}, async (invoke, calls) => {
    const result = await invoke("invoice.payment_failed", { id: "in_no_subscription", customer: null, subscription: null });
    assertEquals(result.response.status, 200);
    assertEquals(calls.some((call) => call.url.pathname.startsWith("/v1/subscriptions/") || call.url.pathname === "/rest/v1/profiles"), false);
  });
});

type EntitlementFailureStep = "profile" | "professional" | "manual" | "lapse";
type EntitlementFailurePath = "active" | "terminal" | "deleted";

const signedEntitlementFailureFixture = async (
  path: EntitlementFailurePath,
  step: EntitlementFailureStep,
  inspect: (context: {
    first: { response: Response; body: Record<string, unknown> };
    retry: () => Promise<{ response: Response; body: Record<string, unknown> }>;
    calls: SignedWebhookCall[];
    stored: Map<string, Record<string, unknown>>;
    actor: string;
  }) => void | Promise<void>,
) => {
  const actor = "00000000-0000-4000-8000-000000000093";
  const canonical = {
    id: `sub_entitlement_${path}`, customer: `cus_entitlement_${path}`,
    status: path === "active" ? "active" : "canceled", livemode: false,
    current_period_end: 4102444800,
    metadata: { checkout_type: "subscription", user_id: actor, plan_key: "professional_pro", audience: "professional" },
    invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] },
    items: { data: [{ current_period_end: 4102444800, price: { id: "price_professional", product: "prod_professional" } }] },
  };
  let fail = true;
  const route = (call: SignedWebhookCall) => {
    if (call.method === "GET" && call.url.pathname === `/v1/subscriptions/${canonical.id}`) return webhookJson(canonical);
    if (call.method === "GET" && call.url.pathname === `/v1/customers/${canonical.customer}`) return webhookJson({ id: canonical.customer, metadata: { user_id: actor } });
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions") return webhookJson({ object: "list", data: [], has_more: false });
    if (call.method === "GET" && call.url.pathname === "/rest/v1/pricing_configs") return webhookJson([{ key: "professional_pro", audience: "professional", module: "professional_subscription", metadata: { stripe_product_id: "prod_professional", stripe_price_id: "price_professional" } }]);
    if (call.method === "GET" && call.url.pathname === "/rest/v1/profiles") {
      if (call.url.searchParams.get("select")?.includes("force_pro_access")) {
        return fail && step === "manual"
          ? webhookJson({ message: "synthetic manual lookup failure" }, 500)
          : webhookJson({ role: "professional", force_pro_access: false, is_platform_admin: false });
      }
      return webhookJson({ role: "professional", role_switch_in_progress_at: null });
    }
    if (call.method === "POST" && ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"].includes(call.url.pathname)) return new Response(null, { status: 201 });
    if (call.method === "PATCH" && call.url.pathname === "/rest/v1/profiles") return fail && step === "profile" ? webhookJson({ message: "synthetic profile persistence failure" }, 500) : new Response(null, { status: 204 });
    if (call.method === "PATCH" && call.url.pathname === "/rest/v1/professionals") return fail && step === "professional" ? webhookJson({ message: "synthetic professional persistence failure" }, 500) : new Response(null, { status: 204 });
    if (call.method === "POST" && call.url.pathname === "/rest/v1/rpc/apply_subscription_lapse_controls") return fail && step === "lapse" ? webhookJson({ message: "synthetic lapse persistence failure" }, 500) : webhookJson({ applied: true });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls, stored) => {
    const type = path === "deleted" ? "customer.subscription.deleted" : "customer.subscription.updated";
    const event = { id: canonical.id, customer: canonical.customer, livemode: false, status: "old" };
    const overrides = { id: `evt_entitlement_${path}_${step}` };
    const retry = () => invoke(type, event, overrides);
    const first = await retry();
    await inspect({ first, retry: () => { fail = false; return retry(); }, calls, stored, actor });
  });
};

for (const [path, step, later] of [
  ["active", "profile", ["/rest/v1/professionals"]],
  ["active", "professional", []],
  ["terminal", "manual", ["/rest/v1/profiles#PATCH", "/rest/v1/professionals", "/rest/v1/rpc/apply_subscription_lapse_controls"]],
  ["terminal", "profile", ["/rest/v1/professionals", "/rest/v1/rpc/apply_subscription_lapse_controls"]],
  ["terminal", "professional", ["/rest/v1/rpc/apply_subscription_lapse_controls"]],
  ["terminal", "lapse", []],
  ["deleted", "profile", ["/rest/v1/professionals", "/rest/v1/rpc/apply_subscription_lapse_controls"]],
  ["deleted", "manual", ["/rest/v1/professionals", "/rest/v1/rpc/apply_subscription_lapse_controls"]],
  ["deleted", "professional", ["/rest/v1/rpc/apply_subscription_lapse_controls"]],
  ["deleted", "lapse", []],
] as const) {
  Deno.test(`signed ${path} subscription ${step} failure leaves event retryable`, async () => {
    await signedEntitlementFailureFixture(path, step, ({ first, calls, stored, actor }) => {
      assertEquals(first.response.status, 500);
      assertEquals(String(first.body.error).includes(actor), true);
      assertEquals(String(first.body.error).includes("synthetic"), true);
      assertEquals(stored.get(`evt_entitlement_${path}_${step}`)?.status, "failed");
      assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/billing_subscriptions" && call.method === "POST" && JSON.parse(call.body).user_id === actor), true);
      const failurePath = step === "profile" ? "/rest/v1/profiles" : step === "professional" ? "/rest/v1/professionals" : step === "manual" ? "/rest/v1/profiles" : "/rest/v1/rpc/apply_subscription_lapse_controls";
      const failing = calls.findLast((call) => call.url.pathname === failurePath && (step === "manual" ? call.method === "GET" && call.url.searchParams.get("select")?.includes("force_pro_access") : step === "lapse" ? call.method === "POST" : call.method === "PATCH"));
      assertEquals(Boolean(failing), true);
      assertEquals(failing!.url.searchParams.get("user_id") ?? (step === "lapse" ? JSON.parse(failing!.body).p_user_id : null), step === "lapse" ? actor : `eq.${actor}`);
      const after = calls.slice(calls.indexOf(failing!) + 1);
      for (const forbidden of later) {
        const [pathName, method] = forbidden.split("#");
        assertEquals(after.some((call) => call.url.pathname === pathName && (!method || call.method === method)), false);
      }
      assertEquals(after.filter((call) => call.url.pathname === "/rest/v1/stripe_webhook_events" && call.method === "PATCH").map((call) => JSON.parse(call.body).status), ["failed"]);
    });
  });
}

Deno.test("signed active subscription reclaims a failed event and persists both entitlements from canonical state", async () => {
  await signedEntitlementFailureFixture("active", "profile", async ({ first, retry, calls, stored, actor }) => {
    assertEquals(first.response.status, 500);
    assertEquals(stored.get("evt_entitlement_active_profile")?.status, "failed");
    const retryStart = calls.length;
    const second = await retry();
    assertEquals(second.response.status, 200);
    assertEquals(stored.get("evt_entitlement_active_profile")?.status, "processed");
    const retryCalls = calls.slice(retryStart);
    assertEquals(retryCalls.filter((call) => call.url.pathname === "/v1/subscriptions/sub_entitlement_active" && call.method === "GET").length, 1);
    const profile = retryCalls.find((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH");
    const professional = retryCalls.find((call) => call.url.pathname === "/rest/v1/professionals" && call.method === "PATCH");
    assertEquals(Boolean(profile && professional), true);
    assertEquals(profile!.url.searchParams.get("user_id"), `eq.${actor}`);
    assertEquals(JSON.parse(profile!.body).subscription_product_id, "prod_professional");
    assertEquals(professional!.url.searchParams.get("user_id"), `eq.${actor}`);
    assertEquals(JSON.parse(professional!.body).subscription_tier, "pro");
    assertEquals(retryCalls.indexOf(profile!) < retryCalls.indexOf(professional!), true);
    const ledgerUpdates = retryCalls.filter((call) => call.url.pathname === "/rest/v1/stripe_webhook_events" && call.method === "PATCH");
    assertEquals(ledgerUpdates.map((call) => JSON.parse(call.body).status), ["processing", "processed"]);
  });
});

Deno.test("signed professional subscription uses customer actor with matching or missing subscription actor", async () => {
  const actor = "00000000-0000-4000-8000-000000000081";
  for (const subscriptionActor of [actor, undefined]) {
    const canonical = {
      id: "sub_professional_actor", customer: "cus_professional_actor", status: "active", livemode: false,
      current_period_end: 4102444800,
      metadata: { checkout_type: "subscription", ...(subscriptionActor ? { user_id: subscriptionActor } : {}), plan_key: "professional_pro", audience: "professional" },
      invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] },
      items: { data: [{ id: "si_actor", current_period_end: 4102444800, price: { id: "price_professional", product: "prod_professional" } }] },
    };
    const route = (call: SignedWebhookCall) => {
      if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_professional_actor") return webhookJson(canonical);
      if (call.method === "GET" && call.url.pathname === "/v1/customers/cus_professional_actor") return webhookJson({ id: canonical.customer, email: "actor@maiprop.test", metadata: { user_id: actor } });
      if (call.method === "GET" && call.url.pathname === "/rest/v1/pricing_configs") return webhookJson([{ key: "professional_pro", audience: "professional", module: "professional_subscription", metadata: { stripe_product_id: "prod_professional", stripe_price_id: "price_professional" } }]);
      if (call.method === "GET" && call.url.pathname === "/rest/v1/profiles") return webhookJson({ role: "professional", participant_type: null, role_switch_in_progress_at: null });
      if (call.method === "POST" && ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"].includes(call.url.pathname)) return new Response(null, { status: 201 });
      if (call.method === "PATCH" && ["/rest/v1/profiles", "/rest/v1/professionals"].includes(call.url.pathname)) return new Response(null, { status: 204 });
      return null;
    };
    await signedWebhookFixture({ route }, async (invoke, calls) => {
      const result = await invoke("customer.subscription.updated", { id: canonical.id, customer: canonical.customer, livemode: false });
      assertEquals(result.response.status, 200);
      const professional = calls.filter((call) => call.url.pathname === "/rest/v1/professionals" && call.method === "PATCH");
      assertEquals(professional.length, 1);
      assertEquals(professional[0].url.searchParams.get("user_id"), `eq.${actor}`);
      assertEquals(JSON.parse(professional[0].body).subscription_tier, "pro");
    });
  }
});

Deno.test("signed deleted professional subscription keeps manual access on customer actor", async () => {
  const actorA = "00000000-0000-4000-8000-000000000081";
  const actorB = "00000000-0000-4000-8000-000000000082";
  const canonical = {
    id: "sub_professional_deleted", customer: "cus_professional_deleted", status: "canceled", livemode: false,
    metadata: { checkout_type: "subscription", user_id: actorB, plan_key: "professional_pro", audience: "professional" },
    items: { data: [{ id: "si_deleted", price: { id: "price_professional", product: "prod_professional" } }] },
  };
  const route = (call: SignedWebhookCall) => {
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_professional_deleted") return webhookJson(canonical);
    if (call.method === "GET" && call.url.pathname === "/v1/customers/cus_professional_deleted") return webhookJson({ id: canonical.customer, email: "actor-a@maiprop.test", metadata: { user_id: actorA } });
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions") return webhookJson({ data: [], has_more: false, object: "list", url: "/v1/subscriptions" });
    if (call.method === "GET" && call.url.pathname === "/rest/v1/pricing_configs") return webhookJson([{ key: "professional_pro", audience: "professional", module: "professional_subscription", metadata: { stripe_product_id: "prod_professional", stripe_price_id: "price_professional" } }]);
    if (call.method === "GET" && call.url.pathname === "/rest/v1/profiles") {
      return webhookJson(call.url.searchParams.get("select")?.includes("force_pro_access")
        ? { role: "professional", force_pro_access: true, is_platform_admin: false }
        : { role: "professional", participant_type: null, role_switch_in_progress_at: null });
    }
    if (call.method === "POST" && ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"].includes(call.url.pathname)) return new Response(null, { status: 201 });
    if (call.method === "PATCH" && ["/rest/v1/profiles", "/rest/v1/professionals"].includes(call.url.pathname)) return new Response(null, { status: 204 });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls) => {
    const result = await invoke("customer.subscription.deleted", { id: canonical.id, customer: canonical.customer, livemode: false });
    assertEquals(result.response.status, 200);
    const customer = calls.find((call) => call.url.pathname === "/rest/v1/billing_customers" && call.method === "POST");
    const subscription = calls.find((call) => call.url.pathname === "/rest/v1/billing_subscriptions" && call.method === "POST");
    assertEquals(JSON.parse(customer!.body).user_id, actorA);
    assertEquals(JSON.parse(subscription!.body).user_id, actorA);
    const profile = calls.find((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH");
    assertEquals(profile!.url.searchParams.get("user_id"), `eq.${actorA}`);
    assertEquals(JSON.parse(profile!.body).subscription_product_id, null);
    const professional = calls.filter((call) => call.url.pathname === "/rest/v1/professionals" && call.method === "PATCH");
    assertEquals(professional.length, 1);
    assertEquals(professional[0].url.searchParams.get("user_id"), `eq.${actorA}`);
    assertEquals(JSON.parse(professional[0].body).subscription_tier, "pro");
  });
});

Deno.test("signed deleted subscription syncs a replacement before any entitlement clear", async () => {
  const actor = "00000000-0000-4000-8000-000000000094";
  const customer = "cus_replacement_handler";
  const deleted = { id: "sub_deleted_handler", customer, status: "canceled", livemode: false, metadata: { plan_key: "professional_pro", audience: "professional" }, items: { data: [{ price: { id: "price_professional", product: "prod_professional" } }] } };
  const replacement = { id: "sub_replacement_handler", customer, status: "active", livemode: false, created: 1800000000, current_period_end: 4102444800, metadata: { plan_key: "professional_pro", audience: "professional" }, invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] }, items: { data: [{ current_period_end: 4102444800, price: { id: "price_professional", product: "prod_professional" } }] } };
  const route = (call: SignedWebhookCall) => {
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_deleted_handler") return webhookJson(deleted);
    if (call.method === "GET" && call.url.pathname === "/v1/customers/cus_replacement_handler") return webhookJson({ id: customer, metadata: { user_id: actor } });
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions") return webhookJson({ object: "list", data: [replacement], has_more: false });
    if (call.method === "GET" && call.url.pathname === "/rest/v1/pricing_configs") return webhookJson([{ key: "professional_pro", audience: "professional", module: "professional_subscription", metadata: { stripe_product_id: "prod_professional", stripe_price_id: "price_professional" } }]);
    if (call.method === "GET" && call.url.pathname === "/rest/v1/profiles") return webhookJson({ role: "professional", role_switch_in_progress_at: null });
    if (call.method === "POST" && ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"].includes(call.url.pathname)) return new Response(null, { status: 201 });
    if (call.method === "PATCH" && ["/rest/v1/profiles", "/rest/v1/professionals"].includes(call.url.pathname)) return new Response(null, { status: 204 });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls) => {
    const result = await invoke("customer.subscription.deleted", { id: deleted.id, customer, livemode: false });
    assertEquals(result.response.status, 200);
    const history = calls.filter((call) => call.url.pathname === "/rest/v1/billing_subscriptions" && call.method === "POST");
    assertEquals(history.map((call) => JSON.parse(call.body).stripe_subscription_id), [deleted.id, replacement.id]);
    const profile = calls.filter((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH");
    assertEquals(profile.length, 1);
    assertEquals(profile[0].url.searchParams.get("user_id"), `eq.${actor}`);
    assertEquals(JSON.parse(profile[0].body).subscription_product_id, "prod_professional");
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/rpc/apply_subscription_lapse_controls"), false);
  });
});

Deno.test("signed subscription during role switch stores history despite invoice-settings failure", async () => {
  const actor = "00000000-0000-4000-8000-000000000095";
  const canonical = { id: "sub_role_switch_handler", customer: "cus_role_switch_handler", status: "active", livemode: false, current_period_end: 4102444800, metadata: { plan_key: "professional_pro", audience: "professional" }, invoice_settings: { custom_fields: [] }, items: { data: [{ current_period_end: 4102444800, price: { id: "price_professional", product: "prod_professional" } }] } };
  const route = (call: SignedWebhookCall) => {
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_role_switch_handler") return webhookJson(canonical);
    if (call.method === "POST" && call.url.pathname === "/v1/subscriptions/sub_role_switch_handler") return webhookJson({ error: { type: "invalid_request_error", message: "synthetic invoice settings rejection" } }, 400);
    if (call.method === "GET" && call.url.pathname === "/v1/customers/cus_role_switch_handler") return webhookJson({ id: canonical.customer, metadata: { user_id: actor } });
    if (call.method === "GET" && call.url.pathname === "/rest/v1/pricing_configs") return webhookJson([{ key: "professional_pro", audience: "professional", module: "professional_subscription", metadata: { stripe_product_id: "prod_professional", stripe_price_id: "price_professional" } }]);
    if (call.method === "GET" && call.url.pathname === "/rest/v1/profiles") return webhookJson({ role: "professional", role_switch_in_progress_at: "2026-09-30T00:00:00Z" });
    if (call.method === "POST" && ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"].includes(call.url.pathname)) return new Response(null, { status: 201 });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls) => {
    const result = await invoke("customer.subscription.updated", { id: canonical.id, customer: canonical.customer, status: "older", livemode: false });
    assertEquals(result.response.status, 200);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/subscriptions/sub_role_switch_handler" && call.method === "POST").length > 0, true);
    const history = calls.find((call) => call.url.pathname === "/rest/v1/billing_subscriptions" && call.method === "POST");
    assertEquals(JSON.parse(history!.body).user_id, actor);
    assertEquals(JSON.parse(history!.body).status, "active");
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH"), false);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/professionals"), false);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/rpc/apply_subscription_lapse_controls"), false);
  });
});

Deno.test("signed canonical trial subscription updates the actor claim after billing and entitlement writes", async () => {
  const actor = "00000000-0000-4000-8000-000000000096";
  const canonical = { id: "sub_trial_handler", customer: "cus_trial_handler", status: "trialing", livemode: false, trial_end: 4102444800, metadata: { checkout_type: "subscription_trial", user_id: actor, plan_key: "pro", audience: "participant" }, invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] }, items: { data: [{ current_period_end: 4102444800, price: { id: "price_pro", product: "prod_pro" } }] } };
  const row = trialRow({ user_id: actor, stripe_customer_id: "cus_trial_handler", stripe_subscription_id: "sub_trial_handler", metadata: {} });
  const trialRoute = trialLedgerRoute(row);
  const route = (call: SignedWebhookCall) => {
    const trial = trialRoute(call); if (trial) return trial;
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_trial_handler") return webhookJson(canonical);
    if (call.method === "GET" && call.url.pathname === "/v1/customers/cus_trial_handler") return webhookJson({ id: canonical.customer, metadata: { user_id: actor } });
    if (call.method === "GET" && call.url.pathname === "/rest/v1/pricing_configs") return webhookJson([{ key: "pro", audience: "participant", module: "user_subscription", metadata: { stripe_product_id: "prod_pro", stripe_price_id: "price_pro" } }]);
    if (call.method === "GET" && call.url.pathname === "/rest/v1/profiles") return webhookJson({ role: "buyer", participant_type: "buyer", role_switch_in_progress_at: null });
    if (call.method === "POST" && ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"].includes(call.url.pathname)) return new Response(null, { status: 201 });
    if (call.method === "PATCH" && ["/rest/v1/profiles", "/rest/v1/subscription_trial_claims"].includes(call.url.pathname)) return new Response(null, { status: 204 });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls) => {
    const result = await invoke("customer.subscription.updated", { id: canonical.id, customer: canonical.customer, status: "active", livemode: false });
    assertEquals(result.response.status, 200);
    const history = calls.find((call) => call.url.pathname === "/rest/v1/billing_subscriptions" && call.method === "POST");
    const profile = calls.find((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH");
    const claim = calls.find((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "PATCH");
    assertEquals(Boolean(history && profile && claim), true);
    assertEquals(calls.indexOf(history!) < calls.indexOf(profile!), true);
    assertEquals(calls.indexOf(profile!) < calls.indexOf(claim!), true);
    assertEquals(JSON.parse(history!.body).status, "trialing");
    assertEquals(JSON.parse(profile!.body).subscription_product_id, "prod_pro");
    assertEquals(JSON.parse(claim!.body).status, "trialing");
    assertEquals(claim!.url.searchParams.get("user_id"), `eq.${actor}`);
    assertEquals(claim!.url.searchParams.get("stripe_subscription_id"), "eq.sub_trial_handler");
  });
});

Deno.test("signed deleted subscription without replacement clears and lapses the customer actor", async () => {
  const actor = "00000000-0000-4000-8000-000000000097";
  const canonical = { id: "sub_deleted_lapse_handler", customer: "cus_deleted_lapse_handler", status: "canceled", livemode: false, metadata: { plan_key: "professional_pro", audience: "professional" }, items: { data: [{ price: { id: "price_professional", product: "prod_professional" } }] } };
  const route = (call: SignedWebhookCall) => {
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_deleted_lapse_handler") return webhookJson(canonical);
    if (call.method === "GET" && call.url.pathname === "/v1/customers/cus_deleted_lapse_handler") return webhookJson({ id: canonical.customer, metadata: { user_id: actor } });
    if (call.method === "GET" && call.url.pathname === "/v1/subscriptions") return webhookJson({ object: "list", data: [], has_more: false });
    if (call.method === "GET" && call.url.pathname === "/rest/v1/pricing_configs") return webhookJson([{ key: "professional_pro", audience: "professional", module: "professional_subscription", metadata: { stripe_product_id: "prod_professional", stripe_price_id: "price_professional" } }]);
    if (call.method === "GET" && call.url.pathname === "/rest/v1/profiles") return webhookJson(call.url.searchParams.get("select")?.includes("force_pro_access") ? { role: "professional", force_pro_access: false, is_platform_admin: false } : { role: "professional", role_switch_in_progress_at: null });
    if (call.method === "POST" && ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"].includes(call.url.pathname)) return new Response(null, { status: 201 });
    if (call.method === "PATCH" && ["/rest/v1/profiles", "/rest/v1/professionals"].includes(call.url.pathname)) return new Response(null, { status: 204 });
    if (call.method === "POST" && call.url.pathname === "/rest/v1/rpc/apply_subscription_lapse_controls") return webhookJson({ applied: true });
    return null;
  };
  await signedWebhookFixture({ route }, async (invoke, calls) => {
    const result = await invoke("customer.subscription.deleted", { id: canonical.id, customer: canonical.customer, livemode: false });
    assertEquals(result.response.status, 200);
    const profile = calls.find((call) => call.url.pathname === "/rest/v1/profiles" && call.method === "PATCH");
    const professional = calls.find((call) => call.url.pathname === "/rest/v1/professionals" && call.method === "PATCH");
    const lapse = calls.find((call) => call.url.pathname === "/rest/v1/rpc/apply_subscription_lapse_controls");
    assertEquals(Boolean(profile && professional && lapse), true);
    assertEquals(calls.indexOf(profile!) < calls.indexOf(professional!), true);
    assertEquals(calls.indexOf(professional!) < calls.indexOf(lapse!), true);
    assertEquals(profile!.url.searchParams.get("user_id"), `eq.${actor}`);
    assertEquals(JSON.parse(profile!.body).subscription_product_id, null);
    assertEquals(professional!.url.searchParams.get("user_id"), `eq.${actor}`);
    assertEquals(JSON.parse(professional!.body).subscription_tier, "free");
    assertEquals(JSON.parse(lapse!.body).p_user_id, actor);
  });
});

Deno.test("signed trial completion cross-checks both objects before any claim mutation", async () => {
  for (const [mismatch, legacy] of [[false, false], [true, false], [false, true]]) {
    const actor = "00000000-0000-4000-8000-000000000096";
    const row = trialRow({ user_id: actor, stripe_customer_id: "cus_trial_handler", ...(legacy ? { stripe_checkout_session_id: "cs_completion", metadata: {} } : {}) });
    const metadata = { checkout_type: "subscription_trial", ...(legacy ? {} : { trial_claim_id: row.id }), user_id: actor, plan_key: "pro", audience: "participant" };
    const canonical = { id: "sub_trial_handler", customer: "cus_trial_handler", status: "trialing", livemode: false, metadata,
      invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] }, items: { data: [{ current_period_end: 4102444800, price: { id: "price_pro", product: "prod_pro" } }] } };
    const trialRoute = trialLedgerRoute(row);
    const route = (call: SignedWebhookCall) => {
      const trial = trialRoute(call); if (trial) return trial;
      if (call.method === "GET" && call.url.pathname === "/v1/subscriptions/sub_trial_handler") return webhookJson(canonical);
      if (call.method === "GET" && call.url.pathname === "/v1/customers/cus_trial_handler") return webhookJson({ id: canonical.customer, metadata: { user_id: actor } });
      if (call.method === "GET" && call.url.pathname === "/rest/v1/pricing_configs") return webhookJson([{ key: "pro", audience: "participant", module: "user_subscription", metadata: { stripe_product_id: "prod_pro", stripe_price_id: "price_pro" } }]);
      if (call.method === "GET" && call.url.pathname === "/rest/v1/profiles") return webhookJson({ role: "buyer", participant_type: "buyer", role_switch_in_progress_at: null });
      if (call.method === "POST" && ["/rest/v1/billing_customers", "/rest/v1/billing_subscriptions"].includes(call.url.pathname)) return new Response(null, { status: 201 });
      if (call.method === "PATCH" && call.url.pathname === "/rest/v1/profiles") return new Response(null, { status: 204 });
      return null;
    };
    await signedWebhookFixture({ route }, async (invoke, calls) => {
      const session = { id: "cs_completion", customer: canonical.customer, subscription: canonical.id, livemode: false,
        metadata: { ...metadata, user_id: mismatch ? "other" : actor } };
      const result = await invoke("checkout.session.completed", session);
      assertEquals(result.response.status, mismatch ? 500 : 200);
      assertEquals(row.stripe_subscription_id, mismatch ? null : canonical.id);
      assertEquals(row.stripe_checkout_session_id, mismatch ? null : session.id);
      assertEquals(row.status, mismatch ? "checkout_started" : "trialing");
      if (!legacy) assertEquals(row.metadata.checkout_operation_v1.key, "preserved");
      if (mismatch) assertEquals(calls.some((c) => c.url.pathname === "/rest/v1/subscription_trial_claims" && c.method === "PATCH"), false);
      else {
        assertEquals((await invoke("customer.subscription.updated", canonical)).response.status, 200);
        assertEquals(row.status, "trialing");
      }
    });
  }
});

Deno.test("signed old trial expiry cannot change a newer claim or revive consumed state", async () => {
  const row = trialRow({ stripe_checkout_session_id: "cs_new" });
  await signedWebhookFixture({ route: trialLedgerRoute(row) }, async (invoke) => {
    const result = await invoke("checkout.session.expired", { id: "cs_old", customer: "cus_trial", subscription: null, livemode: false, metadata: { checkout_type: "subscription_trial", user_id: "user-1", trial_claim_id: row.id } });
    assertEquals(result.response.status, 500); assertEquals(row.status, "checkout_started"); assertEquals(row.stripe_checkout_session_id, "cs_new");
  });
});
