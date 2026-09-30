/**
 * Tests for followup-lead automated email generation.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const SERVICE_ROLE = "placeholder-supabase-service-role";
const CRM_LEAD_ID = "11111111-1111-4111-8111-111111111111";
const MARKETING_LEAD_ID = "22222222-2222-4222-8222-222222222222";
const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
    OPENAI_API_KEY: "placeholder-openai",
  },
);

Deno.test("CRM lead preview defaults to step 1 and uses OpenAI with vetted recency rules", async () => {
  const originalFetch = globalThis.fetch;
  let providerUrl = "";
  let systemPrompt = "";

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;

    if (url.includes("ai.gateway.lovable.dev")) {
      throw new Error(
        "followup-lead must not use the legacy Lovable/Gemini gateway",
      );
    }

    if (url.includes("api.openai.com")) {
      providerUrl = url;
      const body = JSON.parse(String(init?.body ?? "{}"));
      systemPrompt = String(body.messages?.[0]?.content ?? "");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: "Budget-specific follow-up.\nThe mAI Prop Team",
              },
            }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    if (url.includes("/rest/v1/marketing_leads")) {
      return Promise.resolve(
        new Response("null", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    if (url.includes("/rest/v1/leads")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "lead-1",
            name: "Alex Buyer",
            email: "alex@example.com",
            source: "manual",
            status: "new",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    if (url.includes("/rest/v1/properties")) {
      return Promise.resolve(
        new Response(
          JSON.stringify([{
            id: "property-1",
            title: "Glyfada Apartment",
            location: "Glyfada",
            price: 260000,
            size: 72,
            bedrooms: 2,
            yield: "4.5%",
            images: [],
            description: "Compact coastal apartment.",
          }]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      lead_id: CRM_LEAD_ID,
      preview_only: true,
    }, {
      authorization: `Bearer ${SERVICE_ROLE}`,
    }));

    assertEquals(res.status, 200);
    assertEquals(providerUrl, "https://api.openai.com/v1/chat/completions");
    assertEquals(systemPrompt.includes("Current date:"), true);
    assertEquals(
      systemPrompt.includes("Do not claim live/current facts"),
      true,
    );
    assertEquals(
      systemPrompt.includes(
        "Never cite, imply, or fabricate sources you have not actually used",
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Golden Visa follow-up preview avoids unsupported static urgency and exact legal claims", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;

    if (url.includes("api.openai.com")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const prompt = String(body.messages?.[1]?.content ?? "");
      assertEquals(prompt.includes("must be verified"), true);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content:
                  "Eligibility and benefits must be checked against current official rules.\nThe mAI Prop Team",
              },
            }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    if (url.includes("/rest/v1/marketing_leads")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "lead-visa",
            full_name: "Alex Buyer",
            email: "alex@example.com",
            nationality: "Canadian",
            investment_budget: 280000,
            preferred_location: "Athens",
            status: "new",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      lead_id: MARKETING_LEAD_ID,
      step: 3,
      preview_only: true,
    }, {
      authorization: `Bearer ${SERVICE_ROLE}`,
    }));
    const body = await res.json() as { subject?: string; html?: string };

    assertEquals(res.status, 200);
    assertEquals(
      body.subject?.includes("act before thresholds increase"),
      false,
    );
    assertEquals(body.html?.includes("6-9 Months"), false);
    assertEquals(body.html?.includes("27 Countries"), false);
    assertEquals(
      body.html?.includes(
        '<p style="margin:0;color:#e0fafa;font-size:15px;">None</p>',
      ),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("invalid follow-up bodies return structured 400 before database or provider work", async () => {
  const originalFetch = globalThis.fetch;
  let sideEffectCalls = 0;

  globalThis.fetch = (() => {
    sideEffectCalls += 1;
    throw new Error("invalid follow-up input reached a side effect");
  }) as typeof fetch;

  const requestFor = (body: unknown) =>
    req("POST", body, {
      authorization: `Bearer ${SERVICE_ROLE}`,
    });
  const malformed = new Request("https://functions.test/followup-lead", {
    method: "POST",
    headers: {
      authorization: `Bearer ${SERVICE_ROLE}`,
      "content-type": "application/json",
    },
    body: "{",
  });

  try {
    for (
      const request of [
        malformed,
        requestFor({ lead_id: "x".repeat(1000) }),
        requestFor({ lead_id: 42 }),
        requestFor({ lead_id: CRM_LEAD_ID, invented: true }),
      ]
    ) {
      const res = await handler(request);
      const body = await res.json() as {
        code?: string;
        issues?: unknown[];
      };

      assertEquals(res.status, 400);
      assertEquals(
        ["invalid_json", "validation_error"].includes(body.code ?? ""),
        true,
      );
      assertEquals(Array.isArray(body.issues), true);
    }
    assertEquals(sideEffectCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();

async function followupScenario(
  options: {
    body?: string;
    reject?: boolean;
    timeout?: boolean;
    failure?: string;
    concurrent?: string;
    crm?: boolean;
    current?: number | null;
    requested?: number;
    preview?: boolean;
    alias?: boolean;
  } = {},
) {
  const originalFetch = globalThis.fetch;
  const row = {
    id: MARKETING_LEAD_ID,
    full_name: "Fixture",
    email: "fixture@example.test",
    status: "new",
    followup_step: options.current === undefined ? 0 : options.current,
  };
  let sends = 0, writes = 0;
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ??
        (input instanceof Request ? input.method : "GET");
      if (url.hostname === "api.openai.com") {
        return json({
          choices: [{ message: { content: "Fixture followup." } }],
        });
      }
      if (url.pathname === "/rest/v1/properties") return json([]);
      if (url.hostname === "api.brevo.com") {
        sends++;
        assertEquals(
          JSON.parse(String(init?.body)).sender.email,
          "kr@maiprop.co",
        );
        if (options.concurrent === "step") row.followup_step = 3;
        if (options.concurrent === "status") row.status = "closed";
        if (options.timeout) throw new DOMException("Timeout", "TimeoutError");
        return new Response(options.body ?? '{"messageId":"accepted-id"}', {
          status: options.reject ? 400 : 201,
        });
      }
      if (url.pathname === "/rest/v1/marketing_leads" && method === "GET") {
        return json(options.crm ? null : structuredClone(row));
      }
      if (url.pathname === "/rest/v1/leads" && method === "GET") {
        return json(structuredClone(row));
      }
      if (
        method === "PATCH" &&
        ["/rest/v1/marketing_leads", "/rest/v1/leads"].includes(url.pathname)
      ) {
        writes++;
        if (options.failure === "error") {
          return json({ message: "private-db" }, 500);
        }
        assertEquals(url.searchParams.get("select"), "id");
        const patch = JSON.parse(String(init?.body));
        if (!options.crm) {
          const expected = row.followup_step === null
            ? "is.null"
            : `eq.${row.followup_step}`;
          if (
            (url.searchParams.has("followup_step") &&
              url.searchParams.get("followup_step") !== expected) ||
            (url.searchParams.has("status") &&
              url.searchParams.get("status") !== `eq.${row.status}`)
          ) return json([]);
        }
        if (options.failure === "zero") return json([]);
        Object.assign(row, patch);
        return json([{ id: row.id }]);
      }
      throw new Error(`Unexpected fake transport ${method} ${url.pathname}`);
    }) as typeof fetch;
  Deno.env.set("BREVO_API_KEY", "placeholder");
  if (options.alias) {
    Deno.env.delete("BREVO_API_KEY");
    Deno.env.set("brevo", "placeholder-alias");
  }
  try {
    const response = await handler(
      req("POST", {
        lead_id: MARKETING_LEAD_ID,
        step: options.requested ?? 1,
        preview_only: options.preview ?? false,
      }, { authorization: `Bearer ${SERVICE_ROLE}` }),
    );
    return { response, body: await response.json(), sends, writes, row };
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.set("BREVO_API_KEY", "placeholder-brevo");
    Deno.env.delete("brevo");
  }
}
for (
  const body of [
    '{"messageId":"accepted-id"}',
    '{"message_id":"legacy-id"}',
    "",
    "not-json",
  ]
) {
  Deno.test(`followup preserves HTTP acceptance for body ${body}`, async () => {
    const result = await followupScenario({ body });
    assertEquals(result.response.status, 200);
    assertEquals(
      result.body.email_id,
      body.includes("messageId")
        ? "accepted-id"
        : body.includes("message_id")
        ? "legacy-id"
        : null,
    );
    assertEquals(result.body.provider_accepted, true);
    assertEquals(result.body.persistence_complete, true);
    assertEquals(result.row.followup_step, 1);
    assertEquals(result.sends, 1);
  });
}
for (const failure of ["error", "zero"]) {
  Deno.test(`followup accepted but ${failure} checkpoint is explicit`, async () => {
    const result = await followupScenario({ failure });
    assertEquals(result.response.status, 503);
    assertEquals(result.body.provider_accepted, true);
    assertEquals(result.body.persistence_complete, false);
    assertEquals(result.sends, 1);
    assertEquals(result.row.followup_step, 0);
  });
}
for (const concurrent of ["step", "status"]) {
  Deno.test(`followup never overwrites concurrent ${concurrent}`, async () => {
    const result = await followupScenario({ concurrent });
    assertEquals(result.response.status, 503);
    assertEquals(
      result.row[concurrent === "step" ? "followup_step" : "status"],
      concurrent === "step" ? 3 : "closed",
    );
    assertEquals(result.sends, 1);
  });
}
Deno.test("manual older template keeps progression and legacy sender alias", async () => {
  const result = await followupScenario({
    current: 3,
    requested: 1,
    alias: true,
  });
  assertEquals(result.response.status, 200);
  assertEquals(result.row.followup_step, 3);
  assertEquals(result.sends, 1);
});
Deno.test("nullable marketing step advances with NULL-specific comparison", async () => {
  const result = await followupScenario({ current: null });
  assertEquals(result.response.status, 200);
  assertEquals(result.row.followup_step, 1);
});
Deno.test("CRM manual send preserves its timestamp checkpoint", async () => {
  const result = await followupScenario({ crm: true });
  assertEquals(result.response.status, 200);
  assertEquals(
    typeof (result.row as Record<string, unknown>).follow_up_at,
    "string",
  );
  assertEquals(result.row.followup_step, 0);
});
Deno.test("preview does not send, mutate, or claim provider acceptance", async () => {
  const result = await followupScenario({ preview: true });
  assertEquals(result.response.status, 200);
  assertEquals(result.sends, 0);
  assertEquals(result.writes, 0);
  assertEquals(result.body.provider_accepted === true, false);
});
for (const options of [{ reject: true }, { timeout: true }]) {
  Deno.test(`unaccepted followup never checkpoints ${JSON.stringify(options)}`, async () => {
    const result = await followupScenario(options);
    assertEquals(result.response.status >= 400, true);
    assertEquals(result.writes, 0);
    assertEquals(result.sends, 1);
    assertEquals(
      result.body.send_outcome,
      "timeout" in options ? "unknown" : "rejected",
    );
    assertEquals(
      result.body.provider_accepted,
      "timeout" in options ? null : false,
    );
  });
}

for (const failure of ["error", "zero"]) {
  Deno.test(`CRM accepted send checks ${failure} persistence`, async () => {
    const result = await followupScenario({ crm: true, failure });
    assertEquals(result.response.status, 503);
    assertEquals(result.body.provider_accepted, true);
    assertEquals(result.body.persistence_complete, false);
    assertEquals(result.sends, 1);
    assertEquals(
      (result.row as Record<string, unknown>).follow_up_at,
      undefined,
    );
  });
}

Deno.test("followup authorization blocks sending before any transport", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    throw new Error("Unexpected transport");
  }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", { lead_id: MARKETING_LEAD_ID, step: 1 }),
    );
    assertEquals(response.status, 401);
    assertEquals(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const PARENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARENT_TOKEN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SELECTED_OP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

async function automaticScenario(options: {
  body?: string;
  providerStatus?: number;
  transportLoss?: boolean;
  bodyReadFailure?: boolean;
  beginLoss?: boolean;
  recordLoss?: boolean;
  recordLossOnce?: boolean;
  applyFailure?: boolean;
  existing?: boolean;
  existingAppliedReset?: boolean;
  existingAppliedHealthy?: boolean;
  existingSending?: boolean;
  initialProviderEffects?: number;
  beginDecision?: "expired" | "busy" | "unknown";
  mutateBeforeBegin?: "recipient" | "step" | "deleted";
  existingAcceptedExpired?: boolean;
  repeatAfterRejection?: boolean;
  repeatAfterAmbiguity?: boolean;
  retryAfterDeadline?: boolean;
  sinkDedupe?: boolean;
  concurrentInvocations?: boolean;
  parentState?: string;
  partialContext?: boolean;
  wrongCredential?: boolean;
} = {}) {
  const oldFetch = globalThis.fetch;
  const row = {
    id: MARKETING_LEAD_ID,
    full_name: "Fixture",
    email: "fixture@example.test",
    status: "new",
    followup_step: 2,
    created_at: "2026-08-01T00:00:00Z",
  };
  if (options.existingAppliedHealthy) row.followup_step = 3;
  let operation: {
    state: string;
    payload: Record<string, unknown>;
    accepted: boolean;
    token: string | null;
  } | null = options.existing || options.existingAcceptedExpired ||
      options.existingAppliedReset || options.existingAppliedHealthy ||
      options.existingSending
    ? {
      state: options.existingAcceptedExpired
        ? "checkpoint_payload_expired"
        : options.existingAppliedReset || options.existingAppliedHealthy
        ? "applied"
        : options.existingSending
        ? "sending"
        : "prepared",
      payload: {
        sender: { name: "mAI Prop", email: "kr@maiprop.co" },
        to: [{ email: row.email, name: "Fixture" }],
        subject: "Frozen subject",
        htmlContent: "Frozen html",
      },
      accepted: !!options.existingAcceptedExpired ||
        !!options.existingAppliedReset || !!options.existingAppliedHealthy,
      token: options.existingSending
        ? "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        : null,
    }
    : null;
  let providerCalls = 0,
    aiCalls = 0,
    prepareCalls = 0,
    applyCalls = 0,
    recordCalls = 0;
  let providerEffects = options.initialProviderEffects ?? 0;
  let beginCalls = 0;
  const attemptTokens: string[] = [];
  const payloadBytes: string[] = [];
  const recordArgs: Record<string, unknown>[] = [];
  const sinkKeys = new Set<string>();
  const observedSinkKeys: (string | null)[] = [];
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/rest/v1/scheduled_http_dispatches") {
        return json({
          dispatch_id: PARENT_ID,
          integration: "scheduled_followups",
          application_state: options.parentState ?? "running",
          execution_token: PARENT_TOKEN,
        });
      }
      if (url.pathname === "/rest/v1/marketing_leads") {
        return json(structuredClone(row));
      }
      if (
        url.pathname === "/rest/v1/rpc/get_selected_email_operation_for_service"
      ) {
        return json(
          operation
            ? {
              decision: "existing",
              operation_id: SELECTED_OP,
              state: operation.state,
              accepted: operation.accepted,
              payload: operation.payload,
            }
            : { decision: "absent" },
        );
      }
      if (url.hostname === "api.openai.com") {
        aiCalls++;
        return json({
          choices: [{ message: { content: "Fixture selected followup." } }],
        });
      }
      if (
        url.pathname === "/rest/v1/rpc/prepare_marketing_followup_for_service"
      ) {
        prepareCalls++;
        const args = JSON.parse(String(init?.body));
        assertEquals(args.p_expected, {
          email: row.email,
          followup_step: 2,
          status: "new",
        });
        assertEquals(args.p_dispatch_id, PARENT_ID);
        assertEquals(args.p_execution_token, PARENT_TOKEN);
        if (operation) {
          return json({ decision: "existing", operation_id: SELECTED_OP });
        }
        if (!operation) {
          operation = {
            state: "prepared",
            payload: args.p_payload,
            accepted: false,
            token: null,
          };
        }
        return json({ decision: "prepared", operation_id: SELECTED_OP });
      }
      if (url.pathname === "/rest/v1/rpc/begin_email_dispatch_for_service") {
        const args = JSON.parse(String(init?.body));
        beginCalls++;
        attemptTokens.push(args.p_attempt_token);
        if (!operation) throw new Error("begin before prepare");
        if (options.beginLoss && beginCalls === 1) {
          operation.state = "sending";
          operation.token = args.p_attempt_token;
          throw new Error("Lost begin response after commit");
        }
        if (options.mutateBeforeBegin) {
          if (options.mutateBeforeBegin === "recipient") {
            row.email = "changed@example.test";
          }
          if (options.mutateBeforeBegin === "step") row.followup_step = 3;
          if (options.mutateBeforeBegin === "deleted") row.status = "closed";
          operation.state = "superseded";
          return json({
            decision: "conflict",
            operation_id: SELECTED_OP,
            reason: "current_eligibility",
          });
        }
        if (operation.accepted) {
          return json({
            decision: "replay_accepted",
            operation_id: SELECTED_OP,
          });
        }
        if (options.beginDecision) {
          return json({
            decision: options.beginDecision,
            operation_id: SELECTED_OP,
            ...(options.beginDecision === "busy"
              ? { not_before: "2026-10-01T00:00:00Z" }
              : {}),
          });
        }
        if (operation.state === "sending") {
          return json({ decision: "busy", operation_id: SELECTED_OP });
        }
        if (operation.state === "unknown") {
          return json({ decision: "unknown", operation_id: SELECTED_OP });
        }
        if (operation.state === "retryable") {
          if (!options.retryAfterDeadline || beginCalls < 2) {
            return json({
              decision: "busy",
              operation_id: SELECTED_OP,
              not_before: "2026-10-01T00:00:00Z",
            });
          }
        }
        operation.state = "sending";
        operation.token = args.p_attempt_token;
        return json({
          decision: "send",
          operation_id: SELECTED_OP,
          attempt_token: args.p_attempt_token,
          payload: operation.payload,
        });
      }
      if (url.hostname === "api.brevo.com") {
        providerCalls++;
        const headers = new Headers(init?.headers);
        const sinkKey = headers.get("Idempotency-Key") ??
          headers.get("X-Idempotency-Key");
        observedSinkKeys.push(sinkKey);
        payloadBytes.push(String(init?.body));
        assertEquals(JSON.parse(String(init?.body)), operation?.payload);
        if (
          (options.providerStatus === undefined || options.transportLoss ||
            (options.retryAfterDeadline && providerCalls === 2)) &&
          (!options.sinkDedupe || !sinkKey || !sinkKeys.has(sinkKey))
        ) providerEffects++;
        if (sinkKey) sinkKeys.add(sinkKey);
        if (options.transportLoss) throw new Error("Transport response lost");
        if (options.bodyReadFailure) {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error("Optional provider body lost"));
              },
            }),
            { status: 201 },
          );
        }
        return new Response(options.body ?? '{"messageId":"accepted-id"}', {
          status: options.retryAfterDeadline && providerCalls === 2
            ? 201
            : options.providerStatus ?? 201,
        });
      }
      if (
        url.pathname === "/rest/v1/rpc/record_email_dispatch_result_for_service"
      ) {
        recordCalls++;
        const args = JSON.parse(String(init?.body));
        recordArgs.push(structuredClone(args));
        if (!operation || args.p_attempt_token !== operation.token) {
          throw new Error("wrong token");
        }
        operation.state = args.p_outcome === "rejected_retryable"
          ? "retryable"
          : args.p_outcome;
        operation.accepted = args.p_outcome === "accepted";
        if (
          (options.recordLoss && recordCalls <= 2) ||
          (options.recordLossOnce && recordCalls === 1)
        ) {
          throw new Error("Lost record response after commit");
        }
        return new Response(null, { status: 204 });
      }
      if (
        url.pathname === "/rest/v1/rpc/apply_email_dispatch_result_for_service"
      ) {
        applyCalls++;
        if (options.applyFailure) return json({ message: "db error" }, 500);
        if (options.existingAcceptedExpired) {
          return json({ decision: "expired", operation_id: SELECTED_OP });
        }
        if (!operation?.accepted) throw new Error("apply before acceptance");
        if (operation.state === "applied") {
          return json({
            decision: "already_applied",
            operation_id: SELECTED_OP,
          });
        }
        row.followup_step = 3;
        row.status = "contacted";
        operation.state = "applied";
        return json({ decision: "applied", operation_id: SELECTED_OP });
      }
      throw new Error(`Unexpected selected fixture route ${url.pathname}`);
    }) as typeof fetch;
  Deno.env.set("BREVO_API_KEY", "synthetic-brevo");
  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${
        options.wrongCredential ? "wrong" : SERVICE_ROLE
      }`,
      "x-maiprop-parent-dispatch-id": PARENT_ID,
    };
    if (!options.partialContext) {
      headers["x-maiprop-parent-execution-token"] = PARENT_TOKEN;
    }
    const first = handler(
      req("POST", { lead_id: MARKETING_LEAD_ID, step: 3 }, headers),
    );
    const second = options.concurrentInvocations
      ? handler(req("POST", { lead_id: MARKETING_LEAD_ID, step: 3 }, headers))
      : null;
    const response = await first;
    const secondResponse = second
      ? await second
      : options.repeatAfterRejection || options.repeatAfterAmbiguity
      ? await handler(
        req("POST", { lead_id: MARKETING_LEAD_ID, step: 3 }, headers),
      )
      : null;
    return {
      response,
      body: await response.json(),
      secondResponse,
      row,
      operation,
      providerCalls,
      aiCalls,
      prepareCalls,
      applyCalls,
      recordCalls,
      recordArgs,
      providerEffects,
      attemptTokens,
      payloadBytes,
      observedSinkKeys,
    };
  } finally {
    globalThis.fetch = oldFetch;
    Deno.env.set("BREVO_API_KEY", "placeholder-brevo");
  }
}

for (
  const body of [
    '{"messageId":"accepted-id"}',
    '{"message_id":"alias-id"}',
    "",
    "not-json",
  ]
) {
  Deno.test(`automatic followup records accepted HTTP body ${JSON.stringify(body)}`, async () => {
    const result = await automaticScenario({ body });
    assertEquals(result.response.status, 200);
    assertEquals(
      [result.providerCalls, result.prepareCalls, result.applyCalls],
      [1, 1, 1],
    );
    assertEquals(result.operation?.state, "applied");
    assertEquals(result.row.followup_step, 3);
    assertEquals(
      result.body.email_id,
      body.includes("alias-id")
        ? "alias-id"
        : body.includes("accepted-id")
        ? "accepted-id"
        : null,
    );
  });
}
Deno.test("automatic followup reuses frozen payload without AI", async () => {
  const result = await automaticScenario({ existing: true });
  assertEquals([result.aiCalls, result.prepareCalls, result.providerCalls], [
    0,
    0,
    1,
  ]);
  assertEquals(result.operation?.state, "applied");
});
Deno.test("concurrent automatic followups admit one provider request", async () => {
  const result = await automaticScenario({ concurrentInvocations: true });
  assertEquals(result.secondResponse !== null, true);
  assertEquals(result.providerCalls, 1);
  assertEquals(result.operation?.state, "applied");
});
for (
  const options of [{ beginLoss: true }, { transportLoss: true }, {
    recordLoss: true,
  }]
) {
  Deno.test(`automatic followup holds ambiguous ${JSON.stringify(options)}`, async () => {
    const result = await automaticScenario(options);
    assertEquals(result.response.status, 503);
    assertEquals(result.applyCalls, 0);
    assertEquals(result.providerCalls, options.beginLoss ? 0 : 1);
    assertEquals(result.row.followup_step, 2);
  });
}
Deno.test("automatic accepted followup keeps durable acceptance after apply failure", async () => {
  const result = await automaticScenario({ applyFailure: true });
  assertEquals(result.body.provider_accepted, true);
  assertEquals(result.body.persistence_complete, false);
  assertEquals(result.operation?.accepted, true);
  assertEquals(result.providerCalls, 1);
});
for (
  const [status, expectedState] of [[429, "retryable"], [
    403,
    "rejected_final",
  ], [503, "unknown"]] as const
) {
  Deno.test(`automatic followup records HTTP ${status} without checkpoint`, async () => {
    const result = await automaticScenario({
      providerStatus: status,
      body: '{"code":"invalid_parameter"}',
    });
    assertEquals(result.response.status, 503);
    assertEquals([result.providerCalls, result.applyCalls], [1, 0]);
    assertEquals(result.operation?.state, expectedState);
    assertEquals(result.row.followup_step, 2);
  });
}
for (
  const options of [{ partialContext: true }, { wrongCredential: true }, {
    parentState: "finished",
  }]
) {
  Deno.test(`automatic context rejects ${JSON.stringify(options)} before AI`, async () => {
    const result = await automaticScenario(options);
    assertEquals([result.providerCalls, result.aiCalls, result.prepareCalls], [
      0,
      0,
      0,
    ]);
    assertEquals(
      result.response.status === 400 || result.response.status === 403,
      true,
    );
  });
}
for (const beginDecision of ["expired", "busy", "unknown"] as const) {
  Deno.test(`automatic followup ${beginDecision} begin never fetches provider`, async () => {
    const result = await automaticScenario({ beginDecision });
    assertEquals([result.providerCalls, result.applyCalls], [0, 0]);
    assertEquals(result.response.status, 503);
  });
}
for (const mutateBeforeBegin of ["recipient", "step", "deleted"] as const) {
  Deno.test(`automatic followup changed ${mutateBeforeBegin} before begin cannot send`, async () => {
    const result = await automaticScenario({ mutateBeforeBegin });
    assertEquals([result.providerCalls, result.applyCalls], [0, 0]);
    assertEquals(result.operation?.state, "superseded");
  });
}
Deno.test("accepted expired followup payload remains held without rerender or resend", async () => {
  const result = await automaticScenario({ existingAcceptedExpired: true });
  assertEquals([result.aiCalls, result.providerCalls, result.applyCalls], [
    0,
    0,
    1,
  ]);
  assertEquals(result.body.provider_accepted, true);
  assertEquals(result.body.persistence_complete, false);
  assertEquals(result.response.status, 503);
});
Deno.test("lost first record response repeats only the same accepted record", async () => {
  const result = await automaticScenario({ recordLossOnce: true });
  assertEquals([result.providerCalls, result.recordCalls, result.applyCalls], [
    1,
    2,
    1,
  ]);
  assertEquals(result.operation?.state, "applied");
  assertEquals(result.recordArgs[0], result.recordArgs[1]);
});
Deno.test("accepted HTTP survives optional body stream rejection", async () => {
  const result = await automaticScenario({ bodyReadFailure: true });
  assertEquals([result.providerCalls, result.recordCalls, result.applyCalls], [
    1,
    1,
    1,
  ]);
  assertEquals(result.body.email_id, null);
  assertEquals(result.operation?.state, "applied");
});
Deno.test("durable 429 not-before blocks next existing invocation without AI or resend", async () => {
  const result = await automaticScenario({
    providerStatus: 429,
    body: '{"code":"rate_limited"}',
    repeatAfterRejection: true,
  });
  assertEquals(result.secondResponse?.status, 503);
  assertEquals([result.providerCalls, result.aiCalls, result.prepareCalls], [
    1,
    1,
    1,
  ]);
  assertEquals(result.operation?.state, "retryable");
  assertEquals(result.applyCalls, 0);
});

for (const sinkDedupe of [false, true]) {
  for (const mode of ["begin", "transport", "record"] as const) {
    Deno.test(`followup ${mode} ambiguity stays fenced on next invocation with sink dedupe ${sinkDedupe}`, async () => {
      const result = await automaticScenario({
        beginLoss: mode === "begin",
        transportLoss: mode === "transport",
        recordLoss: mode === "record",
        repeatAfterAmbiguity: true,
        sinkDedupe,
      });
      assertEquals(result.providerCalls, mode === "begin" ? 0 : 1);
      assertEquals(result.providerEffects, mode === "begin" ? 0 : 1);
      assertEquals(result.observedSinkKeys, mode === "begin" ? [] : [null]);
      assertEquals(result.aiCalls, 1);
      assertEquals(result.prepareCalls, 1);
      assertEquals(result.row.followup_step, mode === "record" ? 3 : 2);
      assertEquals(
        result.secondResponse?.status,
        mode === "record" ? 200 : 503,
      );
      assertEquals(
        result.operation?.state,
        mode === "begin"
          ? "sending"
          : mode === "transport"
          ? "unknown"
          : "applied",
      );
      if (mode === "record") {
        assertEquals(result.recordArgs[0], result.recordArgs[1]);
      }
    });
  }
}

Deno.test("followup restart after simulated death after committed begin never fetches", async () => {
  // The fixture starts at the durable sending row left by a dead invocation.
  const result = await automaticScenario({
    existingSending: true,
    initialProviderEffects: 1,
    repeatAfterAmbiguity: true,
  });
  assertEquals(result.providerCalls, 0);
  assertEquals(result.providerEffects, 1);
  assertEquals([result.aiCalls, result.applyCalls, result.row.followup_step], [
    0,
    0,
    2,
  ]);
  assertEquals(result.secondResponse?.status, 503);
  assertEquals(result.operation?.state, "sending");
});

Deno.test("followup durable 429 retries the byte-identical frozen payload once after deadline", async () => {
  const result = await automaticScenario({
    providerStatus: 429,
    body: '{"code":"rate_limited"}',
    repeatAfterRejection: true,
    retryAfterDeadline: true,
  });
  assertEquals([result.providerCalls, result.aiCalls, result.prepareCalls], [
    2,
    1,
    1,
  ]);
  assertEquals(result.payloadBytes[0], result.payloadBytes[1]);
  assertEquals(result.attemptTokens.length, 2);
  assertEquals(result.attemptTokens[0] === result.attemptTokens[1], false);
  assertEquals(result.operation?.state, "applied");
  assertEquals(result.row.followup_step, 3);
  assertEquals(result.secondResponse?.status, 200);
});

Deno.test("applied marketing step after manual reset is a sequence conflict hold", async () => {
  const result = await automaticScenario({ existingAppliedReset: true });
  assertEquals(result.response.status, 503);
  assertEquals(result.body.reason, "sequence_conflict");
  assertEquals(result.body.persistence_complete, false);
  assertEquals([result.aiCalls, result.providerCalls, result.applyCalls], [
    0,
    0,
    0,
  ]);
  assertEquals(result.row.followup_step, 2);
  assertEquals(result.operation?.state, "applied");
});

Deno.test("ordinary already-applied step replay remains healthy", async () => {
  const result = await automaticScenario({ existingAppliedHealthy: true });
  assertEquals(result.response.status, 200);
  assertEquals(result.body.persistence_complete, true);
  assertEquals([result.aiCalls, result.providerCalls, result.applyCalls], [
    0,
    0,
    1,
  ]);
  assertEquals(result.row.followup_step, 3);
});
