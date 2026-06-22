/**
 * Tests for invitation-notify edge function (server-triggered).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email?: string | null };
  profile?: { role?: string | null; is_platform_admin?: boolean | null } | null;
  profileError?: string;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __invitationNotifyScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "invitation-notify-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__invitationNotifyScenario;
  return {
    auth: {
      getUser: async (token) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        if (scenario.authError) {
          return { data: { user: null }, error: { message: scenario.authError } };
        }
        return {
          data: { user: scenario.user ?? { id: "admin-user", email: "admin@test.local" } },
          error: null,
        };
      },
    },
    from: (table) => {
      scenario.calls.push({ name: "from", args: { table } });
      if (table !== "profiles") throw new Error("Unexpected table " + table);
      return {
        select: (columns) => {
          scenario.calls.push({ name: "profileSelect", args: { columns } });
          return {
            eq: (column, value) => {
              scenario.calls.push({ name: "profileEq", args: { column, value } });
              return {
                single: async () => {
                  scenario.calls.push({ name: "profileSingle" });
                  if (scenario.profileError) {
                    return { data: null, error: { message: scenario.profileError } };
                  }
                  return {
                    data: scenario.profile ?? { role: "admin", is_platform_admin: false },
                    error: null,
                  };
                },
              };
            },
          };
        },
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
  .replace('from "../_shared/brevo.ts"', `from "${shared("brevo.ts")}"`)
  .replace('from "../_shared/cors.ts"', `from "${shared("cors.ts")}"`)
  .replace('from "../_shared/logger.ts"', `from "${shared("logger.ts")}"`)
  .replace(
    'from "../_shared/rateLimit.ts"',
    `from "${shared("rateLimit.ts")}"`,
  )
  .replace('from "../_shared/schema.ts"', `from "${shared("schema.ts")}"`);

await Deno.writeTextFile(transformedPath, transformedSource);

const { handler, restore } = await captureHandler(import.meta.url, fileUrl(transformedPath));

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__invitationNotifyScenario = {
    calls: [],
    user: { id: "admin-user", email: "admin@test.local" },
    profile: { role: "admin", is_platform_admin: false },
    ...overrides,
  };
};

Deno.test("OPTIONS preflight returns 200", async () => {
  resetScenario();
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing Authorization returns 401", async () => {
  resetScenario();
  const res = await handler(req("POST", { invitation_id: "inv_123" }));
  assertEquals([401, 403].includes(res.status), true);
});

Deno.test("fake Bearer returns auth error, not unhandled crash", async () => {
  resetScenario({ authError: "bad token" });
  const res = await handler(authedReq("POST", { invitation_id: "inv_123" }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Unauthorized");
});

Deno.test("invalid JSON is rejected after admin auth and before notification work", async () => {
  resetScenario();
  const res = await handler(new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      authorization: `Bearer ${crypto.randomUUID()}`,
      "content-type": "application/json",
      origin: "https://maiprop.co",
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: "{",
  }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid JSON body");
  assertEquals(
    globalThis.__invitationNotifyScenario.calls.some((call) => call.name === "getUser"),
    true,
  );
});

Deno.test("invalid invitation notification payload is rejected before notification work", async () => {
  resetScenario();
  const res = await handler(authedReq("POST", { invitation_id: "inv_123" }, {
    "x-forwarded-for": crypto.randomUUID(),
  }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.code, "validation_error");
  assertEquals(String(body.error).includes("approved"), true);
});

restore();
