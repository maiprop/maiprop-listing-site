import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { type, property } = body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    if (type === "ping") {
      return new Response(JSON.stringify({ ok: true, message: "listing-ai-assist is available" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Require authenticated user for description/price (not for ping)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
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
    const content = result.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("listing-ai-assist error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
