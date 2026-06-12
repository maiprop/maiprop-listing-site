import { createClient } from "npm:@supabase/supabase-js@2";
import { buildVettedAnswerRules } from "../_shared/aiSafety.ts";
import { openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";

const requireEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

type LeadRecord = {
  id?: string;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  nationality?: string | null;
  investment_budget?: number | null;
  preferred_location?: string | null;
  message?: string | null;
  source?: string | null;
  status?: string | null;
  followup_step?: number | null;
};

type LeadSourceTable = "marketing_leads" | "leads";

type LeadLookupClient = {
  from: (table: LeadSourceTable) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: unknown,
      ) => { maybeSingle: () => PromiseLike<{ data?: unknown; error?: unknown }> };
    };
  };
};

type PropertyCard = {
  id: string;
  title: string;
  location: string;
  price?: number;
  size?: number;
  bedrooms?: number;
  yield?: string;
  images?: string[];
  description?: string;
  floor?: number | string;
  construction_year?: number | string;
};

type SupabaseSelectedQuery = {
  eq: (column: string, value: unknown) => SupabaseSelectedQuery;
  lte: (column: string, value: unknown) => SupabaseSelectedQuery;
  order: (
    column: string,
    options?: Record<string, unknown>,
  ) => SupabaseSelectedQuery;
  limit: (
    count: number,
  ) => PromiseLike<{ data?: PropertyCard[] | null; error?: unknown }>;
};

type SupabaseClientLike = {
  from: (table: string) => {
    select: (columns: string) => SupabaseSelectedQuery;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_URL = "https://properties.maiprop.co";
const LOGO_URL =
  "https://cqxcztafhnwkhxgaylne.supabase.co/storage/v1/object/public/email-assets/logo-new.png";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function leadFullName(lead: LeadRecord): string {
  return nonEmpty(lead.full_name) ?? nonEmpty(lead.name) ?? "there";
}

function leadFirstName(lead: LeadRecord): string {
  return leadFullName(lead).split(/\s+/)[0] || "there";
}

function leadNationality(lead: LeadRecord): string {
  return nonEmpty(lead.nationality) ?? "prospective buyer";
}

function leadPreferredLocation(lead: LeadRecord): string {
  return nonEmpty(lead.preferred_location) ?? "Greece";
}

function leadBudget(lead: LeadRecord): number {
  const budget = Number(lead.investment_budget);
  return Number.isFinite(budget) && budget > 0 ? budget : 250000;
}

function normalizeFollowupStep(requestedStep: unknown, lead: LeadRecord): number | null {
  if (requestedStep === undefined || requestedStep === null || requestedStep === "") {
    const currentStep = Number(lead.followup_step ?? 0);
    const nextStep = Number.isFinite(currentStep) ? Math.trunc(currentStep) + 1 : 1;
    return Math.min(Math.max(nextStep, 1), 3);
  }

  const parsed = Number(requestedStep);
  if (!Number.isInteger(parsed) || ![1, 2, 3].includes(parsed)) return null;
  return parsed;
}

async function findLead(
  supabase: LeadLookupClient,
  leadId: string,
): Promise<{ lead: LeadRecord | null; source: LeadSourceTable | null; error: unknown }> {
  const marketing = await supabase
    .from("marketing_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (!marketing.error && marketing.data) {
    return { lead: marketing.data as LeadRecord, source: "marketing_leads", error: null };
  }

  const crm = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (!crm.error && crm.data) {
    return { lead: crm.data as LeadRecord, source: "leads", error: null };
  }

  return { lead: null, source: null, error: marketing.error ?? crm.error ?? null };
}

function brandWrap(
  innerHtml: string,
  ctaText: string,
  ctaHref: string,
): string {
  return `
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:0;">
    <!-- Header -->
    <div style="background:#000014;padding:28px 0;text-align:center;border-radius:8px 8px 0 0;">
      <img src="${LOGO_URL}" alt="mAI Prop" width="140" style="display:block;margin:0 auto;" />
    </div>

    <!-- Body -->
    <div style="background:#faf6f0;padding:32px 30px;border-radius:0 0 8px 8px;">
      ${innerHtml}
    </div>

    <!-- CTA -->
    <div style="text-align:center;padding:30px 0;">
      <a href="${ctaHref}" style="display:inline-block;background:#4ef5f1;color:#000014;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;text-decoration:none;">
        ${ctaText}
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:0 0 20px;">
      <p style="margin:0 0 8px;font-size:12px;color:#888;">
        You received this because you submitted an inquiry on our platform.
      </p>
      <p style="margin:0;font-size:12px;color:#666;">
        © ${new Date().getFullYear()} mAI Prop · <a href="${SITE_URL}" style="color:#8755f2;text-decoration:none;">properties.maiprop.co</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildPropertyCardsHtml(properties: PropertyCard[]): string {
  if (!properties.length) return "";
  return properties
    .map((p: PropertyCard) => {
      const img = (p.images || [])[0] || "";
      const link = `${SITE_URL}/#property-${p.id}`;
      const priceStr = p.price ? `€${Number(p.price).toLocaleString()}` : "";
      const details = [
        p.size ? `${p.size}m²` : "",
        p.bedrooms ? `${p.bedrooms} bed${p.bedrooms > 1 ? "s" : ""}` : "",
        p.yield || "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `
    <a href="${link}" style="display:block;text-decoration:none;margin:12px 0;border-radius:8px;overflow:hidden;border:1px solid #1a1e3a;">
      ${img ? `<img src="${img}" alt="${escapeHtml(p.title)}" width="460" style="display:block;width:100%;max-height:180px;object-fit:cover;" />` : ""}
      <div style="padding:14px 16px;background:#0f1340;">
        <p style="margin:0 0 4px;color:#4ef5f1;font-size:15px;font-weight:600;">${escapeHtml(p.title)}</p>
        <p style="margin:0 0 4px;color:#e0fafa;font-size:13px;">${escapeHtml(p.location)} ${priceStr ? `— ${priceStr}` : ""}</p>
        ${details ? `<p style="margin:0;color:#a0b0c0;font-size:12px;">${details}</p>` : ""}
      </div>
    </a>`;
    })
    .join("");
}

function textToHtml(text: string): string {
  return escapeHtml(text)
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("•")) {
        return `<div style="padding:4px 0 4px 16px;position:relative;color:#3d3529;font-size:15px;line-height:1.7;"><span style="color:#0a0e2a;font-weight:bold;position:absolute;left:0;">•</span>${trimmed.slice(1).trim()}</div>`;
      }
      if (!trimmed) return "<br/>";
      return `<p style="margin:0 0 10px;color:#3d3529;font-size:15px;line-height:1.7;">${trimmed}</p>`;
    })
    .join("");
}

// Step 1: New property suggestions (different from initial followup)
async function generateStep1(
  lead: LeadRecord,
  supabase: SupabaseClientLike,
) {
  const budget = leadBudget(lead);

  // Get different properties - order by date_added to show newer ones
  const { data: props } = await supabase
    .from("properties")
    .select(
      "id, title, location, price, size, bedrooms, yield, project_type, images, description",
    )
    .eq("status", "available")
    .lte("price", budget * 1.3)
    .order("date_added", { ascending: false })
    .limit(4);

  const topProps = props || [];

  const budgetStr = `€${budget.toLocaleString()}`;
  const prompt = `You are mAI Prop's investment advisor. Write a SHORT follow-up email (max 8 lines) for a Golden Visa lead who hasn't responded yet.

Lead: ${escapeHtml(leadFullName(lead))}, ${escapeHtml(leadNationality(lead))}, budget ${budgetStr}, prefers ${escapeHtml(leadPreferredLocation(lead))}.

CRITICAL: Centre the entire email around their ${budgetStr} budget:
- Open by referencing their specific budget and what it unlocks right now
- Explain cautiously what ${budgetStr} may support: property type, location tier, and realistic rental-yield range only if framed as an estimate
- If budget is at or above the common Golden Visa threshold, say eligibility must be checked against current official rules and property-specific criteria
- If budget is below the common Golden Visa threshold, mention alternative income or renovation strategies without implying residency eligibility
- Do not claim properties are moving fast unless supported by the provided property data
- End with invitation to book a 15-minute call to discuss ${budgetStr}-range options

Do NOT list specific property details. Property cards with images will appear below.
Do NOT use markdown. Plain text only. Sign off: "The mAI Prop Team"`;

  const aiText = await callAI(prompt);
  const htmlContent = textToHtml(aiText);
  const cardsHtml = buildPropertyCardsHtml(topProps);
  const firstName = escapeHtml(leadFirstName(lead));

  // Process overview section for Step 1
  const processHtml = `
    <div style="margin-top:20px;border-top:1px solid #e0d8cc;padding-top:16px;">
      <p style="margin:0 0 14px;color:#0a0e2a;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">📌 How It Works</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:12px 14px;background:#0f1340;border-radius:6px 6px 0 0;border-bottom:1px solid #1a1e3a;">
            <p style="margin:0 0 2px;color:#4ef5f1;font-size:22px;font-weight:700;">1</p>
            <p style="margin:0 0 2px;color:#e0fafa;font-size:14px;font-weight:600;">Free Consultation</p>
            <p style="margin:0;color:#a0b0c0;font-size:12px;">We discuss your goals, budget & timeline in a 30-min call.</p>
          </td>
          <td style="padding:12px 14px;background:#0f1340;border-radius:6px 6px 0 0;border-bottom:1px solid #1a1e3a;">
            <p style="margin:0 0 2px;color:#4ef5f1;font-size:22px;font-weight:700;">2</p>
            <p style="margin:0 0 2px;color:#e0fafa;font-size:14px;font-weight:600;">Property Selection</p>
            <p style="margin:0;color:#a0b0c0;font-size:12px;">We shortlist properties and verify any residency-related criteria before presentation.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 14px;background:#0f1340;border-bottom:1px solid #1a1e3a;">
            <p style="margin:0 0 2px;color:#4ef5f1;font-size:22px;font-weight:700;">3</p>
            <p style="margin:0 0 2px;color:#e0fafa;font-size:14px;font-weight:600;">Legal & Renovation</p>
            <p style="margin:0;color:#a0b0c0;font-size:12px;">Qualified legal partners review conveyancing and residency documents; renovation support is scoped where applicable.</p>
          </td>
          <td style="padding:12px 14px;background:#0f1340;border-radius:0 0 6px 6px;">
            <p style="margin:0 0 2px;color:#4ef5f1;font-size:22px;font-weight:700;">4</p>
            <p style="margin:0 0 2px;color:#e0fafa;font-size:14px;font-weight:600;">Residency & Returns</p>
            <p style="margin:0;color:#a0b0c0;font-size:12px;">Proceed only after current eligibility, legal, and income assumptions are verified.</p>
          </td>
        </tr>
      </table>
    </div>`;

  const fullContent =
    htmlContent +
    (cardsHtml
      ? `<div style="margin-top:20px;border-top:1px solid #e0d8cc;padding-top:16px;"><p style="margin:0 0 10px;color:#0a0e2a;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">🏠 New Listings For You</p>${cardsHtml}</div>`
      : "") +
    processHtml;

  return {
    subject: `${firstName}, budget-matched property options from mAI Prop`,
    body: brandWrap(
      fullContent,
      "Book a Free Consultation →",
      "https://calendly.com/maipropos/consultation",
    ),
  };
}

// Step 2: Extensive property details with more info
async function generateStep2(
  lead: LeadRecord,
  supabase: SupabaseClientLike,
) {
  const budget = leadBudget(lead);

  const { data: props } = await supabase
    .from("properties")
    .select(
      "id, title, location, price, size, bedrooms, yield, project_type, images, description, floor, construction_year",
    )
    .eq("status", "available")
    .lte("price", budget * 1.5)
    .order("price", { ascending: true })
    .limit(3);

  const topProps = props || [];

  // Build detailed property cards with more info
  const detailedCardsHtml = topProps
    .map((p: PropertyCard) => {
      const img = (p.images || [])[0] || "";
      const link = `${SITE_URL}/#property-${p.id}`;
      const priceStr = p.price ? `€${Number(p.price).toLocaleString()}` : "";
      const details = [
        p.size ? `${p.size}m²` : "",
        p.bedrooms ? `${p.bedrooms} bedroom${p.bedrooms > 1 ? "s" : ""}` : "",
        p.floor ? `Floor ${p.floor}` : "",
        p.yield ? `Yield: ${p.yield}` : "",
        p.construction_year ? `Built: ${p.construction_year}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      return `
    <a href="${link}" style="display:block;text-decoration:none;margin:14px 0;border-radius:8px;overflow:hidden;border:1px solid #1a1e3a;">
      ${img ? `<img src="${img}" alt="${escapeHtml(p.title)}" width="460" style="display:block;width:100%;max-height:200px;object-fit:cover;" />` : ""}
      <div style="padding:16px 18px;background:#0f1340;">
        <p style="margin:0 0 6px;color:#4ef5f1;font-size:16px;font-weight:600;">${escapeHtml(p.title)}</p>
        <p style="margin:0 0 6px;color:#e0fafa;font-size:14px;">${escapeHtml(p.location)} ${priceStr ? `— ${priceStr}` : ""}</p>
        <p style="margin:0 0 8px;color:#a0b0c0;font-size:12px;">${details}</p>
        ${p.description ? `<p style="margin:0;color:#c0d0e0;font-size:13px;line-height:1.5;">${escapeHtml(p.description).substring(0, 150)}…</p>` : ""}
      </div>
    </a>`;
    })
    .join("");

  const budgetStr = `€${budget.toLocaleString()}`;
  const prompt = `You are mAI Prop's senior investment advisor. Write a personalized follow-up email (max 10 lines) for a Golden Visa lead.

Lead: ${escapeHtml(leadFullName(lead))}, ${escapeHtml(leadNationality(lead))}, budget ${budgetStr}, prefers ${escapeHtml(leadPreferredLocation(lead))}.

CRITICAL: Make the entire email a ${budgetStr} investment breakdown:
- Open with: "We've analysed what ${budgetStr} can achieve in the Greek property market"
- Break down how their budget may map to property acquisition, renovation costs, legal fees, and expected returns using cautious ranges
- Mention only broad ROI/rental-yield ranges and label them as estimates, not guarantees
- If budget is at or above the common Golden Visa threshold, explain that residency eligibility and passive-income assumptions require current official/legal verification
- If budget is below the common Golden Visa threshold, focus on renovation and rental-return strategies without implying residency eligibility
- Mention our end-to-end service covers everything within their budget
- Invite them for a video call to walk through the ${budgetStr} investment plan

Do NOT list specific property details. Detailed property cards appear below.
Do NOT use markdown. Plain text only. Sign off: "The mAI Prop Team"`;

  const aiText = await callAI(prompt);
  const htmlContent = textToHtml(aiText);
  const firstName = escapeHtml(leadFirstName(lead));

  const fullContent =
    htmlContent +
    (detailedCardsHtml
      ? `<div style="margin-top:20px;border-top:1px solid #e0d8cc;padding-top:16px;"><p style="margin:0 0 10px;color:#0a0e2a;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">📋 Your Detailed Property Portfolio</p>${detailedCardsHtml}</div>`
      : "");

  return {
    subject: `${firstName}, your personalized investment portfolio — mAI Prop`,
    body: brandWrap(
      fullContent,
      "Schedule a Video Call →",
      "https://calendly.com/maipropos/consultation",
    ),
  };
}

// Step 3: Golden Visa benefits deep dive
async function generateStep3(
  lead: LeadRecord,
  _supabase: SupabaseClientLike,
) {
  const firstName = escapeHtml(leadFirstName(lead));

  const budgetStr = `€${leadBudget(lead).toLocaleString()}`;
  const prompt = `You are mAI Prop's Golden Visa specialist. Write a compelling email (max 12 lines) about the Greek Golden Visa benefits for a lead who hasn't converted yet.

Lead: ${escapeHtml(leadFullName(lead))}, ${escapeHtml(leadNationality(lead))}, budget ${budgetStr}.

CRITICAL: Frame every benefit through the lens of their ${budgetStr} budget:
Cover these benefits with bullet points (use • character), tying each to their budget:
• EU Residency — say ${budgetStr} may support a route only if current official Golden Visa thresholds and property criteria are met
• Family Inclusion — say family inclusion rules must be verified with a qualified Greek immigration lawyer
• Potential Returns — use cautious estimated rental-yield language, never guaranteed appreciation
• Processing Timeline — describe timing as variable and subject to official processing
• Minimum Stay — say stay requirements can change and must be verified

After the bullets, add 2-3 lines about:
- Golden Visa thresholds and qualifying zones can change, so current official/legal verification matters
- A call can compare currently available properties against their ${budgetStr} goals
- Final invitation to review their ${budgetStr} plan with the team

Do NOT use markdown formatting. Use • for bullets. Plain text only. Sign off: "The mAI Prop Team"`;

  const aiText = await callAI(prompt);
  const htmlContent = textToHtml(aiText);

  // Add a visual benefits summary section
  const benefitsHtml = `
    <div style="margin-top:20px;border-top:1px solid #e0d8cc;padding-top:16px;">
      <p style="margin:0 0 14px;color:#0a0e2a;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">🇬🇷 Golden Visa At A Glance</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:12px 14px;background:#0f1340;border-radius:6px 6px 0 0;border-bottom:1px solid #1a1e3a;">
            <p style="margin:0 0 2px;color:#4ef5f1;font-size:13px;font-weight:600;">Eligibility Threshold</p>
            <p style="margin:0;color:#e0fafa;font-size:15px;">Verify current rules</p>
          </td>
          <td style="padding:12px 14px;background:#0f1340;border-radius:6px 6px 0 0;border-bottom:1px solid #1a1e3a;">
            <p style="margin:0 0 2px;color:#4ef5f1;font-size:13px;font-weight:600;">Processing Time</p>
            <p style="margin:0;color:#e0fafa;font-size:15px;">Varies by file</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 14px;background:#0f1340;border-bottom:1px solid #1a1e3a;">
            <p style="margin:0 0 2px;color:#4ef5f1;font-size:13px;font-weight:600;">Validity</p>
            <p style="margin:0;color:#e0fafa;font-size:15px;">Official rules apply</p>
          </td>
          <td style="padding:12px 14px;background:#0f1340;border-bottom:1px solid #1a1e3a;">
            <p style="margin:0 0 2px;color:#4ef5f1;font-size:13px;font-weight:600;">Family Members</p>
            <p style="margin:0;color:#e0fafa;font-size:15px;">Legal review required</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 14px;background:#0f1340;border-radius:0 0 6px 6px;">
            <p style="margin:0 0 2px;color:#4ef5f1;font-size:13px;font-weight:600;">Schengen Access</p>
            <p style="margin:0;color:#e0fafa;font-size:15px;">Check current rights</p>
          </td>
          <td style="padding:12px 14px;background:#0f1340;border-radius:0 0 6px 6px;">
            <p style="margin:0 0 2px;color:#4ef5f1;font-size:13px;font-weight:600;">Min. Stay Required</p>
            <p style="margin:0;color:#e0fafa;font-size:15px;">Verify current rules</p>
          </td>
        </tr>
      </table>
    </div>`;

  const fullContent = htmlContent + benefitsHtml;

  return {
    subject: `${firstName}, your Golden Visa questions to verify before investing`,
    body: brandWrap(
      fullContent,
      "Book Your Free Consultation →",
      "https://calendly.com/maipropos/consultation",
    ),
  };
}

const FOLLOWUP_EMAIL_SYSTEM_PROMPT = `You write ultra-concise, professional emails for a luxury Greek real estate firm. Output only the email body. No subject line. No markdown.

${buildVettedAnswerRules({
  scope: "automated lead follow-up emails",
  timeSensitiveTopics: [
    "Golden Visa thresholds",
    "residency rules",
    "rental yields",
    "capital appreciation",
    "lead availability",
  ],
})}

Email-specific rules:
- Do not create urgency from unsupported claims such as live scarcity, fast-moving stock, rising thresholds, or guaranteed returns.
- Treat Golden Visa, tax, legal, and residency claims as conditional and recommend official/legal verification.
- Use the lead and property data as context; do not invent property details, exact market data, or exact ROI.`;

async function callAI(prompt: string): Promise<string> {
  try {
    const response = await openAIChatCompletion({
      messages: [
        { role: "system", content: FOLLOWUP_EMAIL_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.45,
      max_tokens: 700,
    });
    if (!response.ok) throw new Error(`AI error: ${response.status}`);
    const data = await response.json();
    return readOpenAITextContent(data).trim();
  } catch (e) {
    console.error("AI call failed:", e);
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth guard: require admin JWT or internal service-role key ───────────
    {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      // Allow internal calls from scheduled-followups (which pass the service role key)
      if (token !== serviceRoleKey) {
        const _ac = createClient(requireEnv("SUPABASE_URL"), serviceRoleKey);
        const {
          data: { user },
          error: authErr,
        } = await _ac.auth.getUser(token);
        if (authErr || !user) {
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: roleData } = await _ac
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .single();
        if (!roleData) {
          return new Response(
            JSON.stringify({ error: "Forbidden — admin access required" }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const { lead_id, step: requestedStep, preview_only } = await req.json();

    if (!lead_id || typeof lead_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing lead_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { lead, source } = await findLead(supabase as unknown as LeadLookupClient, lead_id);
    if (!lead || !source) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const step = normalizeFollowupStep(requestedStep, lead);
    if (!step) {
      return new Response(
        JSON.stringify({ error: "Step must be 1, 2, or 3" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? Deno.env.get("brevo");
    if (!BREVO_API_KEY && !preview_only) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!lead.email && !preview_only) {
      return new Response(JSON.stringify({ error: "Lead email is missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: { subject: string; body: string };
    const propertySupabase = supabase as unknown as SupabaseClientLike;

    if (step === 1) {
      result = await generateStep1(lead, propertySupabase);
    } else if (step === 2) {
      result = await generateStep2(lead, propertySupabase);
    } else {
      result = await generateStep3(lead, propertySupabase);
    }
    // Fallback if AI failed
    if (!result.body) {
      const firstName = escapeHtml(leadFirstName(lead));
      result = {
        subject: `${firstName}, an update from mAI Prop`,
        body: brandWrap(
          `<p style="margin:0 0 8px;color:#e0fafa;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
           <p style="margin:0 0 8px;color:#e0fafa;font-size:15px;line-height:1.6;">We wanted to follow up on your Golden Visa inquiry. Our team has curated a selection of properties that match your investment profile.</p>
           <p style="margin:0;color:#e0fafa;font-size:15px;line-height:1.6;">We'd love to schedule a call — reply to this email or visit our website.</p>
           <p style="margin:12px 0 0;color:#e0fafa;font-size:15px;">Warm regards,<br/>The mAI Prop Team</p>`,
          "Browse Our Portfolio →",
          `${SITE_URL}/#opportunities`,
        ),
      };
    }

    // Preview mode — return HTML without sending
    if (preview_only) {
      return new Response(
        JSON.stringify({
          success: true,
          preview: true,
          subject: result.subject,
          html: result.body,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!BREVO_API_KEY) {
      throw new Error("Email service not configured");
    }

    // Send via Brevo
    const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "mAI Prop", email: "kr@maiprop.co" },
        to: [{ email: lead.email, name: leadFullName(lead) }],
        subject: result.subject,
        htmlContent: result.body,
      }),
    });

    const emailData = await emailRes.json();

    if (!emailRes.ok) {
      console.error("Brevo error:", JSON.stringify(emailData));
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (source === "marketing_leads") {
      await supabase
        .from("marketing_leads")
        .update({
          followup_step: step,
          ...(lead.status === "new" ? { status: "contacted" } : {}),
        })
        .eq("id", lead_id);
    } else {
      await supabase
        .from("leads")
        .update({
          follow_up_at: new Date().toISOString(),
          ...(lead.status === "new" ? { status: "contacted" } : {}),
        })
        .eq("id", lead_id);
    }

    return new Response(
      JSON.stringify({ success: true, step, email_id: emailData.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    console.error("Followup error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
