import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  rpcError?: string;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __beginRoleSwitchScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "begin-role-switch-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__beginRoleSwitchScenario;
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
      return { data: null, error: null };
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
  globalThis.__beginRoleSwitchScenario = {
    calls: [],
    user: { id: "user-1", email: "user@test.local" },
    ...overrides,
  };
};

const authedJson = (body: unknown = {}) =>
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

Deno.test("anonymous direct invoke is rejected before role switch RPC", async () => {
  resetScenario();
  const res = await handler(req("POST", {}));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__beginRoleSwitchScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("verified caller is passed explicitly to service RPC", async () => {
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
  });

  const res = await handler(authedJson());
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, { success: true, validate_only: false });
  assertEquals(
    globalThis.__beginRoleSwitchScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
        name: "begin_role_switch_for_user",
        args: { _user_id: "verified-user" },
      })
    ),
    true,
  );
});

Deno.test("validate-only role switch preflight calls the non-mutating validation RPC", async () => {
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
  });

  const res = await handler(authedJson({ validate_only: true }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, { success: true, validate_only: true });
  assertEquals(
    globalThis.__beginRoleSwitchScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
        name: "validate_role_switch_for_user",
        args: { _user_id: "verified-user" },
      })
    ),
    true,
  );
});

Deno.test("service RPC errors fail closed", async () => {
  resetScenario({ rpcError: "active_firesale_commitment_blocks_role_switch" });
  const res = await handler(authedJson());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "active_firesale_commitment_blocks_role_switch");
});
