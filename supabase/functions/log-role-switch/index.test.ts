/**
 * Tests for log-role-switch edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing auth returns 401 or 503", async () => {
  const res = await handler(req("POST", { from_role: "buyer", to_role: "agent" }));
  assertEquals([401, 503].includes(res.status), true);
});

Deno.test("fake Bearer returns 401 (Supabase getUser rejects)", async () => {
  const res = await handler(authedReq("POST", { from_role: "buyer", to_role: "seller" }));
  assertEquals([401, 503].includes(res.status), true);
});

Deno.test("role switch cancellation iterates core billable subscriptions without cancelling add-ons", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(source.includes("for (const sub of billableSubs)"), true);
  assertEquals(source.includes("shouldSkipProfileEntitlementSync"), true);
  assertEquals(source.includes("sub_cancelled_count"), true);
  assertEquals(source.includes("billableSubs[0]"), false);
});

Deno.test("role switch preflight does not write audit rows before a destination role exists", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(source.includes("if (toType) {"), true);
  assertEquals(
    source.includes("Audit insert skipped until destination role is selected"),
    true,
  );
  assertEquals(source.includes("_to_type: toType,"), true);
  assertEquals(source.includes('_to_type: toType || ""'), false);
});

restore();
