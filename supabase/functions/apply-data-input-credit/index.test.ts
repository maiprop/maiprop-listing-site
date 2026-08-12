/**
 * Tests for apply-data-input-credit edge function.
 *
 * The function delegates to Stripe + Supabase clients which require live
 * credentials, so these tests focus on the early-return behaviours we can
 * exercise without those: CORS preflight, missing auth, and the
 * env-or-auth refusal path.
 *
 * Note: testUtils injects defaults for STRIPE_SECRET_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_URL that survive Deno.env.delete()
 * because the patched getter consults an in-memory map first. So a request
 * with no Authorization header surfaces as either 503 (env path triggers
 * first) or 401 (auth path triggers first) depending on how the test
 * runtime is configured. Either is a correct refusal — see streetview-proxy
 * and delete-account tests for the same convention.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    RATE_LIMIT_FORCE_MEMORY: "true",
    STRIPE_RUNTIME_MODE: "test",
    STRIPE_EXPECTED_ACCOUNT_ID: "acct_testmaiprop",
  },
);
const {
  handler: productionBoundaryHandler,
  restore: restoreProductionBoundary,
} = await captureHandler(
  import.meta.url,
  "./index.ts?production-boundary",
  {
    RATE_LIMIT_FORCE_MEMORY: "false",
    STRIPE_RUNTIME_MODE: "test",
    STRIPE_EXPECTED_ACCOUNT_ID: "acct_testmaiprop",
  },
);

const adminUserId = "11111111-1111-4111-8111-111111111111";
const agentUserId = "22222222-2222-4222-8222-222222222222";
const dataInputId = "33333333-3333-4333-8333-333333333333";

type DataInputRow = {
  id: string;
  user_id: string;
  status: string;
  discount_pct: number;
  applied_to_invoice_at: string | null;
  stripe_credit_id: string | null;
  stripe_credit_amount_cents: number | null;
  stripe_credit_currency: string | null;
  discount_applied: boolean;
  discount_applied_at: string | null;
  discount_invoice_id: string | null;
};

type MockScenario = {
  row: DataInputRow;
  appliedThisMonth?: Array<{ stripe_credit_amount_cents: number | null }>;
  updateClaimsRow?: boolean;
};

const baseRow: DataInputRow = {
  id: dataInputId,
  user_id: agentUserId,
  status: "verified",
  discount_pct: 0.5,
  applied_to_invoice_at: null,
  stripe_credit_id: null,
  stripe_credit_amount_cents: null,
  stripe_credit_currency: null,
  discount_applied: false,
  discount_applied_at: null,
  discount_invoice_id: null,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rawPost(body: string, ip: string): Request {
  return new Request("https://functions.supabase.co/apply-data-input-credit", {
    method: "POST",
    headers: {
      authorization: "Bearer boundary-test-token",
      "content-type": "application/json",
      origin: "https://maiprop.co",
      "x-forwarded-for": ip,
    },
    body,
  });
}

async function assertBoundaryRejection(
  request: Request,
  expectedCode: string,
  expectedStatus = 400,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = (() => {
    externalRequests += 1;
    return Promise.resolve(json({ message: "unexpected request" }, 500));
  }) as typeof fetch;

  try {
    const response = await handler(request);
    const payload = await response.json() as {
      code?: string;
      issues?: unknown[];
    };

    assertEquals(response.status, expectedStatus);
    assertEquals(payload.code, expectedCode);
    assertEquals(Array.isArray(payload.issues), true);
    assertEquals(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://maiprop.co",
    );
    assertEquals(externalRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function installFetchMock(scenario: MockScenario) {
  const originalFetch = globalThis.fetch;
  const balanceTransactions: Array<
    { amount: string | null; url: string; idempotencyKey: string | null }
  > = [];
  const patches: unknown[] = [];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);

    if (url.hostname === "test.supabase.co") {
      if (url.pathname === "/auth/v1/user") {
        return json({ id: adminUserId, email: "admin@test.local" });
      }

      if (url.pathname === `/auth/v1/admin/users/${agentUserId}`) {
        return json({ id: agentUserId, email: "agent@test.local" });
      }

      if (url.pathname === "/rest/v1/profiles") {
        const select = url.searchParams.get("select") ?? "";
        if (select.includes("role")) {
          return json({ role: "admin", is_platform_admin: true });
        }
        return json({ user_id: agentUserId });
      }

      if (url.pathname === "/rest/v1/agent_data_inputs") {
        if (request.method === "PATCH") {
          patches.push(await request.json());
          return json(
            scenario.updateClaimsRow === false ? null : { id: scenario.row.id },
          );
        }

        const select = url.searchParams.get("select") ?? "";
        if (select === "stripe_credit_amount_cents") {
          return json(scenario.appliedThisMonth ?? []);
        }

        return json(scenario.row);
      }
    }

    if (url.hostname === "api.stripe.com") {
      if (url.pathname === "/v1/account") {
        return json({ id: "acct_testmaiprop", object: "account" });
      }

      if (url.pathname === "/v1/balance") {
        return json({ object: "balance", livemode: false, available: [], pending: [] });
      }

      if (url.pathname === "/v1/customers/search") {
        return json({ object: "search_result", data: [{ id: "cus_agent" }] });
      }

      if (url.pathname === "/v1/subscriptions") {
        const status = url.searchParams.get("status");
        return json({
          object: "list",
          data: status === "active"
            ? [{
              id: "sub_active",
              items: {
                data: [{ price: { unit_amount: 10_000, currency: "eur" } }],
              },
            }]
            : [],
        });
      }

      if (url.pathname === "/v1/customers/cus_agent/balance_transactions") {
        const form = new URLSearchParams(await request.text());
        const id = `cbtxn_${balanceTransactions.length + 1}`;
        balanceTransactions.push({
          amount: form.get("amount"),
          url: url.href,
          idempotencyKey: request.headers.get("Idempotency-Key"),
        });
        return json({ id, object: "customer_balance_transaction" });
      }
    }

    return json({
      message: `Unhandled mock URL: ${request.method} ${request.url}`,
    }, 500);
  };

  return {
    balanceTransactions,
    patches,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

Deno.test("OPTIONS preflight returns 200 with CORS headers", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("non-POST requests are rejected before external work", async () => {
  const originalFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = (() => {
    externalRequests += 1;
    return Promise.resolve(json({ message: "unexpected request" }, 500));
  }) as typeof fetch;

  try {
    const res = await handler(req("GET"));
    assertEquals(res.status, 405);
    assertEquals(externalRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("POST without auth returns 401 or 503", async () => {
  const res = await handler(req("POST", { data_input_id: dataInputId }));
  assertEquals([401, 503].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("fake Bearer token returns 401 (not 500)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (
      url.hostname === "test.supabase.co" && url.pathname === "/auth/v1/user"
    ) {
      return json({ msg: "invalid JWT" }, 401);
    }
    return json({
      message: `Unexpected request: ${request.method} ${request.url}`,
    }, 500);
  };

  try {
    const res = await handler(
      authedReq("POST", { data_input_id: dataInputId }),
    );
    assertEquals(res.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("malformed JSON is rejected before DB, RPC, or Stripe requests", async () => {
  await assertBoundaryRejection(
    rawPost('{"data_input_id":', "6.6.6.1"),
    "invalid_json",
  );
});

Deno.test("unknown body fields are rejected before DB, RPC, or Stripe requests", async () => {
  await assertBoundaryRejection(
    rawPost(
      JSON.stringify({ data_input_id: dataInputId, action: "apply" }),
      "6.6.6.2",
    ),
    "validation_error",
  );
});

Deno.test("oversized bodies return 413 before auth, limiter, DB, or Stripe", async () => {
  await assertBoundaryRejection(
    rawPost("x".repeat(16_385), "6.6.6.3"),
    "payload_too_large",
    413,
  );
});

Deno.test("invalid bodies bypass the production DB-backed limiter transport", async () => {
  const originalFetch = globalThis.fetch;
  let transportCalls = 0;
  globalThis.fetch = (() => {
    transportCalls += 1;
    return Promise.resolve(json({ message: "unexpected request" }, 500));
  }) as typeof fetch;

  try {
    for (
      const [request, expectedCode, expectedStatus] of [
        [rawPost('{"data_input_id":', "6.6.7.1"), "invalid_json", 400],
        [
          rawPost(
            JSON.stringify({ data_input_id: dataInputId, action: "apply" }),
            "6.6.7.2",
          ),
          "validation_error",
          400,
        ],
        [rawPost("x".repeat(16_385), "6.6.7.3"), "payload_too_large", 413],
      ] as const
    ) {
      const response = await productionBoundaryHandler(request);
      const payload = await response.json() as { code?: string };
      assertEquals(response.status, expectedStatus);
      assertEquals(payload.code, expectedCode);
    }
    assertEquals(transportCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("already-applied input returns idempotent response without Stripe credit", async () => {
  const mock = installFetchMock({
    row: {
      ...baseRow,
      applied_to_invoice_at: "2026-05-10T12:00:00.000Z",
      stripe_credit_id: "cbtxn_existing",
      stripe_credit_amount_cents: 50,
      stripe_credit_currency: "eur",
    },
  });

  try {
    const res = await handler(
      authedReq("POST", { data_input_id: dataInputId }, {
        "x-forwarded-for": "2.2.2.2",
      }),
    );
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body, {
      applied: true,
      idempotent: true,
      stripe_credit_id: "cbtxn_existing",
      amount_cents: 50,
      currency: "eur",
    });
    assertEquals(mock.balanceTransactions.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("legacy applied input is idempotent before Stripe credit", async () => {
  const mock = installFetchMock({
    row: {
      ...baseRow,
      discount_applied: true,
      discount_applied_at: "2026-05-10T12:00:00.000Z",
      discount_invoice_id: "in_legacy",
    },
  });

  try {
    const res = await handler(
      authedReq("POST", { data_input_id: dataInputId }, {
        "x-forwarded-for": "2.2.2.3",
      }),
    );
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body, {
      applied: true,
      idempotent: true,
      stripe_credit_id: "in_legacy",
      amount_cents: null,
      currency: null,
    });
    assertEquals(mock.balanceTransactions.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("credit amount is capped to remaining monthly allowance", async () => {
  const mock = installFetchMock({
    row: baseRow,
    appliedThisMonth: [{ stripe_credit_amount_cents: 975 }],
  });

  try {
    const res = await handler(
      authedReq("POST", { data_input_id: dataInputId }, {
        "x-forwarded-for": "3.3.3.3",
      }),
    );
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.applied, true);
    assertEquals(body.idempotent, false);
    assertEquals(body.amount_cents, 25);
    assertEquals(mock.balanceTransactions.map((tx) => tx.amount), ["-25"]);
    assertEquals(
      mock.balanceTransactions[0].idempotencyKey?.startsWith(
        "maiprop-data-input-credit-",
      ),
      true,
    );
    const appliedAt = mock.patches[0] && typeof mock.patches[0] === "object"
      ? (mock.patches[0] as { applied_to_invoice_at?: string })
        .applied_to_invoice_at
      : undefined;
    assertEquals(mock.patches[0], {
      applied_to_invoice_at: appliedAt,
      stripe_credit_id: "cbtxn_1",
      stripe_credit_amount_cents: 25,
      stripe_credit_currency: "eur",
      discount_applied: true,
      discount_applied_at: appliedAt,
      discount_invoice_id: "cbtxn_1",
    });
  } finally {
    mock.restore();
  }
});

Deno.test("monthly cap reached returns no-op before Stripe credit", async () => {
  const mock = installFetchMock({
    row: baseRow,
    appliedThisMonth: [{ stripe_credit_amount_cents: 1_000 }],
  });

  try {
    const res = await handler(
      authedReq("POST", { data_input_id: dataInputId }, {
        "x-forwarded-for": "4.4.4.4",
      }),
    );
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body, {
      applied: false,
      reason: "monthly_cap_reached",
      applied_cents: 1_000,
      cap_cents: 1_000,
    });
    assertEquals(mock.balanceTransactions.length, 0);
    assertEquals(mock.patches.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("lost concurrent update reverses orphan Stripe credit", async () => {
  const mock = installFetchMock({
    row: baseRow,
    appliedThisMonth: [],
    updateClaimsRow: false,
  });

  try {
    const res = await handler(
      authedReq("POST", { data_input_id: dataInputId }, {
        "x-forwarded-for": "5.5.5.5",
      }),
    );
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body, {
      applied: false,
      reason: "duplicate_concurrent_apply",
      orphan_balance_tx: "cbtxn_1",
    });
    assertEquals(mock.balanceTransactions.map((tx) => tx.amount), [
      "-50",
      "50",
    ]);
    assertEquals(
      mock.balanceTransactions[0].idempotencyKey?.startsWith(
        "maiprop-data-input-credit-",
      ),
      true,
    );
    assertEquals(
      mock.balanceTransactions[1].idempotencyKey?.startsWith(
        "maiprop-data-input-credit-reversal-",
      ),
      true,
    );
  } finally {
    mock.restore();
  }
});

restore();
restoreProductionBoundary();
