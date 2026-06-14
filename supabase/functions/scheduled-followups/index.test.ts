/**
 * Tests for scheduled-followups cron authentication guard.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const CRON_VALUE = crypto.randomUUID();
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts", {
  CRON_SECRET: CRON_VALUE,
});

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing cron secret header returns 401", async () => {
  const res = await handler(req("POST"));
  assertEquals(res.status, 401);
});

Deno.test("wrong cron secret header returns 401", async () => {
  const res = await handler(req("POST", {}, { "x-cron-secret": crypto.randomUUID() }));
  assertEquals(res.status, 401);
});

Deno.test("valid cron secret with non-POST method returns 405 before work", async () => {
  const res = await handler(new Request("https://functions.supabase.co/fn", {
    method: "GET",
    headers: { "x-cron-secret": CRON_VALUE },
  }));
  assertEquals(res.status, 405);
});

Deno.test("valid cron secret reaches handler and missing env fails closed", async () => {
  Deno.env.delete("SUPABASE_URL");
  const res = await handler(req("POST", {}, { "x-cron-secret": CRON_VALUE }));
  assertEquals(res.status, 500);
});

restore();
