/**
 * Tests for send-saved-search-alerts edge function (cron).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler("./index.ts", {
  CRON_SECRET: "correct-cron-secret",
});

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing cron secret returns 401", async () => {
  const res = await handler(req("POST", {}));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.ok, false);
});

Deno.test("wrong cron secret returns 401", async () => {
  const res = await handler(req("POST", {}, { authorization: "Bearer wrong-secret" }));
  assertEquals(res.status, 401);
});

Deno.test("correct cron secret passes the guard (Supabase query fails in test env)", async () => {
  // With correct secret, guard passes; Supabase call may fail but not with 401
  const res = await handler(req("POST", {}, { authorization: "Bearer correct-cron-secret" }));
  assertEquals(res.status !== 401, true);
});

restore();
