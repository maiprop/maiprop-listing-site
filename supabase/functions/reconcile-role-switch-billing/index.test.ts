import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const cronSecret = crypto.randomUUID();
const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    CRON_SECRET: cronSecret,
    STRIPE_SECRET_KEY: "invalid-runtime-key",
  },
);

Deno.test("role-switch reconciliation accepts POST only", async () => {
  const response = await handler(
    new Request("https://functions.supabase.co/fn", {
      method: "GET",
      headers: { "x-cron-secret": cronSecret },
    }),
  );
  assertEquals(response.status, 405);
});

Deno.test("role-switch reconciliation rejects missing and incorrect cron secrets", async () => {
  const missing = await handler(req("POST"));
  const incorrect = await handler(
    req("POST", {}, { "x-cron-secret": "wrong" }),
  );
  assertEquals(missing.status, 401);
  assertEquals(incorrect.status, 401);
});

Deno.test("role-switch reconciliation fails closed when Stripe runtime is not explicit", async () => {
  const response = await handler(
    req("POST", {}, { "x-cron-secret": cronSecret }),
  );
  assertEquals(response.status, 503);
});

restore();
