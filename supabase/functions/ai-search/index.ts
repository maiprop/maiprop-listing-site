import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("ai-search");

const BUCKET = "ai-search";
const aiSearchLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 20, windowMs: 60_000, failClosed: true });

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, AI parsing, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
  if (quota.errorResponse) return quota.errorResponse;

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? quota.userId ?? "anonymous";
  if (await aiSearchLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  try {
    const { query } = await req.json();
    if (!query?.trim()) throw new Error("No query provided");

    const systemPrompt = `You are a real estate search assistant for a Greek property portal. 
    Parse the user's natural language query into structured search filters.
    Return ONLY valid JSON matching the exact schema. Do not include any explanation.

    Schema:
    {
      "city": string | null,           // city name e.g. "Athens", "Thessaloniki"
      "listing_type": "sale" | "rent" | "auction" | null,
      "property_type": "apartment" | "house" | "villa" | "land" | "commercial" | "office" | null,
      "price_max": number | null,      // maximum price in euros
      "price_min": number | null,      // minimum price in euros
      "beds_min": number | null,       // minimum bedrooms
      "beds_max": number | null,
      "sqm_min": number | null,
      "sqm_max": number | null,
      "features": string[],            // any of: has_parking, has_elevator, has_pool, has_balcony, has_garden, has_furnished, has_ac, pets_allowed, has_fireplace, has_storage, has_view, has_smart_home
      "energy": string[],             // e.g. ["A+", "A", "B+"]
      "heating": string | null,       // "autonomous" | "central" | "floor" | "none"
      "summary": string               // short friendly 1-sentence summary of what was searched
    }

    Examples:
    - "quiet apartment near metro in Athens under 200k" → {"city":"Athens","listing_type":"sale","property_type":"apartment","price_max":200000,"features":["has_elevator"],"summary":"Apartment for sale in Athens under €200k near transit"}
    - "3 bedroom villa with pool for rent in Mykonos" → {"city":"Mykonos","listing_type":"rent","property_type":"villa","beds_min":3,"features":["has_pool"],"summary":"3-bed villa for rent in Mykonos with pool"}
    - "cheap studio under 50k" → {"price_max":50000,"beds_max":1,"summary":"Studio under €50k"}`;

    const response = await openAIChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0.1,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const raw = readOpenAITextContent(aiData);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("AI response is not an object");
    }

    // Whitelist + coerce. The AI prompt asks for a fixed schema; if it returns
    // anything else we drop it on the floor rather than passing the raw object
    // to the client (which would otherwise echo whatever shape the model felt
    // like).
    const src = parsed as Record<string, unknown>;
    const optionalString = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 80) : null;
    const optionalNumber = (v: unknown, lo = 0, hi = 1_000_000_000): number | null => {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (!Number.isFinite(n)) return null;
      return Math.max(lo, Math.min(hi, Math.round(n)));
    };
    const optionalEnum = <T extends string>(v: unknown, allowed: readonly T[]): T | null => {
      return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
    };
    const optionalStringArray = (v: unknown, max = 30): string[] => {
      if (!Array.isArray(v)) return [];
      return v.filter((x): x is string => typeof x === "string").slice(0, max);
    };

    const filters = {
      city: optionalString(src.city),
      listing_type: optionalEnum(src.listing_type, ["sale", "rent", "auction"] as const),
      property_type: optionalEnum(src.property_type, [
        "apartment", "house", "villa", "land", "commercial", "office",
      ] as const),
      price_min: optionalNumber(src.price_min),
      price_max: optionalNumber(src.price_max),
      beds_min: optionalNumber(src.beds_min, 0, 100),
      beds_max: optionalNumber(src.beds_max, 0, 100),
      sqm_min: optionalNumber(src.sqm_min, 0, 100_000),
      sqm_max: optionalNumber(src.sqm_max, 0, 100_000),
      features: optionalStringArray(src.features),
      energy: optionalStringArray(src.energy, 12),
      heating: optionalEnum(src.heating, ["autonomous", "central", "floor", "none"] as const),
      summary: optionalString(src.summary) ?? "",
    };

    await recordAiCall(quota.userId, BUCKET);
    return new Response(JSON.stringify(filters), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    log.error("ai-search error", { err: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
