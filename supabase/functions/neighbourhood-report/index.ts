/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("neighbourhood-report");

const BUCKET = "neighbourhood-report";
const neighbourhoodLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 15, windowMs: 60_000 });

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await neighbourhoodLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
  if (quota.errorResponse) return quota.errorResponse;

  try {
    const { city, address, region, propertyType: _propertyType, lat, lng, listingId } = await req.json();

    if (!city) {
      return new Response(
        JSON.stringify({ error: "city is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Deno.env.get("OPENAI_API_KEY")) throw new Error("OPENAI_API_KEY not configured");

    const locationStr = [address, city, region, "Greece"].filter(Boolean).join(", ");
    const coordStr = lat && lng ? ` (coords: ${lat}, ${lng})` : "";

    const prompt = `You are a Greek real estate market analyst. Generate a neighbourhood intelligence report for a property at: ${locationStr}${coordStr}.

Return ONLY valid JSON, no markdown, no explanation:
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
- Only return the JSON object`;

    const response = await openAIChatCompletion({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 1800,
    });

    if (!response.ok) {
      const status = response.status;
      const usageLimitMsg = "AI features are temporarily unavailable due to usage limits. Please try again later or contact support.";
      if (status === 429) return new Response(JSON.stringify({ error: usageLimitMsg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: usageLimitMsg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const raw = readOpenAITextContent(aiData)
      .replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    // Extract only the outermost JSON object
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const jsonStr = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;

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
        throw new Error("AI returned invalid JSON");
      }
    }

    // Persist neighbourhood scores back to the listing row so they can be filtered on.
    if (listingId && parsed.walkabilityScore != null) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await adminClient.from("listings").update({
        walkability_score: Math.round(parsed.walkabilityScore),
        safety_score:      parsed.safetyScore?.score  != null ? Math.round(parsed.safetyScore.score)  : undefined,
        noise_score:       parsed.noiseLevel?.score   != null ? Math.round(parsed.noiseLevel.score)   : undefined,
      }).eq("id", listingId);
      // fire-and-forget — don't block the response on DB write
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
