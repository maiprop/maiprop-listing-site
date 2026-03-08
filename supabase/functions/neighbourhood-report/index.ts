import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { city, address, region, propertyType, lat, lng } = await req.json();

    if (!city) {
      return new Response(
        JSON.stringify({ error: "city is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const locationStr = [address, city, region, "Greece"].filter(Boolean).join(", ");
    const coordStr = lat && lng ? ` (coords: ${lat}, ${lng})` : "";

    const prompt = `You are a Greek real estate market analyst. Generate a neighbourhood intelligence report for a property at: ${locationStr}${coordStr}.

Return ONLY valid JSON, no markdown, no explanation:
{
  "areaName": "string (specific neighbourhood name, e.g. 'Kolonaki' or 'Nea Smyrni')",
  "pricePerSqmTrend": {
    "current": number (EUR/m² today),
    "oneYearAgo": number,
    "threeYearsAgo": number,
    "fiveYearsAgo": number,
    "changeYoY": number (% change year-on-year, e.g. 7.2),
    "change5Y": number (% change over 5 years)
  },
  "noiseLevel": {
    "score": number (1-10, 1=silent, 10=very loud),
    "label": "Very Quiet" | "Quiet" | "Moderate" | "Busy" | "Very Busy",
    "notes": "string (brief description, e.g. 'Residential street, low traffic')"
  },
  "safetyScore": {
    "score": number (1-100, higher=safer),
    "label": "Excellent" | "Good" | "Average" | "Below Average",
    "trend": "Improving" | "Stable" | "Declining",
    "notes": "string"
  },
  "developmentProjects": [
    {
      "name": "string (realistic project name)",
      "type": "infrastructure" | "commercial" | "residential" | "transport" | "public",
      "status": "planned" | "under_construction" | "recently_completed",
      "impact": "positive" | "negative" | "neutral",
      "estimatedCompletion": "string (e.g. '2026' or 'Q3 2025')",
      "distanceKm": number
    }
  ],
  "demographics": {
    "primaryResidents": "string (e.g. 'Young professionals and families')",
    "avgAge": number,
    "tourismImpact": "Low" | "Moderate" | "High"
  },
  "investmentOutlook": {
    "rating": "Excellent" | "Good" | "Fair" | "Poor",
    "summary": "string (2 sentences)"
  },
  "areaHighlights": ["string"] 
}

Rules:
- Base all data on real knowledge of ${city}, Greece neighbourhoods
- developmentProjects: include 2-4 realistic projects for the area
- areaHighlights: 3-4 short bullet points (e.g. 'Metro line 200m away')
- All numbers must be realistic for the Greek market
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
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const content = (aiData.choices?.[0]?.message?.content ?? "")
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: any;
    try { parsed = JSON.parse(content); }
    catch { throw new Error("AI returned invalid JSON"); }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("neighbourhood-report error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
