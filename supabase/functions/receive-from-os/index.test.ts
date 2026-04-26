/**
 * Tests for receive-from-os edge function (HMAC-verified OS webhook).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing HMAC signature returns 401 or 400", async () => {
  const res = await handler(req("POST", { type: "auction.updated", data: {} }));
  // Without valid HMAC signature, webhook should reject
  assertEquals([400, 401, 403].includes(res.status), true);
});

Deno.test("wrong HMAC returns error response", async () => {
  const r = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": "sha256=bad",
      "x-webhook-timestamp": String(Math.floor(Date.now() / 1000)),
    },
    body: JSON.stringify({ type: "auction.updated" }),
  });
  const res = await handler(r);
  assertEquals([400, 401, 403].includes(res.status), true);
});

restore();
