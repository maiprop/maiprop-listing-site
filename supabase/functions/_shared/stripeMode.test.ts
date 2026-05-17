import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getStripeMode, withMockBillingParams } from "./stripeMode.ts";

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => void,
) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) {
    previous.set(key, Deno.env.get(key));
    const value = values[key];
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test("getStripeMode defaults to live", () => {
  withEnv({
    BILLING_MODE: undefined,
    STRIPE_MODE: undefined,
    STRIPE_MOCK_MODE: undefined,
  }, () => {
    assertEquals(getStripeMode(), "live");
  });
});

Deno.test("getStripeMode accepts explicit mock billing mode", () => {
  withEnv({ BILLING_MODE: "mock" }, () => {
    assertEquals(getStripeMode(), "mock");
  });
});

Deno.test("getStripeMode accepts legacy boolean mock flag", () => {
  withEnv({ BILLING_MODE: undefined, STRIPE_MOCK_MODE: "true" }, () => {
    assertEquals(getStripeMode(), "mock");
  });
});

Deno.test("withMockBillingParams preserves path and adds mock markers", () => {
  const path = withMockBillingParams("/pricing?checkout=success", {
    checkout: "success",
    plan: "developer_pro",
    billing_cycle: "annual",
  });
  assertEquals(
    path,
    "/pricing?checkout=success&billing_mode=mock&plan=developer_pro&billing_cycle=annual",
  );
});
