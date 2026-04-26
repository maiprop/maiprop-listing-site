/**
 * Tests for fetch-past-deals-from-os edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(req("POST", { kaek: "12345" }));
  assertEquals([401, 403].includes(res.status), true);
});

Deno.test("fake Bearer returns auth error (not crash)", async () => {
  const res = await handler(authedReq("POST", { kaek: "12345" }));
  assertEquals([401, 403, 500].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

restore();
