import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function requireAuth(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authErr = await requireAuth(req);
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const { address, city } = body;
    const lat = body.lat ?? body.latitude;
    const lng = body.lng ?? body.longitude;

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: "lat/lng required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const useGemini = !!GEMINI_API_KEY;
    if (!useGemini && !LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const apiKey = (useGemini ? GEMINI_API_KEY : LOVABLE_API_KEY)!;
    const aiUrl = useGemini
      ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const aiModel = "google/gemini-3-flash-preview";

    const prompt = `You are a Greek real estate assistant. Given a property at address "${address}" in ${city}, Greece (coordinates: ${lat}, ${lng}), generate a realistic list of 10-14 nearby points of interest that a prospective buyer would care about.

Return ONLY valid JSON with this exact structure, no markdown, no explanation:
{
  "pois": [
    {
      "name": "string (specific realistic place name in English, e.g. 'Primary School Kolonaki')",
      "category": "school" | "transit" | "cafe" | "hospital" | "shopping" | "park",
      "distanceKm": number (realistic 0.05 to 2.5),
      "walkMinutes": number (distanceKm * 12 rounded to nearest whole number),
      "description": "string (brief 3-5 word description, optional)"
    }
  ]
}

Rules:
- Use real-sounding Greek place names relevant to ${city}
- Include 2-3 of each category: school, transit, cafe, hospital, shopping, park
- Distances should be realistically spread from 50m to 2.5km
- walkMinutes = Math.round(distanceKm * 12) approximately
- Return only the JSON object, nothing else`;

    const response = await fetch(aiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(useGemini ? {} : { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(
        useGemini
          ? { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } }
          : { model: aiModel, messages: [{ role: "user", content: prompt }], temperature: 0.7 }
      ),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "AI features are temporarily unavailable due to usage limits. Please try again later or contact support." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI features are temporarily unavailable due to usage limits. Please try again later or contact support." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI error:", status, text);
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const content = useGemini ? aiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "" : aiData.choices?.[0]?.message?.content ?? "";

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

    let parsed: { pois: any[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Attempt to repair common AI JSON glitches
      const repaired = jsonStr
        .replace(/,\s*}/g, "}")          // trailing commas in objects
        .replace(/,\s*]/g, "]")          // trailing commas in arrays
        .replace(/\)\s*\}/g, "}")        // stray ) before closing brace  ← fixes this specific bug
        .replace(/\)\s*,/g, ",")         // stray ) before commas
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""); // control chars

      try {
        parsed = JSON.parse(repaired);
      } catch {
        console.error("Failed to parse AI response:", jsonStr);
        throw new Error("AI returned invalid JSON");
      }
    }

    if (!Array.isArray(parsed.pois)) throw new Error("Invalid AI response shape");

    // Validate and sanitise
    const categories = ["school", "transit", "cafe", "hospital", "shopping", "park"];
    const pois = parsed.pois
      .filter((p: any) => p.name && categories.includes(p.category) && typeof p.distanceKm === "number")
      .map((p: any) => ({
        name: String(p.name).slice(0, 60),
        category: p.category,
        distanceKm: Math.max(0.05, Math.min(5, Number(p.distanceKm))),
        walkMinutes: Math.max(1, Math.min(60, Number(p.walkMinutes ?? Math.round(p.distanceKm * 12)))),
        description: p.description ? String(p.description).slice(0, 40) : undefined,
      }))
      .slice(0, 15);

    return new Response(JSON.stringify({ pois }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("property-pois error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
