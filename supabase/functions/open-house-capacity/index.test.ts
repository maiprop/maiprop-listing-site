import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  capacity?: unknown[];
  rpcError?: string;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __openHouseCapacityScenario: MockScenario;
}

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);
restore();

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__openHouseCapacityScenario = {
    calls: [],
    user: { id: "user-1", email: "user@test.local" },
    ...overrides,
  };
};

const authedJson = (body: unknown) =>
  req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });

Deno.test("OPTIONS preflight returns CORS headers", async () => {
  resetScenario();
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("anonymous direct invoke is rejected before capacity lookup", async () => {
  resetScenario();
  const res = await handler(req("POST", { listingId: crypto.randomUUID() }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__openHouseCapacityScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("invalid listing id is rejected before auth or capacity lookup", async () => {
  resetScenario();
  const res = await handler(authedJson({ listingId: "../not-a-uuid" }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid listingId");
  assertEquals(globalThis.__openHouseCapacityScenario.calls.length, 0);
});

Deno.test("invalid JSON is rejected before auth or capacity lookup", async () => {
  resetScenario();
  const res = await handler(new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      authorization: `Bearer ${crypto.randomUUID()}`,
      "content-type": "application/json",
      origin: "https://maiprop.co",
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: "{",
  }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid JSON body");
  assertEquals(globalThis.__openHouseCapacityScenario.calls.length, 0);
});

Deno.test("capacity is returned for the verified caller only", async () => {
  const listingId = crypto.randomUUID();
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
    capacity: [{
      listing_id: listingId,
      active_total: 2,
      max_total_visitors: 4,
      slot_counts: [{ slot_index: 0, active_count: 2, max_visitors: 2, full: true }],
    }],
  });

  const res = await handler(authedJson({ listingId }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.active_total, 2);
  assertEquals(
    globalThis.__openHouseCapacityScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
        name: "get_open_house_capacity_for_user",
        args: {
          _user_id: "verified-user",
          p_listing_id: listingId,
        },
      })
    ),
    true,
  );
});

Deno.test("service RPC errors fail closed", async () => {
  resetScenario({ rpcError: "database unavailable" });
  const res = await handler(authedJson({ listingId: crypto.randomUUID() }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "database unavailable");
});
