import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { openAIChatCompletion } from "../_shared/openai.ts";

const serviceMatchLimiter = makeRateLimiter({ bucket: "ai-service-match", maxRequests: 20, windowMs: 60_000 });

async function requireAuth(req: Request): Promise<{ error: Response | null; userId: string | null }> {
  const corsHeaders = getCorsHeaders(req);
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
    Deno.env.get("SUPABASE_ANON_KEY")!
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

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await serviceMatchLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  const { error: authErr } = await requireAuth(req);
  if (authErr) return authErr;

  try {
    const { need } = await req.json();
    if (!need?.trim()) {
      return new Response(JSON.stringify({ error: "Need description is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await openAIChatCompletion({
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
