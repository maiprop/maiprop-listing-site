/**
 * Tests for followup-lead automated email generation.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const SERVICE_ROLE = "placeholder-supabase-service-role";
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
      lead_id: "lead-1",
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

restore();
