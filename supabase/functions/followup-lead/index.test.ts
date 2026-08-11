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
