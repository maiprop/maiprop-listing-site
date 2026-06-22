import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  calls: Array<{ name: string; args?: unknown }>;
  profileFound?: boolean;
  operationError?: string;
};

declare global {
  // deno-lint-ignore no-var
  var __saveProfessionalOnboardingScenario: MockScenario;
}

const functionSource = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const tempDir = await Deno.makeTempDir({ prefix: "save-professional-onboarding-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const mockAuditPath = `${tempDir}/mockAudit.ts`;
const transformedPath = `${tempDir}/index.ts`;

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function fileUrl(path: string) {
  return `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

await Deno.writeTextFile(
  mockClientPath,
  `
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
const chain = (table, scenario, extra = {}) => ({
  eq: (column, value) => {
    scenario.calls.push({ name: "eq", args: { table, column, value } });
    return chain(table, scenario, extra);
  },
  not: (column, operator, value) => {
    scenario.calls.push({ name: "not", args: { table, column, operator, value } });
    return chain(table, scenario, extra);
  },
  maybeSingle: async () => scenario.profileFound === false
    ? { data: null, error: null }
    : { data: { id: "22222222-2222-4222-8222-222222222222" }, error: null },
  ...extra,
});

export function createClient() {
  const scenario = globalThis.__saveProfessionalOnboardingScenario;
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
    from: (table) => ({
      select: (columns) => {
        scenario.calls.push({ name: "select", args: { table, columns } });
        return chain(table, scenario);
      },
      update: (payload) => {
        scenario.calls.push({ name: "update", args: { table, payload } });
        return chain(table, scenario, {
          select: (columns) => {
            scenario.calls.push({ name: "select", args: { table, columns } });
            return chain(table, scenario);
          },
        });
      },
      upsert: (rows, options) => {
        scenario.calls.push({ name: "upsert", args: { table, rows, options } });
        return Promise.resolve(scenario.operationError
          ? { data: null, error: { message: scenario.operationError } }
          : { data: null, error: null });
      },
      delete: () => {
        scenario.calls.push({ name: "delete", args: { table } });
        return chain(table, scenario, {
          then: (resolve) => resolve(scenario.operationError
            ? { data: null, error: { message: scenario.operationError } }
            : { data: null, error: null }),
        });
      },
      insert: (rows) => {
        scenario.calls.push({ name: "insert", args: { table, rows } });
        return Promise.resolve(scenario.operationError
          ? { data: null, error: { message: scenario.operationError } }
          : { data: null, error: null });
      },
    }),
  };
}
`,
);

await Deno.writeTextFile(
  mockAuditPath,
  `
export async function logAuditEvent(event) {
  globalThis.__saveProfessionalOnboardingScenario.calls.push({ name: "audit", args: event });
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
  .replace('from "../_shared/auditLog.ts"', `from "${fileUrl(mockAuditPath)}"`)
  .replace('from "../_shared/schema.ts"', `from "${shared("schema.ts")}"`);

await Deno.writeTextFile(transformedPath, transformedSource);

const { handler, restore } = await captureHandler(import.meta.url, fileUrl(transformedPath));

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__saveProfessionalOnboardingScenario = { calls: [], ...overrides };
};

const authedJson = (body: unknown) =>
  req("POST", body, { authorization: `Bearer ${crypto.randomUUID()}` });

Deno.test("saves services only for the verified caller's professional profile", async () => {
  resetScenario();
  const res = await handler(authedJson({
    action: "services",
    professionalId: "22222222-2222-4222-8222-222222222222",
    services: [{
      professional_id: "22222222-2222-4222-8222-222222222222",
      service_key: "consult",
      service_name: "Consultation",
      description: "Advice",
      category: "architect",
      pricing_model: "hourly",
      rate_amount: 120,
      currency: "EUR",
      estimated_hours: null,
      video_enabled: true,
      is_premium: false,
      is_active: true,
    }],
  }));

  assertEquals(res.status, 200);
  assert(globalThis.__saveProfessionalOnboardingScenario.calls.some((call) =>
    call.name === "eq" &&
    JSON.stringify(call.args).includes('"column":"user_id"') &&
    JSON.stringify(call.args).includes("11111111-1111-4111-8111-111111111111")
  ));
  assert(globalThis.__saveProfessionalOnboardingScenario.calls.some((call) =>
    call.name === "upsert" &&
    JSON.stringify(call.args).includes('"table":"professional_services"')
  ));
  assert(globalThis.__saveProfessionalOnboardingScenario.calls.some((call) =>
    call.name === "audit" &&
    JSON.stringify(call.args).includes('"entity":"professional.onboarding"') &&
    JSON.stringify(call.args).includes('"action":"services"')
  ));
});

Deno.test("rejects service rows for another professional before writes", async () => {
  resetScenario();
  const res = await handler(authedJson({
    action: "services",
    professionalId: "22222222-2222-4222-8222-222222222222",
    services: [{
      professional_id: "33333333-3333-4333-8333-333333333333",
      service_key: "consult",
      service_name: "Consultation",
      category: "architect",
      pricing_model: "hourly",
      currency: "EUR",
      video_enabled: true,
      is_premium: false,
      is_active: true,
    }],
  }));
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error, "professional_id_mismatch");
  assert(!globalThis.__saveProfessionalOnboardingScenario.calls.some((call) => call.name === "upsert"));
  assert(!globalThis.__saveProfessionalOnboardingScenario.calls.some((call) => call.name === "delete"));
});

Deno.test("saves availability and prunes days by professional id", async () => {
  resetScenario();
  const res = await handler(authedJson({
    action: "availability",
    professionalId: "22222222-2222-4222-8222-222222222222",
    availability: [{
      professional_id: "22222222-2222-4222-8222-222222222222",
      day_of_week: 1,
      start_time: "09:00",
      end_time: "17:00",
      is_active: true,
    }],
  }));

  assertEquals(res.status, 200);
  assert(globalThis.__saveProfessionalOnboardingScenario.calls.some((call) =>
    call.name === "upsert" &&
    JSON.stringify(call.args).includes('"table":"professional_availability"')
  ));
  assert(globalThis.__saveProfessionalOnboardingScenario.calls.some((call) =>
    call.name === "not" &&
    JSON.stringify(call.args).includes('"column":"day_of_week"')
  ));
});

Deno.test("saves video settings scoped to verified caller", async () => {
  resetScenario();
  const res = await handler(authedJson({
    action: "video",
    professionalId: "22222222-2222-4222-8222-222222222222",
    videoLink: "https://example.test/intro",
    calendarNotes: "Weekdays only",
  }));

  assertEquals(res.status, 200);
  assert(globalThis.__saveProfessionalOnboardingScenario.calls.some((call) =>
    call.name === "update" &&
    JSON.stringify(call.args).includes('"table":"professionals"') &&
    JSON.stringify(call.args).includes("https://example.test/intro")
  ));
  assert(globalThis.__saveProfessionalOnboardingScenario.calls.some((call) =>
    call.name === "eq" &&
    JSON.stringify(call.args).includes('"column":"user_id"') &&
    JSON.stringify(call.args).includes("11111111-1111-4111-8111-111111111111")
  ));
});

restore();
