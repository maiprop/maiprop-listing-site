// no imports needed

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { location, poi, size, bedrooms, tags, title } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const details = [
      title && `Property: ${title}`,
      location && `Location: ${location}`,
      size && `Size: ${size}m²`,
      bedrooms && `Bedrooms: ${bedrooms}`,
      tags?.length && `Features: ${tags.join(", ")}`,
      poi?.length && `Nearby: ${poi.slice(0, 5).join(", ")}`,
    ].filter(Boolean).join("\n");

    const prompt = `Write a concise, compelling 1-2 sentence property description for a Greek Golden Visa investment property. Use professional real estate tone. Focus on investment appeal, location, and key features. Do NOT mention prices. No bullet points, no headings — plain text only.\n\n${details}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a luxury real estate copywriter specializing in Greek Golden Visa investment properties." },
          { role: "user", content: prompt },
        ],
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-description error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
