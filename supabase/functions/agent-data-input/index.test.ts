/**
 * Handler-level tests for agent-data-input.
 *
 * The data input role/quota/ban rules are enforced by database triggers/RPCs.
 * These tests mock Supabase so we can verify the edge function preserves those
 * guarantees at the boundary without making live or destructive DB calls.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  user?: { id: string };
  submitError?: string;
  submitData?: Record<string, unknown> | null;
  profileRole?: string | null;
  statusData?: Record<string, unknown>[];
  entriesData?: Record<string, unknown>[];
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __agentDataInputScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "agent-data-input-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
type Scenario = typeof globalThis.__agentDataInputScenario;

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function thenable<T>(value: T) {
  return { then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(value).then(resolve, reject) };
}

class QueryBuilder {
  constructor(private table: string, private scenario: Scenario) {}

  select(columns: string) {
    this.scenario.calls.push({ name: "select", args: { table: this.table, columns } });
    return this;
  }

  eq(column: string, value: unknown) {
    this.scenario.calls.push({ name: "eq", args: { table: this.table, column, value } });
    return this;
  }

  order(column: string, options: unknown) {
    this.scenario.calls.push({ name: "order", args: { table: this.table, column, options } });
    return this;
  }

  limit(count: number) {
    this.scenario.calls.push({ name: "limit", args: { table: this.table, count } });
    return thenable({ data: this.scenario.entriesData ?? [], error: null });
  }

  insert(row: unknown) {
    this.scenario.calls.push({ name: "insert", args: { table: this.table, row } });
    return {
      select: (columns: string) => {
        this.scenario.calls.push({ name: "insert_select", args: { table: this.table, columns } });
        return {
          single: async () => {
            if (this.scenario.submitError) {
              return { data: null, error: { message: this.scenario.submitError } };
            }
            if ("submitData" in this.scenario) {
              return { data: this.scenario.submitData, error: null };
            }
            return {
              data: { id: "input-1", status: "pending", ...(row as Record<string, unknown>) },
              error: null,
            };
          },
        };
      },
    };
  }

  maybeSingle() {
    this.scenario.calls.push({ name: "maybeSingle", args: { table: this.table } });
    return Promise.resolve({
      data: this.scenario.profileRole == null ? null : { role: this.scenario.profileRole },
      error: null,
    });
  }
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function createClient() {
  const scenario = globalThis.__agentDataInputScenario;
  return {
    auth: {
      getUser: async (token: string) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        return { data: { user: scenario.user ?? { id: "user-1" } }, error: null };
      },
    },
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (name === "get_agent_data_input_status") {
        return { data: scenario.statusData ?? [], error: null };
      }
      return { data: { id: "input-1", status: "verified" }, error: null };
    },
    from: (table: string) => {
      scenario.calls.push({ name: "from", args: { table } });
      return new QueryBuilder(table, scenario);
    },
  };
}
`,
);

const shared = (name: string) =>
  new URL(`../_shared/${name}`, import.meta.url).href;
const transformedSource = functionSource
  .replace(
    'import { createClient } from "npm:@supabase/supabase-js@2.57.2";',
    `import { createClient } from "${fileUrl(mockClientPath)}";`,
  )
  .replace('from "../_shared/cors.ts"', `from "${shared("cors.ts")}"`)
  .replace('from "../_shared/logger.ts"', `from "${shared("logger.ts")}"`)
  .replace(
    'from "../_shared/rateLimit.ts"',
    `from "${shared("rateLimit.ts")}"`,
  );

await Deno.writeTextFile(transformedPath, transformedSource);

const { handler, restore } = await captureHandler(
  import.meta.url,
  fileUrl(transformedPath),
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__agentDataInputScenario = {
    user: { id: "11111111-1111-4111-8111-111111111111" },
    calls: [],
    ...overrides,
  };
};

const authedJson = (body: unknown) => {
  return req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function validSubmitPayload() {
  return {
    property_address: "12 Test Street",
    city: "Athens",
    property_type: "apartment",
    transaction_type: "sale",
    agent_side: "seller",
    sale_price: 250000,
    closing_date: new Date().toISOString().slice(0, 10),
  };
}

Deno.test("submit maps DB role enforcement to a 403 agent-only response", async () => {
  resetScenario({ submitError: "agent_role_required" });

  const res = await handler(authedJson({
    action: "submit",
    payload: validSubmitPayload(),
  }));
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "agent_role_required");
  assertEquals(
    body.message,
    "Only agents can submit closings for the Data Input discount.",
  );
});

Deno.test("submit maps DB monthly quota enforcement to a 429 response", async () => {
  resetScenario({ submitError: "agent_data_input_monthly_limit_reached" });

  const res = await handler(authedJson({
    action: "submit",
    payload: validSubmitPayload(),
  }));
  const body = await res.json();

  assertEquals(res.status, 429);
  assertEquals(body.error, "monthly_limit_reached");
  assertEquals(
    body.message,
    "You have already submitted 20 data inputs this month. Try again next month.",
  );
});

Deno.test("submit maps DB lifetime ban enforcement to a 403 response", async () => {
  resetScenario({ submitError: "agent_data_input_lifetime_banned" });

  const res = await handler(authedJson({
    action: "submit",
    payload: validSubmitPayload(),
  }));
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "lifetime_banned");
  assertEquals(
    body.message,
    "You no longer have access to the Data Input feature. This is permanent and cannot be reversed.",
  );
});

Deno.test("submit fails when the insert returns no persisted row", async () => {
  resetScenario({ submitData: null });

  const res = await handler(authedJson({
    action: "submit",
    payload: validSubmitPayload(),
  }));
  const body = await res.json();

  assertEquals(res.status, 500);
  assertEquals(body.error, "submission_not_persisted");
  assertEquals(
    body.message,
    "Data input submission was not persisted. Please retry.",
  );
});

Deno.test("admin_review rejects non-admin callers before invoking review RPC", async () => {
  resetScenario({ profileRole: "agent" });

  const res = await handler(authedJson({
    action: "admin_review",
    input_id: "22222222-2222-4222-8222-222222222222",
    decision: "rejected",
    reason: "unsupported closing",
    lifetime_ban: true,
  }));
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "Forbidden");
  assertEquals(
    globalThis.__agentDataInputScenario.calls.some((call) =>
      call.name === "rpc" &&
      (call.args as { name?: string }).name === "admin_review_agent_data_input"
    ),
    false,
  );
});

Deno.test("admin_review forwards reviewer id and lifetime ban flag for admin callers", async () => {
  resetScenario({ profileRole: "admin" });

  const res = await handler(authedJson({
    action: "admin_review",
    input_id: "22222222-2222-4222-8222-222222222222",
    decision: "rejected",
    reason: "hallucinated closing",
    lifetime_ban: true,
  }));

  assertEquals(res.status, 200);
  const reviewCall = globalThis.__agentDataInputScenario.calls.find((call) =>
    call.name === "rpc" &&
    (call.args as { name?: string }).name === "admin_review_agent_data_input"
  );
  assert(reviewCall);
  assertEquals((reviewCall.args as { args: Record<string, unknown> }).args, {
    p_input_id: "22222222-2222-4222-8222-222222222222",
    p_decision: "rejected",
    p_reason: "hallucinated closing",
    p_lifetime_ban: true,
    p_reviewer_id: "11111111-1111-4111-8111-111111111111",
  });
});

Deno.test("status returns ban/quota metrics and starts RPC plus entries query", async () => {
  resetScenario({
    statusData: [{
      monthly_count: 20,
      monthly_limit: 20,
      pending_discount_pct: 10,
      pending_discount_count: 20,
      total_pending: 0,
      total_verified: 20,
      total_rejected: 1,
      lifetime_banned: true,
      ban_reason: "false claim",
      banned_at: "2026-05-14T00:00:00Z",
    }],
    entriesData: [{ id: "input-1", status: "verified" }],
  });

  const res = await handler(authedJson({ action: "status" }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.monthly_count, 20);
  assertEquals(body.monthly_limit, 20);
  assertEquals(body.lifetime_banned, true);
  assertEquals(body.entries, [{ id: "input-1", status: "verified" }]);
  assert(
    globalThis.__agentDataInputScenario.calls.some((call) =>
      call.name === "rpc" &&
      (call.args as { name?: string }).name === "get_agent_data_input_status"
    ),
  );
  assert(
    globalThis.__agentDataInputScenario.calls.some((call) =>
      call.name === "from" &&
      (call.args as { table?: string }).table === "agent_data_inputs"
    ),
  );
  assert(
    globalThis.__agentDataInputScenario.calls.some((call) =>
      call.name === "select" &&
      String((call.args as { columns?: string }).columns).includes(
        "discount_pct",
      )
    ),
  );
  assert(
    globalThis.__agentDataInputScenario.calls.some((call) =>
      call.name === "select" &&
      String((call.args as { columns?: string }).columns).includes(
        "applied_to_invoice_at",
      ) &&
      String((call.args as { columns?: string }).columns).includes(
        "stripe_credit_id",
      )
    ),
  );
});

Deno.test("DB quota implementation serializes concurrent monthly-count checks", async () => {
  const sql = await Deno.readTextFile(
    new URL(
      "../../migrations/20260707020000_serialize_agent_data_input_quota.sql",
      import.meta.url,
    ),
  );

  const lockIndex = sql.indexOf("pg_advisory_xact_lock");
  const countIndex = sql.indexOf("SELECT COUNT(*)");
  const insertIndex = sql.indexOf("INSERT INTO public.agent_data_inputs");

  assert(lockIndex > 0, "expected transaction-scoped advisory lock");
  assert(countIndex > lockIndex, "quota count must happen after the lock");
  assert(
    insertIndex > countIndex,
    "insert must happen after the serialized quota count",
  );
  assert(sql.includes("IF v_used >= 20 THEN"));
  assert(
    sql.includes("RAISE EXCEPTION 'Monthly data input limit (20) reached'"),
  );
});

restore();
