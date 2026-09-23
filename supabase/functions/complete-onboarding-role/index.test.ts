import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  calls: Array<{ name: string; args?: unknown }>;
  rpcError?: string;
  professionalUpsertError?: string;
};

declare global {
  // deno-lint-ignore no-var
  var __completeOnboardingScenario: MockScenario;
}

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

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
  const auditCall = globalThis.__completeOnboardingScenario.calls.find((call) => call.name === "audit");
  assertEquals(auditCall?.args, {
    actor_id: "11111111-1111-4111-8111-111111111111",
    target_id: "11111111-1111-4111-8111-111111111111",
    entity: "onboarding.role",
    action: "UPDATED",
    new_data: {
      role: "seller",
      participant_type: "seller",
      professional_id: null,
    },
    reason: "complete_onboarding_role",
  });
});

Deno.test("professional onboarding creates profile row with verified caller before RPC", async () => {
  resetScenario();
  const res = await handler(authedJson({
    role: "professional",
    participantType: "professional",
    phone: "+306900000000",
    professionalProfile: {
      title: "Pro Studio",
      category: "architect",
      displayName: "A Pro",
      city: "Athens",
      licenseNumber: "123456789",
    },
  }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.professionalId, "22222222-2222-4222-8222-222222222222");

  const upsertIndex = globalThis.__completeOnboardingScenario.calls.findIndex((call) => call.name === "upsert");
  const rpcIndex = globalThis.__completeOnboardingScenario.calls.findIndex((call) => call.name === "rpc");
  assert(upsertIndex >= 0);
  assert(rpcIndex > upsertIndex);

  const upsertCall = globalThis.__completeOnboardingScenario.calls[upsertIndex];
  assertEquals(upsertCall.args, {
    table: "professionals",
    row: {
      user_id: "11111111-1111-4111-8111-111111111111",
      title: "Pro Studio",
      category: "architect",
      display_name: "A Pro",
      city: "Athens",
      license_number: "123456789",
    },
    options: { onConflict: "user_id" },
  });
});

Deno.test("professional onboarding rejects browser-supplied profile user id before writes", async () => {
  resetScenario();
  const res = await handler(authedJson({
    role: "professional",
    participantType: "professional",
    phone: "+306900000000",
    professionalProfile: {
      userId: "99999999-9999-4999-8999-999999999999",
      title: "Pro Studio",
      category: "architect",
    },
  }));
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error, "validation_error");
  assert(!globalThis.__completeOnboardingScenario.calls.some((call) => call.name === "upsert"));
  assert(!globalThis.__completeOnboardingScenario.calls.some((call) => call.name === "rpc"));
});

restore();
