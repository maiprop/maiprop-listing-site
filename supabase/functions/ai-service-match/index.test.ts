/**
 * Tests for ai-service-match edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(new URL("./index.ts", import.meta.url));

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST", { need: "I need a lawyer for a property purchase" }));
  assertEquals(res.status, 401);
});

Deno.test("Authorization: Basic is rejected with 401", async () => {
  const res = await handler(req("POST", {}, { authorization: "Basic xyz" }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer token → auth failure (not 500)", async () => {
  const res = await handler(authedReq("POST", { need: "need a notary" }));
  assertEquals([401, 429].includes(res.status), true);
});

restore();
