// no imports needed

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { texts, targetLang } = await req.json();

    const VALID_LANGS = ["English", "Ελληνικά", "العربية", "中文", "Русский", "Français", "हिन्दी", "עברית"];

    if (!texts || !Array.isArray(texts) || !targetLang) {
      return new Response(
        JSON.stringify({ error: "texts (array) and targetLang are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (texts.length > 50) {
      return new Response(
        JSON.stringify({ error: "Maximum 50 texts per request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!VALID_LANGS.includes(targetLang)) {
      return new Response(
        JSON.stringify({ error: "Unsupported target language" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate all texts are strings with reasonable length
    for (const t of texts) {
      if (typeof t !== "string" || t.length > 5000) {
        return new Response(
          JSON.stringify({ error: "Each text must be a string under 5000 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `You are a professional translator. Translate the following JSON array of strings into ${targetLang}. Return ONLY a valid JSON array of translated strings in the same order, nothing else. Keep proper nouns, brand names like "mAI Prop", "Golden Visa", currency symbols, and numbers unchanged. Do not add explanations.\n\nInput:\n${JSON.stringify(texts)}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(
        JSON.stringify({ error: "Translation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Extract JSON array from the response (handle markdown code blocks)
    let translated: string[];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      translated = jsonMatch ? JSON.parse(jsonMatch[0]) : texts;
    } catch {
      console.error("Failed to parse translation response:", content);
      translated = texts;
    }

    return new Response(JSON.stringify({ translated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
