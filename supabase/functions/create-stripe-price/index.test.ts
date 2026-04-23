/**
 * Tests for create-stripe-price edge function (admin only).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(new URL("./index.ts", import.meta.url));

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing Authorization returns error", async () => {
  const res = await handler(req("POST", { name: "Pro Plan", amount: 2900, interval: "month" }));
  assertEquals([401, 403, 500].includes(res.status), true);
});

Deno.test("fake Bearer returns auth/permission error, not crash", async () => {
  const res = await handler(authedReq("POST", { name: "Pro Plan", amount: 2900, interval: "month" }));
  assertEquals([401, 403, 500].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

restore();
