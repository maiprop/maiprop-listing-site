/**
 * Tests for create-checkout edge function (handler-level only).
 *
 * sanitizeRedirectPath unit tests live in `sanitizeRedirectPath.test.ts` —
 * keeping them out of this file avoids loading the module before
 * captureHandler patches Deno.serve.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    RATE_LIMIT_FORCE_MEMORY: "true",
  },
);
const moduleUrl = new URL("./index.ts", import.meta.url).href;
const {
  isCheckoutAudienceAllowed,
  isCheckoutAddonAudienceAllowed,
  isInviteOnlyCheckoutPlan,
  isSupportedCheckoutPlan,
  isSupportedCheckoutAddonModule,
  normalizeExplicitCheckoutKey,
  normalizePlanKey,
} = await import(moduleUrl);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST", { priceId: "price_test" }));
  assertEquals(res.status, 401);
});

Deno.test("GET does not create checkout sessions", async () => {
  const res = await handler(authedReq("GET"));
  assertEquals(res.status, 405);
});

Deno.test("fake Bearer token results in auth failure, not internal error", async () => {
  const res = await handler(authedReq("POST", { priceId: "price_test" }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("checkout plan keys are allowlisted and investor plans remain invitation-only", () => {
  assertEquals(normalizePlanKey(undefined), "pro");
  assertEquals(normalizePlanKey("agent_basic"), "agent_basic");
  assertEquals(normalizePlanKey("bad plan"), null);
  assertEquals(normalizeExplicitCheckoutKey("featured_listing"), "featured_listing");
  assertEquals(normalizeExplicitCheckoutKey(""), null);
  assertEquals(normalizeExplicitCheckoutKey(undefined), null);

  assertEquals(isSupportedCheckoutPlan("pro"), true);
  assertEquals(isSupportedCheckoutPlan("developer_pro"), true);
  assertEquals(isSupportedCheckoutPlan("investor_private"), true);
  assertEquals(isSupportedCheckoutPlan("unknown_plan"), false);

  assertEquals(isInviteOnlyCheckoutPlan("investor_private"), true);
  assertEquals(isInviteOnlyCheckoutPlan("investor_institutional"), true);
  assertEquals(isInviteOnlyCheckoutPlan("developer_pro"), false);
});

Deno.test("checkout audience gate blocks cross-role public plan purchases", () => {
  assertEquals(isCheckoutAudienceAllowed("participant", { role: "buyer" }), true);
  assertEquals(isCheckoutAudienceAllowed("participant", { participant_type: "seller" }), true);
  assertEquals(isCheckoutAudienceAllowed("agent", { role: "agent", participant_type: "agent" }), true);
  assertEquals(isCheckoutAudienceAllowed("developer", { role: "developer", participant_type: "developer" }), true);
  assertEquals(
    isCheckoutAudienceAllowed("developer", {
      role: "buyer",
      participant_type: "developer",
    }),
    false,
  );
  assertEquals(
    isCheckoutAudienceAllowed("participant", {
      role: "buyer",
      participant_type: "developer",
    }),
    true,
  );

  assertEquals(isCheckoutAudienceAllowed("agent", { participant_type: "buyer" }), false);
  assertEquals(isCheckoutAudienceAllowed("developer", { participant_type: "agent" }), false);
  assertEquals(isCheckoutAudienceAllowed("professional", null), false);
});

Deno.test("self-serve add-on modules are explicitly allowlisted", () => {
  assertEquals(isSupportedCheckoutAddonModule("valuation_reports"), true);
  assertEquals(isSupportedCheckoutAddonModule("adhoc_charges"), true);
  assertEquals(isSupportedCheckoutAddonModule("os_data_products"), false);
  assertEquals(isSupportedCheckoutAddonModule("user_subscription"), false);
  assertEquals(isSupportedCheckoutAddonModule("investor_subscription"), false);
  assertEquals(isSupportedCheckoutAddonModule(null), false);
});

Deno.test("add-on audience gate allows universal participant add-ons but blocks role-specific add-ons", () => {
  assertEquals(
    isCheckoutAddonAudienceAllowed("participant", "valuation_reports", { role: "agent" }),
    true,
  );
  assertEquals(
    isCheckoutAddonAudienceAllowed("participant", "adhoc_charges", { role: "professional" }),
    true,
  );
  assertEquals(
    isCheckoutAddonAudienceAllowed("agent", "adhoc_charges", { role: "agent" }),
    true,
  );
  assertEquals(
    isCheckoutAddonAudienceAllowed("professional", "adhoc_charges", { role: "agent" }),
    false,
  );
  assertEquals(isCheckoutAddonAudienceAllowed("participant", "os_data_products", { role: "buyer" }), false);
  assertEquals(isCheckoutAddonAudienceAllowed("participant", "os_data_products", { role: "developer" }), false);
});

Deno.test("mock add-on checkout is gated by add-on availability and audience", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const addonBranchStart = source.indexOf("if (addonKey) {");
  const stripeSessionStart = source.indexOf("const stripe = new Stripe", addonBranchStart);
  const addonBranch = source.slice(addonBranchStart, stripeSessionStart);

  const lookupIndex = addonBranch.indexOf("const checkoutAddon = await getCheckoutAddon");
  const audienceIndex = addonBranch.indexOf("!isCheckoutAddonAudienceAllowed");
  const mockIndex = addonBranch.indexOf("if (isStripeMockMode())");

  assertEquals(lookupIndex >= 0, true);
  assertEquals(audienceIndex > lookupIndex, true);
  assertEquals(mockIndex > audienceIndex, true);
});

Deno.test("subscription trial checkout is reserved before Stripe session creation", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const reserveIndex = source.indexOf("reserveSubscriptionTrialClaim");
  const sessionIndex = source.indexOf("stripe.checkout.sessions.create", source.indexOf("const checkoutPlan"));
  const updateIndex = source.indexOf("await markSubscriptionTrialCheckoutCreated", sessionIndex);

  assertEquals(source.includes("normalizeTrialCheckoutRequest"), true);
  assertEquals(source.includes("trial_period_days: PRO_TRIAL_DAYS"), true);
  assertEquals(source.includes('checkout_type: "subscription_trial"'), true);
  assertEquals(source.includes('payment_method_collection: "always"'), true);
  assertEquals(source.includes("subscription_trial_claims"), true);
  assertEquals(reserveIndex >= 0, true);
  assertEquals(sessionIndex > reserveIndex, true);
  assertEquals(updateIndex > sessionIndex, true);
});

Deno.test("mock billing never fabricates successful Pro trial checkout", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const subscriptionCheckoutStart = source.indexOf("if (wantsTrial && hasExistingPaidAccess");
  const mockBranchStart = source.indexOf("if (isStripeMockMode())", subscriptionCheckoutStart);
  const stripeSessionStart = source.indexOf("const stripe = new Stripe", mockBranchStart);
  const mockBranch = source.slice(mockBranchStart, stripeSessionStart);
  const blockTrialIndex = mockBranch.indexOf("trial_mock_billing_disabled");
  const mockUrlIndex = mockBranch.indexOf("buildMockCheckoutUrl");

  assertEquals(mockBranch.includes("wantsTrial"), true);
  assertEquals(blockTrialIndex >= 0, true);
  assertEquals(mockUrlIndex > blockTrialIndex, true);
});

restore();
