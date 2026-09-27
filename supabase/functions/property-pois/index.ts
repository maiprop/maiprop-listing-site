import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { hasAIProviderCredentials, openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";
import { buildVettedAnswerRules } from "../_shared/aiSafety.ts";
import { errorResponse } from "../_shared/response.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

const log = createLogger("property-pois");

const BUCKET = "property-pois";
const poisLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 20, windowMs: 60_000, failClosed: true });
const VETTED_POI_RULES = buildVettedAnswerRules({
  scope: "nearby points-of-interest estimates",
  timeSensitiveTopics: ["business hours", "school names", "transit stops", "healthcare facilities", "shop availability"],
});
const POI_CATEGORIES = ["school", "transit", "cafe", "hospital", "shopping", "park"] as const;
const AI_SUGGESTION_WARNING = "AI-generated nearby-place suggestions are not independently verified. Confirm names and distances before relying on them.";

const optionalBoundedText = (label: string, maxLength: number) =>
  z.preprocess(
    (value) => value === null || value === undefined ? undefined : value,
    z.string().trim().max(maxLength, `Invalid ${label}`).optional(),
  );

const optionalCoordinate = (label: string, min: number, max: number) =>
  z.preprocess(
    (value) => value === null || value === undefined || value === "" ? undefined : value,
    z.union([
      z.number(),
      z.string().trim().min(1, `Invalid ${label}`),
    ])
      .transform((value) => typeof value === "number" ? value : Number(value))
      .pipe(
        z.number(`Invalid ${label}`)
          .finite(`Invalid ${label}`)
          .min(min, `Invalid ${label}`)
          .max(max, `Invalid ${label}`),
      )
      .optional(),
  );

const propertyPoisRequestSchema = z.object({
  responseVersion: z.unknown().optional(),
  address: optionalBoundedText("property address", 240),
  city: optionalBoundedText("property city", 120),
  lat: optionalCoordinate("property latitude", -90, 90),
  lng: optionalCoordinate("property longitude", -180, 180),
  latitude: optionalCoordinate("property latitude", -90, 90),
  longitude: optionalCoordinate("property longitude", -180, 180),
}).strict().superRefine((body, context) => {
  if (body.lat == null && body.latitude == null) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "lat/lng required" });
  }
  if (body.lng == null && body.longitude == null) {
    context.addIssue({ code: "custom", path: ["longitude"], message: "lat/lng required" });
  }
  if (body.lat != null && body.latitude != null && body.lat !== body.latitude) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "Conflicting latitude values" });
  }
  if (body.lng != null && body.longitude != null && body.lng !== body.longitude) {
    context.addIssue({ code: "custom", path: ["longitude"], message: "Conflicting longitude values" });
  }
});

const providerPoiSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(POI_CATEGORIES),
  distanceKm: z.number().finite().min(0).max(5),
  walkMinutes: z.number().finite().int().min(0).max(120),
  description: z.string().trim().min(1).max(240).optional(),
}).strict();

const providerPoisSchema = z.object({
  pois: z.array(providerPoiSchema).min(1).max(15),
}).strict();

const unavailableResponse = (
  corsHeaders: Record<string, string>,
  reason: string,
): Response => {
  log.warn("property-pois: nearby-place evidence unavailable", { reason });
  return errorResponse("Nearby-place evidence unavailable", 503, corsHeaders, {
    code: "poi_unavailable",
  });
};

const handleRequest = async (req: Request): Promise<Response> => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, listing context, AI parsing, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await poisLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  try {
    const body = await parseJsonBody(req, propertyPoisRequestSchema);
    const { address, city } = body;
    const lat = body.lat ?? body.latitude;
    const lng = body.lng ?? body.longitude;

    // Older clients turn any successful POI array into guessed markers and a
    // fabricated walk score. Reject them before configuration, quota, or paid
    // provider work. Only v2 clients understand suggestion-only semantics.
    if (body.responseVersion !== 2) {
      return unavailableResponse(corsHeaders, "Unsupported property-pois response version");
    }

    if (!hasAIProviderCredentials()) {
      return unavailableResponse(
        corsHeaders,
        "AI provider is not configured",
      );
    }

    const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
    if (quota.errorResponse) return quota.errorResponse;

    const prompt = `You are a Greek real estate assistant. Given a property at address "${address}" in ${city}, Greece (coordinates: ${lat}, ${lng}), suggest up to 12 possible nearby points of interest that a prospective buyer may want to verify.

${VETTED_POI_RULES}

These are model suggestions, not independently verified geographic evidence. Do not provide coordinates and do not imply that a suggested place or distance has been verified.

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
- Omit categories for which you cannot provide a useful suggestion
- Distances and walk times are estimates only; mention that uncertainty in each description
- Do not include latitude, longitude, lat, lng, or any other marker coordinates
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
      return unavailableResponse(
        corsHeaders,
        `AI provider returned ${status}`,
      );
    }

    let aiData: unknown;
    try {
      aiData = await response.json();
    } catch {
      return unavailableResponse(corsHeaders, "AI provider returned a non-JSON response");
    }
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      log.warn("property-pois: AI returned invalid JSON", {
        city,
        response: jsonStr?.slice(0, 500),
      });
      return unavailableResponse(corsHeaders, "AI provider returned invalid nearby-place JSON");
    }

    const providerResult = providerPoisSchema.safeParse(parsed);
    if (!providerResult.success) {
      log.warn("property-pois: invalid AI response shape", {
        city,
        issues: providerResult.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
      });
      return unavailableResponse(corsHeaders, "AI provider returned an invalid nearby-place shape");
    }

    return new Response(JSON.stringify({
      responseVersion: 2,
      pois: providerResult.data.pois,
      generatedBy: "ai",
      warning: AI_SUGGESTION_WARNING,
      provenance: {
        source: "ai_model_suggestion",
        independentlyVerified: false,
        coordinatesProvided: false,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof SchemaValidationError) {
      return errorResponse(e.message, 400, corsHeaders, {
        code: e.code,
        issues: e.issues,
      });
    }
    log.error("property-pois error", { err: e instanceof Error ? e.message : String(e) });
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

Deno.serve(handleRequest);
