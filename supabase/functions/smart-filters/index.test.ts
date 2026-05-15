/**
 * Tests for smart-filters edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const moduleUrl = new URL("./index.ts", import.meta.url).href;
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");
const { parseSmartFilterArgs } = await import(moduleUrl);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(req("POST", { type: "apartment", listing_type: "sale" }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 (not 500)", async () => {
  const res = await handler(authedReq("POST", { type: "house" }));
  assertEquals([401, 429].includes(res.status), true);
});

Deno.test("parseSmartFilterArgs accepts Gemini/OpenAI text JSON responses", () => {
  const parsed = parseSmartFilterArgs("Here is the JSON:\n```json\n{\"sections\":[\"size\",\"bedrooms\"],\"featureKeys\":[\"has_parking\"],\"sizeLabel\":\"Home Area\",\"priceLabel\":\"Asking Price\",\"bedsLabel\":\"Bedrooms\",\"featuresLabel\":\"Amenities\"}\n```");
  assertEquals(parsed.sections, ["size", "bedrooms"]);
  assertEquals(parsed.featureKeys, ["has_parking"]);
  assertEquals(parsed.priceLabel, "Asking Price");
});

restore();
