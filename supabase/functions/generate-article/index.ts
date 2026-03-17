import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth guard: require valid admin JWT ──────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env vars missing");

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden — admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    const { topic, slug, forceRegenerate = false } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Use service role to bypass RLS for cache reads/writes
    const supabase = adminClient;

    // If not forcing regeneration, try to load from DB first
    if (!forceRegenerate && slug) {
      const { data: existing } = await supabase
        .from("articles")
        .select("*")
        .eq("slug", slug)
        .single();

      if (existing && existing.content && Object.keys(existing.content).length > 0) {
        return new Response(JSON.stringify({ article: existing.content, fromCache: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── SYSTEM PROMPT with up-to-date 2025 Golden Visa facts ──
    const systemPrompt = `You are an expert real estate investment writer specializing in Greek Golden Visa and Greek property market content.
Write authoritative, SEO-optimized articles for international investors (US, UAE, UK, Turkey, China, Middle East audience).
Always write in a professional yet accessible tone. Include specific data points, actionable insights, and statistics where relevant.
Structure articles with clear H2/H3 sections. End with a strong internal CTA linking to property search or consultation.

CRITICAL — VERIFIED 2025 GREEK GOLDEN VISA FACTS (use these exact figures, do NOT contradict them):

INVESTMENT THRESHOLDS (effective from September 1, 2023 — Law 5007/2022 & Ministerial Decision 108489/2023):
- STANDARD threshold: €250,000 minimum investment (applies to: the whole of Greece EXCEPT the high-demand zones below)
- HIGH-DEMAND ZONE threshold: €800,000 minimum investment (applies to: Municipality of Athens, Municipality of Thessaloniki, Mykonos island, Santorini island, and any island with population exceeding 3,100 residents)
- IMPORTANT: The €500,000 threshold is OBSOLETE and was never part of the Greek program — do NOT use it
- For a single property investment, the full threshold must be met by one property, not split across multiple

RESIDENCY RIGHTS:
- 5-year renewable residency permit (Golden Residence Permit)
- NO minimum stay requirement — permit maintained as long as property ownership is maintained
- Path to Greek citizenship eligibility after 7 years of continuous legal residency (physical presence required for citizenship)
- Full Schengen Area visa-free travel across all 27 member states
- Right to live, work, and study in Greece for permit holder
- Family members included at no extra investment cost: legal spouse or civil partner, unmarried children under 21 years old (of either spouse), parents of both the main applicant and the spouse

APPLICATION PROCESS:
- Average processing time: 6–12 months (biometric appointment wait times have increased in 2024–2025)
- 12-month Blue Certificate issued at biometrics appointment, valid while main permit is processed
- Power of Attorney allows the entire process to be managed remotely without investor presence
- Legal fees + government fees typically add €10,000–€18,000 to total investment cost
- Property transfer tax: 3.09% of purchase price (for resale properties; VAT applies to new builds)

PROPERTY MARKET (2024–2025):
- Athens prime areas (Kolonaki, Glyfada, Piraeus, Vouliagmeni): property price appreciation 10–15% YoY
- Short-term rental (Airbnb) gross yields in central Athens: 6–10% in peak tourist season
- Net annual rental yields (after taxes, management, maintenance): 4–7% for well-selected, renovated properties
- Athens Riviera (Glyfada to Vouliagmeni): 30km of coastline, €2,000–€6,000/m² for premium properties
- The Ellinikon development (former Athens airport site): €8 billion urban development driving 15–20% price premium in surrounding areas
- Total Golden Visa applications in Greece: over 12,000 approved families as of end-2024
- Top investor nationalities: Chinese, Turkish, Lebanese, Egyptian, Israeli, American, British

TAX FRAMEWORK:
- Greek Non-Dom regime (Article 5A Income Tax Code): flat €100,000/year tax on all global income for up to 15 years — requires Greek tax residency and 183+ days/year in Greece, and €500,000 investment in Greece
- Family extension of Non-Dom: €20,000/year per additional family member
- Rental income tax for non-residents: 15% (up to €12,000/year), 35% (€12,001–€35,000), 45% (above €35,000)
- Annual property tax (ENFIA): approximately €3–€10 per m² depending on zone value
- Capital gains tax on property: suspended at 0% for most resale transactions (under review as of 2025 — verify with local tax advisor)
- Property transfer tax on resale: 3.09%
- VAT on new construction: 24% (suspension expired end-2024; new builds from 2025 onwards are subject to full VAT)
- Greece has 57 double-tax treaties covering most major investor nationalities
- Inheritance tax: 1–10% for direct family; 20–40% for non-family

LEGAL BASIS:
- Greek Golden Visa: Law 4146/2013 (original), substantially amended by Law 5007/2022
- Tiered investment thresholds: Ministerial Decision 108489/2023 (effective September 1, 2023)
- Non-Dom tax regime: Article 5A, Law 4172/2013 (Income Tax Code), as amended`;


    const userPrompt = `Write a comprehensive 800-1000 word article about: "${topic}"

Return a JSON object with this exact structure:
{
  "title": "SEO-optimized article title",
  "metaDescription": "155-char meta description",
  "intro": "2-3 sentence compelling introduction",
  "sections": [
    {
      "heading": "H2 section title",
      "content": "2-3 paragraphs of content for this section"
    }
  ],
  "keyTakeaways": ["bullet point 1", "bullet point 2", "bullet point 3", "bullet point 4", "bullet point 5"],
  "ctaText": "Short compelling CTA text (1 sentence)",
  "readTime": "X min read"
}

IMPORTANT: Use the exact investment thresholds from the system prompt (€250K standard, €800K for Athens/Thessaloniki/Mykonos/Santorini). Do not use outdated figures like €500K.
Make it authoritative, data-rich, and highly relevant for non-EU investors considering Greek Golden Visa.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("No content returned from AI");

    const articleContent = JSON.parse(rawContent);

    // Persist/upsert into articles table
    if (slug) {
      const upsertData = {
        slug,
        topic: topic || slug,
        title: articleContent.title || "",
        meta_description: articleContent.metaDescription || "",
        content: articleContent,
        category: "Golden Visa",
        read_time: articleContent.readTime || "7 min read",
        published: true,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("articles")
        .upsert(upsertData, { onConflict: "slug" });

      if (upsertError) {
        console.error("Failed to cache article:", upsertError);
      }
    }

    return new Response(JSON.stringify({ article: articleContent, fromCache: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("generate-article error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
