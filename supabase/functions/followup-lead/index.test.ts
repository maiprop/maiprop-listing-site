/**
 * Tests for followup-lead automated email generation.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const SERVICE_ROLE = "placeholder-supabase-service-role";
const CRM_LEAD_ID = "11111111-1111-4111-8111-111111111111";
const MARKETING_LEAD_ID = "22222222-2222-4222-8222-222222222222";
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts", {
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
  OPENAI_API_KEY: "placeholder-openai",
});

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
      throw new Error("followup-lead must not use the legacy Lovable/Gemini gateway");
    }

    if (url.includes("api.openai.com")) {
      providerUrl = url;
      const body = JSON.parse(String(init?.body ?? "{}"));
      systemPrompt = String(body.messages?.[0]?.content ?? "");
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: "Budget-specific follow-up.\nThe mAI Prop Team" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }

    if (url.includes("/rest/v1/marketing_leads")) {
      return Promise.resolve(new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }

    if (url.includes("/rest/v1/leads")) {
      return Promise.resolve(new Response(JSON.stringify({
        id: "lead-1",
        name: "Alex Buyer",
        email: "alex@example.com",
        source: "manual",
        status: "new",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }

    if (url.includes("/rest/v1/properties")) {
      return Promise.resolve(new Response(JSON.stringify([{
        id: "property-1",
        title: "Glyfada Apartment",
        location: "Glyfada",
        price: 260000,
        size: 72,
        bedrooms: 2,
        yield: "4.5%",
        images: [],
        description: "Compact coastal apartment.",
      }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }

    return Promise.resolve(new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
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
    assertEquals(systemPrompt.includes("Do not claim live/current facts"), true);
    assertEquals(systemPrompt.includes("Never cite, imply, or fabricate sources you have not actually used"), true);
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
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: "Eligibility and benefits must be checked against current official rules.\nThe mAI Prop Team" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }

    if (url.includes("/rest/v1/marketing_leads")) {
      return Promise.resolve(new Response(JSON.stringify({
        id: "lead-visa",
        full_name: "Alex Buyer",
        email: "alex@example.com",
        nationality: "Canadian",
        investment_budget: 280000,
        preferred_location: "Athens",
        status: "new",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }

    return Promise.resolve(new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
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
    assertEquals(body.subject?.includes("act before thresholds increase"), false);
    assertEquals(body.html?.includes("6-9 Months"), false);
    assertEquals(body.html?.includes("27 Countries"), false);
    assertEquals(body.html?.includes("<p style=\"margin:0;color:#e0fafa;font-size:15px;\">None</p>"), false);
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
    for (const request of [
      malformed,
      requestFor({ lead_id: "x".repeat(1000) }),
      requestFor({ lead_id: 42 }),
      requestFor({ lead_id: CRM_LEAD_ID, invented: true }),
    ]) {
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
            (url.searchParams.has("followup_step") && url.searchParams.get("followup_step") !== expected) ||
            (url.searchParams.has("status") && url.searchParams.get("status") !== `eq.${row.status}`)
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

Deno.test('followup authorization blocks sending before any transport', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls++; throw new Error('Unexpected transport'); }) as typeof fetch;
  try {
    const response = await handler(req('POST', { lead_id: MARKETING_LEAD_ID, step: 1 }));
    assertEquals(response.status, 401);
    assertEquals(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
