/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";

const smartFiltersLimiter = makeRateLimiter({ maxRequests: 20, windowMs: 60_000 });

async function requireAuth(req: Request): Promise<Response | null> {
  const corsHeaders = getCorsHeaders(req);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

// All available boolean feature fields on listings
const AVAILABLE_FEATURES = [
  { key: "has_ac",                 label: "❄️ AC" },
  { key: "has_alarm",              label: "🚨 Alarm" },
  { key: "has_attic",              label: "🔼 Attic" },
  { key: "has_awning",             label: "☂️ Awning" },
  { key: "has_balcony",            label: "🏞️ Balcony" },
  { key: "has_cctv",               label: "📹 CCTV" },
  { key: "has_disability_access",  label: "♿ Accessibility" },
  { key: "has_double_glazing",     label: "🪟 Double Glazing" },
  { key: "has_electricity_supply", label: "⚡ Electricity" },
  { key: "has_elevator",           label: "🛗 Elevator" },
  { key: "has_equipped",           label: "🍳 Equipped Kitchen" },
  { key: "has_facade",             label: "🏪 Shop Facade" },
  { key: "has_fireplace",          label: "🔥 Fireplace" },
  { key: "has_furnished",          label: "🛋️ Furnished" },
  { key: "has_garden",             label: "🌿 Garden" },
  { key: "has_internal_staircase", label: "🪜 Internal Staircase" },
  { key: "has_land_concession",    label: "📜 Land Concession" },
  { key: "has_loading_dock",       label: "🚛 Loading Dock" },
  { key: "has_night_power",        label: "🌙 Night Power" },
  { key: "has_parking",            label: "🚗 Parking" },
  { key: "has_pool",               label: "🏊 Pool" },
  { key: "has_satellite",          label: "📡 Satellite" },
  { key: "has_secure_door",        label: "🔒 Secure Door" },
  { key: "has_security",           label: "🛡️ Security" },
  { key: "has_smart_home",         label: "🏡 Smart Home" },
  { key: "has_solar_water",        label: "☀️ Solar Water Heater" },
  { key: "has_storage",            label: "📦 Storage" },
  { key: "has_structured_cabling", label: "🔌 Structured Cabling" },
  { key: "has_three_phase_power",  label: "⚡ 3-Phase Power" },
  { key: "has_underfloor_heating", label: "🌡️ Underfloor Heating" },
  { key: "has_view",               label: "👁️ View" },
  { key: "has_virtual_tour",       label: "🕹️ Virtual Tour" },
  { key: "has_water_supply",       label: "💧 Water Supply" },
  { key: "has_window_screens",     label: "🪟 Window Screens" },
  { key: "is_buildable",           label: "🏗️ Buildable" },
  { key: "within_city_plan",       label: "🗺️ Within City Plan" },
  { key: "within_settlement",      label: "🏘️ Within Settlement" },
  { key: "pets_allowed",           label: "🐾 Pet Friendly" },
  { key: "short_term_rental",      label: "📅 Short-term Rental" },
];

const AVAILABLE_SECTIONS = [
  "size", "bedrooms", "bathrooms", "floor", "year_built",
  "heating", "energy_class", "construction_status",
  "land_details", "rental_extras", "commercial_details",
];

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (smartFiltersLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  const authErr = await requireAuth(req);
  if (authErr) return authErr;

  try {
    const { type, subtype, listing_type } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const featureKeys = AVAILABLE_FEATURES.map(f => f.key).join(", ");
    const sectionKeys = AVAILABLE_SECTIONS.join(", ");

    const systemPrompt = `You are a Greek real estate portal filter expert. Given a property type and subtype, determine the most relevant search filters to show buyers/renters. Be precise — only include filters that are genuinely useful for that property type.

Available filter sections: ${sectionKeys}
Available feature keys: ${featureKeys}

Rules:
- "size" is always included
- "bedrooms"/"bathrooms" only for residential (apartment, house, villa) or hotel
- "floor" only for apartments and offices, not land or standalone commercial
- "land_details" only for land
- "commercial_details" only for commercial subtypes
- "rental_extras" only when listing_type is "rent"  
- Choose 4–12 feature keys most relevant to the specific subtype
- For "sizeLabel": be specific (e.g. "Plot Area (m²)" for land, "Hotel Area (m²)" for hotel)
- For "priceLabel": "Asking Price" for sale, "Monthly Rent" for rent, "Price" if unknown
- For "bedsLabel": "Bedrooms" for residential, "Rooms" for hotel, omit for commercial/land`;

    const userMsg = `Property type: ${type || "any"}${subtype ? `, subtype: ${subtype}` : ""}${listing_type ? `, listing_type: ${listing_type}` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        temperature: 0.1,
        tools: [
          {
            type: "function",
            function: {
              name: "set_filters",
              description: "Define which filter sections and feature chips to display",
              parameters: {
                type: "object",
                properties: {
                  sections: {
                    type: "array",
                    items: { type: "string", enum: AVAILABLE_SECTIONS },
                    description: "Ordered list of filter sections to show",
                  },
                  featureKeys: {
                    type: "array",
                    items: { type: "string" },
                    description: "Feature field keys to show as filter chips",
                  },
                  sizeLabel: { type: "string", description: "Label for size input e.g. 'Plot Area (m²)'" },
                  priceLabel: { type: "string", description: "Label for price e.g. 'Monthly Rent'" },
                  bedsLabel: { type: "string", description: "Label for bedrooms/rooms, omit if not applicable" },
                  featuresLabel: { type: "string", description: "Section heading for features e.g. 'Hotel Amenities'" },
                },
                required: ["sections", "featureKeys", "sizeLabel", "priceLabel", "featuresLabel"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_filters" } },
      }),
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
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    // Robust JSON parsing with repair for common AI formatting glitches
    let rawArgs = toolCall.function.arguments ?? "";
    // Strip markdown code fences if present
    rawArgs = rawArgs.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    // Extract outermost { ... }
    const argsStart = rawArgs.indexOf("{");
    const argsEnd = rawArgs.lastIndexOf("}");
    if (argsStart !== -1 && argsEnd !== -1) rawArgs = rawArgs.slice(argsStart, argsEnd + 1);

    let args: any;
    try {
      args = JSON.parse(rawArgs);
    } catch {
      const repaired = rawArgs
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/\)\s*}/g, "}")
        .replace(/\)\s*,/g, ",")
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      try {
        args = JSON.parse(repaired);
      } catch {
        throw new Error("AI returned invalid JSON in tool call arguments");
      }
    }

    // Resolve feature keys → full { key, label } objects from our map
    const featureMap = Object.fromEntries(AVAILABLE_FEATURES.map(f => [f.key, f]));
    const features = (args.featureKeys as string[])
      .filter(k => featureMap[k])
      .map(k => featureMap[k]);

    return new Response(JSON.stringify({
      sections: args.sections,
      features,
      sizeLabel: args.sizeLabel,
      priceLabel: args.priceLabel,
      bedsLabel: args.bedsLabel ?? null,
      featuresLabel: args.featuresLabel,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("smart-filters error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
