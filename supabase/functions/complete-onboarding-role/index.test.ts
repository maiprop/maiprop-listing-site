import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  calls: Array<{ name: string; args?: unknown }>;
  rpcError?: string;
};

declare global {
  // deno-lint-ignore no-var
  var __completeOnboardingScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const tempDir = await Deno.makeTempDir({ prefix: "complete-onboarding-role-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function createClient() {
  const scenario = globalThis.__completeOnboardingScenario;
  return {
    auth: {
      getUser: async (token) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        return {
          data: { user: { id: "11111111-1111-4111-8111-111111111111", email: "user@test.local" } },
          error: null,
        };
      },
    },
    rpc: async (name, args) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      return scenario.rpcError
        ? { data: null, error: { message: scenario.rpcError } }
        : { data: null, error: null };
    },
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
  .replace('from "../_shared/cors.ts"', `from "${shared("cors.ts")}"`)
  .replace('from "../_shared/auth.ts"', `from "${shared("auth.ts")}"`)
  .replace('from "../_shared/logger.ts"', `from "${shared("logger.ts")}"`);

await Deno.writeTextFile(transformedPath, transformedSource);

const { handler, restore } = await captureHandler(import.meta.url, fileUrl(transformedPath));

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__completeOnboardingScenario = { calls: [], ...overrides };
};

const authedJson = (body: unknown) =>
  req("POST", body, { authorization: `Bearer ${crypto.randomUUID()}` });

Deno.test("OPTIONS preflight returns 200", async () => {
  resetScenario();
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("self-service onboarding forwards agent role to trusted RPC", async () => {
  resetScenario();
  const res = await handler(authedJson({ role: "agent", participantType: "agent" }));

  assertEquals(res.status, 200);
  const rpcCall = globalThis.__completeOnboardingScenario.calls.find((call) => call.name === "rpc");
  assertEquals(rpcCall?.args, {
    name: "complete_onboarding_role_for_user",
    args: {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_role: "agent",
      p_participant_type: "agent",
      p_display_name: null,
      p_city: null,
      p_phone: null,
    },
  });
});

Deno.test("self-service onboarding forwards developer role to trusted RPC", async () => {
  resetScenario();
  const res = await handler(authedJson({
    role: "developer",
    participantType: "developer",
    displayName: "Dev Co",
    city: "Athens",
  }));

  assertEquals(res.status, 200);
  const rpcCall = globalThis.__completeOnboardingScenario.calls.find((call) => call.name === "rpc");
  assertEquals(rpcCall?.args, {
    name: "complete_onboarding_role_for_user",
    args: {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_role: "developer",
      p_participant_type: "developer",
      p_display_name: "Dev Co",
      p_city: "Athens",
      p_phone: null,
    },
  });
});

Deno.test("self-service onboarding rejects invite-only investor role before RPC", async () => {
  resetScenario();
  const res = await handler(authedJson({ role: "investor", participantType: "investor" }));
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error, "role_not_allowed");
  assert(!globalThis.__completeOnboardingScenario.calls.some((call) => call.name === "rpc"));
});

Deno.test("self-service onboarding rejects admin role before RPC", async () => {
  resetScenario();
  const res = await handler(authedJson({ role: "admin", participantType: "admin" }));
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error, "role_not_allowed");
  assert(!globalThis.__completeOnboardingScenario.calls.some((call) => call.name === "rpc"));
});

Deno.test("self-service onboarding forwards seller role to trusted RPC", async () => {
  resetScenario();
  const res = await handler(authedJson({ role: "seller", participantType: "seller" }));

  assertEquals(res.status, 200);
  const rpcCall = globalThis.__completeOnboardingScenario.calls.find((call) => call.name === "rpc");
  assertEquals(rpcCall?.args, {
    name: "complete_onboarding_role_for_user",
    args: {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_role: "seller",
      p_participant_type: "seller",
      p_display_name: null,
      p_city: null,
      p_phone: null,
    },
  });
});

restore();
