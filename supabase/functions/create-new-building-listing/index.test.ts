import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  user?: { id: string; email: string };
  profileRole?: string | null;
  roleSwitchInProgress?: boolean;
  proAllowed?: boolean;
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
const mockProGatePath = `${tempDir}/mockProGate.ts`;
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

await Deno.writeTextFile(
  mockProGatePath,
  `
export async function requireProSubscription(userId, corsHeaders, options = {}) {
  const scenario = globalThis.__createNewBuildingScenario;
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
  .replace('from "../_shared/auditLog.ts"', `from "${fileUrl(mockAuditPath)}"`)
  .replace('from "../_shared/proGate.ts"', `from "${fileUrl(mockProGatePath)}"`);

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
    proAllowed: true,
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
    price_per_sqm: 1,
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
    price_per_sqm: 1,
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

Deno.test("free developers are denied before any new-building write or rollback", async () => {
  resetScenario({ proAllowed: false });
  const res = await handler(authedJson(body()));

  assertEquals(res.status, 403);
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.some((call) =>
      ["insert", "update", "delete", "audit"].includes(call.name)
    ),
    false,
  );
});

Deno.test("Developer Pro creation forces ownership and writes every row", async () => {
  resetScenario();
  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.listingId, "33333333-3333-4333-8333-333333333333");
  assert(globalThis.__createNewBuildingScenario.calls.some((call) =>
    call.name === "proGate" &&
    JSON.stringify(call.args) === JSON.stringify({
      userId: "11111111-1111-4111-8111-111111111111",
      options: { audience: "developer" },
    })
  ));

  const projectInsert = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "projects"
  );
  const unitInsert = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "project_units"
  );
  const listingInsert = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "listings"
  );
  assertEquals((projectInsert?.args as { payload: Record<string, unknown> }).payload.owner_id, "11111111-1111-4111-8111-111111111111");
  assertEquals((unitInsert?.args as { payload: Record<string, unknown> }).payload.price_per_sqm, 2500);
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.owner_id, "11111111-1111-4111-8111-111111111111");
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.listing_type, "new_build");
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.is_pre_sale, false);
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.price_per_sqm, 2500);

  assert(globalThis.__createNewBuildingScenario.calls.some((call) =>
    call.name === "update" && (call.args as { table?: string })?.table === "project_units"
  ));
  assert(globalThis.__createNewBuildingScenario.calls.some((call) => call.name === "audit"));
});

Deno.test("create geocodes missing project coordinates before writing project and listing rows", async () => {
  resetScenario();
  const originalFetch = globalThis.fetch;
  Deno.env.set("GOOGLE_MAPS_API_KEY", "test-google-key");
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assertEquals(url.hostname, "maps.googleapis.com");
    assert(url.searchParams.get("address")?.includes("Imittou 6"));
    assertEquals(url.searchParams.get("region"), "gr");
    assertEquals(url.searchParams.get("key"), "test-google-key");
    return Promise.resolve(new Response(JSON.stringify({
      status: "OK",
      results: [{ geometry: { location: { lat: 38.0301, lng: 23.7241 } } }],
    })));
  }) as typeof fetch;

  try {
    const res = await handler(authedJson(body({
      project: {
        ...body().project,
        address: "Imittou 6",
        city: "Agioi Anargyroi",
        municipality: "Dimos Agion Anargyron - Kamaterou",
      },
      listing: {
        ...body().listing,
        address: "Imittou 6",
        city: "Agioi Anargyroi",
      },
    })));
    assertEquals(res.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
  }

  const projectInsert = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "projects"
  );
  const listingInsert = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "listings"
  );
  assertEquals((projectInsert?.args as { payload: Record<string, unknown> }).payload.latitude, 38.0301);
  assertEquals((projectInsert?.args as { payload: Record<string, unknown> }).payload.longitude, 23.7241);
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.latitude, 38.0301);
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.longitude, 23.7241);
});

Deno.test("create falls back to Nominatim geocoding when a server Google key is unavailable", async () => {
  resetScenario();
  const originalFetch = globalThis.fetch;
  const oldGoogleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const oldViteGoogleKey = Deno.env.get("VITE_GOOGLE_MAPS_API_KEY");
  Deno.env.delete("GOOGLE_MAPS_API_KEY");
  Deno.env.delete("VITE_GOOGLE_MAPS_API_KEY");
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assertEquals(url.hostname, "nominatim.openstreetmap.org");
    assertEquals(url.searchParams.get("countrycodes"), "gr");
    assertEquals((init?.headers as Record<string, string>)?.["User-Agent"], "maiprop-edge-geocode/1.0");
    return Promise.resolve(new Response(JSON.stringify([{
      lat: "38.0421087",
      lon: "23.7333126",
    }])));
  }) as typeof fetch;

  try {
    const res = await handler(authedJson(body({
      project: {
        ...body().project,
        address: "Imittou 6",
        city: "Agioi Anargyroi",
      },
      listing: {
        ...body().listing,
        address: "Imittou 6",
        city: "Agioi Anargyroi",
      },
    })));
    assertEquals(res.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldGoogleKey) Deno.env.set("GOOGLE_MAPS_API_KEY", oldGoogleKey);
    if (oldViteGoogleKey) Deno.env.set("VITE_GOOGLE_MAPS_API_KEY", oldViteGoogleKey);
  }

  const listingInsert = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "listings"
  );
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.latitude, 38.0421087);
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.longitude, 23.7333126);
});

Deno.test("create accepts multiple units and preserves renovation project listing metadata", async () => {
  resetScenario();
  const res = await handler(authedJson(body({
    projectKind: "renovation",
    units: [
      {
        project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        unit_id: "R1",
        availability_status: "available",
        internal_sqm: 80,
        price: 280000,
        price_per_sqm: 1,
      },
      {
        project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        unit_id: "R2",
        availability_status: "available",
        internal_sqm: 100,
        price: 360000,
        price_per_sqm: 1,
      },
    ],
    listing: {
      ...body().listing,
      listing_type: "new_build",
      construction_status: "renovated",
      year_built: 1982,
      tags: ["renovation_project", "renovation_year:2026"],
    },
  })));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.listingId, "33333333-3333-4333-8333-333333333333");

  const unitInserts = globalThis.__createNewBuildingScenario.calls.filter((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "project_units"
  );
  const listingInsert = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "listings"
  );
  assertEquals(unitInserts.length, 2);
  assertEquals((unitInserts[0].args as { payload: Record<string, unknown> }).payload.price_per_sqm, 3500);
  assertEquals((unitInserts[1].args as { payload: Record<string, unknown> }).payload.price_per_sqm, 3600);
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.listing_type, "new_build");
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.construction_status, "renovated");
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.year_built, 1982);
  assertEquals((listingInsert?.args as { payload: Record<string, unknown> }).payload.tags, [
    "renovation_project",
    "renovation_year:2026",
  ]);
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
