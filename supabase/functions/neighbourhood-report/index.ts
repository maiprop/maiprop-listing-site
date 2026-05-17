import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { hasAIProviderCredentials, openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("neighbourhood-report");

const BUCKET = "neighbourhood-report";
const neighbourhoodLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 15, windowMs: 60_000, failClosed: true });

const fallbackReport = (city: string, address?: string, region?: string) => { // skipcq: JS-R1005 - Deterministic fallback report keeps section defaults together when AI output is unavailable.
  const areaName = address?.trim() || city.trim();
  const isAthens = city.toLowerCase().includes("athens") || city.toLowerCase().includes("athina");
  const current = isAthens ? 4200 : 2600;
  return {
    areaName,
    walkabilityScore: isAthens ? 82 : 68,
    pricePerSqmTrend: {
      current,
      oneYearAgo: Math.round(current * 0.94),
      threeYearsAgo: Math.round(current * 0.82),
      fiveYearsAgo: Math.round(current * 0.7),
      changeYoY: 6.4,
      change5Y: 42.9,
    },
    noiseLevel: {
      score: isAthens ? 6 : 4,
      label: isAthens ? "Moderate" : "Quiet",
      notes: "Generated from conservative city-level defaults after AI output could not be parsed.",
    },
    safetyScore: {
      score: isAthens ? 74 : 78,
      label: "Good",
      trend: "Stable",
      notes: "Use local due diligence for street-level validation.",
    },
    developmentProjects: [
      {
        name: `${city} public realm improvements`,
        type: "public",
        status: "planned",
        impact: "positive",
        estimatedCompletion: "2026",
        distanceKm: 1.5,
      },
    ],
    demographics: {
      primaryResidents: "Mixed local residents, professionals, and families",
      avgAge: 39,
      tourismImpact: isAthens || region?.toLowerCase().includes("attica") ? "Moderate" : "Low",
    },
    investmentOutlook: {
      rating: "Good",
      summary: "The area has resilient demand, but this report used fallback benchmarks because the AI provider returned malformed JSON. Validate street-level conditions before making an investment decision.",
    },
    areaHighlights: [
      "City-level market benchmark available",
      "Local amenities likely within normal urban range",
      "Independent inspection recommended",
    ],
    generatedBy: "fallback",
  };
};

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, provider JSON parsing, fallback, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
  if (quota.errorResponse) return quota.errorResponse;

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? quota.userId ?? "anonymous";
  if (await neighbourhoodLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  // Signed-in access gate is handled by enforceAiQuota; free vs Pro caps live in the DB.
  try {
    const { city, address, region, propertyType: _propertyType, lat, lng, listingId } = await req.json();

    if (!city) {
      return new Response(
        JSON.stringify({ error: "city is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!hasAIProviderCredentials()) {
      log.warn("neighbourhood-report: AI provider key missing; using fallback report", { city });
      const fallback = fallbackReport(city, address, region);
      await recordAiCall(quota.userId, BUCKET);
      return new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const locationStr = [address, city, region, "Greece"].filter(Boolean).join(", ");
    const coordStr = lat && lng ? ` (coords: ${lat}, ${lng})` : "";

    const prompt = `You are a Greek real estate market analyst. Generate a neighbourhood intelligence report for a property at: ${locationStr}${coordStr}.

Return ONLY valid JSON, no markdown, no explanation. The JSON must be complete and parseable:
{
  "areaName": "string (specific neighbourhood name, e.g. 'Kolonaki' or 'Nea Smyrni')",
  "walkabilityScore": number (0-100; 90+ = walker's paradise, 70-89 = very walkable, 50-69 = somewhat walkable, below 50 = car-dependent),
  "pricePerSqmTrend": {
    "current": number (EUR/m² today),
    "oneYearAgo": number,
    "threeYearsAgo": number,
    "fiveYearsAgo": number,
    "changeYoY": number (% change year-on-year, e.g. 7.2),
    "change5Y": number (% change over 5 years)
  },
  "noiseLevel": {
    "score": number (1-10, 1=silent, 10=very loud),
    "label": "Very Quiet" | "Quiet" | "Moderate" | "Busy" | "Very Busy",
    "notes": "string (brief description, e.g. 'Residential street, low traffic')"
  },
  "safetyScore": {
    "score": number (1-100, higher=safer),
    "label": "Excellent" | "Good" | "Average" | "Below Average",
    "trend": "Improving" | "Stable" | "Declining",
    "notes": "string"
  },
  "developmentProjects": [
    {
      "name": "string (realistic project name)",
      "type": "infrastructure" | "commercial" | "residential" | "transport" | "public",
      "status": "planned" | "under_construction" | "recently_completed",
      "impact": "positive" | "negative" | "neutral",
      "estimatedCompletion": "string (e.g. '2026' or 'Q3 2025')",
      "distanceKm": number
    }
  ],
  "demographics": {
    "primaryResidents": "string (e.g. 'Young professionals and families')",
    "avgAge": number,
    "tourismImpact": "Low" | "Moderate" | "High"
  },
  "investmentOutlook": {
    "rating": "Excellent" | "Good" | "Fair" | "Poor",
    "summary": "string (2 sentences)"
  },
  "areaHighlights": ["string"]
}

Rules:
- Base all data on real knowledge of ${city}, Greece neighbourhoods
- walkabilityScore: reflect proximity to shops, public transport, restaurants, parks
- developmentProjects: include 2-4 realistic projects for the area
- areaHighlights: 3-4 short bullet points (e.g. 'Metro line 200m away')
- All numbers must be realistic for the Greek market
- Only return the JSON object
- Do not include comments, trailing commas, prose, markdown, or incomplete arrays`;

    const response = await openAIChatCompletion({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 4096,
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      log.warn("neighbourhood-report: AI provider unavailable; using fallback report", {
        city,
        status,
        body: text.slice(0, 500),
      });
      const fallback = fallbackReport(city, address, region);
      await recordAiCall(quota.userId, BUCKET);
      return new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await response.json();
    const raw = readOpenAITextContent(aiData)
      .replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    // Extract only the outermost JSON object
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const jsonStr = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;

    // The shape of the AI's parsed JSON is unknown until we run the
    // downstream guardrails on it; intentionally typed broadly here and
    // narrowed at every read site.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const repaired = jsonStr
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/\)\s*}/g, "}")
        .replace(/\)\s*,/g, ",")
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      try {
        parsed = JSON.parse(repaired);
      } catch {
        log.warn("neighbourhood-report: AI returned invalid JSON; using fallback report", {
          city,
          rawLength: jsonStr.length,
          sample: jsonStr.slice(0, 240),
        });
        parsed = fallbackReport(city, address, region);
      }
    }

    // Persist neighbourhood scores back to the listing row so they can be filtered on.
    // SECURITY: verify the caller owns the listing before writing scores.
    if (listingId && parsed.walkabilityScore != null) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: listing } = await adminClient
        .from("listings")
        .select("owner_id")
        .eq("id", listingId)
        .single();
      if (listing && listing.owner_id === quota.userId) {
        await adminClient.from("listings").update({
          walkability_score: Math.round(parsed.walkabilityScore),
          safety_score:      parsed.safetyScore?.score  != null ? Math.round(parsed.safetyScore.score)  : undefined,
          noise_score:       parsed.noiseLevel?.score   != null ? Math.round(parsed.noiseLevel.score)   : undefined,
        }).eq("id", listingId);
      } else {
        log.warn("neighbourhood-report: listing ownership mismatch", { listingId, userId: quota.userId });
      }
    }

    await recordAiCall(quota.userId, BUCKET);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    log.error("neighbourhood-report error", { err: e instanceof Error ? e.message : String(e) });
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
