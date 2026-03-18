const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase env not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
