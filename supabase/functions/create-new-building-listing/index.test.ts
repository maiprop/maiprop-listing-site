import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  user?: { id: string; email: string };
  profileRole?: string | null;
  roleSwitchInProgress?: boolean;
  proAllowed?: boolean;
  rpcError?: string;
  rpcFailures?: Array<{
    type: "error" | "throw";
    message: string;
    code?: string;
    status?: number;
  }>;
  rpcIdempotent?: boolean;
  rpcIdempotentOnCall?: number;
  cleanupStageError?: string;
  committedProjectMediaUrls?: string[];
  projectMediaLookupError?: string;
  committedListing?: { id: string; cover_image_url: string | null } | null;
  committedListingImageUrls?: string[];
  listingLookupError?: string;
  listingImagesLookupError?: string;
  storageRemoveError?: string;
  missingStoragePaths?: string[];
  removedStorage?: Array<{ bucket: string; paths: string[] }>;
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
    in: (column, values) => {
      filters.push([column, values]);
      return chain;
    },
    neq: (column, value) => {
      filters.push([column, { neq: value }]);
      return chain;
    },
    then: (resolve) => {
      globalThis.__createNewBuildingScenario.calls.push({ name: operation, args: { table, payload, filters } });
      return Promise.resolve(resolve(result));
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
    rpc: async (name, args) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (name === "stage_storage_cleanup_jobs_for_service") {
        return {
          data: scenario.cleanupStageError ? null : args.p_objects.length,
          error: scenario.cleanupStageError
            ? { message: scenario.cleanupStageError }
            : null,
        };
      }
      if (name !== "create_new_building_listing_with_storage_for_service") {
        return { data: null, error: { message: "unexpected_rpc" } };
      }
      const rpcCallNumber = scenario.calls.filter((call) =>
        call.name === "rpc"
        && call.args?.name === "create_new_building_listing_with_storage_for_service"
      ).length;
      const failure = scenario.rpcFailures?.[rpcCallNumber - 1];
      if (failure?.type === "throw") {
        throw new TypeError(failure.message);
      }
      if (failure?.type === "error") {
        return {
          data: null,
          error: {
            message: failure.message,
            code: failure.code ?? "",
            status: failure.status ?? 0,
          },
        };
      }
      return scenario.rpcError
        ? { data: null, error: { message: scenario.rpcError, code: "22023" } }
        : {
          data: {
            listingId: "33333333-3333-4333-8333-333333333333",
            projectId: args.p_project.id,
            idempotent: scenario.rpcIdempotent === true
              || scenario.rpcIdempotentOnCall === rpcCallNumber,
          },
          error: null,
        };
    },
    storage: {
      from: (bucket) => ({
        getPublicUrl: (path) => ({
          data: {
            publicUrl: \`https://test-project.supabase.co/storage/v1/object/public/\${bucket}/\${path}\`,
          },
        }),
        list: async (folder, options) => {
          const fileName = options?.search;
          const path = folder ? \`\${folder}/\${fileName}\` : fileName;
          scenario.calls.push({ name: "storageList", args: { bucket, folder, options } });
          return {
            data: scenario.missingStoragePaths?.includes(path) ? [] : [{ name: fileName }],
            error: null,
          };
        },
        remove: async (paths) => {
          scenario.calls.push({ name: "storageRemove", args: { bucket, paths } });
          scenario.removedStorage?.push({ bucket, paths });
          return {
            data: null,
            error: scenario.storageRemoveError
              ? { message: scenario.storageRemoveError }
              : null,
          };
        },
      }),
    },
    from: (table) => ({
      upsert: async (payload, options) => {
        scenario.calls.push({ name: "upsert", args: { table, payload, options } });
        return { data: null, error: null };
      },
      select: (columns) => ({
        eq: (column, value) => {
          if (table === "project_media") {
            scenario.calls.push({ name: "select", args: { table, columns, filters: [[column, value]] } });
            return Promise.resolve({
              data: (scenario.committedProjectMediaUrls ?? []).map((url) => ({ url })),
              error: scenario.projectMediaLookupError
                ? { message: scenario.projectMediaLookupError }
                : null,
            });
          }
          if (table === "listing_images") {
            scenario.calls.push({ name: "select", args: { table, columns, filters: [[column, value]] } });
            return Promise.resolve({
              data: (scenario.committedListingImageUrls ?? []).map((url) => ({ url })),
              error: scenario.listingImagesLookupError
                ? { message: scenario.listingImagesLookupError }
                : null,
            });
          }
          return {
            maybeSingle: async () => {
              scenario.calls.push({ name: "select", args: { table, columns, filters: [[column, value]] } });
              if (table === "listings") {
                return {
                  data: scenario.committedListing ?? null,
                  error: scenario.listingLookupError
                    ? { message: scenario.listingLookupError }
                    : null,
                };
              }
              return {
                data: {
                  role: scenario.profileRole ?? "developer",
                  role_switch_in_progress_at: scenario.roleSwitchInProgress ? "2026-06-01T00:00:00Z" : null,
                },
                error: null,
              };
            },
          };
        },
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
    /import\s*\{\s*createClient,\s*type SupabaseClient,\s*\}\s*from "npm:@supabase\/supabase-js@2\.57\.2";/,
    `import { createClient } from "${fileUrl(mockClientPath)}";
type SupabaseClient = ReturnType<typeof createClient>;`,
  )
  .replace('from "../_shared/auth.ts"', `from "${shared("auth.ts")}"`)
  .replace('from "../_shared/cors.ts"', `from "${shared("cors.ts")}"`)
  .replace('from "../_shared/logger.ts"', `from "${shared("logger.ts")}"`)
  .replace('from "../_shared/rateLimit.ts"', `from "${shared("rateLimit.ts")}"`)
  .replace('from "../_shared/schema.ts"', `from "${shared("schema.ts")}"`)
  .replace('from "../_shared/auditLog.ts"', `from "${fileUrl(mockAuditPath)}"`)
  .replace('from "../_shared/proGate.ts"', `from "${fileUrl(mockProGatePath)}"`);

if (transformedSource.includes("npm:@supabase/supabase-js")) {
  throw new Error("create-new-building-listing test failed to replace Supabase client");
}

await Deno.writeTextFile(transformedPath, transformedSource);

const { handler, restore } = await captureHandler(
  import.meta.url,
  fileUrl(transformedPath),
  {
    RATE_LIMIT_FORCE_MEMORY: "true",
    SUPABASE_URL: "https://test-project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  },
);
restore();

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__createNewBuildingScenario = {
    calls: [],
    removedStorage: [],
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
  },
  unit: {
    internal_sqm: 100,
    price: 250000,
  },
  projectMedia: [{
    url: "https://test-project.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/render.jpg",
    media_type: "rendering",
  }],
  listing: {
    title: "Marina Heights A1",
    cover_image_url: "https://test-project.supabase.co/storage/v1/object/public/listing-images/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/cover.jpg",
  },
  additionalImageUrls: [
    "https://test-project.supabase.co/storage/v1/object/public/listing-images/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/2.jpg",
  ],
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

Deno.test("Developer Pro creation forces ownership and derives commercial fields through one atomic RPC", async () => {
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

  const rpc = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "rpc"
  );
  const rpcArgs = (rpc?.args as {
    name: string;
    args: {
      p_actor_user_id: string;
      p_organization_id: string | null;
      p_project: Record<string, unknown>;
      p_units: Array<Record<string, unknown>>;
      p_listing: Record<string, unknown>;
      p_storage_objects: Array<Record<string, unknown>>;
    };
  });
  assertEquals(rpcArgs.name, "create_new_building_listing_with_storage_for_service");
  assertEquals(rpcArgs.args.p_actor_user_id, "11111111-1111-4111-8111-111111111111");
  assertEquals(rpcArgs.args.p_organization_id, null);
  assertEquals("owner_id" in rpcArgs.args.p_project, false);
  assertEquals("availability_status" in rpcArgs.args.p_units[0], false);
  assertEquals("price_per_sqm" in rpcArgs.args.p_units[0], false);
  assertEquals("owner_id" in rpcArgs.args.p_listing, false);
  assertEquals("listing_type" in rpcArgs.args.p_listing, false);
  assertEquals("is_pre_sale" in rpcArgs.args.p_listing, false);
  assertEquals(rpcArgs.args.p_storage_objects.map((row) => [
    row.bucket,
    row.object_path,
  ]), [
    [
      "project-media",
      "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/render.jpg",
    ],
    [
      "listing-images",
      "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/cover.jpg",
    ],
    [
      "listing-images",
      "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/2.jpg",
    ],
  ]);
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.some((call) =>
      ["insert", "delete"].includes(call.name)
      || (
        call.name === "update"
        && (call.args as { table?: string }).table !== "storage_cleanup_jobs"
      )
    ),
    false,
  );
  assert(globalThis.__createNewBuildingScenario.calls.some((call) => call.name === "audit"));
});

Deno.test("organization ownership is passed separately for database authorization", async () => {
  resetScenario();
  const organizationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const res = await handler(authedJson(body({ organizationId })));
  assertEquals(res.status, 200);

  const rpc = globalThis.__createNewBuildingScenario.calls.find((call) => call.name === "rpc");
  const rpcArgs = (rpc?.args as { args: { p_organization_id: string | null } }).args;
  assertEquals(rpcArgs.p_organization_id, organizationId);
});

Deno.test("foreign, flat, or non-canonical creation storage references are rejected before the transaction", async () => {
  resetScenario();
  const res = await handler(authedJson(body({
    listing: {
      ...body().listing,
      cover_image_url:
        "https://test-project.supabase.co/storage/v1/object/public/listing-images/another-user/cover.jpg",
    },
  })));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "storage_reference_not_owned");
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.some((call) =>
      call.name === "rpc"
      && (call.args as { name?: string }).name ===
        "create_new_building_listing_with_storage_for_service"
    ),
    false,
  );

  resetScenario();
  const flatRes = await handler(authedJson(body({
    listing: {
      ...body().listing,
      cover_image_url:
        "https://test-project.supabase.co/storage/v1/object/public/listing-images/11111111-1111-4111-8111-111111111111/cover.jpg",
    },
  })));
  assertEquals(flatRes.status, 400);
  assertEquals((await flatRes.json()).error, "storage_reference_not_owned");
});

Deno.test("same-prefix storage references must exist before the transaction", async () => {
  resetScenario({
    missingStoragePaths: [
      "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/cover.jpg",
    ],
  });
  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "storage_reference_missing");
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.some((call) =>
      call.name === "rpc"
      && (call.args as { name?: string }).name ===
        "create_new_building_listing_with_storage_for_service"
    ),
    false,
  );
  const cleanupStage = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "rpc"
    && (call.args as { name?: string }).name === "stage_storage_cleanup_jobs_for_service"
  );
  assertEquals(
    ((cleanupStage?.args as { args: { p_objects: Array<{ bucket: string }> } }).args.p_objects)
      .map((object) => object.bucket),
    ["project-media", "listing-images", "listing-images"],
  );
  assertEquals(globalThis.__createNewBuildingScenario.removedStorage, []);
});

Deno.test("strict Edge contract rejects server-owned listing and unit fields", async () => {
  resetScenario();
  const res = await handler(authedJson(body({
    unit: {
      ...body().unit,
      availability_status: "sold",
    },
    listing: {
      ...body().listing,
      listing_type: "sale",
    },
  })));

  assertEquals(res.status, 400);
  assertEquals(globalThis.__createNewBuildingScenario.calls.length, 0);
});

Deno.test("partial coordinates are rejected instead of silently mixing locations", async () => {
  resetScenario();
  const res = await handler(authedJson(body({
    project: {
      ...body().project,
      latitude: 38.03,
    },
  })));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "project_coordinates_incomplete");
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.some((call) => call.name === "rpc"),
    false,
  );
});

Deno.test("project dates must follow permit, construction, structure, delivery order", async () => {
  resetScenario();
  const res = await handler(authedJson(body({
    project: {
      ...body().project,
      permit_approval_date: "2027-01-01",
      construction_start_date: "2026-12-01",
    },
  })));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "project_dates_out_of_order");
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.some((call) => call.name === "rpc"),
    false,
  );
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
    })));
    assertEquals(res.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
  }

  const rpc = globalThis.__createNewBuildingScenario.calls.find((call) => call.name === "rpc");
  const rpcArgs = (rpc?.args as {
    args: {
      p_project: Record<string, unknown>;
      p_listing: Record<string, unknown>;
    };
  }).args;
  assertEquals(rpcArgs.p_project.latitude, 38.0301);
  assertEquals(rpcArgs.p_project.longitude, 23.7241);
  assertEquals("latitude" in rpcArgs.p_listing, false);
  assertEquals("longitude" in rpcArgs.p_listing, false);
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
    })));
    assertEquals(res.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldGoogleKey) Deno.env.set("GOOGLE_MAPS_API_KEY", oldGoogleKey);
    if (oldViteGoogleKey) Deno.env.set("VITE_GOOGLE_MAPS_API_KEY", oldViteGoogleKey);
  }

  const rpc = globalThis.__createNewBuildingScenario.calls.find((call) => call.name === "rpc");
  const rpcArgs = (rpc?.args as {
    args: { p_listing: Record<string, unknown> };
  }).args;
  assertEquals("latitude" in rpcArgs.p_listing, false);
  assertEquals("longitude" in rpcArgs.p_listing, false);
});

Deno.test("create accepts multiple units and derives renovation metadata server-side", async () => {
  resetScenario();
  const res = await handler(authedJson(body({
    projectKind: "renovation",
    project: {
      ...body().project,
      building_permit_number: null,
      construction_year: 1982,
      renovation_year: 2026,
    },
    units: [
      {
        unit_id: "R1",
        internal_sqm: 80,
        price: 280000,
      },
      {
        unit_id: "R2",
        internal_sqm: 100,
        price: 360000,
      },
    ],
  })));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.listingId, "33333333-3333-4333-8333-333333333333");

  const rpc = globalThis.__createNewBuildingScenario.calls.find((call) => call.name === "rpc");
  const rpcArgs = (rpc?.args as {
    args: {
      p_project_kind: string;
      p_units: Array<Record<string, unknown>>;
      p_listing: Record<string, unknown>;
    };
  }).args;
  assertEquals(rpcArgs.p_project_kind, "renovation");
  assertEquals(rpcArgs.p_units.length, 2);
  assertEquals("price_per_sqm" in rpcArgs.p_units[0], false);
  assertEquals("price_per_sqm" in rpcArgs.p_units[1], false);
  assertEquals("listing_type" in rpcArgs.p_listing, false);
  assertEquals("construction_status" in rpcArgs.p_listing, false);
  assertEquals("year_built" in rpcArgs.p_listing, false);
  assertEquals("tags" in rpcArgs.p_listing, false);
});

Deno.test("client-supplied project scope fields are rejected before auth and writes", async () => {
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
  assert(String(parsed.error).includes("project_id"));
  assertEquals(globalThis.__createNewBuildingScenario.calls.length, 0);
});

Deno.test("organization ownership cannot be smuggled inside the project object", async () => {
  resetScenario();
  const res = await handler(authedJson(body({
    project: {
      ...body().project,
      organization_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    },
  })));

  assertEquals(res.status, 400);
  assertEquals(globalThis.__createNewBuildingScenario.calls.length, 0);
});

Deno.test("atomic RPC failure queues exact run-owned objects without deleting inline", async () => {
  resetScenario({ rpcError: "image insert failed" });
  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "image insert failed");
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.some((call) =>
      ["insert", "delete"].includes(call.name)
      || (
        call.name === "update"
        && (call.args as { table?: string }).table !== "storage_cleanup_jobs"
      )
    ),
    false,
  );
  assertEquals(globalThis.__createNewBuildingScenario.removedStorage, []);
  const cleanupStages = globalThis.__createNewBuildingScenario.calls.filter((call) =>
    call.name === "rpc"
    && (call.args as { name?: string }).name === "stage_storage_cleanup_jobs_for_service"
  );
  assertEquals(cleanupStages.length, 1);
  const cleanupArgs = (cleanupStages[0].args as {
    args: {
      p_mode: string;
      p_reason: string;
      p_objects: Array<{ bucket: string; object_path: string }>;
    };
  }).args;
  assertEquals(cleanupArgs.p_mode, "enqueue");
  assertEquals(cleanupArgs.p_reason, "creation_failed");
  assertEquals(
    cleanupArgs.p_objects.map((object) => [object.bucket, object.object_path]),
    [
      [
        "project-media",
        "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/render.jpg",
      ],
      [
        "listing-images",
        "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/cover.jpg",
      ],
      [
        "listing-images",
        "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/2.jpg",
      ],
    ],
  );
});

Deno.test("cleanup enqueue failure preserves the original atomic error and avoids inline deletion", async () => {
  resetScenario({
    rpcError: "image insert failed",
    cleanupStageError: "outbox unavailable",
  });
  const res = await handler(authedJson(body()));
  const parsed = await res.json();
  assertEquals(res.status, 400);
  assertEquals(parsed.error, "image insert failed");
  assertEquals(globalThis.__createNewBuildingScenario.removedStorage, []);

  const cleanupStages = globalThis.__createNewBuildingScenario.calls.filter((call) =>
    call.name === "rpc"
    && (call.args as { name?: string }).name === "stage_storage_cleanup_jobs_for_service"
  );
  assertEquals(cleanupStages.length, 1);
});

Deno.test("idempotent retries queue only uncommitted creation objects", async () => {
  resetScenario({
    rpcIdempotent: true,
    committedProjectMediaUrls: [
      "https://test-project.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/original.jpg",
    ],
    committedListing: {
      id: "33333333-3333-4333-8333-333333333333",
      cover_image_url: "https://test-project.supabase.co/storage/v1/object/public/listing-images/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/original-cover.jpg",
    },
  });
  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.idempotent, true);
  assertEquals(globalThis.__createNewBuildingScenario.removedStorage, []);
  const cleanupStage = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "rpc"
    && (call.args as { name?: string }).name === "stage_storage_cleanup_jobs_for_service"
  );
  assertEquals(
    ((cleanupStage?.args as {
      args: { p_objects: Array<{ object_path: string }> };
    }).args.p_objects).map((object) => object.object_path),
    [
      "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/render.jpg",
      "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/cover.jpg",
      "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/2.jpg",
    ],
  );
});

Deno.test("idempotent request replay preserves project media already committed to the project", async () => {
  const committedUrl =
    "https://test-project.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/create/render.jpg";
  resetScenario({
    rpcIdempotent: true,
    committedProjectMediaUrls: [committedUrl],
    committedListing: {
      id: "33333333-3333-4333-8333-333333333333",
      cover_image_url: body().listing.cover_image_url,
    },
    committedListingImageUrls: body().additionalImageUrls,
  });

  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.idempotent, true);
  assertEquals(globalThis.__createNewBuildingScenario.removedStorage, []);
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.some((call) =>
      call.name === "rpc"
      && (call.args as { name?: string }).name === "stage_storage_cleanup_jobs_for_service"
    ),
    false,
  );
});

Deno.test("idempotent cleanup preserves media when committed-state lookup is unavailable", async () => {
  resetScenario({
    rpcIdempotent: true,
    projectMediaLookupError: "database unavailable",
  });

  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.idempotent, true);
  assertEquals(globalThis.__createNewBuildingScenario.removedStorage, []);
  const cleanupStage = globalThis.__createNewBuildingScenario.calls.find((call) =>
    call.name === "rpc"
    && (call.args as { name?: string }).name === "stage_storage_cleanup_jobs_for_service"
  );
  assertEquals(
    (cleanupStage?.args as { args: { p_reason: string } }).args.p_reason,
    "idempotent_reconciliation:committed_state_unavailable",
  );
});

Deno.test("lost atomic RPC response reconciles by stable project id without deleting committed media", async () => {
  resetScenario({
    rpcFailures: [{
      type: "error",
      message: "TypeError: Failed to fetch",
      code: "",
      status: 0,
    }],
    rpcIdempotentOnCall: 2,
    committedProjectMediaUrls: [body().projectMedia[0].url],
    committedListing: {
      id: "33333333-3333-4333-8333-333333333333",
      cover_image_url: body().listing.cover_image_url,
    },
    committedListingImageUrls: body().additionalImageUrls,
  });

  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.projectId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assertEquals(parsed.data.listingId, "33333333-3333-4333-8333-333333333333");
  assertEquals(parsed.data.idempotent, true);
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.filter((call) => call.name === "rpc").length,
    2,
  );
  assertEquals(globalThis.__createNewBuildingScenario.removedStorage, []);
});

Deno.test("thrown atomic RPC transport failure reconciles without deleting committed media", async () => {
  resetScenario({
    rpcFailures: [{
      type: "throw",
      message: "network connection closed",
    }],
    rpcIdempotentOnCall: 2,
    committedProjectMediaUrls: [body().projectMedia[0].url],
    committedListing: {
      id: "33333333-3333-4333-8333-333333333333",
      cover_image_url: body().listing.cover_image_url,
    },
    committedListingImageUrls: body().additionalImageUrls,
  });

  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.idempotent, true);
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.filter((call) => call.name === "rpc").length,
    2,
  );
  assertEquals(globalThis.__createNewBuildingScenario.removedStorage, []);
});

Deno.test("unresolved atomic RPC transport failure preserves media and returns retryable 503", async () => {
  resetScenario({
    rpcFailures: [
      { type: "throw", message: "request timed out" },
      { type: "throw", message: "request timed out" },
    ],
  });

  const res = await handler(authedJson(body()));
  const parsed = await res.json();

  assertEquals(res.status, 503);
  assertEquals(parsed.error, "new_build_atomic_outcome_unknown");
  assertEquals(parsed.retryable, true);
  assertEquals(
    globalThis.__createNewBuildingScenario.calls.filter((call) => call.name === "rpc").length,
    2,
  );
  assertEquals(globalThis.__createNewBuildingScenario.removedStorage, []);
});
