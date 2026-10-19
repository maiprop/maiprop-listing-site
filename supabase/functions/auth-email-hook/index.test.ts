/**
 * Tests for auth-email-hook edge function (Supabase Auth hook).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("unsigned hook request returns exactly 401", async () => {
  const res = await handler(req("POST", {
    user: { email: "test@example.com", id: "user_1" },
    email_data: { token: "123456", token_hash: "abc", redirect_to: "https://maiprop.co" },
  }));
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: "Invalid webhook payload" });
});

Deno.test("well-formed OPTIONS returns CORS headers", async () => {
  const res = await handler(req("OPTIONS"));
  const origin = res.headers.get("Access-Control-Allow-Origin");
  assertEquals(typeof origin, "string");
});

restore();
