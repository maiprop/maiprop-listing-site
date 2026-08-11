import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import type { Database } from "../../../src/integrations/supabase/types.ts";

const log = createLogger("smart-filters");

const BUCKET = "smart-filters";
const smartFiltersLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 20, windowMs: 60_000, failClosed: true });
type CanonicalPropertyType = Database["public"]["Enums"]["property_type"];

// Current app catalogue plus the documented legacy commercial values "office" and "other".
const PROPERTY_SUBTYPES_BY_TYPE = {
  apartment: [
    "studio", "1bedroom", "2bedroom", "3bedroom", "4bedroom", "ground_floor", "basement",
    "penthouse", "loft", "maisonette",
  ],
  house: ["detached", "semi_detached", "terraced", "townhouse", "bungalow", "neoclassical", "traditional"],
  villa: ["seafront", "hilltop", "countryside", "island", "gated", "golden_visa"],
  land: ["buildable", "agricultural", "coastal", "forest", "industrial", "tourism"],
  commercial: [
    "shop", "office", "warehouse", "hotel", "restaurant", "showroom", "clinic", "industrial", "other",
    "craft_workshop", "commercial_building", "hall", "mixed_use", "office_private", "office_open_plan",
    "office_coworking", "office_business", "office_floor", "other_commercial",
  ],
  office: ["private_office", "open_plan", "coworking", "business_centre", "floor", "converted"],
  studio: [],
  maisonette: [],
  warehouse: [],
  hotel: [],
  mixed_use: [],
  parking: [],
  storage: [],
} as const satisfies Record<CanonicalPropertyType, readonly string[]>;

const CANONICAL_PROPERTY_TYPES = Object.keys(PROPERTY_SUBTYPES_BY_TYPE) as [
  CanonicalPropertyType,
  ...CanonicalPropertyType[],
];
const ALL_PROPERTY_SUBTYPES = [
  ...new Set(Object.values(PROPERTY_SUBTYPES_BY_TYPE).flat()),
] as [string, ...string[]];
const propertyTypeSchema = z.enum(CANONICAL_PROPERTY_TYPES);
const propertySubtypeSchema = z.enum(ALL_PROPERTY_SUBTYPES);
const smartFiltersRequestSchema = z.object({
  type: propertyTypeSchema,
  subtype: propertySubtypeSchema.nullable().optional(),
  listing_type: z.enum(["sale", "rent", "auction", "firesale", "open_house", "new_build"]).nullable().optional(),
}).strict().superRefine((request, context) => {
  if (request.subtype == null) return;
  const allowedSubtypes = PROPERTY_SUBTYPES_BY_TYPE[request.type] as readonly string[];
  if (!allowedSubtypes.includes(request.subtype)) {
    context.addIssue({
      code: "custom",
      path: ["subtype"],
      message: `Invalid subtype for property type ${request.type}`,
    });
  }
});

// All available boolean feature fields on listings
const AVAILABLE_FEATURES = [
  { key: "has_ac",                 label: "AC" },
  { key: "has_alarm",              label: "Alarm" },
  { key: "has_attic",              label: "Attic" },
  { key: "has_awning",             label: "Awning" },
  { key: "has_balcony",            label: "Balcony" },
  { key: "has_cctv",               label: "CCTV" },
  { key: "has_disability_access",  label: "Accessibility" },
  { key: "has_double_glazing",     label: "Double Glazing" },
  { key: "has_electricity_supply", label: "Electricity" },
  { key: "has_elevator",           label: "Elevator" },
  { key: "has_equipped",           label: "Equipped Kitchen" },
  { key: "has_facade",             label: "Shop Facade" },
  { key: "has_fireplace",          label: "Fireplace" },
  { key: "has_furnished",          label: "Furnished" },
  { key: "has_garden",             label: "Garden" },
  { key: "has_internal_staircase", label: "Internal Staircase" },
  { key: "has_land_concession",    label: "Land Concession" },
  { key: "has_loading_dock",       label: "Loading Dock" },
  { key: "has_night_power",        label: "Night Power" },
  { key: "has_parking",            label: "Parking" },
  { key: "has_pool",               label: "Pool" },
  { key: "has_satellite",          label: "Satellite" },
  { key: "has_secure_door",        label: "Secure Door" },
  { key: "has_security",           label: "Security" },
  { key: "has_smart_home",         label: "Smart Home" },
  { key: "has_solar_water",        label: "Solar Water Heater" },
  { key: "has_storage",            label: "Storage" },
  { key: "has_structured_cabling", label: "Structured Cabling" },
  { key: "has_three_phase_power",  label: "3-Phase Power" },
  { key: "has_underfloor_heating", label: "Underfloor Heating" },
  { key: "has_view",               label: "View" },
  { key: "has_virtual_tour",       label: "Virtual Tour" },
  { key: "has_water_supply",       label: "Water Supply" },
  { key: "has_window_screens",     label: "Window Screens" },
  { key: "is_buildable",           label: "Buildable" },
  { key: "within_city_plan",       label: "Within City Plan" },
  { key: "within_settlement",      label: "Within Settlement" },
  { key: "pets_allowed",           label: "Pet Friendly" },
  { key: "short_term_rental",      label: "Short-term Rental" },
];

const AVAILABLE_SECTIONS = [
  "size", "bedrooms", "bathrooms", "floor", "year_built",
  "heating", "energy_class", "construction_status",
  "land_details", "rental_extras", "commercial_details",
];

type SmartFilterArgs = {
  sections?: unknown;
  featureKeys?: unknown;
  sizeLabel?: unknown;
  priceLabel?: unknown;
  bedsLabel?: unknown;
  featuresLabel?: unknown;
};

const extractJsonObject = (raw: string): string => {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object in AI response");
  }
  return cleaned.slice(start, end + 1);
};

export const parseSmartFilterArgs = (raw: string): SmartFilterArgs => {
  const json = extractJsonObject(raw);
  try {
    return JSON.parse(json) as SmartFilterArgs;
  } catch {
    const repaired = json
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/\)\s*}/g, "}")
      .replace(/\)\s*,/g, ",");
    return JSON.parse(repaired) as SmartFilterArgs;
  }
};

const coerceString = (value: unknown, fallback: string): string => {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
};

const coerceStringArray = (value: unknown, allowed?: Set<string>): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && (!allowed || allowed.has(item)))
    .slice(0, 24);
};

const handleRequest = async (req: Request): Promise<Response> => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, AI parsing, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { type, subtype, listing_type } = await parseJsonBody(req, smartFiltersRequestSchema);
    const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
    if (quota.errorResponse) return quota.errorResponse;

    const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? quota.userId ?? "anonymous";
    if (await smartFiltersLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

    const availableFeatureKeys = AVAILABLE_FEATURES.map((f) => f.key).join(", ");
    const sectionKeys = AVAILABLE_SECTIONS.join(", ");

    const systemPrompt = `You are a Greek real estate portal filter expert. Given a property type and subtype, determine the most relevant search filters to show buyers/renters. Be precise - only include filters that are genuinely useful for that property type.

Available filter sections: ${sectionKeys}
Available feature keys: ${availableFeatureKeys}

Return ONLY one valid JSON object with this exact shape:
{
  "sections": string[],
  "featureKeys": string[],
  "sizeLabel": string,
  "priceLabel": string,
  "bedsLabel": string | null,
  "featuresLabel": string
}

Rules:
- "size" is always included
- "bedrooms"/"bathrooms" only for residential (apartment, house, villa) or hotel
- "floor" only for apartments and offices, not land or standalone commercial
- "land_details" only for land
- "commercial_details" only for commercial subtypes
- "rental_extras" only when listing_type is "rent"
- Choose 4-12 feature keys most relevant to the specific subtype
- For "sizeLabel": be specific (e.g. "Plot Area (m²)" for land, "Hotel Area (m²)" for hotel)
- For "priceLabel": "Asking Price" for sale, "Monthly Rent" for rent, "Price" if unknown
- For "bedsLabel": "Bedrooms" for residential, "Rooms" for hotel, omit for commercial/land`;

    const userMsg = `Property type: ${type || "any"}${subtype ? `, subtype: ${subtype}` : ""}${listing_type ? `, listing_type: ${listing_type}` : ""}`;

    const response = await openAIChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      temperature: 0.1,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
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
    const args = parseSmartFilterArgs(readOpenAITextContent(aiData));

    const featureMap = Object.fromEntries(AVAILABLE_FEATURES.map((f) => [f.key, f]));
    const sectionSet = new Set(AVAILABLE_SECTIONS);
    const featureKeySet = new Set(AVAILABLE_FEATURES.map((f) => f.key));
    const sections = coerceStringArray(args.sections, sectionSet);
    const featureKeys = coerceStringArray(args.featureKeys, featureKeySet);
    const features = featureKeys
      .map((k) => featureMap[k]);

    await recordAiCall(quota.userId, BUCKET);
    return new Response(JSON.stringify({
      sections: sections.length ? sections : ["size"],
      features,
      sizeLabel: coerceString(args.sizeLabel, "Size (m²)"),
      priceLabel: coerceString(args.priceLabel, listing_type === "rent" ? "Monthly Rent" : "Asking Price"),
      bedsLabel: typeof args.bedsLabel === "string" ? args.bedsLabel.slice(0, 80) : null,
      featuresLabel: coerceString(args.featuresLabel, "Features"),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof SchemaValidationError) {
      return new Response(JSON.stringify({ error: e.message, code: e.code, issues: e.issues }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log.error("smart-filters error", { err: e instanceof Error ? e.message : String(e) });
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

Deno.serve(handleRequest);
