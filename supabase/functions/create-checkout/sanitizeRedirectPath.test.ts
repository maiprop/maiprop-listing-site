/**
 * Unit tests for sanitizeRedirectPath — covers BUG C with full branch coverage.
 *
 * Lives in its own file so importing the helper does not trigger the module's
 * Deno.serve(...) call before testUtils.captureHandler can patch it (which
 * would break the handler-level integration tests in `index.test.ts`).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isInviteOnlyCheckoutPlan,
  isCheckoutAudienceAllowed,
  isSupportedCheckoutPlan,
  getStripePriceEnvKey,
  getStripePriceEnvKeys,
  normalizeBillingCycle,
  normalizePlanKey,
  resolveCheckoutOrigin,
  sanitizeRedirectPath,
} from "./index.ts";

Deno.test("sanitizeRedirectPath: accepts a same-origin path", () => {
  assertEquals(sanitizeRedirectPath("/dashboard"), "/dashboard");
});

Deno.test("sanitizeRedirectPath: accepts a path with a query string", () => {
  assertEquals(
    sanitizeRedirectPath("/dashboard?pro=success&from=stripe"),
    "/dashboard?pro=success&from=stripe",
  );
});

Deno.test("sanitizeRedirectPath: rejects scheme-relative URLs (//evil.com)", () => {
  assertEquals(sanitizeRedirectPath("//evil.com/phish"), null);
});

Deno.test("sanitizeRedirectPath: rejects backslash-escape redirect (/\\evil)", () => {
  assertEquals(sanitizeRedirectPath("/\\evil.com"), null);
});

Deno.test("sanitizeRedirectPath: rejects absolute URLs", () => {
  assertEquals(sanitizeRedirectPath("https://evil.com/path"), null);
  assertEquals(sanitizeRedirectPath("http://attacker"), null);
});

Deno.test("sanitizeRedirectPath: rejects non-string inputs", () => {
  assertEquals(sanitizeRedirectPath(null), null);
  assertEquals(sanitizeRedirectPath(undefined), null);
  assertEquals(sanitizeRedirectPath(123), null);
  assertEquals(sanitizeRedirectPath({ foo: "bar" }), null);
  assertEquals(sanitizeRedirectPath(["/dashboard"]), null);
});

Deno.test("sanitizeRedirectPath: rejects empty string", () => {
  assertEquals(sanitizeRedirectPath(""), null);
});

Deno.test("sanitizeRedirectPath: rejects CRLF / control characters (header injection)", () => {
  assertEquals(
    sanitizeRedirectPath("/dashboard\r\nLocation: https://evil"),
    null,
  );
  assertEquals(sanitizeRedirectPath("/dashboard\nfoo"), null);
  assertEquals(sanitizeRedirectPath("/dashboard\tfoo"), null);
});

Deno.test("sanitizeRedirectPath: rejects paths longer than 512 chars", () => {
  const longPath = "/" + "a".repeat(512);
  assertEquals(sanitizeRedirectPath(longPath), null);
  // 512-char path (slash + 511 chars) is allowed
  const exactPath = "/" + "a".repeat(511);
  assertEquals(sanitizeRedirectPath(exactPath), exactPath);
});

Deno.test("sanitizeRedirectPath: rejects paths not starting with /", () => {
  assertEquals(sanitizeRedirectPath("dashboard"), null);
  assertEquals(sanitizeRedirectPath("./dashboard"), null);
  assertEquals(sanitizeRedirectPath("../etc/passwd"), null);
});

Deno.test("normalizePlanKey: defaults to pro and rejects malformed keys", () => {
  assertEquals(normalizePlanKey(undefined), "pro");
  assertEquals(normalizePlanKey("agent_basic"), "agent_basic");
  assertEquals(normalizePlanKey(" investor_private "), "investor_private");
  assertEquals(normalizePlanKey("../investor_private"), null);
  assertEquals(normalizePlanKey("https://evil.test"), null);
});

Deno.test("normalizeBillingCycle: defaults monthly and accepts annual aliases", () => {
  assertEquals(normalizeBillingCycle(undefined), "monthly");
  assertEquals(normalizeBillingCycle(""), "monthly");
  assertEquals(normalizeBillingCycle("monthly"), "monthly");
  assertEquals(normalizeBillingCycle("month"), "monthly");
  assertEquals(normalizeBillingCycle("annual"), "annual");
  assertEquals(normalizeBillingCycle("yearly"), "annual");
  assertEquals(normalizeBillingCycle("weekly"), null);
});

Deno.test("getStripePriceEnvKey: separates monthly and annual price ids", () => {
  assertEquals(getStripePriceEnvKey("developer_pro", "monthly"), "STRIPE_PRICE_DEVELOPER_PRO_MONTHLY");
  assertEquals(getStripePriceEnvKey("developer_pro", "annual"), "STRIPE_PRICE_DEVELOPER_PRO_ANNUAL");
});

Deno.test("getStripePriceEnvKeys: supports role-audience annual secret aliases", () => {
  assertEquals(getStripePriceEnvKeys("agent_basic", "annual"), [
    "STRIPE_PRICE_AGENT_ANNUAL",
    "STRIPE_PRICE_AGENT_BASIC_ANNUAL",
    "STRIPE_PRICE_AGENT_BASIC_YEARLY",
  ]);
  assertEquals(getStripePriceEnvKeys("developer_pro", "monthly"), [
    "STRIPE_PRICE_DEVELOPER_MONTHLY",
    "STRIPE_PRICE_DEVELOPER_PRO_MONTHLY",
    "STRIPE_PRICE_DEVELOPER_PRO",
  ]);
});

Deno.test("isInviteOnlyCheckoutPlan: blocks direct checkout for investor plans", () => {
  assertEquals(isInviteOnlyCheckoutPlan("investor_private"), true);
  assertEquals(isInviteOnlyCheckoutPlan("investor_institutional"), true);
  assertEquals(isInviteOnlyCheckoutPlan("professional_basic"), false);
});

Deno.test("isSupportedCheckoutPlan: rejects unknown syntactically valid keys", () => {
  assertEquals(isSupportedCheckoutPlan("pro"), true);
  assertEquals(isSupportedCheckoutPlan("agent_basic"), true);
  assertEquals(isSupportedCheckoutPlan("developer_pro"), true);
  assertEquals(isSupportedCheckoutPlan("professional_basic"), true);
  assertEquals(isSupportedCheckoutPlan("valuation_single"), false);
  assertEquals(isSupportedCheckoutPlan("made_up_valid_key"), false);
});

Deno.test("isCheckoutAudienceAllowed: blocks cross-role plan use", () => {
  assertEquals(
    isCheckoutAudienceAllowed("developer", { role: "agent", participant_type: "agent" }),
    false,
  );
  assertEquals(
    isCheckoutAudienceAllowed("developer", { role: "developer", participant_type: "developer" }),
    true,
  );
  assertEquals(
    isCheckoutAudienceAllowed("participant", { role: "buyer", participant_type: "buyer" }),
    true,
  );
  assertEquals(
    isCheckoutAudienceAllowed("participant", { role: "seller", participant_type: "seller" }),
    true,
  );
});

Deno.test("resolveCheckoutOrigin: allows known origins and rejects attacker origins", () => {
  assertEquals(
    resolveCheckoutOrigin("https://maiprop.co"),
    "https://maiprop.co",
  );
  assertEquals(
    resolveCheckoutOrigin("https://feature.maiprop-listing-site.pages.dev"),
    "https://feature.maiprop-listing-site.pages.dev",
  );
  assertEquals(
    resolveCheckoutOrigin("https://evil.example"),
    "https://portal.maiprop.co",
  );
  assertEquals(resolveCheckoutOrigin(null), "https://portal.maiprop.co");
});
