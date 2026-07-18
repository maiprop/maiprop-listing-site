import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  profileRole?: string | null;
  roleSwitchInProgress?: boolean;
  proAllowed?: boolean;
  updatedCount?: number;
  rpcError?: string;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __projectUnitPricesScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "project-unit-prices-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const mockProGatePath = `${tempDir}/mockProGate.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__projectUnitPricesScenario;
  return {
    auth: {
      getUser: async (token: string) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        if (scenario.authError) {
          return { data: { user: null }, error: { message: scenario.authError } };
        }
        return {
          data: { user: scenario.user ?? { id: "user-1", email: "user@test.local" } },
          error: null,
        };
      },
    },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            scenario.calls.push({
              name: "select",
              args: { table, columns, filters: [[column, value]] },
            });
            return {
              data: {
                role: scenario.profileRole ?? "developer",
                role_switch_in_progress_at: scenario.roleSwitchInProgress
                  ? "2026-06-01T00:00:00Z"
                  : null,
              },
              error: null,
            };
          },
        }),
      }),
    }),
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (scenario.rpcError) {
        return { data: null, error: { message: scenario.rpcError } };
      }
      return { data: scenario.updatedCount ?? 3, error: null };
    },
  };
}
`,
);

await Deno.writeTextFile(
  mockProGatePath,
  `
export async function requireProSubscription(userId, corsHeaders, options = {}) {
  const scenario = globalThis.__projectUnitPricesScenario;
  scenario.calls.push({ name: "proGate", args: { userId, options } });
  const allowed = scenario.proAllowed !== false;
  return {
    allowed,
    errorResponse: allowed
      ? null
      : new Response(
        JSON.stringify({ error: "This feature requires a Pro subscription. Please upgrade your plan." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
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
  .replace('from "../_shared/auth.ts"', `from "${shared("auth.ts")}"`)
  .replace('from "../_shared/cors.ts"', `from "${shared("cors.ts")}"`)
  .replace('from "../_shared/logger.ts"', `from "${shared("logger.ts")}"`)
  .replace(
    'from "../_shared/rateLimit.ts"',
    `from "${shared("rateLimit.ts")}"`,
  )
  .replace('from "../_shared/proGate.ts"', `from "${fileUrl(mockProGatePath)}"`);

await Deno.writeTextFile(transformedPath, transformedSource);

const { handler, restore } = await captureHandler(
  import.meta.url,
  fileUrl(transformedPath),
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);
restore();

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__projectUnitPricesScenario = {
    calls: [],
    profileRole: "developer",
    proAllowed: true,
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

Deno.test("anonymous direct invoke is rejected before price update", async () => {
  resetScenario();
  const res = await handler(req("POST", {
    projectId: crypto.randomUUID(),
    percentage: 5,
  }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__projectUnitPricesScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("invalid project id is rejected before auth or price update", async () => {
  resetScenario();
  const res = await handler(authedJson({
    projectId: "../not-a-uuid",
    percentage: 5,
  }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid projectId");
  assertEquals(globalThis.__projectUnitPricesScenario.calls.length, 0);
});

Deno.test("invalid percentage is rejected before auth or price update", async () => {
  resetScenario();
  const res = await handler(authedJson({
    projectId: crypto.randomUUID(),
    percentage: 0,
  }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid percentage");
  assertEquals(globalThis.__projectUnitPricesScenario.calls.length, 0);
});

Deno.test("non-developers are denied before the unit-price RPC", async () => {
  resetScenario({ profileRole: "agent" });
  const res = await handler(authedJson({
    projectId: crypto.randomUUID(),
    percentage: 5,
  }));

  assertEquals(res.status, 403);
  assertEquals(
    globalThis.__projectUnitPricesScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("free developers are denied before the unit-price RPC", async () => {
  resetScenario({ proAllowed: false });
  const res = await handler(authedJson({
    projectId: crypto.randomUUID(),
    percentage: 5,
  }));

  assertEquals(res.status, 403);
  assertEquals(
    globalThis.__projectUnitPricesScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("bulk price update is executed for the verified Developer Pro caller only", async () => {
  const projectId = crypto.randomUUID();
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
    updatedCount: 4,
  });

  const res = await handler(authedJson({ projectId, percentage: 5 }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.updatedCount, 4);
  assertEquals(
    globalThis.__projectUnitPricesScenario.calls.some((call) =>
      call.name === "proGate" &&
      JSON.stringify(call.args) === JSON.stringify({
        userId: "verified-user",
        options: { audience: "developer" },
      })
    ),
    true,
  );
  assertEquals(
    globalThis.__projectUnitPricesScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
        name: "bulk_update_project_unit_prices_for_user",
        args: {
          _user_id: "verified-user",
          p_project_id: projectId,
          p_percentage: 5,
        },
      })
    ),
    true,
  );
});

Deno.test("service RPC errors fail closed", async () => {
  resetScenario({ rpcError: "project not found" });
  const res = await handler(authedJson({
    projectId: crypto.randomUUID(),
    percentage: 5,
  }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "project not found");
});
