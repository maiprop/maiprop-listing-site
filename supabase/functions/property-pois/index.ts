import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { hasAIProviderCredentials, openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";
import { buildVettedAnswerRules } from "../_shared/aiSafety.ts";

const log = createLogger("property-pois");

const BUCKET = "property-pois";
const poisLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 20, windowMs: 60_000, failClosed: true });
const VETTED_POI_RULES = buildVettedAnswerRules({
  scope: "nearby points-of-interest estimates",
  timeSensitiveTopics: ["business hours", "school names", "transit stops", "healthcare facilities", "shop availability"],
});

type FallbackPoi = {
  name: string;
  category: "school" | "transit" | "cafe" | "hospital" | "shopping" | "park";
  distanceKm: number;
  walkMinutes: number;
  description: string;
};

const fallbackPois = (city: string): FallbackPoi[] => {
  const area = city?.trim() || "the area";
  return [
    { name: `${area} Primary School`, category: "school", distanceKm: 0.45, walkMinutes: 5, description: "Local education option" },
    { name: `${area} High School`, category: "school", distanceKm: 1.35, walkMinutes: 16, description: "Secondary education nearby" },
    { name: `${area} Bus Stop`, category: "transit", distanceKm: 0.18, walkMinutes: 2, description: "Nearest transit link" },
    { name: `${area} Metro/Transit Hub`, category: "transit", distanceKm: 1.1, walkMinutes: 13, description: "Main public transport access" },
    { name: `${area} Coffee Corner`, category: "cafe", distanceKm: 0.28, walkMinutes: 3, description: "Neighbourhood cafe" },
    { name: `${area} Bakery & Cafe`, category: "cafe", distanceKm: 0.62, walkMinutes: 7, description: "Daily convenience stop" },
    { name: `${area} Medical Centre`, category: "hospital", distanceKm: 1.4, walkMinutes: 17, description: "Primary healthcare access" },
    { name: `${area} Pharmacy`, category: "hospital", distanceKm: 0.35, walkMinutes: 4, description: "Healthcare convenience" },
    { name: `${area} Market Street`, category: "shopping", distanceKm: 0.5, walkMinutes: 6, description: "Groceries and services" },
    { name: `${area} Shopping Arcade`, category: "shopping", distanceKm: 1.8, walkMinutes: 22, description: "Retail cluster" },
    { name: `${area} Pocket Park`, category: "park", distanceKm: 0.75, walkMinutes: 9, description: "Local green space" },
    { name: `${area} Public Square`, category: "park", distanceKm: 1.2, walkMinutes: 14, description: "Open public space" },
  ];
};

const fallbackPoisResponse = (
  city: string,
  corsHeaders: Record<string, string>,
  reason: string,
): Response => {
  log.warn("property-pois: using fallback POIs", { city, reason });
  return new Response(
    JSON.stringify({ pois: fallbackPois(city), generatedBy: "fallback", warning: reason }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
};

const handleRequest = async (req: Request): Promise<Response> => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, listing context, AI parsing, and response shaping.
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

    if (!hasAIProviderCredentials()) {
      return fallbackPoisResponse(
        String(city ?? ""),
        corsHeaders,
        "AI provider is not configured; deterministic nearby-place fallback used",
      );
    }

    const prompt = `You are a Greek real estate assistant. Given a property at address "${address}" in ${city}, Greece (coordinates: ${lat}, ${lng}), generate up to 12 cautious nearby points-of-interest estimates that a prospective buyer would care about.

${VETTED_POI_RULES}

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
- Do not invent exact school, business, transit, hospital, or park names. Use a precise real name only if it is a stable, widely known landmark for the supplied area; otherwise use generic labels such as "Nearby primary school" or "${city} transit stop".
- Allowed categories: school, transit, cafe, hospital, shopping, park
- Include at least one item per allowed category
- Distances are estimates only; spread them realistically from 50m to 2.5km and mention uncertainty in descriptions when names are generic
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
      const text = await response.text();
      log.error("AI gateway error", { status, body: text.slice(0, 500) });
      return fallbackPoisResponse(
        String(city ?? ""),
        corsHeaders,
        `AI provider returned ${status}; deterministic nearby-place fallback used`,
      );
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
        log.warn("property-pois: AI returned invalid JSON; using fallback POIs", {
          city,
          response: jsonStr?.slice(0, 500),
        });
        parsed = { pois: fallbackPois(String(city ?? "")) };
      }
    }

    if (!Array.isArray(parsed.pois)) {
      log.warn("property-pois: invalid AI response shape; using fallback POIs", { city });
      parsed = { pois: fallbackPois(String(city ?? "")) };
    }

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
};

Deno.serve(handleRequest);
