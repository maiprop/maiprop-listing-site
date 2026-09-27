import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "./testUtils.ts";

// Exercise real handlers, auth and quota helper. Only HTTP boundaries are fake;
// neither the auth bypass nor a replacement reservation helper is used.
const cases = [
  { name: "ai-search", body: { query: "Athens apartment" }, output: { city: "Athens" } },
  { name: "smart-filters", body: { type: "apartment", listing_type: "sale" }, output: { sections: ["size"], featureKeys: [], sizeLabel: "Area", priceLabel: "Price", bedsLabel: "Beds", featuresLabel: "Features" } },
  { name: "ai-service-match", body: { need: "Review my property purchase contract" }, output: { category: "lawyer", services: ["contracts"], explanation: "Legal review", urgency: "medium", follow_up_question: null } },
  { name: "listing-ai-assist", body: { type: "description", property: { property_type: "apartment", listing_type: "sale", city: "Athens", sqm: 85 } }, output: "Property description" },
  { name: "pro-ai-tools", body: { groupId: "legal", messages: [{ role: "user", content: "Review this title" }] }, output: "Seek a qualified lawyer" },
  { name: "property-chat", body: { messages: [{ role: "user", content: "Describe this property" }], propertyContext: { latitude: 37.98, longitude: 23.73 } }, output: "Property context" },
  { name: "property-pois", body: { responseVersion: 2, city: "Athens", address: "Athens 1", lat: 37.98, lng: 23.73 }, output: { pois: [{ name: "Possible cafe", category: "cafe", distanceKm: 0.2, walkMinutes: 3 }] } },
];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const nativeFetch = globalThis.fetch;
let activeFetch: typeof fetch = () => Promise.reject(new Error("No test transport installed"));
globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;
globalThis.addEventListener("unload", () => { globalThis.fetch = nativeFetch; });

for (const [index, entry] of cases.entries()) {
  const { handler } = await captureHandler(import.meta.url, `../${entry.name}/index.ts`, {
    MAIPROP_EDGE_TEST_AUTH_BYPASS: "false", GEMINI_API_KEY: "", OPENAI_API_KEY: "placeholder-openai",
  });
  for (const outcome of ["allowed", "denied", "unavailable"] as const) {
    Deno.test(`${entry.name}: ${outcome} quota reserves once before provider work`, async () => {
      const events: string[] = [];
      const unexpected: string[] = [];
      const actor = `quota-actor-${index}-${outcome}`;
      const previous = activeFetch;
      const originalError = console.error;
      const expectedErrors: string[] = [];
      console.error = (...args: unknown[]) => {
        const message = args.map(String).join(" ");
        if (outcome === "unavailable" && message.includes("[aiUsage] reserve_ai_quota failed")) expectedErrors.push(message);
        else originalError(...args);
      };
      activeFetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.hostname === "test.supabase.co" && url.pathname === "/auth/v1/user") {
          events.push("auth");
          return Promise.resolve(json({ id: actor, email: "quota@example.test" }));
        }
        if (url.hostname === "test.supabase.co" && url.pathname === "/rest/v1/rpc/reserve_ai_quota_for_user") {
          events.push("reserve");
          assertEquals(JSON.parse(String((init as { body?: unknown })?.body)), { _user_id: actor, p_bucket: entry.name });
          return Promise.resolve(outcome === "unavailable"
            ? json({ message: "quota unavailable" }, 503)
            : json({ allowed: outcome === "allowed", reason: outcome === "denied" ? "monthly_limit_reached" : null, used: 1, limit: 5 }));
        }
        if (url.hostname === "api.openai.com" && url.pathname === "/v1/chat/completions") {
          assertEquals(events.filter(event => event === "reserve"), ["reserve"]);
          assertEquals(outcome, "allowed");
          events.push("provider");
          return Promise.resolve(json({ choices: [{ message: { content: typeof entry.output === "string" ? entry.output : JSON.stringify(entry.output) } }] }));
        }
        unexpected.push(url.origin + url.pathname);
        return Promise.reject(new Error(`Unexpected transport ${url.origin}${url.pathname}`));
      };
      try {
        const response = await handler(req("POST", entry.body, {
          authorization: `Bearer quota-${index}-${outcome}`,
          "x-forwarded-for": `10.92.${index}.${["allowed", "denied", "unavailable"].indexOf(outcome) + 1}`,
        }));
        const body = await response.text();
        assertEquals(response.status, outcome === "allowed" ? 200 : outcome === "denied" ? 429 : 503, body);
        assertEquals(events.filter(event => event === "reserve"), ["reserve"]);
        assertEquals(events.filter(event => event === "provider").length, outcome === "allowed" ? 1 : 0);
        assertEquals(events[0], "auth");
        assertEquals(unexpected, []);
        if (outcome === "unavailable") assertEquals(expectedErrors.length, 1);
      } finally {
        activeFetch = previous;
        console.error = originalError;
      }
    });
  }
}
