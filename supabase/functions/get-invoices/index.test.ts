/**
 * Tests for get-invoices edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("missing Authorization returns error response", async () => {
  const res = await handler(req("POST"));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("fake Bearer returns auth error (not 500 internal crash)", async () => {
  const res = await handler(authedReq("POST"));
  assertEquals(res.status, 401);
});

Deno.test("invoice response can fall back to durable billing state", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "billing_subscriptions");
  assertStringIncludes(source, "billing_customers");
  assertStringIncludes(source, "normalizeDurableBillingSubscription");
  assertStringIncludes(source, '"billing_state"');
  assertStringIncludes(source, 'log.warn("customer lookup failed"');
  assertStringIncludes(source, "customer_lookup_unavailable");
  assertStringIncludes(source, "return durableBillingResponse(corsHeaders, durableBilling, true)");
});

Deno.test("invoice response includes VAT and Stripe Tax details", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "extractInvoiceTaxAmount");
  assertStringIncludes(source, "normalizeInvoiceTaxIds");
  assertStringIncludes(source, "tax_amount");
  assertStringIncludes(source, "customer_tax_ids");
  assertStringIncludes(source, "automatic_tax");
  assertStringIncludes(source, "customer_tax_exempt");
  assertStringIncludes(source, "taxes");
});

Deno.test("invoice response exposes Stripe receipt and payment evidence when available", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "listCustomerInvoices");
  assertStringIncludes(source, "expanded invoice list failed, retrying without receipt expansion");
  assertStringIncludes(source, "data.payments.data.payment.payment_intent");
  assertStringIncludes(source, "data.payments.data.payment.charge");
  assertStringIncludes(source, "extractInvoiceReceipt");
  assertStringIncludes(source, "resolveInvoiceReceipt");
  assertStringIncludes(source, "stripe.invoices.retrieve");
  assertStringIncludes(source, "expanded invoice retrieve failed");
  assertStringIncludes(source, "stripe.paymentIntents.retrieve");
  assertStringIncludes(source, "stripe.charges.retrieve");
  assertStringIncludes(source, "payment_intent_id");
  assertStringIncludes(source, "charge_id");
  assertStringIncludes(source, "receipt_url");
});

Deno.test("subscription lookup does not request too-deep Stripe expansions", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(source.includes("data.items.data.price.product"), false);
});

restore();
