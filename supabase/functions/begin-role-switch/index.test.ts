import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  authError?: string;
  user?: { id: string; email: string };
  rpcError?: string;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  var __beginRoleSwitchScenario: MockScenario;
}

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);
restore();
const beginRoleSwitchModule = await import("./index.ts");

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__beginRoleSwitchScenario = {
    calls: [],
    user: { id: "user-1", email: "user@test.local" },
    ...overrides,
  };
};

const authedJson = (body: unknown = {}) =>
  req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });

Deno.test("OPTIONS preflight returns CORS headers", async () => {
  resetScenario();
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("anonymous direct invoke is rejected before role switch RPC", async () => {
  resetScenario();
  const res = await handler(req("POST", {
    audit_id: "11111111-1111-4111-8111-111111111111",
  }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
  assertEquals(
    globalThis.__beginRoleSwitchScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("anonymous malformed requests are rejected without consuming JSON", async () => {
  const request = new Request(
    "https://functions.test/begin-role-switch",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    },
  );

  resetScenario();
  const res = await handler(request);

  assertEquals(res.status, 401);
  assertEquals(request.bodyUsed, false);
  assertEquals(globalThis.__beginRoleSwitchScenario.calls.length, 0);
});

Deno.test("declared oversized bodies are rejected before JSON parsing", async () => {
  const request = authedJson({ validate_only: true });
  request.headers.set("content-length", "65536");

  resetScenario();
  const res = await handler(request);
  const body = await res.json();

  assertEquals(res.status, 413);
  assertEquals(body.code, "payload_too_large");
  assertEquals(request.bodyUsed, false);
  assertEquals(
    globalThis.__beginRoleSwitchScenario.calls.some((call) =>
      call.name === "rpc"
    ),
    false,
  );
});

Deno.test("stalled begin-role-switch bodies are cancelled with HTTP 408", async () => {
  const parseRequest = (
    beginRoleSwitchModule as unknown as {
      parseBeginRoleSwitchRequest?: (
        request: Request,
        options: { timeoutMs: number },
      ) => Promise<unknown>;
    }
  ).parseBeginRoleSwitchRequest;
  assertEquals(typeof parseRequest, "function");
  if (!parseRequest) return;

  let cancelled = false;
  const request = new Request(
    "https://functions.test/begin-role-switch",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        pull: () => new Promise<void>(() => undefined),
        cancel: () => {
          cancelled = true;
        },
      }),
    },
  );

  const error = await assertRejects(
    () => parseRequest(request, { timeoutMs: 10 }),
    Error,
  ) as Error & { code?: string; status?: number };
  assertEquals(error.code, "request_timeout");
  assertEquals(error.status, 408);
  assertEquals(cancelled, true);
});

Deno.test("verified caller is passed explicitly to service RPC", async () => {
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
  });

  const auditId = "11111111-1111-4111-8111-111111111111";
  const res = await handler(authedJson({ audit_id: auditId }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, { success: true, validate_only: false });
  assertEquals(
    globalThis.__beginRoleSwitchScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
          name: "begin_role_switch_for_user",
          args: { _user_id: "verified-user", _audit_id: auditId },
        })
    ),
    true,
  );
});

Deno.test("validate-only role switch preflight calls the non-mutating validation RPC", async () => {
  resetScenario({
    user: { id: "verified-user", email: "verified@test.local" },
  });

  const res = await handler(authedJson({ validate_only: true }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body, { success: true, validate_only: true });
  assertEquals(
    globalThis.__beginRoleSwitchScenario.calls.some((call) =>
      call.name === "rpc" &&
      JSON.stringify(call.args) === JSON.stringify({
          name: "validate_role_switch_for_user",
          args: { _user_id: "verified-user" },
        })
    ),
    true,
  );
});

Deno.test("malformed and mistyped role-switch payloads fail after auth but before RPC selection", async () => {
  const malformed = new Request("https://functions.test/begin-role-switch", {
    method: "POST",
    headers: {
      authorization: `Bearer ${crypto.randomUUID()}`,
      "content-type": "application/json",
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: "{",
  });

  resetScenario();
  const malformedRes = await handler(malformed);
  assertEquals(malformedRes.status, 400);
  const malformedBody = await malformedRes.json();
  assertEquals(malformedBody.code, "invalid_json");
  assertEquals(
    globalThis.__beginRoleSwitchScenario.calls.map((call) => call.name),
    ["getUser"],
  );

  for (
    const invalidBody of [
      {},
      { audit_id: "not-a-uuid" },
      { validate_only: "true" },
      { validateOnly: 1 },
      { dry_run: "yes" },
      { unexpected: true },
    ]
  ) {
    resetScenario();
    const res = await handler(authedJson(invalidBody));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.code, "validation_error");
    assertEquals(Array.isArray(body.issues), true);
    assertEquals(
      globalThis.__beginRoleSwitchScenario.calls.map((call) => call.name),
      ["getUser"],
    );
  }
});

Deno.test("service RPC errors fail closed", async () => {
  resetScenario({ rpcError: "active_firesale_commitment_blocks_role_switch" });
  const res = await handler(authedJson({
    audit_id: "11111111-1111-4111-8111-111111111111",
  }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "active_firesale_commitment_blocks_role_switch");
});
