import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  rpcError?: string;
  rpcData?: unknown;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  var __adminFiresaleScenario: MockScenario;
}

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);
restore();

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__adminFiresaleScenario = {
    calls: [],
    user: { id: "admin-user", email: "admin@test.local" },
    ...overrides,
  };
};

const authedJson = (body: unknown) =>
  req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });

Deno.test("anonymous direct invoke is rejected before firesale RPC", async () => {
  resetScenario();
  const res = await handler(req("POST", {
    action: "set_investor_publication",
    dealId: crypto.randomUUID(),
    published: true,
  }));

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__adminFiresaleScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("invalid action is rejected before auth or firesale lookup", async () => {
  resetScenario();
  const res = await handler(authedJson({
    action: "delete_pipeline",
    dealId: crypto.randomUUID(),
  }));

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid action");
  assertEquals(globalThis.__adminFiresaleScenario.calls.length, 0);
});

Deno.test("malformed firesale JSON returns a structured 400 before auth or RPC", async () => {
  resetScenario();
  const res = await handler(
    new Request("https://functions.test/admin-firesale-action", {
      method: "POST",
      headers: {
        authorization: `Bearer ${crypto.randomUUID()}`,
        "content-type": "application/json",
        "x-forwarded-for": crypto.randomUUID(),
      },
      body: "{",
    }),
  );

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.code, "invalid_json");
  assertEquals(Array.isArray(body.issues), true);
  assertEquals(globalThis.__adminFiresaleScenario.calls.length, 0);
});

Deno.test("firesale payload domains are bounded before auth or privileged RPC", async () => {
  const dealId = crypto.randomUUID();
  const interestId = crypto.randomUUID();
  const invalidBodies = [
    {
      action: "update_pipeline_deal",
      dealId,
      status: "deleted",
      adminNotes: "",
    },
    {
      action: "update_pipeline_deal",
      dealId,
      status: "reviewed",
      adminNotes: "x".repeat(4_001),
    },
    {
      action: "update_pipeline_deal",
      dealId,
      status: "offer_sent",
      adminNotes: "",
      offerPrice: -1,
    },
    {
      action: "update_pipeline_deal",
      dealId,
      status: "offer_sent",
      adminNotes: "",
      sellerResponse: "maybe",
    },
    {
      action: "update_interest_workflow",
      interestId,
      status: "reserved",
      reservationHours: 721,
      verifyProof: false,
    },
    {
      action: "update_interest_workflow",
      interestId,
      status: "reserved",
      verifyProof: true,
      adminNote: "x".repeat(2_001),
    },
    {
      action: "update_interest_workflow",
      interestId,
      status: "reserved",
      verifyProof: true,
      proofAmount: 1_000_000_001,
    },
    {
      action: "set_investor_publication",
      dealId,
      published: true,
      unexpected: true,
    },
  ];

  for (const invalidBody of invalidBodies) {
    resetScenario();
    const res = await handler(authedJson(invalidBody));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.code, "validation_error");
    assertEquals(Array.isArray(body.issues), true);
    assertEquals(globalThis.__adminFiresaleScenario.calls.length, 0);
  }
});

Deno.test("pipeline action forwards the verified admin id and payload", async () => {
  const dealId = crypto.randomUUID();
  resetScenario({ user: { id: "verified-admin", email: "admin@test.local" } });

  const res = await handler(authedJson({
    action: "update_pipeline_deal",
    dealId,
    status: "offer_sent",
    adminNotes: "Reviewed",
    offerPrice: 200000,
    sellerResponse: "countered",
    sellerResponsePrice: 210000,
  }));

  assertEquals(res.status, 200);
  assertEquals(
    globalThis.__adminFiresaleScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
          name: "admin_update_firesale_pipeline_deal_for_user",
          args: {
            _admin_user_id: "verified-admin",
            p_deal_id: dealId,
            p_status: "offer_sent",
            p_admin_notes: "Reviewed",
            p_offer_price: 200000,
            p_seller_response: "countered",
            p_seller_response_price: 210000,
          },
        })
    ),
    true,
  );
});

Deno.test("publication action forwards the verified admin id", async () => {
  const dealId = crypto.randomUUID();
  resetScenario();

  const res = await handler(authedJson({
    action: "set_investor_publication",
    dealId,
    published: true,
  }));

  assertEquals(res.status, 200);
  assertEquals(
    globalThis.__adminFiresaleScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
          name: "admin_set_firesale_investor_publication_for_user",
          args: {
            _admin_user_id: "admin-user",
            p_deal_id: dealId,
            p_published: true,
          },
        })
    ),
    true,
  );
});

Deno.test("interest workflow action forwards reservation and proof fields", async () => {
  const interestId = crypto.randomUUID();
  resetScenario();

  const res = await handler(authedJson({
    action: "update_interest_workflow",
    interestId,
    status: "reserved",
    reservationHours: 48,
    verifyProof: true,
    adminNote: "Verified",
    proofAmount: 1500000,
  }));

  assertEquals(res.status, 200);
  assertEquals(
    globalThis.__adminFiresaleScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
          name: "admin_update_firesale_interest_workflow_for_user",
          args: {
            _admin_user_id: "admin-user",
            p_interest_id: interestId,
            p_status: "reserved",
            p_reservation_hours: 48,
            p_verify_pof: true,
            p_admin_note: "Verified",
            p_proof_amount: 1500000,
          },
        })
    ),
    true,
  );
});

Deno.test("database admin_only errors return 403", async () => {
  resetScenario({ rpcError: "admin_only" });

  const res = await handler(authedJson({
    action: "update_interest_workflow",
    interestId: crypto.randomUUID(),
    status: "passed",
  }));
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "admin_only");
});
