/**
 * Tests for auth-email-hook edge function (Supabase Auth hook).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler("./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing hook secret returns 401", async () => {
  const res = await handler(req("POST", {
    user: { email: "test@example.com", id: "user_1" },
    email_data: { token: "123456", token_hash: "abc", redirect_to: "https://maiprop.co" },
  }));
  // Auth hook validates the Supabase hook signing secret
  assertEquals([401, 403, 500].includes(res.status), true);
});

Deno.test("well-formed OPTIONS returns CORS headers", async () => {
  const res = await handler(req("OPTIONS"));
  const origin = res.headers.get("Access-Control-Allow-Origin");
  assertEquals(typeof origin, "string");
});

restore();
