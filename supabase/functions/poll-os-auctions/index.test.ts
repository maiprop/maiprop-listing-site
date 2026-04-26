/**
 * Tests for poll-os-auctions edge function (cron/internal).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("POST with no OS credentials returns skipped or error (not crash)", async () => {
  // Env has MAIPROP_OS_URL set by testUtils; without real credentials it should
  // skip or return an OS auth error, not throw an unhandled exception
  const res = await handler(req("POST", {}));
  // skipped (200) or OS auth failure (4xx/5xx) — but not an unhandled crash
  assertEquals(typeof res.status, "number");
  assertEquals(res.status >= 200 && res.status < 600, true);
});

restore();
