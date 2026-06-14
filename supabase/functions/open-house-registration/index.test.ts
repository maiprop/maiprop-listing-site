import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  registration?: unknown;
  rpcError?: { message: string; code?: string };
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __openHouseRegistrationScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const tempDir = await Deno.makeTempDir({ prefix: "open-house-registration-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__openHouseRegistrationScenario;
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
        data: scenario.registration ?? { id: "registration-1", status: "pending" },
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
  globalThis.__openHouseRegistrationScenario = {
    calls: [],
    user: { id: "user-1", email: "user@test.local" },
    ...overrides,
  };
};

const registrationBody = (overrides: Record<string, unknown> = {}) => ({
  listingId: crypto.randomUUID(),
  timeslotIndex: 1,
  contactName: "Buyer One",
  contactEmail: "buyer@example.com",
  contactPhone: "+306900000000",
  visitPurpose: "Buying",
  note: "Needs lift access",
  contactPermission: true,
  idVerificationConsent: true,
  privacyAcknowledgement: true,
  ...overrides,
});

const authedJson = (body: unknown) =>
  req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });

Deno.test("anonymous direct invoke is rejected before registration lookup", async () => {
  resetScenario();
  const res = await handler(req("POST", registrationBody()));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__openHouseRegistrationScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("invalid listing id is rejected before auth or registration lookup", async () => {
  resetScenario();
  const res = await handler(authedJson(registrationBody({ listingId: "x" })));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid listingId");
  assertEquals(globalThis.__openHouseRegistrationScenario.calls.length, 0);
});

Deno.test("malformed uuid-shaped listing id is rejected before auth or registration lookup", async () => {
  resetScenario();
  const res = await handler(authedJson(registrationBody({
    listingId: "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
  })));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid listingId");
  assertEquals(globalThis.__openHouseRegistrationScenario.calls.length, 0);
});

Deno.test("invalid contact email is rejected before auth or registration lookup", async () => {
  resetScenario();
  const res = await handler(authedJson(registrationBody({
    contactEmail: "buyer at example dot com",
  })));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid contactEmail");
  assertEquals(globalThis.__openHouseRegistrationScenario.calls.length, 0);
});

Deno.test("overlong note is rejected instead of silently truncated", async () => {
  resetScenario();
  const res = await handler(authedJson(registrationBody({
    note: "x".repeat(1001),
  })));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid note");
  assertEquals(globalThis.__openHouseRegistrationScenario.calls.length, 0);
});

Deno.test("registration is created for the verified caller only", async () => {
  const listingId = crypto.randomUUID();
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
    registration: { id: "registration-2", listing_id: listingId, status: "pending" },
  });

  const res = await handler(authedJson(registrationBody({ listingId })));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.error, null);
  assertEquals(body.data.id, "registration-2");
  assertEquals(
    globalThis.__openHouseRegistrationScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
        name: "create_open_house_registration_for_user",
        args: {
          _user_id: "verified-user",
          p_listing_id: listingId,
          p_timeslot_index: 1,
          p_contact_name: "Buyer One",
          p_contact_email: "buyer@example.com",
          p_contact_phone: "+306900000000",
          p_visit_purpose: "Buying",
          p_note: "Needs lift access",
          p_contact_permission: true,
          p_id_verification_consent: true,
          p_privacy_acknowledgement: true,
        },
      })
    ),
    true,
  );
});

Deno.test("business RPC errors preserve message and code in an RPC-style envelope", async () => {
  resetScenario({
    rpcError: {
      message: "open_house_timeslot_capacity_reached",
      code: "23514",
    },
  });
  const res = await handler(authedJson(registrationBody()));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data, null);
  assertEquals(body.error, {
    message: "open_house_timeslot_capacity_reached",
    code: "23514",
  });
});
