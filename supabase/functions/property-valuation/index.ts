const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { title, city, address, price, sqm, bedrooms, bathrooms, propertyType,
            listingType, floor, yearBuilt, energyClass, pricePerSqm,
            hasParking, hasPool, hasElevator, region } = body;

    if (!city || !sqm || !price) {
      return new Response(
        JSON.stringify({ error: "city, sqm and price are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const features = [
      floor != null && `Floor ${floor}`,
      yearBuilt && `Built ${yearBuilt}`,
      energyClass && `Energy class ${energyClass}`,
      hasParking && "Has parking",
      hasPool && "Has pool",
      hasElevator && "Has elevator",
    ].filter(Boolean).join(", ");

    // ── Property-type specific analysis instructions ──────────────────────────
    const typeSpecificInstructions = (() => {
      switch (propertyType) {
        case "land":
          return `
LAND-SPECIFIC ANALYSIS — critical fields for keyFactors:
- Buildability: is it within the city plan (εντός σχεδίου) or outside (εκτός σχεδίου)? Outside-plan land in Greece has much lower buildability (typically max 200m² coverage ratio outside settlements).
- Συντελεστής Δόμησης (SD) / Building Factor: multiply sqm by SD to get total buildable area. Residential SD in Greece ranges 0.4–2.4 depending on zone.
- Κάλυψη (coverage ratio): typically 60–70% for residential, 40% for outside-plan.
- Construction cost estimate: Greek residential construction costs €800–1,400/m² (2024), commercial €1,200–2,000/m².
- Developer profit margin: typically 15–25% of GDV for Greek developers.
- Expected GDV (Gross Development Value): estimate total apartment sale value achievable.
- Taxation on land purchase: FMA (Φόρος Μεταβίβασης Ακινήτου) 3% of tax value, or 24% VAT for new constructions from licensed developers.
- ENFIA land tax: typically €2–15/m² annually depending on zone.
- Key risk factor: planning permission timeline in Greece (6–18 months typical).
- For coastal/island land: check tourist zone restrictions (ΖΟΕ) and minimum plot size (4,000m² outside settlements).`;

        case "commercial":
          return `
COMMERCIAL PROPERTY ANALYSIS:
- Commercial yield in Greece: prime Athens 5–7%, secondary locations 7–10%.
- Commercial lease terms: typically 3+3 or 5+5 years with annual CPI indexation.
- VAT status: commercial rents subject to 24% VAT unless waived by landlord (a common option in Greece).
- ENFIA commercial: significantly higher multipliers than residential.
- ERV (Estimated Rental Value): calculate €/m²/month based on location; prime Athens €15–45/m², regional €5–15/m².
- Conversion potential: note if property could be converted to residential (requires change-of-use permit).
- Tenant covenant quality matters significantly for commercial valuation.`;

        case "office":
          return `
OFFICE PROPERTY ANALYSIS:
- Athens CBD Grade-A offices: €18–28/m²/month; Grade-B: €10–18/m²/month.
- Smart buildings and ESG compliance increasingly valued.
- Vacancy rates: Athens CBD ~8–12% (2024), rising due to hybrid work trends.
- Net initial yield: prime 5.5–6.5%, secondary 7–9%.
- Service charges typically paid by tenant in Greece.
- Dilapidation risk and reinstatement cost should be considered.`;

        case "villa":
          return `
VILLA/LUXURY PROPERTY ANALYSIS:
- Greek luxury market: island villas command 30–80% premium over mainland equivalents.
- Golden Visa threshold: €800,000 for Athens/Thessaloniki/islands over 3,100 residents, €400,000 elsewhere.
- Short-term rental (Airbnb) yield: island villas €80,000–300,000/year gross depending on location and spec.
- License 99: short-term rental tax in Greece — 15% on revenue up to €12,000, 35% above €35,000.
- Pool maintenance, property management costs: €8,000–25,000/year.
- Capital gains tax: 15% on profit from resale (currently suspended until end 2024; watch for reinstatement).`;

        case "apartment":
        default:
          return `
RESIDENTIAL APARTMENT ANALYSIS:
- Reference to real comparable sales: use ε-ΤΑΜΕΙΟ and property.gr/spitogatos price indices for the specific area.
- Rental yield benchmarks: Athens center 3.5–5.5%, Glyfada/Voula 3–4.5%, Thessaloniki 4–6%, islands 5–8%.
- Short-term rental potential (if applicable): note if area has holiday/tourist demand.
- Golden Visa eligibility: flag if price ≥ €250,000 (or €400,000/€800,000 for new thresholds).
- Renovation cost estimate if year_built < 2000: €400–900/m² for full refurb.
- ENFIA residential: typically €2–8/m² depending on zone value (ΤΙΜΗ ΖΩΝΗΣ).
- Transaction costs in Greece: ~8–10% total (FMA 3%, notary 1–1.5%, legal 0.5–1%, agent 2–3% each side).`;
      }
    })();

    const prompt = `You are a senior Greek real estate valuation expert (RICS-equivalent) with 20+ years of experience in the Greek property market. You have deep knowledge of:
- Regional price indices from spitogatos.gr, xe.gr, property.gr
- Greek property law (N.3741/1929, N.4495/2017), planning legislation, and ENFIA taxation
- Post-2010 distressed market recovery trajectory and current 2024–2025 market conditions
- Construction costs, developer economics, and investment yields by city/area
- Tourism real estate, Golden Visa program, and foreign investment dynamics

Analyse this property and provide an accurate AI valuation:
- Title: ${title || "Property"}
- Location: ${address || city}, ${city}${region ? `, ${region}` : ""}, Greece
- Type: ${propertyType || "apartment"} (${listingType || "sale"})
- Size: ${sqm} m²${bedrooms != null ? ` · ${bedrooms} bed` : ""}${bathrooms != null ? ` · ${bathrooms} bath` : ""}
- Listed price: €${Number(price).toLocaleString()} (€${pricePerSqm ? Math.round(Number(pricePerSqm)) : Math.round(Number(price)/Number(sqm))}/m²)
- Additional details: ${features || "standard specification"}

${typeSpecificInstructions}

Return ONLY valid JSON, no markdown, no explanation:
{
  "estimatedValue": number (realistic market value in EUR — do NOT simply echo the listed price; justify deviation),
  "rangeLow": number (lower bound, typically 5-12% below estimated),
  "rangeHigh": number (upper bound, typically 5-12% above estimated),
  "confidence": number (0-100, reflect data completeness — more details = higher confidence),
  "confidenceLabel": "High" | "Medium" | "Low",
  "pricePerSqmEstimate": number (your own €/m² benchmark for comparable properties in this area),
  "marketComparison": "below_market" | "at_market" | "above_market",
  "marketComparisonPct": number (e.g. -8 means 8% below market, +5 means 5% above),
  "summary": "string (3–4 sentences: valuation rationale, local market context, key value drivers or risks — mention specific ${city} market dynamics and current trends)",
  "keyFactors": [
    { "factor": "string", "impact": "positive" | "negative" | "neutral", "note": "string (specific data point or benchmark)" }
  ],
  "renovationPotential": "string (quantified estimate where possible, e.g. '€300–450/m² refurb could add 15–20% to value')",
  "rentalYieldEstimate": number (annual gross %, e.g. 4.5 — must be realistic for the specific city/area)
}

Rules:
- keyFactors must have 4–6 items; include at least one tax/cost factor and one market trend factor
- estimatedValue must reflect genuine market analysis, not just echo the list price
- For land: include buildability and development potential in keyFactors
- confidenceLabel: High = 80+, Medium = 50–79, Low = <50
- Only return the JSON object`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const content = (aiData.choices?.[0]?.message?.content ?? "")
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: any;
    try { parsed = JSON.parse(content); }
    catch { throw new Error("AI returned invalid JSON"); }

    // Sanitise
    const result = {
      estimatedValue: Math.round(Number(parsed.estimatedValue) || price),
      rangeLow: Math.round(Number(parsed.rangeLow) || price * 0.92),
      rangeHigh: Math.round(Number(parsed.rangeHigh) || price * 1.08),
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 70)),
      confidenceLabel: ["High","Medium","Low"].includes(parsed.confidenceLabel) ? parsed.confidenceLabel : "Medium",
      pricePerSqmEstimate: Math.round(Number(parsed.pricePerSqmEstimate) || price / sqm),
      marketComparison: ["below_market","at_market","above_market"].includes(parsed.marketComparison) ? parsed.marketComparison : "at_market",
      marketComparisonPct: Number(parsed.marketComparisonPct) || 0,
      summary: String(parsed.summary || "").slice(0, 400),
      keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.slice(0, 6).map((f: any) => ({
        factor: String(f.factor || "").slice(0, 50),
        impact: ["positive","negative","neutral"].includes(f.impact) ? f.impact : "neutral",
        note: String(f.note || "").slice(0, 80),
      })) : [],
      renovationPotential: String(parsed.renovationPotential || "").slice(0, 200),
      rentalYieldEstimate: Math.round((Number(parsed.rentalYieldEstimate) || 4.5) * 10) / 10,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("property-valuation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
