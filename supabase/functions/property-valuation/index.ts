import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { title, city, address, price, sqm, bedrooms, bathrooms, propertyType,
            listingType, floor, yearBuilt, energyClass, pricePerSqm,
            hasParking, hasPool, hasElevator, region } = body;

    if (!city || !sqm || !price) {
      return new Response(
        JSON.stringify({ error: "city, sqm and price are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const features = [
      floor != null && `Floor ${floor}`,
      yearBuilt && `Built ${yearBuilt}`,
      energyClass && `Energy class ${energyClass}`,
      hasParking && "Has parking",
      hasPool && "Has pool",
      hasElevator && "Has elevator",
    ].filter(Boolean).join(", ");

    const prompt = `You are a Greek real estate valuation expert with deep knowledge of the ${city} property market.

Analyse this property and provide an AI valuation:
- Title: ${title || "Property"}
- Location: ${address || city}, ${city}${region ? `, ${region}` : ""}, Greece
- Type: ${propertyType || "apartment"} (${listingType || "sale"})
- Size: ${sqm} m²
- Bedrooms: ${bedrooms ?? "N/A"}, Bathrooms: ${bathrooms ?? "N/A"}
- Listed price: €${Number(price).toLocaleString()} (€${pricePerSqm ? Math.round(Number(pricePerSqm)) : Math.round(Number(price)/Number(sqm))}/m²)
- Features: ${features || "standard"}

Return ONLY valid JSON, no markdown, no explanation:
{
  "estimatedValue": number (realistic market value in EUR),
  "rangeLow": number (lower bound, typically 5-12% below estimated),
  "rangeHigh": number (upper bound, typically 5-12% above estimated),
  "confidence": number (0-100, your confidence in the estimate),
  "confidenceLabel": "High" | "Medium" | "Low",
  "pricePerSqmEstimate": number,
  "marketComparison": "below_market" | "at_market" | "above_market",
  "marketComparisonPct": number (e.g. -8 means 8% below market, +5 means 5% above),
  "summary": "string (2-3 sentences explaining the valuation, mention specific ${city} market dynamics)",
  "keyFactors": [
    { "factor": "string", "impact": "positive" | "negative" | "neutral", "note": "string (brief)" }
  ],
  "renovationPotential": "string (brief note on value-add potential)",
  "rentalYieldEstimate": number (annual %, e.g. 4.5)
}

Rules:
- Be realistic about Greek property market values
- keyFactors should have 3-5 items covering location, size, condition, market trends
- confidence should reflect data quality (lower if few details provided)
- Only return the JSON object`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const content = (aiData.choices?.[0]?.message?.content ?? "")
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: any;
    try { parsed = JSON.parse(content); }
    catch { throw new Error("AI returned invalid JSON"); }

    // Sanitise
    const result = {
      estimatedValue: Math.round(Number(parsed.estimatedValue) || price),
      rangeLow: Math.round(Number(parsed.rangeLow) || price * 0.92),
      rangeHigh: Math.round(Number(parsed.rangeHigh) || price * 1.08),
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 70)),
      confidenceLabel: ["High","Medium","Low"].includes(parsed.confidenceLabel) ? parsed.confidenceLabel : "Medium",
      pricePerSqmEstimate: Math.round(Number(parsed.pricePerSqmEstimate) || price / sqm),
      marketComparison: ["below_market","at_market","above_market"].includes(parsed.marketComparison) ? parsed.marketComparison : "at_market",
      marketComparisonPct: Number(parsed.marketComparisonPct) || 0,
      summary: String(parsed.summary || "").slice(0, 400),
      keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.slice(0, 6).map((f: any) => ({
        factor: String(f.factor || "").slice(0, 50),
        impact: ["positive","negative","neutral"].includes(f.impact) ? f.impact : "neutral",
        note: String(f.note || "").slice(0, 80),
      })) : [],
      renovationPotential: String(parsed.renovationPotential || "").slice(0, 200),
      rentalYieldEstimate: Math.round((Number(parsed.rentalYieldEstimate) || 4.5) * 10) / 10,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("property-valuation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
