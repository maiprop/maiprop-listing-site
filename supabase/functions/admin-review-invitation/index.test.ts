import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("GET does not review invitations", async () => {
  const res = await handler(req("GET"));
  assertEquals(res.status, 405);
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST", {
    requestId: "00000000-0000-4000-8000-000000000000",
    decision: "approved",
    tier: "private",
  }));
  assertEquals(res.status, 401);
});

restore();
