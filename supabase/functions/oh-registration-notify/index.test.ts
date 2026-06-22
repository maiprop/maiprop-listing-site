/**
 * Tests for oh-registration-notify edge function (DB webhook).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts", {
  WEBHOOK_SECRET: "correct-secret",
});

const webhookPayload = {
  type: "UPDATE",
  record: {
    id: "reg_1",
    requester_id: "user_1",
    listing_id: "listing_1",
    status: "approved",
  },
  old_record: {
    id: "reg_1",
    requester_id: "user_1",
    listing_id: "listing_1",
    status: "pending",
  },
};

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing webhook secret returns 401", async () => {
  const res = await handler(req("POST", webhookPayload));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.ok, false);
});

Deno.test("wrong webhook secret returns 401", async () => {
  const res = await handler(req("POST", webhookPayload, {
    authorization: "Bearer wrong-secret",
  }));
  assertEquals(res.status, 401);
});

Deno.test("correct webhook secret passes the guard", async () => {
  const res = await handler(req("POST", webhookPayload, {
    authorization: "Bearer correct-secret",
  }));
  // Will fail later (Supabase admin call fails) but NOT with 401
  assertEquals(res.status !== 401, true);
});

Deno.test("missing payload fields returns early with non-500", async () => {
  const res = await handler(req("POST", {}, { authorization: "Bearer correct-secret" }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, false);
});

Deno.test("invalid JSON returns validation error instead of notify crash", async () => {
  const res = await handler(new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      authorization: "Bearer correct-secret",
      "content-type": "application/json",
      origin: "https://maiprop.co",
    },
    body: "{",
  }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.error, "Invalid JSON body");
});

restore();
