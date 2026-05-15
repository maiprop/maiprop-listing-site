import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { hasAIProviderCredentials, openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("property-pois");

const BUCKET = "property-pois";
const poisLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 20, windowMs: 60_000, failClosed: true });

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, listing context, AI parsing, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
  if (quota.errorResponse) return quota.errorResponse;

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? quota.userId ?? "anonymous";
  if (await poisLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  try {
    const body = await req.json();
    const { address, city } = body;
    const lat = body.lat ?? body.latitude;
    const lng = body.lng ?? body.longitude;

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: "lat/lng required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!hasAIProviderCredentials()) throw new Error("AI provider key not configured");

    const prompt = `You are a Greek real estate assistant. Given a property at address "${address}" in ${city}, Greece (coordinates: ${lat}, ${lng}), generate exactly 12 nearby points of interest that a prospective buyer would care about.

Return ONLY valid JSON. Use this example shape exactly:
{
  "pois": [
    {
      "name": "Syntagma Metro Station",
      "category": "transit",
      "distanceKm": 0.05,
      "walkMinutes": 1,
      "description": "Central metro interchange"
    }
  ]
}

Rules:
- Use real-sounding Greek place names relevant to ${city}
- Allowed categories: school, transit, cafe, hospital, shopping, park
- Include at least one item per allowed category
- Distances should be realistically spread from 50m to 2.5km
- walkMinutes = Math.round(distanceKm * 12) approximately
- Return only the JSON object, nothing else
- The JSON must be complete and parseable`;

    const response = await openAIChatCompletion({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 3072,
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 403 || status === 429) {
        return new Response(
          JSON.stringify({ error: "AI features are temporarily unavailable due to usage limits. Please try again later or contact support." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI features are temporarily unavailable due to usage limits. Please try again later or contact support." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      log.error("AI gateway error", { status, body: text.slice(0, 500) });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const content = readOpenAITextContent(aiData);

    // Strip markdown code fences if present
    let jsonStr = content
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    // Find outermost JSON object boundaries
    const jsonStart = jsonStr.search(/\{/);
    const jsonEnd = jsonStr.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    }

    type RawPoi = {
      name?: unknown;
      category?: unknown;
      distanceKm?: unknown;
      walkMinutes?: unknown;
      description?: unknown;
    };
    let parsed: { pois: RawPoi[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Attempt to repair common AI JSON glitches
      const repaired = jsonStr
        .replace(/,\s*}/g, "}")          // trailing commas in objects
        .replace(/,\s*]/g, "]")          // trailing commas in arrays
        .replace(/\)\s*\}/g, "}")        // stray ) before closing brace
        .replace(/\)\s*,/g, ",")         // stray ) before commas
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""); // control chars

      try {
        parsed = JSON.parse(repaired);
      } catch {
        log.error("failed to parse AI response", { response: jsonStr?.slice(0, 500) });
        throw new Error("AI returned invalid JSON");
      }
    }

    if (!Array.isArray(parsed.pois)) throw new Error("Invalid AI response shape");

    // Validate and sanitise
    const categories = ["school", "transit", "cafe", "hospital", "shopping", "park"];
    const pois = parsed.pois
      .filter(
        (p) =>
          typeof p.name === "string" &&
          typeof p.category === "string" &&
          categories.includes(p.category) &&
          typeof p.distanceKm === "number",
      )
      .map((p) => {
        const distanceKm = Math.max(0.05, Math.min(5, Number(p.distanceKm)));
        const fallbackWalk = Math.round(distanceKm * 12);
        return {
          name: String(p.name).slice(0, 60),
          category: p.category as string,
          distanceKm,
          walkMinutes: Math.max(1, Math.min(60, Number(p.walkMinutes ?? fallbackWalk))),
          description: p.description ? String(p.description).slice(0, 40) : undefined,
        };
      })
      .slice(0, 15);

    await recordAiCall(quota.userId, BUCKET);
    return new Response(JSON.stringify({ pois }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    log.error("property-pois error", { err: e instanceof Error ? e.message : String(e) });
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
