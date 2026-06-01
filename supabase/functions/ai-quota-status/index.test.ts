import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  quota?: { allowed: boolean; reason: string | null; used: number; limit: number };
  rpcError?: string;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __aiQuotaStatusScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "ai-quota-status-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__aiQuotaStatusScenario;
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
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (scenario.rpcError) {
        return { data: null, error: { message: scenario.rpcError } };
      }
      return {
        data: scenario.quota ?? { allowed: true, reason: null, used: 1, limit: 5 },
        error: null,
      };
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
  .replace('from "../_shared/auth.ts"', `from "${shared("auth.ts")}"`)
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
restore();

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__aiQuotaStatusScenario = {
    calls: [],
    user: { id: "user-1", email: "user@test.local" },
    quota: { allowed: true, reason: null, used: 1, limit: 5 },
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

Deno.test("quota status is returned for the verified caller only", async () => {
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
    quota: { allowed: false, reason: "monthly_limit_reached", used: 5, limit: 5 },
  });

  const res = await handler(authedJson({ bucket: "property-valuation" }));
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
        name: "check_ai_quota_for_user",
        args: {
          _user_id: "verified-user",
          p_bucket: "property-valuation",
        },
      })
    ),
    true,
  );
});

Deno.test("service RPC errors fail closed", async () => {
  resetScenario({ rpcError: "database unavailable" });
  const res = await handler(authedJson({ bucket: "property-pois" }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "database unavailable");
});
