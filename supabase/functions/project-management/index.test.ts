import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  user?: { id: string; email: string };
  profileRole?: string | null;
  roleSwitchInProgress?: boolean;
  ownedProject?: boolean;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __projectManagementScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const tempDir = await Deno.makeTempDir({ prefix: "project-management-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const mockAuditPath = `${tempDir}/mockAudit.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
function filteredResult(table, operation, payload, result) {
  const filters = [];
  const chain = {
    eq: (column, value) => {
      filters.push([column, value]);
      return chain;
    },
    select: (columns) => ({
      single: async () => {
        globalThis.__projectManagementScenario.calls.push({ name: operation, args: { table, payload, filters, columns } });
        return result;
      },
    }),
    then: (resolve) => {
      globalThis.__projectManagementScenario.calls.push({ name: operation, args: { table, payload, filters } });
      resolve({ error: null });
    },
  };
  return chain;
}

export function createClient() {
  const scenario = globalThis.__projectManagementScenario;
  return {
    auth: {
      getUser: async (token) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        return {
          data: { user: scenario.user ?? { id: "11111111-1111-4111-8111-111111111111", email: "dev@test.local" } },
          error: null,
        };
      },
    },
    from: (table) => ({
      select: (columns) => ({
        eq: (column, value) => ({
          maybeSingle: async () => {
            scenario.calls.push({ name: "select", args: { table, columns, filters: [[column, value]] } });
            if (table === "profiles") {
              return {
                data: {
                  role: scenario.profileRole ?? "developer",
                  role_switch_in_progress_at: scenario.roleSwitchInProgress ? "2026-06-01T00:00:00Z" : null,
                },
                error: null,
              };
            }
            if (table === "projects") {
              return {
                data: scenario.ownedProject === false
                  ? null
                  : { id: value, owner_id: "11111111-1111-4111-8111-111111111111" },
                error: null,
              };
            }
            return { data: null, error: null };
          },
        }),
      }),
      insert: (payload) => ({
        select: (columns) => ({
          single: async () => {
            scenario.calls.push({ name: "insert", args: { table, payload, columns } });
            return { data: { id: "22222222-2222-4222-8222-222222222222", ...payload }, error: null };
          },
        }),
      }),
      update: (payload) => filteredResult(table, "update", payload, {
        data: { id: "33333333-3333-4333-8333-333333333333", ...payload },
        error: null,
      }),
      delete: () => filteredResult(table, "delete", null, { error: null }),
    }),
  };
}
`,
);

await Deno.writeTextFile(
  mockAuditPath,
  `
export async function logAuditEvent(event) {
  globalThis.__projectManagementScenario.calls.push({ name: "audit", args: event });
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
  .replace('from "../_shared/schema.ts"', `from "${shared("schema.ts")}"`)
  .replace('from "../_shared/auditLog.ts"', `from "${fileUrl(mockAuditPath)}"`);

await Deno.writeTextFile(transformedPath, transformedSource);

const { handler, restore } = await captureHandler(
  import.meta.url,
  fileUrl(transformedPath),
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);
restore();

const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__projectManagementScenario = {
    calls: [],
    profileRole: "developer",
    ownedProject: true,
    user: { id: "11111111-1111-4111-8111-111111111111", email: "dev@test.local" },
    ...overrides,
  };
};

const authedJson = (body: unknown) =>
  req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });

Deno.test("anonymous project-management invoke is rejected before writes", async () => {
  resetScenario();
  const res = await handler(req("POST", { action: "delete_unit", projectId: PROJECT_ID, id: ROW_ID }));

  assertEquals(res.status, 401);
  assertEquals(globalThis.__projectManagementScenario.calls.length, 0);
});

Deno.test("non-developer project-management invoke is rejected before writes", async () => {
  resetScenario({ profileRole: "agent" });
  const res = await handler(authedJson({ action: "delete_unit", projectId: PROJECT_ID, id: ROW_ID }));
  const parsed = await res.json();

  assertEquals(res.status, 403);
  assertEquals(parsed.error, "developer_role_required");
  assert(!globalThis.__projectManagementScenario.calls.some((call) => call.name === "delete"));
});

Deno.test("non-owner project-management invoke is denied before row mutation", async () => {
  resetScenario({ ownedProject: false });
  const res = await handler(authedJson({ action: "delete_media", projectId: PROJECT_ID, id: ROW_ID }));
  const parsed = await res.json();

  assertEquals(res.status, 403);
  assertEquals(parsed.error, "project_not_owned");
  assert(!globalThis.__projectManagementScenario.calls.some((call) => call.name === "delete"));
});

Deno.test("create_unit forces project scope and strips client-controlled links", async () => {
  resetScenario();
  const res = await handler(authedJson({
    action: "create_unit",
    projectId: PROJECT_ID,
    unit: {
      project_id: OTHER_PROJECT_ID,
      listing_id: ROW_ID,
      unit_id: "A1",
      internal_sqm: 50,
      price: 300000,
    },
  }));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.project_id, PROJECT_ID);

  const insert = globalThis.__projectManagementScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "project_units"
  );
  const payload = (insert?.args as { payload: Record<string, unknown> }).payload;
  assertEquals(payload.project_id, PROJECT_ID);
  assertEquals(payload.listing_id, undefined);
});

Deno.test("listing cover updates are scoped to project and verified owner", async () => {
  resetScenario();
  const res = await handler(authedJson({
    action: "update_listing_cover",
    projectId: PROJECT_ID,
    listingId: ROW_ID,
    coverImageUrl: "https://cdn.test/cover.webp",
  }));

  assertEquals(res.status, 200);
  const update = globalThis.__projectManagementScenario.calls.find((call) =>
    call.name === "update" && (call.args as { table?: string })?.table === "listings"
  );
  assertEquals((update?.args as { filters: Array<[string, string]> }).filters, [
    ["id", ROW_ID],
    ["project_id", PROJECT_ID],
    ["owner_id", "11111111-1111-4111-8111-111111111111"],
  ]);
});
