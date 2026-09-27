import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import {
  openAIChatCompletion,
  readOpenAITextContent,
} from "../_shared/openai.ts";
import { enforceAiQuota } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";
import { buildVettedAnswerRules } from "../_shared/aiSafety.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

const log = createLogger("property-chat");

const BUCKET = "property-chat";
const chatLimiter = makeRateLimiter({
  bucket: BUCKET,
  maxRequests: 20,
  windowMs: 60_000,
  failClosed: true,
});
const VETTED_ANSWER_RULES = buildVettedAnswerRules({
  scope: "the property chat assistant",
  timeSensitiveTopics: ["school catchments", "business hours"],
});

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1, "Message content is required").max(
    8000,
    "Message content is too long",
  ),
}).strict();

const propertyContextSchema = z.object({
  title: z.string().trim().max(180).optional(),
  city: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
  price: z.number().finite().min(0).max(1_000_000_000_000).optional(),
  pricePerSqm: z.number().finite().min(0).max(1_000_000_000).optional(),
  propertyType: z.enum([
    "apartment",
    "house",
    "villa",
    "land",
    "commercial",
    "office",
    "studio",
    "maisonette",
    "warehouse",
    "hotel",
    "mixed_use",
    "parking",
    "storage",
  ]).optional(),
  listingType: z.enum([
    "sale",
    "rent",
    "auction",
    "firesale",
    "open_house",
    "new_build",
  ]).optional(),
  sqm: z.number().finite().min(0).max(10_000_000).optional(),
  bedrooms: z.number().finite().min(0).max(100).optional(),
  bathrooms: z.number().finite().min(0).max(100).optional(),
  floor: z.number().finite().min(-20).max(300).optional(),
  yearBuilt: z.number().finite().min(1000).max(2200).optional(),
  energyClass: z.string().trim().max(20).optional(),
  heatingSystem: z.string().trim().max(80).optional(),
  hasParking: z.boolean().optional(),
  hasPool: z.boolean().optional(),
  hasElevator: z.boolean().optional(),
  hasGarden: z.boolean().optional(),
  hasBalcony: z.boolean().optional(),
  hasAC: z.boolean().optional(),
  hasFireplace: z.boolean().optional(),
  hasFurnished: z.boolean().optional(),
  hasStorage: z.boolean().optional(),
  hasSmartHome: z.boolean().optional(),
  petsAllowed: z.boolean().optional(),
  hasView: z.boolean().optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  region: z.string().trim().max(120).optional(),
}).strict().superRefine((context, ctx) => {
  const hasLatitude = context.latitude !== undefined;
  const hasLongitude = context.longitude !== undefined;
  if (hasLatitude === hasLongitude) return;
  ctx.addIssue({
    code: "custom",
    path: [hasLatitude ? "longitude" : "latitude"],
    message: "Latitude and longitude must be provided together",
  });
});

const propertyChatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(
    1,
    "At least one message is required",
  ).max(30, "Too many messages"),
  propertyContext: propertyContextSchema.optional(),
}).strict();

function toSseChunk(text: string): string {
  return `data: ${
    JSON.stringify({ choices: [{ delta: { content: text } }] })
  }\n\ndata: [DONE]\n\n`;
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

  try {
    const { messages, propertyContext } = await parseJsonBody(
      req,
      propertyChatRequestSchema,
    );
    const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
    if (quota.errorResponse) return quota.errorResponse;

    const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      quota.userId ?? "anonymous";
    if (await chatLimiter.isLimited(_ip)) {
      return tooManyRequestsResponse(corsHeaders);
    }

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
- Price: €${
        propertyContext.price
          ? Number(propertyContext.price).toLocaleString()
          : "Unknown"
      }
- Price per m²: ${
        propertyContext.pricePerSqm
          ? `€${Number(propertyContext.pricePerSqm).toLocaleString()}/m²`
          : "Unknown"
      }
- Type: ${sanitize(propertyContext.propertyType)} (${
        sanitize(propertyContext.listingType)
      })
- Size: ${propertyContext.sqm ?? "Unknown"} m²
- Bedrooms: ${propertyContext.bedrooms ?? "Unknown"}
- Bathrooms: ${propertyContext.bathrooms ?? "Unknown"}
- Floor: ${propertyContext.floor ?? "Unknown"}
- Year Built: ${propertyContext.yearBuilt ?? "Unknown"}
- Energy Class: ${sanitize(propertyContext.energyClass)}
- Heating: ${sanitize(propertyContext.heatingSystem)}
- Features: ${
        [
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
        ].filter(Boolean).join(", ") || "None listed"
      }
- Coordinates: ${
        propertyContext.latitude !== undefined &&
          propertyContext.longitude !== undefined
          ? `${propertyContext.latitude}, ${propertyContext.longitude}`
          : "Not available"
      }
- Neighbourhood: ${sanitize(propertyContext.region ?? propertyContext.city)}

RESPONSE RULES — follow strictly:
${VETTED_ANSWER_RULES}

- Be extremely concise. No filler phrases ("Great question!", "Certainly!").
- Use bullet points for any list of 2+ facts.
- Max 3–5 bullets per answer unless the user asks for more detail.
- One short intro sentence max, then bullets. Skip intro if bullets suffice.
- Never repeat information. Keep responses under ~150 words unless asked for depth.
- Always note if a data point is unavailable for this property.`
      : `You are an expert Greek real estate AI assistant. Help users with property questions, market insights, legal aspects, and neighbourhood information in Greece.

RESPONSE RULES — follow these strictly:
${VETTED_ANSWER_RULES}

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
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again shortly.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    // Quota was reserved before provider work, including streams that fail later.
    return await normalizeProviderResponseToSse(response, corsHeaders);
  } catch (e: unknown) {
    if (e instanceof SchemaValidationError) {
      return new Response(
        JSON.stringify({ error: e.message, code: e.code, issues: e.issues }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    log.error("property-chat error", { err: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

Deno.serve(handleRequest);
