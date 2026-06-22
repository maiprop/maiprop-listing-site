import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  user?: { id: string; email: string };
  profileRole?: string | null;
  roleSwitchInProgress?: boolean;
  listingImageError?: string;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __createNewBuildingScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const tempDir = await Deno.makeTempDir({ prefix: "create-new-building-listing-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const mockAuditPath = `${tempDir}/mockAudit.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
function resolved(value) {
  return { then: (resolve) => resolve(value) };
}

function filterResult(table, operation, payload, result) {
  const filters = [];
  const chain = {
    eq: (column, value) => {
      filters.push([column, value]);
      return chain;
    },
    then: (resolve) => {
      globalThis.__createNewBuildingScenario.calls.push({ name: operation, args: { table, payload, filters } });
      resolve(result);
    },
  };
  return chain;
}

export function createClient() {
  const scenario = globalThis.__createNewBuildingScenario;
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
        eq: (_column, value) => ({
          maybeSingle: async () => {
            scenario.calls.push({ name: "select", args: { table, columns, filters: [["user_id", value]] } });
            return {
              data: {
                role: scenario.profileRole ?? "developer",
                role_switch_in_progress_at: scenario.roleSwitchInProgress ? "2026-06-01T00:00:00Z" : null,
              },
              error: null,
            };
          },
        }),
      }),
      insert: (payload) => {
        if (table === "project_units") {
          return {
            select: (columns) => ({
              single: async () => {
                scenario.calls.push({ name: "insert", args: { table, payload, columns } });
                return { data: { id: "22222222-2222-4222-8222-222222222222" }, error: null };
              },
            }),
          };
        }
        if (table === "listings") {
          return {
            select: (columns) => ({
              single: async () => {
                scenario.calls.push({ name: "insert", args: { table, payload, columns } });
                return { data: { id: "33333333-3333-4333-8333-333333333333" }, error: null };
              },
            }),
          };
        }
        scenario.calls.push({ name: "insert", args: { table, payload } });
        if (table === "listing_images" && scenario.listingImageError) {
          return resolved({ error: { message: scenario.listingImageError } });
        }
        return resolved({ error: null });
      },
      update: (payload) => filterResult(table, "update", payload, { error: null }),
      delete: () => filterResult(table, "delete", null, { error: null }),
    }),
  };
}
`,
);

await Deno.writeTextFile(
  mockAuditPath,
  `
export async function logAuditEvent(event) {
  globalThis.__createNewBuildingScenario.calls.push({ name: "audit", args: event });
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

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__createNewBuildingScenario = {
    calls: [],
    profileRole: "developer",
    user: { id: "11111111-1111-4111-8111-111111111111", email: "dev@test.local" },
    ...overrides,
  };
};

const authedJson = (body: unknown) =>
  req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });

const body = (overrides: Record<string, unknown> = {}) => ({
  project: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Marina Heights",
    building_permit_number: "123/2026",
    city: "Athens",
    owner_id: "99999999-9999-4999-8999-999999999999",
  },
  unit: {
    project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    availability_status: "available",
    internal_sqm: 100,
    price: 250000,
  },
  projectMedia: [{
    project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    url: "https://cdn.test/project-media/render.jpg",
    media_type: "rendering",
  }],
  listing: {
    title: "Marina Heights A1",
    city: "Athens",
    price: 250000,
    sqm: 100,
    property_type: "apartment",
    listing_type: "new_build",
    project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    owner_id: "99999999-9999-4999-8999-999999999999",
  },
  additionalImageUrls: ["https://cdn.test/2.jpg"],
  ...overrides,
});

Deno.test("anonymous direct invoke is rejected before new-build writes", async () => {
  resetScenario();
  const res = await handler(req("POST", body()));
  assertEquals(res.status, 401);
  assertEquals(globalThis.__createNewBuildingScenario.calls.length, 0);
});

Deno.test("non-developer profiles cannot create new-build listings", async () => {
  resetScenario({ profileRole: "agent" });
  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 403);
  assertEquals(parsed.error, "developer_role_required");
  assert(!globalThis.__createNewBuildingScenario.calls.some((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "projects"
  ));
});

Deno.test("create forces ownership from the verified developer and writes every row", async () => {
  resetScenario();
  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.listingId, "33333333-3333-4333-8333-333333333333");

  const projectInsert = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "projects"
  );
  const listingInsert = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "listings"
  );
  assertEquals((projectInsert?.args as { payload: Record<string, unknown> }).payload.owner_id, "11111111-1111-4111-8111-111111111111");
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.owner_id, "11111111-1111-4111-8111-111111111111");
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.listing_type, "new_build");
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.is_pre_sale, false);

  assert(globalThis.__createNewBuildingScenario.calls.some((call) =>
    call.name === "update" && (call.args as { table?: string })?.table === "project_units"
  ));
  assert(globalThis.__createNewBuildingScenario.calls.some((call) => call.name === "audit"));
});

Deno.test("project scope mismatch is rejected before auth and writes", async () => {
  resetScenario();
  const res = await handler(authedJson(body({
    unit: {
      project_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      availability_status: "available",
      internal_sqm: 100,
      price: 250000,
    },
  })));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "project_scope_mismatch");
  assertEquals(globalThis.__createNewBuildingScenario.calls.length, 0);
});

Deno.test("downstream image failure rolls back the owned listing and project", async () => {
  resetScenario({ listingImageError: "image insert failed" });
  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "image insert failed");

  const deletes = globalThis.__createNewBuildingScenario.calls.filter((call) => call.name === "delete");
  assertEquals(deletes.map((call) => (call.args as { table: string }).table), ["listings", "projects"]);
  assertEquals((deletes[0].args as { filters: Array<[string, string]> }).filters, [
    ["id", "33333333-3333-4333-8333-333333333333"],
    ["owner_id", "11111111-1111-4111-8111-111111111111"],
  ]);
  assertEquals((deletes[1].args as { filters: Array<[string, string]> }).filters, [
    ["id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["owner_id", "11111111-1111-4111-8111-111111111111"],
  ]);
});
