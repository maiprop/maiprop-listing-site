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
);
const webhookModule = await import("./index.ts");
const {
  addonCreditsGranted,
  addonPurchaseStatusForSubscription,
  findProvisionedReplacementSubscription,
  investorPaymentAccessPeriodDays,
  investorPaymentExpiresAt,
  mapSubscriptionTrialStatus,
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
  assertEquals(source.includes('eventStart === "in_progress"'), true);
  assertEquals(source.includes("Retry-After"), true);
  assertEquals(source.includes("status: 503"), true);
  assertEquals(source.includes("upsertBillingCustomer"), true);
  assertEquals(source.includes("upsertBillingSubscription"), true);
  assertEquals(eventLedgerIndex >= 0, true);
  assertEquals(switchIndex > eventLedgerIndex, true);
  assertEquals(duplicateIndex > eventLedgerIndex, true);
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
  const replacement = {
    id: "sub_new",
    status: "active",
    metadata: { checkout_type: "subscription" },
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
            replacement,
          ],
        });
      },
    },
  };

  assertEquals(
    await findProvisionedReplacementSubscription(
      stripe as never,
      "cus_123",
      "sub_old",
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
  assertEquals(source.includes('case "checkout.session.expired"'), true);
  assertEquals(source.includes("syncAddonRefund"), true);
  assertEquals(source.includes("expireAbandonedTrialCheckoutSession"), true);
  assertEquals(source.includes("credits_refunded"), true);
  assertEquals(source.includes("refund_status"), true);
  assertEquals(source.includes("last_refund_id"), true);
  assertEquals(source.includes("Math.min("), true);
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

Deno.test("agent data-input discount rollback clears legacy and Stripe credit markers", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const rollbackStart = source.indexOf(
    "stripe invoiceItem create failed, rolling back DB",
  );
  const rollbackEnd = source.indexOf(
    '.eq("discount_invoice_id", invoice.id)',
    rollbackStart,
  );
  const rollbackBlock = source.slice(rollbackStart, rollbackEnd);

  assertEquals(rollbackStart >= 0, true);
  assertEquals(rollbackBlock.includes("discount_applied: false"), true);
  assertEquals(rollbackBlock.includes("discount_applied_at: null"), true);
  assertEquals(rollbackBlock.includes("discount_invoice_id: null"), true);
  assertEquals(rollbackBlock.includes("applied_to_invoice_at: null"), true);
  assertEquals(rollbackBlock.includes("stripe_credit_id: null"), true);
  assertEquals(
    rollbackBlock.includes("stripe_credit_amount_cents: null"),
    true,
  );
  assertEquals(rollbackBlock.includes("stripe_credit_currency: null"), true);
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
