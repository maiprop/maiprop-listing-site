/**
 * Tests for property-pois edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(req("POST", { lat: 37.97, lng: 23.72 }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 (not 500)", async () => {
  const res = await handler(authedReq("POST", { lat: 37.97, lng: 23.72, city: "Athens" }));
  assertEquals([401, 429].includes(res.status), true);
});

restore();
