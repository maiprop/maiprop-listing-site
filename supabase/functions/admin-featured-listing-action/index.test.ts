import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email?: string | null };
  profile?: { role?: string | null; is_platform_admin?: boolean | null } | null;
  profileError?: string;
  updateError?: string;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __adminFeaturedListingScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "admin-featured-listing-action-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__adminFeaturedListingScenario;
  return {
    auth: {
      getUser: async (token: string) => {
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
    from: (table: string) => {
      scenario.calls.push({ name: "from", args: { table } });
      if (table === "profiles") {
        return {
          select: (columns: string) => {
            scenario.calls.push({ name: "profileSelect", args: { columns } });
            return {
              eq: (column: string, value: string) => {
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
      }
      if (table === "listings") {
        return {
          update: (values: Record<string, unknown>) => {
            scenario.calls.push({ name: "listingUpdate", args: { values } });
            return {
              eq: async (column: string, value: string) => {
                scenario.calls.push({ name: "listingEq", args: { column, value } });
                if (scenario.updateError) {
                  return { data: null, error: { message: scenario.updateError } };
                }
                return { data: null, error: null };
              },
            };
          },
        };
      }
      throw new Error("Unexpected table " + table);
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
  )
  .replace('from "../_shared/response.ts"', `from "${shared("response.ts")}"`)
  .replace('from "../_shared/schema.ts"', `from "${shared("schema.ts")}"`);

await Deno.writeTextFile(transformedPath, transformedSource);

const { handler, restore } = await captureHandler(
  import.meta.url,
  fileUrl(transformedPath),
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);
restore();

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__adminFeaturedListingScenario = {
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

const validListingId = () => crypto.randomUUID();

Deno.test("anonymous Spotlight listing updates are rejected before DB writes", async () => {
  resetScenario();

  const res = await handler(req("POST", {
    id: validListingId(),
    updates: { is_featured: true },
  }));
  const body = await res.json();

  assertEquals(res.status, 401);
  assertEquals(body.error, "No authorization header");
  assertEquals(body.code, "unauthorized");
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.some((call) => call.name === "listingUpdate"),
    false,
  );
});

Deno.test("non-admin callers are forbidden before Spotlight listing updates", async () => {
  resetScenario({ profile: { role: "agent", is_platform_admin: false } });

  const res = await handler(authedJson({
    id: validListingId(),
    updates: { priority_placement: 5 },
  }));
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "Platform admin only");
  assertEquals(body.code, "forbidden");
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.some((call) => call.name === "listingUpdate"),
    false,
  );
});

Deno.test("platform-admin flag without admin role is not enough for Spotlight listing updates", async () => {
  resetScenario({ profile: { role: "agent", is_platform_admin: true } });

  const res = await handler(authedJson({
    id: validListingId(),
    updates: { priority_placement: 5 },
  }));
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "Platform admin only");
  assertEquals(body.code, "forbidden");
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.some((call) => call.name === "listingUpdate"),
    false,
  );
});

Deno.test("admin callers update only allowed Spotlight listing fields", async () => {
  const id = validListingId();
  resetScenario({ profile: { role: "admin", is_platform_admin: false } });

  const res = await handler(authedJson({
    id,
    updates: {
      is_featured: true,
      priority_placement: 7,
      featured_until: "2026-07-31T00:00:00.000Z",
    },
  }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, { ok: true });
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.some((call) =>
      call.name === "listingUpdate" &&
      JSON.stringify(call.args) === JSON.stringify({
        values: {
          is_featured: true,
          priority_placement: 7,
          featured_until: "2026-07-31T00:00:00.000Z",
        },
      })
    ),
    true,
  );
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.some((call) =>
      call.name === "listingEq" &&
      JSON.stringify(call.args) === JSON.stringify({ column: "id", value: id })
    ),
    true,
  );
});
