import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";

const BUCKET = "ai-search";
const aiSearchLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 20, windowMs: 60_000 });

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await aiSearchLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
  if (quota.errorResponse) return quota.errorResponse;

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

    const filters = JSON.parse(jsonMatch[0]);
    await recordAiCall(quota.userId, BUCKET);
    return new Response(JSON.stringify(filters), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("ai-search error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
