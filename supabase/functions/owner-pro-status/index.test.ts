/**
 * Tests for owner-pro-status edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type ListingRow = {
  id: string;
  owner_id: string | null;
  status: string;
  is_off_market: boolean;
};

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  listing?: ListingRow | null;
  ownerIsPro?: boolean;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __ownerProStatusScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "owner-pro-status-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
type Scenario = typeof globalThis.__ownerProStatusScenario;

class QueryBuilder {
  private filters: Array<{ column: string; value: unknown }> = [];

  constructor(private table: string, private scenario: Scenario) {}

  select(columns: string) {
    this.scenario.calls.push({ name: "select", args: { table: this.table, columns } });
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    this.scenario.calls.push({ name: "eq", args: { table: this.table, column, value } });
    return this;
  }

  async maybeSingle() {
    this.scenario.calls.push({ name: "maybeSingle", args: { table: this.table, filters: this.filters } });
    if (this.table !== "listings") return { data: null, error: null };

    const listing = this.scenario.listing ?? null;
    if (!listing) return { data: null, error: null };

    const matches = this.filters.every(({ column, value }) => listing[column as keyof typeof listing] === value);
    return { data: matches ? { owner_id: listing.owner_id } : null, error: null };
  }
}

export function createClient() {
  const scenario = globalThis.__ownerProStatusScenario;
  return {
    auth: {
      getUser: async (token: string) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        if (scenario.authError) {
          return { data: { user: null }, error: { message: scenario.authError } };
        }
        return {
          data: { user: scenario.user ?? { id: "caller-user", email: "caller@test.local" } },
          error: null,
        };
      },
    },
    from: (table: string) => {
      scenario.calls.push({ name: "from", args: { table } });
      return new QueryBuilder(table, scenario);
    },
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      return { data: scenario.ownerIsPro === true, error: null };
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
  {
    RATE_LIMIT_FORCE_MEMORY: "true",
  },
);

const listingId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const callerId = "33333333-3333-4333-8333-333333333333";

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__ownerProStatusScenario = {
    calls: [],
    user: { id: callerId, email: "caller@test.local" },
    listing: {
      id: listingId,
      owner_id: ownerId,
      status: "active",
      is_off_market: false,
    },
    ownerIsPro: true,
    ...overrides,
  };
};

const authedJson = (body: unknown) => {
  return req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });
};

Deno.test("OPTIONS preflight returns CORS headers", async () => {
  resetScenario();
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("anonymous direct invoke is rejected before owner status lookup", async () => {
  resetScenario();
  const res = await handler(req("POST", { listingId }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__ownerProStatusScenario.calls.some((call) =>
      call.name === "from"
    ),
    false,
  );
});

Deno.test("fake bearer token returns auth failure, not owner status", async () => {
  resetScenario({ authError: "invalid JWT" });
  const res = await handler(authedJson({ listingId }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "invalid JWT");
  assertEquals(
    globalThis.__ownerProStatusScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("GET does not expose owner status", async () => {
  resetScenario();
  const res = await handler(
    req("GET", undefined, { authorization: `Bearer ${crypto.randomUUID()}` }),
  );
  assertEquals(res.status, 405);
});

Deno.test("public active listing returns owner Pro status", async () => {
  resetScenario({ ownerIsPro: true });

  const res = await handler(authedJson({ listingId }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.isPro, true);
  assertEquals(
    globalThis.__ownerProStatusScenario.calls.some((call) =>
      call.name === "eq" &&
      JSON.stringify(call.args) ===
        JSON.stringify({ table: "listings", column: "status", value: "active" })
    ),
    true,
  );
  assertEquals(
    globalThis.__ownerProStatusScenario.calls.some((call) =>
      call.name === "eq" &&
      JSON.stringify(call.args) ===
        JSON.stringify({
          table: "listings",
          column: "is_off_market",
          value: false,
        })
    ),
    true,
  );
  assertEquals(
    globalThis.__ownerProStatusScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    true,
  );
});

Deno.test("unrelated caller cannot learn owner Pro status for an off-market listing", async () => {
  resetScenario({
    listing: {
      id: listingId,
      owner_id: ownerId,
      status: "active",
      is_off_market: true,
    },
    ownerIsPro: true,
  });

  const res = await handler(authedJson({ listingId }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.isPro, false);
  assertEquals(
    globalThis.__ownerProStatusScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("unrelated caller cannot learn owner Pro status for a draft listing", async () => {
  resetScenario({
    listing: {
      id: listingId,
      owner_id: ownerId,
      status: "draft",
      is_off_market: false,
    },
    ownerIsPro: true,
  });

  const res = await handler(authedJson({ listingId }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.isPro, false);
  assertEquals(
    globalThis.__ownerProStatusScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

restore();
