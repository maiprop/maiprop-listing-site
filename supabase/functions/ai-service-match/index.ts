const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a Greek real estate professional matchmaker. A user describes their property need in plain text, and you must:

1. Identify the best professional category match from:
   - lawyer (contracts, title checks, conveyancing, Golden Visa, dispute resolution)
   - notary (property transfer deeds, authenticated contracts, wills)
   - architect (design, planning permits, renovation oversight, energy certificates)
   - civil_engineer (structural analysis, static reports, seismic assessment, compliance)
   - contractor (renovation, new build, project management)
   - interior_designer (space planning, styling, 3D visualisation, staging)
   - electrician (electrical installations, solar, smart home, EV charging)
   - plumber (plumbing, heating systems, bathroom remodel)
   - financial_advisor (mortgage advice, investment strategy, tax planning, Golden Visa finance)
   - valuer (property appraisal, mortgage valuations, investment analysis)
   - property_manager (tenant management, rent collection, maintenance, short-term rental)

2. Identify the specific services needed (1-3 from the category)
3. Write a brief, friendly explanation of why you recommend this professional
4. Estimate urgency: low / medium / high

Respond using the match_professional tool ONLY.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { need } = await req.json();
    if (!need?.trim()) {
      return new Response(JSON.stringify({ error: "Need description is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: need },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "match_professional",
              description: "Return the best professional match for the user's real estate need",
              parameters: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["lawyer", "notary", "architect", "civil_engineer", "contractor", "interior_designer", "electrician", "plumber", "financial_advisor", "valuer", "property_manager"],
                    description: "Best matching professional category",
                  },
                  services: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific services recommended (1-3)",
                  },
                  explanation: {
                    type: "string",
                    description: "Friendly 1-2 sentence explanation of the match",
                  },
                  urgency: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "Urgency level of the need",
                  },
                  follow_up_question: {
                    type: "string",
                    description: "One clarifying question to better serve the user (optional)",
                  },
                },
                required: ["category", "services", "explanation", "urgency"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "match_professional" } },
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

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-service-match error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
