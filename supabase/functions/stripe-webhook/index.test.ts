/**
 * Tests for stripe-webhook edge function (Stripe HMAC-verified webhook).
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

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
  const trialBlock = source.slice(trialStart);

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
  assertEquals(
    trialBlock.includes("livemode: Boolean(session.livemode)"),
    true,
  );
  assertEquals(
    trialBlock.includes("runtime_mode: stripeRuntimeModeFromLivemode"),
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
