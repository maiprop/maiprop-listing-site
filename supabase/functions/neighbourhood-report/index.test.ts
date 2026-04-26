/**
 * Tests for neighbourhood-report edge function.
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
  const res = await handler(req("POST", { city: "Athens", address: "Kolonaki" }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 from Supabase auth (not 500)", async () => {
  const res = await handler(authedReq("POST", { city: "Athens" }));
  assertEquals([401, 429].includes(res.status), true);
});

restore();
