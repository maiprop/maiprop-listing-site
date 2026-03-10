const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const systemPrompts: Record<string, string> = {
  legal: "You are a Greek real estate legal AI assistant. Help with contract risk analysis, title deed checks, due diligence summaries, and conveyancing questions in the Greek property market. Highlight key risks clearly. Keep answers practical and concise.",
  design: "You are a Greek real estate architecture and renovation AI assistant. Help with building permits, renovation cost estimates, floor plan ideas, and Greek building regulations. Be practical and cite typical Greek market costs in euros.",
  trades: "You are a Greek property trades AI assistant specialising in electrical, plumbing, and general building works. Help diagnose issues, estimate costs, and explain Greek building standards.",
  finance: "You are a Greek real estate financial AI assistant. Help with property valuations, investment yield calculations, mortgage advice, portfolio optimisation, and the Greek property tax system (ENFIA, transfer tax, capital gains).",
  management: "You are a Greek property management AI assistant. Help with tenant screening, rental contract advice under Greek law, maintenance scheduling, and occupancy optimisation.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, groupId } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemContent = systemPrompts[groupId] || systemPrompts["legal"];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
        stream: true,
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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("pro-ai-tools error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
