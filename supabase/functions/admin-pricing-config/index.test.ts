import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";
import { adminPricingActionSchema } from "./schema.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("invalid body is rejected before auth lookup", async () => {
  const res = await handler(authedReq("POST", { action: "upsert", rows: [] }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("anonymous pricing write is rejected", async () => {
  const res = await handler(req("POST", {
    action: "delete",
    id: "pricing-row-1",
  }));
  assertEquals(res.status, 401);
});

Deno.test("pricing action schema accepts bounded upserts and deletes", () => {
  assertEquals(adminPricingActionSchema.safeParse({
    action: "delete",
    id: "pricing-row-1",
  }).success, true);

  assertEquals(adminPricingActionSchema.safeParse({
    action: "upsert",
    rows: [{
      id: "pricing-row-1",
      key: "agent_pro",
      label: "Agent Pro",
      description: null,
      audience: "agent",
      module: "agent_subscription",
      unit: "monthly",
      currency: "EUR",
      amount: 149,
      is_active: true,
      sort_order: 1,
      metadata: {},
    }],
  }).success, true);
});

restore();
