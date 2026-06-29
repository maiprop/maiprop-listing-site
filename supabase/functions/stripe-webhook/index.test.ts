/**
 * Tests for stripe-webhook edge function (Stripe HMAC-verified webhook).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);
const {
  addonCreditsGranted,
  addonPurchaseStatusForSubscription,
  findProvisionedReplacementSubscription,
} = await import("./index.ts");

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

Deno.test("add-on fulfillment only grants explicitly supported self-serve credits", () => {
  assertEquals(addonCreditsGranted("valuation_single", 2), 2);
  assertEquals(addonCreditsGranted("valuation_bundle", 2), 10);
  assertEquals(addonCreditsGranted("property_report_single", 3), 3);
  assertEquals(addonCreditsGranted("neighbourhood_report_single", 1), 1);
  assertEquals(addonCreditsGranted("neighbourhood_report_bundle", 2), 6);

  let threw = false;
  try {
    addonCreditsGranted("new_unmapped_report", 1);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
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
  assertEquals(rollbackBlock.includes("stripe_credit_amount_cents: null"), true);
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

restore();
