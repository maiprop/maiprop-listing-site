import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("ai-service-match");

const BUCKET = "ai-service-match";
const serviceMatchLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 20, windowMs: 60_000, failClosed: true });

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

Return ONLY one valid JSON object with:
{
  "category": "lawyer" | "notary" | "architect" | "civil_engineer" | "contractor" | "interior_designer" | "electrician" | "plumber" | "financial_advisor" | "valuer" | "property_manager",
  "services": string[],
  "explanation": string,
  "urgency": "low" | "medium" | "high",
  "follow_up_question": string | null
}`;

const CATEGORIES = new Set(["lawyer", "notary", "architect", "civil_engineer", "contractor", "interior_designer", "electrician", "plumber", "financial_advisor", "valuer", "property_manager"]);
const URGENCIES = new Set(["low", "medium", "high"]);

const parseMatchJson = (raw: string): Record<string, unknown> => {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON in AI response");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
};

const handleRequest = async (req: Request): Promise<Response> => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, AI parsing, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
  if (quota.errorResponse) return quota.errorResponse;

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? quota.userId ?? "anonymous";
  if (await serviceMatchLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

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
      temperature: 0.1,
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
    const parsed = parseMatchJson(readOpenAITextContent(data));
    const category = typeof parsed.category === "string" && CATEGORIES.has(parsed.category)
      ? parsed.category
      : "lawyer";
    const services = Array.isArray(parsed.services)
      ? parsed.services.filter((item): item is string => typeof item === "string").slice(0, 3)
      : [];
    const urgency = typeof parsed.urgency === "string" && URGENCIES.has(parsed.urgency)
      ? parsed.urgency
      : "medium";

    await recordAiCall(quota.userId, BUCKET);
    return new Response(JSON.stringify({
      category,
      services,
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
      urgency,
      follow_up_question: typeof parsed.follow_up_question === "string" ? parsed.follow_up_question : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    log.error("ai-service-match error", { err: e instanceof Error ? e.message : String(e) });
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

Deno.serve(handleRequest);
