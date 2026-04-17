import { createClient } from "npm:@supabase/supabase-js@2";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";

const chatLimiter = makeRateLimiter({ maxRequests: 20, windowMs: 60_000 });

async function requireAuth(req: Request): Promise<{ error: Response | null; userId: string | null }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      userId: null,
    };
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) {
    return {
      error: new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      userId: null,
    };
  }
  return { error: null, userId: user.id };
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (chatLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);


  const { error: authErr } = await requireAuth(req);
  if (authErr) return authErr;

  try {
    const { messages, propertyContext } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build a rich system prompt from the property context
    const propertyDetails = propertyContext
      ? `
You are an expert Greek real estate AI assistant helping users understand a specific property.

PROPERTY CONTEXT:
- Title: ${propertyContext.title ?? "Unknown"}
- City: ${propertyContext.city ?? "Unknown"}
- Address: ${propertyContext.address ?? "Not specified"}
- Price: €${propertyContext.price ? Number(propertyContext.price).toLocaleString() : "Unknown"}
- Price per m²: ${propertyContext.pricePerSqm ? `€${Number(propertyContext.pricePerSqm).toLocaleString()}/m²` : "Unknown"}
- Type: ${propertyContext.propertyType ?? "Unknown"} (${propertyContext.listingType ?? "Unknown"})
- Size: ${propertyContext.sqm ?? "Unknown"} m²
- Bedrooms: ${propertyContext.bedrooms ?? "Unknown"}
- Bathrooms: ${propertyContext.bathrooms ?? "Unknown"}
- Floor: ${propertyContext.floor ?? "Unknown"}
- Year Built: ${propertyContext.yearBuilt ?? "Unknown"}
- Energy Class: ${propertyContext.energyClass ?? "Unknown"}
- Heating: ${propertyContext.heatingSystem ?? "Unknown"}
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
- Neighbourhood: ${propertyContext.region ?? propertyContext.city}

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: propertyDetails },
          ...messages,
        ],
        stream: true,
        temperature: 0.7,
      }),
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

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("property-chat error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
