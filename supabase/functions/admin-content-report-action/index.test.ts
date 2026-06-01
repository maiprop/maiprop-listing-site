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
  var __adminContentReportScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "admin-content-report-action-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__adminContentReportScenario;
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
      return { data: scenario.rpcData ?? { id: "report-1", status: "resolved" }, error: null };
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
  globalThis.__adminContentReportScenario = {
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

Deno.test("anonymous direct invoke is rejected before moderation RPC", async () => {
  resetScenario();
  const res = await handler(req("POST", {
    action: "resolve",
    reportId: crypto.randomUUID(),
  }));

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__adminContentReportScenario.calls.some((call) => call.name === "rpc"),
    false,
  );
});

Deno.test("invalid action is rejected before auth or moderation lookup", async () => {
  resetScenario();
  const res = await handler(authedJson({
    action: "delete_everything",
    reportId: crypto.randomUUID(),
  }));

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid action");
  assertEquals(globalThis.__adminContentReportScenario.calls.length, 0);
});

Deno.test("resolve forwards the verified admin id to the service RPC", async () => {
  const reportId = crypto.randomUUID();
  resetScenario({ user: { id: "verified-admin", email: "admin@test.local" } });

  const res = await handler(authedJson({ action: "resolve", reportId }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.error, null);
  assertEquals(
    globalThis.__adminContentReportScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
        name: "admin_resolve_listing_report_for_user",
        args: {
          _admin_user_id: "verified-admin",
          p_report_id: reportId,
        },
      })
    ),
    true,
  );
});

Deno.test("suspend listing forwards a trimmed reason", async () => {
  const reportId = crypto.randomUUID();
  resetScenario();

  const res = await handler(authedJson({
    action: "suspend_listing",
    reportId,
    reason: "  policy violation  ",
  }));

  assertEquals(res.status, 200);
  assertEquals(
    globalThis.__adminContentReportScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
        name: "admin_suspend_reported_listing_for_user",
        args: {
          _admin_user_id: "admin-user",
          p_report_id: reportId,
          p_reason: "policy violation",
        },
      })
    ),
    true,
  );
});

Deno.test("database forbidden errors return 403", async () => {
  resetScenario({ rpcError: "forbidden" });

  const res = await handler(authedJson({
    action: "ban_owner",
    reportId: crypto.randomUUID(),
  }));
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "forbidden");
});
