import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email?: string | null };
  profile?: { role?: string | null; is_platform_admin?: boolean | null } | null;
  profileError?: string;
  rpcError?: string;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __adminFeaturedListingScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({
  prefix: "admin-featured-listing-action-test-",
});
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
    rpc: async (name: string, args: Record<string, unknown>) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (scenario.rpcError) {
        return { data: null, error: { message: scenario.rpcError } };
      }
      return { data: null, error: null };
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
    globalThis.__adminFeaturedListingScenario.calls.some((call) =>
      call.name === "listingUpdate"
    ),
    false,
  );
});

Deno.test("non-admin callers are forbidden before Spotlight listing updates", async () => {
  resetScenario({ profile: { role: "agent", is_platform_admin: false } });

  const res = await handler(authedJson({
    id: validListingId(),
    updates: { priority_placement: 1 },
  }));
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "Platform admin only");
  assertEquals(body.code, "forbidden");
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.some((call) =>
      call.name === "listingUpdate"
    ),
    false,
  );
});

Deno.test("platform-admin flag without admin role is not enough for Spotlight listing updates", async () => {
  resetScenario({ profile: { role: "agent", is_platform_admin: true } });

  const res = await handler(authedJson({
    id: validListingId(),
    updates: { priority_placement: 1 },
  }));
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "Platform admin only");
  assertEquals(body.code, "forbidden");
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.some((call) =>
      call.name === "listingUpdate"
    ),
    false,
  );
});

Deno.test("admin callers atomically update Spotlight and Priority in one ledger RPC", async () => {
  const id = validListingId();
  resetScenario({ profile: { role: "admin", is_platform_admin: false } });

  const res = await handler(authedJson({
    id,
    updates: {
      is_featured: true,
      priority_placement: 1,
      featured_until: "2026-07-31T00:00:00.000Z",
    },
  }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, { ok: true });
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.filter((call) =>
      call.name === "rpc"
    ),
    [{
      name: "rpc",
      args: {
        name: "admin_set_listing_promotions",
        args: {
          p_listing_id: id,
          p_spotlight_enabled: true,
          p_spotlight_ends_at: "2026-07-31T00:00:00.000Z",
          p_priority_enabled: true,
          p_actor_id: "admin-user",
        },
      },
    }],
  );
});

Deno.test("expiry-only updates preserve the active campaign history", async () => {
  const id = validListingId();
  resetScenario({ profile: { role: "admin" } });

  const res = await handler(authedJson({
    id,
    updates: { featured_until: "2026-08-20T00:00:00.000Z" },
  }));

  assertEquals(res.status, 200);
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.filter((call) =>
      call.name === "rpc"
    ),
    [{
      name: "rpc",
      args: {
        name: "admin_update_listing_promotion_expiry",
        args: {
          p_listing_id: id,
          p_promotion_type: "spotlight",
          p_ends_at: "2026-08-20T00:00:00.000Z",
          p_actor_id: "admin-user",
        },
      },
    }],
  );
});

Deno.test("admin callers can revoke Spotlight through the ledger RPC", async () => {
  const id = validListingId();
  resetScenario({ profile: { role: "admin" } });

  const res = await handler(authedJson({
    id,
    updates: { is_featured: false },
  }));

  assertEquals(res.status, 200);
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.find((call) =>
      call.name === "rpc"
    ),
    {
      name: "rpc",
      args: {
        name: "admin_set_listing_promotions",
        args: {
          p_listing_id: id,
          p_spotlight_enabled: false,
          p_spotlight_ends_at: null,
          p_priority_enabled: null,
          p_actor_id: "admin-user",
        },
      },
    },
  );
});

Deno.test("admin callers can remove Priority with the boolean projection value", async () => {
  const id = validListingId();
  resetScenario({ profile: { role: "admin" } });

  const res = await handler(authedJson({
    id,
    updates: { priority_placement: 0 },
  }));

  assertEquals(res.status, 200);
  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.filter((call) =>
      call.name === "rpc"
    ),
    [{
      name: "rpc",
      args: {
        name: "admin_set_listing_promotions",
        args: {
          p_listing_id: id,
          p_spotlight_enabled: null,
          p_spotlight_ends_at: null,
          p_priority_enabled: false,
          p_actor_id: "admin-user",
        },
      },
    }],
  );
});

Deno.test("Priority rejects rank values outside the paid product boolean", async () => {
  resetScenario({ profile: { role: "admin" } });

  for (const priority_placement of [-1, 2, 10]) {
    const res = await handler(authedJson({
      id: validListingId(),
      updates: { priority_placement },
    }));

    assertEquals(res.status, 400);
  }

  assertEquals(
    globalThis.__adminFeaturedListingScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("ledger RPC errors preserve the existing API status mapping", async () => {
  resetScenario({ profile: { role: "admin" }, rpcError: "listing_not_found" });

  const res = await handler(authedJson({
    id: validListingId(),
    updates: { priority_placement: 1 },
  }));
  const body = await res.json();

  assertEquals(res.status, 404);
  assertEquals(body.error, "listing_not_found");
  assertEquals(body.code, "not_found");
});
