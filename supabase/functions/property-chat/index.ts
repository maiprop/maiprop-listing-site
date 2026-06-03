import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("property-chat");

const BUCKET = "property-chat";
const chatLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 20, windowMs: 60_000, failClosed: true });

function toSseChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
}

async function normalizeProviderResponseToSse(
  response: Response,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.toLowerCase().includes("text/event-stream")) {
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  }

  const payload = await response.json();
  const text = readOpenAITextContent(payload).trim();
  if (!text) {
    throw new Error("AI response did not include readable chat content");
  }

  return new Response(toSseChunk(text), {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}

const handleRequest = async (req: Request): Promise<Response> => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, listing context, AI parsing, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
  if (quota.errorResponse) return quota.errorResponse;

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? quota.userId ?? "anonymous";
  if (await chatLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  try {
    const { messages, propertyContext } = await req.json();

    // Strip newlines and limit length to prevent prompt injection via property fields
    const sanitize = (v: unknown, maxLen = 200): string => {
      if (v === null || v === undefined) return "Unknown";
      return String(v).replace(/[\r\n]+/g, " ").slice(0, maxLen);
    };

    // Build a rich system prompt from the property context
    const propertyDetails = propertyContext
      ? `
You are an expert Greek real estate AI assistant helping users understand a specific property.

PROPERTY CONTEXT:
- Title: <title>${sanitize(propertyContext.title)}</title>
- City: <city>${sanitize(propertyContext.city)}</city>
- Address: <address>${sanitize(propertyContext.address)}</address>
- Price: €${propertyContext.price ? Number(propertyContext.price).toLocaleString() : "Unknown"}
- Price per m²: ${propertyContext.pricePerSqm ? `€${Number(propertyContext.pricePerSqm).toLocaleString()}/m²` : "Unknown"}
- Type: ${sanitize(propertyContext.propertyType)} (${sanitize(propertyContext.listingType)})
- Size: ${propertyContext.sqm ?? "Unknown"} m²
- Bedrooms: ${propertyContext.bedrooms ?? "Unknown"}
- Bathrooms: ${propertyContext.bathrooms ?? "Unknown"}
- Floor: ${propertyContext.floor ?? "Unknown"}
- Year Built: ${propertyContext.yearBuilt ?? "Unknown"}
- Energy Class: ${sanitize(propertyContext.energyClass)}
- Heating: ${sanitize(propertyContext.heatingSystem)}
- Features: ${[
    propertyContext.hasParking && "Parking",
    propertyContext.hasPool && "Pool",
    propertyContext.hasElevator && "Elevator",
    propertyContext.hasGarden && "Garden",
    propertyContext.hasBalcony && "Balcony",
    propertyContext.hasAC && "AC",
    propertyContext.hasFireplace && "Fireplace",
    propertyContext.hasFurnished && "Furnished",
    propertyContext.hasStorage && "Storage",
    propertyContext.hasSmartHome && "Smart Home",
    propertyContext.petsAllowed && "Pet Friendly",
    propertyContext.hasView && "View",
  ].filter(Boolean).join(", ") || "None listed"}
- Coordinates: ${propertyContext.latitude ? `${propertyContext.latitude}, ${propertyContext.longitude}` : "Not available"}
- Neighbourhood: ${sanitize(propertyContext.region ?? propertyContext.city)}

RESPONSE RULES — follow strictly:
- Be extremely concise. No filler phrases ("Great question!", "Certainly!").
- Use bullet points for any list of 2+ facts.
- Max 3–5 bullets per answer unless the user asks for more detail.
- One short intro sentence max, then bullets. Skip intro if bullets suffice.
- Never repeat information. Keep responses under ~150 words unless asked for depth.
- Always note if a data point is unavailable for this property.`
      : `You are an expert Greek real estate AI assistant. Help users with property questions, market insights, legal aspects, and neighbourhood information in Greece.

RESPONSE RULES — follow these strictly:
- Be extremely concise. No filler phrases (e.g. "Great question!", "Certainly!", "Of course!").
- Use bullet points (- item) for any list of 2+ facts.
- Max 3–5 bullets per answer unless the user explicitly asks for more detail.
- One short intro sentence maximum, then bullets. Skip the intro if a bullet list is sufficient.
- Never repeat information already stated.
- Use markdown (bold, bullets) but keep total response under ~150 words unless the user asks for depth.`;

    const response = await openAIChatCompletion({
      messages: [
        { role: "system", content: propertyDetails },
        ...messages,
      ],
      stream: true,
      temperature: 0.7,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
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

    // Record usage now — we've committed to the call. The stream may
    // still fail mid-flight, but the OpenAI cost is already incurred.
    await recordAiCall(quota.userId, BUCKET);
    return await normalizeProviderResponseToSse(response, corsHeaders);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    log.error("property-chat error", { err: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

Deno.serve(handleRequest);
