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
  // deno-lint-ignore no-var
  var __adminBroadcastScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "admin-broadcast-notification-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__adminBroadcastScenario;
  return {
    auth: {
      getUser: async (token: string) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        if (scenario.authError) {
          return { data: { user: null }, error: { message: scenario.authError } };
        }
        return {
          data: { user: scenario.user ?? { id: "admin-1", email: "admin@test.local" } },
          error: null,
        };
      },
    },
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (scenario.rpcError) {
        return { data: null, error: { message: scenario.rpcError } };
      }
      return { data: scenario.rpcData ?? 2, error: null };
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
  globalThis.__adminBroadcastScenario = {
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

Deno.test("anonymous direct invoke is rejected before broadcast RPC", async () => {
  resetScenario();
  const res = await handler(req("POST", {
    segment: "agents",
    title: "Hello",
    body: "Message",
  }));

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__adminBroadcastScenario.calls.some((call) => call.name === "rpc"),
    false,
  );
});

Deno.test("invalid segment is rejected before auth or broadcast lookup", async () => {
  resetScenario();
  const res = await handler(authedJson({
    segment: "everyone-and-more",
    title: "Hello",
    body: "Message",
  }));

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid segment");
  assertEquals(globalThis.__adminBroadcastScenario.calls.length, 0);
});

Deno.test("broadcast forwards the verified admin id and trimmed payload", async () => {
  resetScenario({ user: { id: "verified-admin", email: "admin@test.local" } });

  const res = await handler(authedJson({
    segment: "agents",
    title: "  Listing update  ",
    body: "  New open-house material is available.  ",
    link: "  /dashboard?tab=open-houses  ",
  }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, { data: 2, error: null });
  assertEquals(
    globalThis.__adminBroadcastScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
        name: "admin_broadcast_notification_for_user",
        args: {
          _admin_user_id: "verified-admin",
          p_segment: "agents",
          p_title: "Listing update",
          p_body: "New open-house material is available.",
          p_type: "admin_broadcast",
          p_link: "/dashboard?tab=open-houses",
        },
      })
    ),
    true,
  );
});

Deno.test("database forbidden errors return 403", async () => {
  resetScenario({ rpcError: "forbidden" });

  const res = await handler(authedJson({
    segment: "agents",
    title: "Hello",
    body: "Message",
  }));
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "forbidden");
});
