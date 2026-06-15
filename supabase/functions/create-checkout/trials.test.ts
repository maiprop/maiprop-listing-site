import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTrialMetadata,
  isTrialCheckoutAudienceAllowed,
  normalizeTrialCheckoutRequest,
  PRO_TRIAL_DAYS,
} from "./trials.ts";

Deno.test("trial checkout request accepts only explicit boolean-like values", () => {
  assertEquals(PRO_TRIAL_DAYS, 7);
  assertEquals(normalizeTrialCheckoutRequest(true), true);
  assertEquals(normalizeTrialCheckoutRequest("true"), true);
  assertEquals(normalizeTrialCheckoutRequest("1"), true);
  assertEquals(normalizeTrialCheckoutRequest(false), false);
  assertEquals(normalizeTrialCheckoutRequest("false"), false);
  assertEquals(normalizeTrialCheckoutRequest("7"), false);
  assertEquals(normalizeTrialCheckoutRequest(7), false);
  assertEquals(normalizeTrialCheckoutRequest(undefined), false);
});

Deno.test("trial checkout is limited to public self-serve paid audiences", () => {
  assertEquals(isTrialCheckoutAudienceAllowed("participant"), true);
  assertEquals(isTrialCheckoutAudienceAllowed("agent"), true);
  assertEquals(isTrialCheckoutAudienceAllowed("developer"), true);
  assertEquals(isTrialCheckoutAudienceAllowed("professional"), true);
  assertEquals(isTrialCheckoutAudienceAllowed("investor"), false);
  assertEquals(isTrialCheckoutAudienceAllowed("institutional"), false);
});

Deno.test("trial metadata is stable for checkout and webhook reconciliation", () => {
  assertEquals(buildTrialMetadata(), {
    checkout_type: "subscription_trial",
    trial_days: "7",
  });
});
