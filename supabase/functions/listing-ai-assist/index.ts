import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { hasAIProviderCredentials, openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("listing-ai-assist");

const BUCKET = "listing-ai-assist";
const listingAiLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 20, windowMs: 60_000, failClosed: true });

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, provider errors, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json().catch(() => ({}));
    const { type, property } = body;
    if (!hasAIProviderCredentials()) throw new Error("AI provider key required");

    if (type === "ping") {
      return new Response(JSON.stringify({ ok: true, message: "listing-ai-assist is available" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Require authenticated user + per-user quota for description/price
    // (ping is excluded from both since it's a free health check).
    const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
    if (quota.errorResponse) return quota.errorResponse;

    const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? quota.userId ?? "anonymous";
    if (await listingAiLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

    let systemPrompt = "";
    let userPrompt = "";
    if (type === "description") {
      systemPrompt = `You are a professional Greek real estate copywriter. Write compelling, accurate, and SEO-friendly property descriptions in English for listings on a Greek property portal. Be enthusiastic but factual. Include highlights, location benefits, and investment potential where relevant. Write in 2-3 short paragraphs (120-180 words total). Do NOT include a title. Do NOT add asterisks or markdown.`;
      userPrompt = `Write a listing description for this property:
Type: ${property.property_type} (${property.listing_type})
Location: ${property.city}${property.address ? `, ${property.address}` : ""}
Size: ${property.sqm}m²
${property.bedrooms ? `Bedrooms: ${property.bedrooms}` : ""}
${property.bathrooms ? `Bathrooms: ${property.bathrooms}` : ""}
${property.floor ? `Floor: ${property.floor}` : ""}
${property.year_built ? `Year built: ${property.year_built}` : ""}
${property.energy_class ? `Energy class: ${property.energy_class}` : ""}
${property.features?.length ? `Features: ${property.features.join(", ")}` : ""}
${property.condition ? `Condition: ${property.condition}` : ""}`;
    } else if (type === "price") {
      systemPrompt = `You are a Greek real estate market expert and valuation specialist. Provide a realistic market price estimate for Greek properties in 2025. Return ONLY valid JSON with this structure: {"min": number, "max": number, "suggested": number, "confidence": "low"|"medium"|"high", "reasoning": "brief 1-2 sentence explanation"}. No markdown, no extra text.`;
      userPrompt = `Estimate the market price for this Greek property:
Type: ${property.property_type} (${property.listing_type})
Location: ${property.city}${property.region ? `, ${property.region}` : ""}
Size: ${property.sqm}m²
${property.bedrooms ? `Bedrooms: ${property.bedrooms}` : ""}
${property.floor ? `Floor: ${property.floor}` : ""}
${property.year_built ? `Year built: ${property.year_built}` : ""}
${property.energy_class ? `Energy class: ${property.energy_class}` : ""}
${property.condition ? `Condition: ${property.condition}` : ""}
${property.features?.length ? `Key features: ${property.features.join(", ")}` : ""}
${property.listing_type === "rent" ? "Provide monthly rent estimate in EUR." : "Provide sale price estimate in EUR."}`;
    } else {
      return new Response(
        JSON.stringify({ error: `Unsupported type: "${type}". Use "description", "price", or "ping".` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await openAIChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      temperature: 0.7,
      max_tokens: 1024,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const content = readOpenAITextContent(result);

    await recordAiCall(quota.userId, BUCKET);
    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    log.error("listing-ai-assist error", { err: e instanceof Error ? e.message : String(e) });
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
