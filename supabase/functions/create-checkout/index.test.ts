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
  isInviteOnlyCheckoutPlan,
  isSupportedCheckoutPlan,
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
  assertEquals(isCheckoutAudienceAllowed("agent", { participant_type: "agent" }), true);
  assertEquals(isCheckoutAudienceAllowed("developer", { participant_type: "developer" }), true);

  assertEquals(isCheckoutAudienceAllowed("agent", { participant_type: "buyer" }), false);
  assertEquals(isCheckoutAudienceAllowed("developer", { participant_type: "agent" }), false);
  assertEquals(isCheckoutAudienceAllowed("professional", null), false);
});

restore();
