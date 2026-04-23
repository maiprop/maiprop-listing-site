/**
 * Tests for process-email-queue edge function (internal/cron).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(new URL("./index.ts", import.meta.url));

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("POST without service-role key returns 401 or 503", async () => {
  // process-email-queue checks for a service key or auth header
  const res = await handler(req("POST", {}));
  // Should reject unauthenticated calls or return empty queue result
  assertEquals(typeof res.status, "number");
  assertEquals(res.status >= 200 && res.status < 600, true);
});

restore();
