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
  });
  assertEquals(parsePortalActionRequest({ action: "unknown" }), {
    action: "manage",
    subscriptionId: null,
  });
});

Deno.test("portal action parser validates subscription actions", () => {
  assertEquals(
    parsePortalActionRequest({
      action: "subscription_cancel",
      subscription_id: "sub_123",
    }),
    { action: "subscription_cancel", subscriptionId: "sub_123" },
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
