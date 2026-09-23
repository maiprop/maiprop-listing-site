import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  interest?: unknown;
  rpcError?: { message: string; code?: string };
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  var __submitFiresaleInterestScenario: MockScenario;
}

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);
restore();

const { handler: dbLimiterHandler, restore: restoreDbLimiter } =
  await captureHandler(
    import.meta.url,
    "./index.ts?db-limiter",
    { RATE_LIMIT_FORCE_MEMORY: "false" },
  );
restoreDbLimiter();
const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__submitFiresaleInterestScenario = {
    calls: [],
    user: { id: "user-1", email: "user@test.local" },
    ...overrides,
  };
};

const bodyFor = (dealId: string, overrides: Record<string, unknown> = {}) => ({
  dealId,
  message: "Ready to move",
  proofAmount: 1500000,
  proofOfFundsUrl: `user-1/firesale/${dealId}/proof_uuid.pdf`,
  ...overrides,
});

const authedJson = (body: unknown) =>
  req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });

Deno.test("anonymous direct invoke is rejected before interest submission", async () => {
  resetScenario();
  const res = await handler(req("POST", bodyFor(crypto.randomUUID())));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__submitFiresaleInterestScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("invalid deal id is rejected before auth or interest submission", async () => {
  resetScenario();
  const res = await handler(authedJson(bodyFor("not-a-uuid")));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid dealId");
  assertEquals(globalThis.__submitFiresaleInterestScenario.calls.length, 0);
});

Deno.test("invalid firesale interest bodies return structured 400 before auth or RPC work", async () => {
  const dealId = crypto.randomUUID();
  const malformed = new Request(
    "https://functions.test/submit-firesale-interest",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${crypto.randomUUID()}`,
        "content-type": "application/json",
        "x-forwarded-for": crypto.randomUUID(),
      },
      body: "{",
    },
  );
  const requests = [
    malformed,
    authedJson(bodyFor(dealId, { proofAmount: 1_000_000_001 })),
    authedJson(bodyFor(dealId, { proofAmount: "1500000" })),
    authedJson(bodyFor(dealId, { invented: true })),
  ];

  for (const request of requests) {
    resetScenario();
    const res = await handler(request);
    const body = await res.json() as {
      code?: string;
      issues?: unknown[];
    };

    assertEquals(res.status, 400);
    assertEquals(
      ["invalid_json", "validation_error"].includes(body.code ?? ""),
      true,
    );
    assertEquals(Array.isArray(body.issues), true);
    assertEquals(globalThis.__submitFiresaleInterestScenario.calls.length, 0);
  }
});

Deno.test("invalid bodies do not call the production database rate limiter", async () => {
  resetScenario();
  const originalFetch = globalThis.fetch;
  let transportCalls = 0;
  globalThis.fetch = (_input, _init) => {
    transportCalls += 1;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          allowed: true,
          count: 1,
          limit: 60,
          window_start: new Date().toISOString(),
          reset_in_seconds: 60,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
  };

  try {
    const res = await dbLimiterHandler(authedJson(bodyFor("not-a-uuid")));
    assertEquals(res.status, 400);
    assertEquals(transportCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("oversized request bodies are rejected before database work", async () => {
  resetScenario();
  const originalFetch = globalThis.fetch;
  let transportCalls = 0;
  globalThis.fetch = (_input, _init) => {
    transportCalls += 1;
    return Promise.resolve(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  try {
    const res = await dbLimiterHandler(authedJson(bodyFor(crypto.randomUUID(), {
      message: "x".repeat(20_000),
    })));
    const body = await res.json();
    assertEquals(res.status, 413);
    assertEquals(body.code, "payload_too_large");
    assertEquals(transportCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("proof paths must belong to the verified caller and deal", async () => {
  const dealId = crypto.randomUUID();
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
  });
  const res = await handler(authedJson(bodyFor(dealId, {
    proofOfFundsUrl: `other-user/firesale/${dealId}/proof_uuid.pdf`,
  })));

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid proofOfFundsUrl");
  assertEquals(
    globalThis.__submitFiresaleInterestScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("interest submission is created for the verified caller only", async () => {
  const dealId = crypto.randomUUID();
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
    interest: { id: "interest-2", deal_id: dealId, status: "prioritized" },
  });

  const res = await handler(authedJson(bodyFor(dealId, {
    proofOfFundsUrl: `verified-user/firesale/${dealId}/proof_uuid.pdf`,
  })));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.error, null);
  assertEquals(body.data.id, "interest-2");
  assertEquals(
    globalThis.__submitFiresaleInterestScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
          name: "submit_firesale_interest_for_user",
          args: {
            _user_id: "verified-user",
            p_deal_id: dealId,
            p_message: "Ready to move",
            p_proof_amount: 1500000,
            p_proof_of_funds_url:
              `verified-user/firesale/${dealId}/proof_uuid.pdf`,
          },
        })
    ),
    true,
  );
});

Deno.test("business RPC errors preserve message and code in an RPC-style envelope", async () => {
  resetScenario({
    rpcError: {
      message: "investor_access_required",
      code: "P0001",
    },
  });
  const res = await handler(authedJson(bodyFor(crypto.randomUUID(), {
    proofOfFundsUrl: null,
  })));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data, null);
  assertEquals(body.error, {
    message: "investor_access_required",
    code: "P0001",
  });
});
