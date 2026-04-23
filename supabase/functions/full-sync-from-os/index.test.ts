/**
 * Tests for full-sync-from-os edge function (admin only).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(new URL("./index.ts", import.meta.url));

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST", {}));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 (admin check fails)", async () => {
  const res = await handler(authedReq("POST", { pageSize: 10 }));
  assertEquals([401, 403].includes(res.status), true);
});

restore();
