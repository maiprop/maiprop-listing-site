import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPortalSessionParams,
  parsePortalActionRequest,
  PortalActionValidationError,
} from "./portalActions.ts";

Deno.test("portal action parser defaults to generic billing management", () => {
  assertEquals(parsePortalActionRequest({}), {
    action: "manage",
    subscriptionId: null,
    operationId: null,
  });
  assertThrows(
    () => parsePortalActionRequest({ action: "unknown" }),
    PortalActionValidationError,
    "Invalid action",
  );
});

Deno.test("portal action parser validates subscription actions", () => {
  assertEquals(
    parsePortalActionRequest({
      action: "subscription_cancel",
      subscription_id: "sub_123",
    }),
    { action: "subscription_cancel", subscriptionId: "sub_123", operationId: null },
  );
  assertThrows(
    () => parsePortalActionRequest({
      action: "subscription_update",
    }),
    PortalActionValidationError,
    "subscription_id is required",
  );
  assertThrows(
    () => parsePortalActionRequest({
      action: "subscription_cancel",
      subscription_id: "not-a-subscription",
    }),
    PortalActionValidationError,
    "Invalid subscription_id",
  );
  assertEquals(
    parsePortalActionRequest({
      action: "resume_subscription",
      subscription_id: "sub_123",
      operation_id: "11111111-1111-4111-8111-111111111111",
    }),
    {
      action: "resume_subscription",
      subscriptionId: "sub_123",
      operationId: "11111111-1111-4111-8111-111111111111",
    },
  );
  assertThrows(
    () => parsePortalActionRequest({
      action: "resume_subscription",
      subscription_id: "sub_123",
    }),
    PortalActionValidationError,
    "operation_id is required",
  );
  assertThrows(
    () => parsePortalActionRequest({
      action: "subscription_cancel",
      subscription_id: `sub_${"x".repeat(252)}`,
    }),
    PortalActionValidationError,
    "Invalid subscription_id",
  );
  assertThrows(
    () => parsePortalActionRequest({ action: "manage", unexpected: true }),
    PortalActionValidationError,
  );
});

Deno.test("portal session builder creates action-specific flow data", () => {
  const returnUrl = "https://portal.maiprop.co/dashboard/billing";
  assertEquals(
    buildPortalSessionParams(
      "cus_123",
      returnUrl,
      "payment_method_update",
      null,
      "bpc_123",
    ),
    {
      customer: "cus_123",
      return_url: returnUrl,
      configuration: "bpc_123",
      flow_data: {
        type: "payment_method_update",
        after_completion: {
          type: "redirect",
          redirect: { return_url: returnUrl },
        },
      },
    },
  );
  assertEquals(
    buildPortalSessionParams("cus_123", returnUrl, "subscription_cancel", "sub_123"),
    {
      customer: "cus_123",
      return_url: returnUrl,
      flow_data: {
        type: "subscription_cancel",
        subscription_cancel: { subscription: "sub_123" },
        after_completion: {
          type: "redirect",
          redirect: { return_url: returnUrl },
        },
      },
    },
  );
  assertEquals(
    buildPortalSessionParams("cus_123", returnUrl, "subscription_update", "sub_123")
      .flow_data?.type,
    "subscription_update",
  );
  assertEquals(
    buildPortalSessionParams("cus_123", returnUrl, "manage", null),
    { customer: "cus_123", return_url: returnUrl },
  );
});
