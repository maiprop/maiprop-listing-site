/**
 * Tests for os-diagnose edge function (admin only).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing auth returns 401 or 403", async () => {
  const res = await handler(req("POST"));
  assertEquals([401, 403].includes(res.status), true);
});

Deno.test("fake Bearer returns auth/permission error", async () => {
  const res = await handler(authedReq("POST"));
  assertEquals([401, 403, 500].includes(res.status), true);
});

restore();
