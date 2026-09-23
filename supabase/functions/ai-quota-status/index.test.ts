import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  quota?: {
    allowed: boolean;
    reason: string | null;
    used: number;
    limit: number;
  };
  quotas?: Record<
    string,
    { allowed: boolean; reason: string | null; used: number; limit: number }
  >;
  rpcError?: string;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  var __aiQuotaStatusScenario: MockScenario;
}

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);
restore();

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__aiQuotaStatusScenario = {
    calls: [],
    quota: { allowed: true, reason: null, used: 1, limit: 5 },
    ...overrides,
  };
};

function base64UrlJson(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

const jwtFor = (
  claims: Record<string, unknown> = {},
) =>
  [
    base64UrlJson({ alg: "none", typ: "JWT" }),
    base64UrlJson({
      sub: "00000000-0000-4000-8000-000000000001",
      role: "authenticated",
      email: "user@test.local",
      exp: Math.floor(Date.now() / 1_000) + 3_600,
      ...claims,
    }),
    "test-signature",
  ].join(".");

const authedJson = (body: unknown, claims?: Record<string, unknown>) =>
  req("POST", body, {
    authorization: `Bearer ${jwtFor(claims)}`,
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

Deno.test("anonymous direct invoke is rejected before quota lookup", async () => {
  resetScenario();
  const res = await handler(req("POST", { bucket: "property-valuation" }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__aiQuotaStatusScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("invalid bucket is rejected before auth or quota lookup", async () => {
  resetScenario();
  const res = await handler(authedJson({ bucket: "../not-a-bucket" }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid bucket");
  assertEquals(globalThis.__aiQuotaStatusScenario.calls.length, 0);
});

Deno.test("quota request parsing fails closed with structured errors before RPC", async () => {
  const invalidBodies = [
    { buckets: Array.from({ length: 13 }, () => "property-valuation") },
    { buckets: ["property-valuation", "../invalid"] },
    { bucket: "property-valuation", buckets: ["property-pois"] },
    { bucket: "property-valuation", unexpected: true },
  ];

  for (const invalidBody of invalidBodies) {
    resetScenario();
    const res = await handler(authedJson(invalidBody));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.code, "validation_error");
    assertEquals(Array.isArray(body.issues), true);
    assertEquals(globalThis.__aiQuotaStatusScenario.calls.length, 0);
  }
});

Deno.test("malformed quota JSON returns invalid_json before RPC", async () => {
  resetScenario();
  const res = await handler(new Request("https://functions.test/ai-quota-status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwtFor()}`,
      "content-type": "application/json",
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: "{",
  }));

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.code, "invalid_json");
  assertEquals(globalThis.__aiQuotaStatusScenario.calls.length, 0);
});

Deno.test("malformed bearer token is rejected before quota lookup", async () => {
  resetScenario();
  const res = await handler(
    req("POST", { bucket: "property-valuation" }, {
      authorization: "Bearer not-a-jwt",
      "x-forwarded-for": crypto.randomUUID(),
    }),
  );

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid bearer token");
  assertEquals(
    globalThis.__aiQuotaStatusScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("malformed JWT payload is rejected before quota lookup", async () => {
  resetScenario();
  const res = await handler(
    req("POST", { bucket: "property-valuation" }, {
      authorization: "Bearer header.not-json.signature",
      "x-forwarded-for": crypto.randomUUID(),
    }),
  );

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid bearer token");
  assertEquals(
    globalThis.__aiQuotaStatusScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("non-authenticated JWT role is rejected before quota lookup", async () => {
  resetScenario();
  const res = await handler(authedJson({ bucket: "property-valuation" }, {
    role: "anon",
  }));

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Authentication failed");
  assertEquals(
    globalThis.__aiQuotaStatusScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("quota status is returned for the verified caller only", async () => {
  resetScenario({
    quota: {
      allowed: false,
      reason: "monthly_limit_reached",
      used: 5,
      limit: 5,
    },
  });

  const res = await handler(authedJson(
    { bucket: "property-valuation" },
    { sub: "11111111-1111-4111-8111-111111111111" },
  ));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, {
    allowed: false,
    reason: "monthly_limit_reached",
    used: 5,
    limit: 5,
  });
  assertEquals(
    globalThis.__aiQuotaStatusScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
          name: "check_ai_quotas_for_user",
          args: {
            _user_id: "11111111-1111-4111-8111-111111111111",
            p_buckets: ["property-valuation"],
          },
        })
    ),
    true,
  );
});

Deno.test("batched quota status verifies once and returns quotas by bucket", async () => {
  resetScenario({
    quotas: {
      "property-valuation": { allowed: true, reason: null, used: 2, limit: 5 },
      "neighbourhood-report": {
        allowed: false,
        reason: "monthly_limit_reached",
        used: 5,
        limit: 5,
      },
      "property-pois": { allowed: true, reason: null, used: 1, limit: 5 },
    },
  });

  const res = await handler(authedJson({
    buckets: ["property-valuation", "neighbourhood-report", "property-pois"],
  }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, {
    quotas: {
      "property-valuation": { allowed: true, reason: null, used: 2, limit: 5 },
      "neighbourhood-report": {
        allowed: false,
        reason: "monthly_limit_reached",
        used: 5,
        limit: 5,
      },
      "property-pois": { allowed: true, reason: null, used: 1, limit: 5 },
    },
  });

  const rpcCalls = globalThis.__aiQuotaStatusScenario.calls.filter((call) =>
    call.name === "rpc"
  );
  assertEquals(rpcCalls, [{
    name: "rpc",
    args: {
      name: "check_ai_quotas_for_user",
      args: {
        _user_id: "00000000-0000-4000-8000-000000000001",
        p_buckets: [
          "property-valuation",
          "neighbourhood-report",
          "property-pois",
        ],
      },
    },
  }]);
});

Deno.test("service RPC errors fail closed", async () => {
  resetScenario({ rpcError: "database unavailable" });
  const res = await handler(authedJson({ bucket: "property-pois" }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "database unavailable");
});
