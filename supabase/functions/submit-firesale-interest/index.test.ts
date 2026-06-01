import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  interest?: unknown;
  rpcError?: { message: string; code?: string };
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __submitFiresaleInterestScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "submit-firesale-interest-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__submitFiresaleInterestScenario;
  return {
    auth: {
      getUser: async (token: string) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        if (scenario.authError) {
          return { data: { user: null }, error: { message: scenario.authError } };
        }
        return {
          data: { user: scenario.user ?? { id: "user-1", email: "user@test.local" } },
          error: null,
        };
      },
    },
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (scenario.rpcError) {
        return { data: null, error: scenario.rpcError };
      }
      return {
        data: scenario.interest ?? { id: "interest-1", status: "prioritized" },
        error: null,
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
  globalThis.__submitFiresaleInterestScenario = {
    calls: [],
    user: { id: "user-1", email: "user@test.local" },
    ...overrides,
  };
};

const bodyFor = (dealId: string, overrides: Record<string, unknown> = {}) => ({
  dealId,
  message: "Ready to move",
  proofAmount: 1500000,
  proofOfFundsUrl: `user-1/firesale/${dealId}/proof_uuid.pdf`,
  ...overrides,
});

const authedJson = (body: unknown) =>
  req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });

Deno.test("anonymous direct invoke is rejected before interest submission", async () => {
  resetScenario();
  const res = await handler(req("POST", bodyFor(crypto.randomUUID())));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__submitFiresaleInterestScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("invalid deal id is rejected before auth or interest submission", async () => {
  resetScenario();
  const res = await handler(authedJson(bodyFor("not-a-uuid")));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid dealId");
  assertEquals(globalThis.__submitFiresaleInterestScenario.calls.length, 0);
});

Deno.test("proof paths must belong to the verified caller and deal", async () => {
  const dealId = crypto.randomUUID();
  resetScenario({ user: { id: "verified-user", email: "verified@test.local" } });
  const res = await handler(authedJson(bodyFor(dealId, {
    proofOfFundsUrl: `other-user/firesale/${dealId}/proof_uuid.pdf`,
  })));

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid proofOfFundsUrl");
  assertEquals(
    globalThis.__submitFiresaleInterestScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("interest submission is created for the verified caller only", async () => {
  const dealId = crypto.randomUUID();
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
    interest: { id: "interest-2", deal_id: dealId, status: "prioritized" },
  });

  const res = await handler(authedJson(bodyFor(dealId, {
    proofOfFundsUrl: `verified-user/firesale/${dealId}/proof_uuid.pdf`,
  })));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.error, null);
  assertEquals(body.data.id, "interest-2");
  assertEquals(
    globalThis.__submitFiresaleInterestScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
        name: "submit_firesale_interest_for_user",
        args: {
          _user_id: "verified-user",
          p_deal_id: dealId,
          p_message: "Ready to move",
          p_proof_amount: 1500000,
          p_proof_of_funds_url: `verified-user/firesale/${dealId}/proof_uuid.pdf`,
        },
      })
    ),
    true,
  );
});

Deno.test("business RPC errors preserve message and code in an RPC-style envelope", async () => {
  resetScenario({
    rpcError: {
      message: "investor_access_required",
      code: "P0001",
    },
  });
  const res = await handler(authedJson(bodyFor(crypto.randomUUID(), {
    proofOfFundsUrl: null,
  })));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data, null);
  assertEquals(body.error, {
    message: "investor_access_required",
    code: "P0001",
  });
});
