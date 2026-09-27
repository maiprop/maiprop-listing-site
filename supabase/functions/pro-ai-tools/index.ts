import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { openAIChatCompletion } from "../_shared/openai.ts";
import { enforceAiQuota } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";
import { buildVettedAnswerRules } from "../_shared/aiSafety.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

const log = createLogger("pro-ai-tools");

const BUCKET = "pro-ai-tools";
const proAiLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 15, windowMs: 60_000, failClosed: true });
const VETTED_ANSWER_RULES = `\n\n${buildVettedAnswerRules({
  scope: "specialist pro assistant tools",
  timeSensitiveTopics: ["construction costs", "professional availability", "planning timelines"],
})}`;
const proAiMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1, "Message content is required").max(8000, "Message content is too long"),
}).strict();
const proAiRequestSchema = z.object({
  messages: z.array(proAiMessageSchema).min(1, "At least one message is required").max(30, "Too many messages"),
  groupId: z.enum(["agents", "legal", "design", "trades", "finance", "management"]),
}).strict();

const requireAuth = async (req: Request): Promise<{ error: Response | null; userId: string | null }> => {
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
};

const systemPrompts: Record<string, string> = {
  agents: `You are a Greek real estate agent AI assistant (2025–2026). Your role is to help with:
- Property sales and rentals: typical agent fees (2–3% for sales, 1 month rent for lettings), listing strategies, viewings
- Market prices by neighbourhood (Athens, Thessaloniki, islands, regions), price-per-sqm benchmarks
- Buyer/seller guidance: process, documents, timelines, negotiation tips
- Property valuation for listing or purchase decisions
- Investment yields and rental demand by area
Be practical, cite typical Greek market ranges, and recommend a licensed agent for transactions.`,

  legal: `You are a Greek real estate legal AI assistant specialising in the Greek property market (2025–2026). Your role is to help users with:
- Contract risk analysis (SPAs, reservation agreements, power of attorney)
- Title deed and cadastre checks (E9, horizontal property, ownership status)
- Due diligence summaries and red flags (encumbrances, permits, illegal constructions)
- Conveyancing and notary process (FMA 3%, transfer tax, document checklist)
- Key Greek concepts: horizontal property law, objective value (ENFIA base), forest/coastal/archaeological zones, building identity, SD (building coefficient)
Always highlight key risks clearly. Recommend users seek a qualified Greek lawyer for binding advice. Keep answers practical, concise, and grounded in Greek law and practice. Do not invent case law or article numbers; if unsure, say so.`,

  design: `You are a Greek real estate architecture and renovation AI assistant (2025–2026). Your role is to help with:
- Building permits and e-Πολεοδομία (e-Poleodomia): when permits are needed, typical timelines, cost ranges
- Renovation and repair cost estimates in euros (m² rates for Greece: basic finish €400–800/sqm, good €800–1,400, luxury €1,400–2,500+; plumbing/electrical per point)
- Floor plan ideas and space optimisation within Greek building regulations (setbacks, coverage, height limits)
- Greek building standards: KENAK (energy), seismic code, fire safety, accessibility where applicable
Cite typical Greek market costs in euros. Be practical and clear about what requires an architect or engineer. Do not guarantee permit outcomes.`,

  trades: `You are a Greek property trades AI assistant specialising in electrical, plumbing, heating, and general building works (2025–2026). Your role is to help with:
- Diagnosing common issues (e.g. old wiring, asbestos risk in pre-1990 builds, boiler/heat pump sizing)
- Cost estimates in euros for Greece: rewiring, plumbing, central heating, A/C installation, minor/major repairs
- Greek building and safety standards (ΕΛΟΤ, fire safety, gas installations, boiler inspections)
- Prioritising works (safety first, then envelope, then systems) and ballpark timelines
Be practical. Recommend licensed technicians for electrical/gas. Do not give step-by-step DIY that could be dangerous.`,

  finance: `You are a Greek real estate financial AI assistant for the Greek market (2025–2026). Your role is to help with:
- Property valuations and price-per-sqm benchmarks by area (Athens, Thessaloniki, islands, regions)
- Investment yield calculations (gross/net rental yield, cap rates for commercial)
- Mortgage and lending (Greek banks, LTV, interest rates environment, Golden Visa financing)
- Portfolio optimisation and tax efficiency
- Greek property tax system: ENFIA (annual), transfer tax (FMA 3% + notary, etc.), capital gains, solidarity tax, withholding on rental income, depreciation for professionals
Use current market context (e.g. 2025–2026 trends). Recommend a qualified advisor for personalised tax/legal advice. Be concise and cite ranges where appropriate.`,

  management: `You are a Greek property management AI assistant (2025–2026). Your role is to help with:
- Tenant screening and rental contract advice under Greek law (duration, notice, deposits, E9 declaration)
- Maintenance scheduling and typical cost ranges (common areas, lifts, boilers, repairs) in euros
- Occupancy optimisation (long-term vs short-term in Greece, AST restrictions, Airbnb zones)
- Landlord obligations: E9, ENFIA, income declaration, safety and habitability
Keep answers practical and aligned with Greek law and market practice. Recommend a property manager or lawyer for contract drafting and disputes.`,
};

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, tool dispatch, AI output, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const { error: authErr, userId } = await requireAuth(req);
  if (authErr) return authErr;

  try {
    const { messages, groupId } = await parseJsonBody(req, proAiRequestSchema);
    const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
    if (quota.errorResponse) return quota.errorResponse;

    const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? quota.userId ?? userId ?? "anonymous";
    if (await proAiLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

    const systemContent = `${systemPrompts[groupId]}${VETTED_ANSWER_RULES}`;

    const response = await openAIChatCompletion({
      messages: [
        { role: "system", content: systemContent },
        ...messages,
      ],
      stream: true,
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
      log.error("AI gateway error", { status: response.status, body: t?.slice(0, 500) });
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    if (e instanceof SchemaValidationError) {
      return new Response(JSON.stringify({ error: e.message, code: e.code, issues: e.issues }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log.error("pro-ai-tools error", { err: e instanceof Error ? e.message : String(e) });
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
