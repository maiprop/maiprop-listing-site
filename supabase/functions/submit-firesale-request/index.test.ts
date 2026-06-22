import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type TableCall = {
  table: string;
  operation: "select" | "insert" | "delete";
  payload?: unknown;
  filters?: Array<[string, unknown]>;
};

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  role?: string | null;
  roleSwitchInProgress?: boolean;
  insertError?: string;
  deleteError?: string;
  calls: Array<{ name: string; args?: unknown }>;
  tableCalls: TableCall[];
};

declare global {
  // deno-lint-ignore no-var
  var __submitFiresaleRequestScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const tempDir = await Deno.makeTempDir({ prefix: "submit-firesale-request-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__submitFiresaleRequestScenario;
  return {
    auth: {
      getUser: async (token) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        if (scenario.authError) {
          return { data: { user: null }, error: { message: scenario.authError } };
        }
        return {
          data: { user: scenario.user ?? { id: "seller-1", email: "seller@test.local" } },
          error: null,
        };
      },
    },
    from: (table) => ({
      select: (columns) => ({
        eq: (_column, value) => ({
          maybeSingle: async () => {
            scenario.tableCalls.push({ table, operation: "select", payload: columns, filters: [["user_id", value]] });
            return { data: { role: scenario.role ?? "seller", role_switch_in_progress_at: scenario.roleSwitchInProgress ? "2026-06-01T00:00:00Z" : null }, error: null };
          },
        }),
      }),
      insert: (payload) => ({
        select: (columns) => ({
          single: async () => {
            scenario.tableCalls.push({ table, operation: "insert", payload: { payload, columns } });
            if (scenario.insertError) return { data: null, error: { message: scenario.insertError } };
            return { data: { id: "fire-1" }, error: null };
          },
        }),
      }),
      delete: () => ({
        eq: (firstColumn, firstValue) => ({
          eq: async (secondColumn, secondValue) => {
            scenario.tableCalls.push({
              table,
              operation: "delete",
              filters: [[firstColumn, firstValue], [secondColumn, secondValue]],
            });
            if (scenario.deleteError) return { error: { message: scenario.deleteError } };
            return { error: null };
          },
        }),
      }),
    }),
  };
}
`,
);

const shared = (name: string) => new URL(`../_shared/${name}`, import.meta.url).href;
const transformedSource = functionSource
  .replace(
    'import { createClient } from "npm:@supabase/supabase-js@2.57.2";',
    `import { createClient } from "${fileUrl(mockClientPath)}";`,
  )
  .replace('from "../_shared/auth.ts"', `from "${shared("auth.ts")}"`)
  .replace('from "../_shared/cors.ts"', `from "${shared("cors.ts")}"`)
  .replace('from "../_shared/logger.ts"', `from "${shared("logger.ts")}"`)
  .replace('from "../_shared/rateLimit.ts"', `from "${shared("rateLimit.ts")}"`)
  .replace('from "../_shared/schema.ts"', `from "${shared("schema.ts")}"`);

await Deno.writeTextFile(transformedPath, transformedSource);

const { handler, restore } = await captureHandler(
  import.meta.url,
  fileUrl(transformedPath),
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);
restore();

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__submitFiresaleRequestScenario = {
    calls: [],
    tableCalls: [],
    role: "seller",
    user: { id: "seller-1", email: "seller@test.local" },
    ...overrides,
  };
};

const createBody = (overrides: Record<string, unknown> = {}) => ({
  action: "create",
  request: {
    address: "Kolonaki 12, Athens",
    city: "Athens",
    propertyType: "commercial",
    sqm: 100,
    askingPrice: 350000,
    contactEmail: "seller@example.com",
    contactPhone: null,
    notes: "KAEK: 050240601001/0/1",
    aiEstimate: 280000,
    ...overrides,
  },
});

const authedJson = (body: unknown) =>
  req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });

Deno.test("anonymous direct invoke is rejected before firesale request creation", async () => {
  resetScenario();
  const res = await handler(req("POST", createBody()));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(globalThis.__submitFiresaleRequestScenario.tableCalls.length, 0);
});

Deno.test("invalid create payload is rejected before auth or table writes", async () => {
  resetScenario();
  const res = await handler(authedJson(createBody({ contactEmail: "not email" })));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid contactEmail");
  assertEquals(globalThis.__submitFiresaleRequestScenario.calls.length, 0);
  assertEquals(globalThis.__submitFiresaleRequestScenario.tableCalls.length, 0);
});

Deno.test("non-seller profiles cannot create Quick Sale requests", async () => {
  resetScenario({ role: "agent" });
  const res = await handler(authedJson(createBody()));
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "Quick Sale submissions are available only to seller profiles.");
  assertEquals(
    globalThis.__submitFiresaleRequestScenario.tableCalls.some((call) => call.operation === "insert"),
    false,
  );
});

Deno.test("role-switching seller profiles cannot create Quick Sale requests", async () => {
  resetScenario({ roleSwitchInProgress: true });
  const res = await handler(authedJson(createBody()));
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "Quick Sale submissions are available only to seller profiles.");
  assertEquals(
    globalThis.__submitFiresaleRequestScenario.tableCalls.some((call) => call.operation === "insert"),
    false,
  );
});

Deno.test("create forces user ownership from the verified caller", async () => {
  resetScenario({ user: { id: "verified-seller", email: "verified@test.local" } });
  const res = await handler(authedJson(createBody()));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, { data: { id: "fire-1" }, error: null });
  const insertCall = globalThis.__submitFiresaleRequestScenario.tableCalls.find((call) => call.operation === "insert");
  const inserted = (insertCall?.payload as { payload: Record<string, unknown> }).payload;
  assertEquals(inserted.user_id, "verified-seller");
  assertEquals(inserted.status, "pending");
  assertEquals(inserted.property_type, "commercial");
});

Deno.test("rollback deletes only the verified caller's request", async () => {
  resetScenario({ user: { id: "verified-seller", email: "verified@test.local" } });
  const requestId = crypto.randomUUID();
  const res = await handler(authedJson({ action: "rollback", requestId }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, { data: { deleted: true }, error: null });
  assertEquals(globalThis.__submitFiresaleRequestScenario.tableCalls, [{
    table: "firesale_requests",
    operation: "delete",
    filters: [["id", requestId], ["user_id", "verified-seller"]],
  }]);
});
