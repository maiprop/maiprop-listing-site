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
  },
);

const adminUserId = "11111111-1111-4111-8111-111111111111";
const agentUserId = "22222222-2222-4222-8222-222222222222";

type DataInputRow = {
  id: string;
  user_id: string;
  status: string;
  discount_pct: number;
  applied_to_invoice_at: string | null;
  stripe_credit_id: string | null;
  stripe_credit_amount_cents: number | null;
  stripe_credit_currency: string | null;
};

type MockScenario = {
  row: DataInputRow;
  appliedThisMonth?: Array<{ stripe_credit_amount_cents: number | null }>;
  updateClaimsRow?: boolean;
};

const baseRow: DataInputRow = {
  id: "input-1",
  user_id: agentUserId,
  status: "verified",
  discount_pct: 0.5,
  applied_to_invoice_at: null,
  stripe_credit_id: null,
  stripe_credit_amount_cents: null,
  stripe_credit_currency: null,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock(scenario: MockScenario) {
  const originalFetch = globalThis.fetch;
  const balanceTransactions: Array<{ amount: string | null; url: string }> = [];
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
        balanceTransactions.push({ amount: form.get("amount"), url: url.href });
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

Deno.test("POST without auth returns 401 or 503", async () => {
  const res = await handler(req("POST"));
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
    const res = await handler(authedReq("POST"));
    assertEquals(res.status, 401);
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
      authedReq("POST", { data_input_id: "input-1" }, {
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

Deno.test("credit amount is capped to remaining monthly allowance", async () => {
  const mock = installFetchMock({
    row: baseRow,
    appliedThisMonth: [{ stripe_credit_amount_cents: 975 }],
  });

  try {
    const res = await handler(
      authedReq("POST", { data_input_id: "input-1" }, {
        "x-forwarded-for": "3.3.3.3",
      }),
    );
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.applied, true);
    assertEquals(body.idempotent, false);
    assertEquals(body.amount_cents, 25);
    assertEquals(mock.balanceTransactions.map((tx) => tx.amount), ["-25"]);
    assertEquals(mock.patches[0], {
      applied_to_invoice_at:
        mock.patches[0] && typeof mock.patches[0] === "object"
          ? (mock.patches[0] as { applied_to_invoice_at?: string })
            .applied_to_invoice_at
          : undefined,
      stripe_credit_id: "cbtxn_1",
      stripe_credit_amount_cents: 25,
      stripe_credit_currency: "eur",
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
      authedReq("POST", { data_input_id: "input-1" }, {
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
      authedReq("POST", { data_input_id: "input-1" }, {
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
  } finally {
    mock.restore();
  }
});

restore();
